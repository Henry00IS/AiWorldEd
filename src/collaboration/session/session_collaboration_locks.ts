import type * as THREE from 'three';
import type { OutlinerEditGate, OutlinerMoveGate } from '@/outliner/ui/panel_outliner.js';
import type { SelectionAdmission } from '@/selection/object/manager_selection.js';
import type { HostCollaborationEditor } from '@/collaboration/host/host_collaboration_editor.js';
import type { SessionCollaborationTransport } from '@/collaboration/session/session_collaboration_types.js';
import { verifyCollaborationReason } from '@/collaboration/sync/verify_collaboration_verdict.js';
import type {
  SyncCollaborationLeaseEvent,
  SyncCollaborationSession,
} from '@/collaboration/session/session_collaboration_sync.js';
import type { TrackerCollaborationRefusal } from '@/collaboration/sync/tracker_collaboration_commit.js';
import type { MemberCollaborationRoster } from '@/collaboration/sync/member_collaboration_roster.js';
import {
  selectionCollaborationBlock,
  selectionCollaborationIds,
} from '@/collaboration/sync/selection_collaboration_locks.js';
import {
  hierarchyCollaborationBlock,
  hierarchyCollaborationChain,
} from '@/collaboration/sync/hierarchy_collaboration_locks.js';

/** Conflict entry of a refused lease request. */
export interface LocksCollaborationConflict {
  id: string;
  by: number;
  shared?: true;
}

/** Why an object cannot be edited, with the id whose release retracts it. */
export interface LocksCollaborationRefusal {
  id: string;
  holder: number;
  message: string;
}

/** Delay that coalesces selection broadcasts (clicking through the outliner). */
export const LOCKS_COLLABORATION_SELECT_DELAY_MS = 150;

/** Most selected ids broadcast to other members (relay limit). */
export const LOCKS_COLLABORATION_SELECT_IDS = 256;

/** The same notice is not repeated within this time. */
export const LOCKS_COLLABORATION_NOTICE_MS = 2000;

/** Relay capability of `select` presence. */
export const LOCKS_COLLABORATION_SELECT_CAP = 'select';

/**
 * Selection presence and operation leases of a room. Selecting never locks:
 * several members may select the same object and each sees the others'
 * selections. Editing takes a short lease (see SyncCollaborationSession);
 * a refused or lost lease cancels the running tool, keeps the selection and
 * names the member who is editing.
 */
export class LocksCollaborationSession {
  private readonly host: HostCollaborationEditor;
  private readonly transport: SessionCollaborationTransport;
  private readonly sync: SyncCollaborationSession;
  private readonly roster: MemberCollaborationRoster;
  private readonly changed: () => void;
  private readonly admission: SelectionAdmission;
  private readonly selectionListener: () => void;
  private readonly editGate: OutlinerEditGate;
  private readonly moveGate: OutlinerMoveGate;
  private readonly remote: Map<number, string[]>;
  private scheduled: boolean;
  private active: boolean;
  private refusal: string;
  private refusalId: string;
  private refusalLast: LocksCollaborationRefusal | null;
  private keepRequested: boolean;
  private selectTimer: ReturnType<typeof setTimeout> | null;
  private selectSent: string | null;
  private noticeText: string;
  private noticeAt: number;
  /** Refused operation watched while the pointer stays down. */
  private waiting: { ids: string[]; label: string; holder: number } | null;

  /**
   * Creates the coordinator.
   *
   * @param host Editor services.
   * @param transport Relay connection.
   * @param sync Edit loop that owns the lock table and the lease.
   * @param roster Room members.
   * @param changed Called after any lock or selection change.
   */
  constructor(
    host: HostCollaborationEditor,
    transport: SessionCollaborationTransport,
    sync: SyncCollaborationSession,
    roster: MemberCollaborationRoster,
    changed: () => void,
  ) {
    this.host = host;
    this.transport = transport;
    this.sync = sync;
    this.roster = roster;
    this.changed = changed;
    this.admission = () => this.admit();
    this.selectionListener = () => this.selectionChanged();
    this.editGate = (object, _select, apply, refused) => this.edit([object], apply, refused);
    this.moveGate = (objects, container, _select, apply, refused) => this.move(objects, container, apply, refused);
    this.remote = new Map();
    this.scheduled = false;
    this.active = false;
    this.refusal = '';
    this.refusalId = '';
    this.refusalLast = null;
    this.keepRequested = false;
    this.selectTimer = null;
    this.selectSent = null;
    this.noticeText = '';
    this.noticeAt = -Infinity;
    this.waiting = null;
  }

  /** Installs selection tracking, the outliner gates and the lease listener. */
  install(): void {
    this.active = true;
    this.host.selection.selectionAdmissionSet(this.admission);
    this.host.selection.onSelectionChanged(this.selectionListener);
    this.host.selection.emptyClearListenerSet(() => this.createdRelease());
    this.host.outlinerEditGateSet(this.editGate);
    this.host.outlinerMoveGateSet(this.moveGate);
    this.sync.hierarchyListenerSet(() => this.hierarchyChanged());
    this.sync.refusalDescriberSet((refusal) => this.refusalDescribe(refusal));
    this.sync.leaseListenerSet((event) => this.leaseEvent(event));
    this.sync.memberNameSet((user) => this.roster.nameOf(user));
  }

  /** Removes the hooks. */
  uninstall(): void {
    this.active = false;
    this.host.selection.selectionAdmissionSet(null);
    this.host.selection.offSelectionChanged(this.selectionListener);
    this.host.selection.emptyClearListenerSet(null);
    this.host.outlinerEditGateSet(null);
    this.host.outlinerMoveGateSet(null);
    this.sync.hierarchyListenerSet(null);
    this.sync.leaseListenerSet(null);
    if (this.selectTimer !== null) clearTimeout(this.selectTimer);
    this.selectTimer = null;
    this.remote.clear();
  }

  /**
   * Describes a create or move the tracker refused.
   *
   * @param refusal Refused node and the container another member edits.
   * @returns Status message.
   */
  private refusalDescribe(refusal: TrackerCollaborationRefusal): string {
    const verb = refusal.created ? 'add' : 'move';
    const object = this.nameLabel(refusal.name, 'this object');
    const container = this.nameLabel(refusal.containerName, 'that container');
    const who = this.roster.nameOf(refusal.holder);
    return `Can't ${verb} ${object} into ${container}: ${who} is editing it right now; reverted`;
  }

  /**
   * Applies a lease broadcast or the lease list of room.joined.
   *
   * @param by Holder.
   * @param add Ids now held.
   * @param remove Ids released.
   */
  remoteLocks(by: number, add: readonly string[], remove: readonly string[]): void {
    this.sync.replica.locks.apply(by, add, remove);
    if (remove.includes(this.refusalId)) this.refusalRetract();
    this.waitCheck();
    this.changed();
  }

  /**
   * Watches a refused operation while the pointer stays down: as soon as the
   * holder's lease ends (release or expiry) the user is told the object is
   * free, so the next press (which skips the retry backoff) gets it at once.
   */
  private waitCheck(): void {
    const waiting = this.waiting;
    if (waiting === null) return;
    if (!this.sync.pressing()) {
      this.waiting = null;
      return;
    }
    const locks = this.sync.replica.locks;
    if (waiting.ids.some((id) => locks.heldByOther(id))) return;
    this.waiting = null;
    const who = this.roster.nameOf(waiting.holder);
    this.refusalRetract();
    this.notice(`${who} is done: ${this.objectLabel(waiting.label, 'the object')} is free, drag again to edit it`);
  }

  /** The pointer was released: stops watching a refused operation. */
  waitEnd(): void {
    this.waiting = null;
  }

  /**
   * Stores another member's selection (presence only, never a lock).
   *
   * @param by Member.
   * @param ids Selected ids.
   */
  remoteSelected(by: number, ids: readonly string[]): void {
    if (by === this.sync.replica.locks.selfGet()) return;
    if (ids.length === 0) this.remote.delete(by);
    else this.remote.set(by, ids.slice(0, LOCKS_COLLABORATION_SELECT_IDS));
    this.changed();
  }

  /**
   * Forgets a member's selection when they leave.
   *
   * @param user Member.
   */
  memberLeft(user: number): void {
    if (this.remote.delete(user)) this.changed();
  }

  /**
   * Returns other members' selections.
   *
   * @returns Selected ids by member.
   */
  remoteSelections(): ReadonlyMap<number, readonly string[]> {
    return this.remote;
  }

  /** Re-announces the selection (after sync completes). */
  selectionResend(): void {
    this.selectSent = null;
    this.selectionChanged();
  }

  /**
   * Returns the last refusal shown since the previous call and forgets it.
   *
   * @returns Refusal, or null.
   */
  refusalTake(): LocksCollaborationRefusal | null {
    const refusal = this.refusalLast;
    this.refusalLast = null;
    return refusal;
  }

  /**
   * Returns the name of a node.
   *
   * @param id Node id.
   * @returns Object name, or empty.
   */
  nodeName(id: string): string {
    return this.sync.replica.applier.nodes().get(id)?.object.name ?? '';
  }

  /**
   * Returns why an object cannot be edited right now: another member's running
   * operation covers it, something inside it, or a container around it.
   *
   * @param object Scene object.
   * @param verb Action named in the message, for example "edit" or "move".
   * @returns Refusal, or null when the object is free.
   */
  objectRefusal(object: THREE.Object3D, verb: string): LocksCollaborationRefusal | null {
    const replica = this.sync.replica;
    replica.applier.invalidate();
    const nodes = replica.applier.nodes();
    const ref = nodes.forObjectOrAncestor(object);
    if (ref === undefined) return null;
    return this.idRefusal(ref.id, verb);
  }

  /**
   * Returns why a node cannot be edited right now.
   *
   * @param id Node id.
   * @param verb Action named in the message.
   * @returns Refusal, or null when the node is free.
   */
  idRefusal(id: string, verb: string): LocksCollaborationRefusal | null {
    const replica = this.sync.replica;
    const nodes = replica.applier.nodes();
    const subtree = new Set<string>();
    if (nodes.get(id) !== undefined) nodes.subtreeCollect(id, subtree);
    else subtree.add(id);
    const inner = selectionCollaborationBlock(replica.locks, subtree);
    if (inner !== null) return this.innerRefusal(id, inner, verb);
    const chain = hierarchyCollaborationChain((entry) => nodes.parents.get(entry), nodes.parents.get(id) ?? '');
    const outer = hierarchyCollaborationBlock(replica.locks, chain);
    return outer === null ? null : this.aroundRefusal(id, outer.id, outer.holder, verb);
  }

  /**
   * Returns why objects cannot move into a container another member edits.
   *
   * @param objects Moved objects.
   * @param container New parent.
   * @returns Refusal, or null when the container is free.
   */
  containerRefusal(objects: readonly THREE.Object3D[], container: THREE.Object3D): LocksCollaborationRefusal | null {
    const replica = this.sync.replica;
    replica.applier.invalidate();
    const nodes = replica.applier.nodes();
    const ref = nodes.forObjectOrAncestor(container);
    if (ref === undefined) return null;
    const chain = [
      ref.id,
      ...hierarchyCollaborationChain((id) => nodes.parents.get(id), nodes.parents.get(ref.id) ?? ''),
    ];
    const block = hierarchyCollaborationBlock(replica.locks, chain);
    if (block === null) return null;
    const first = objects[0];
    const moved = first === undefined ? 'objects' : this.nameLabel(first.name, 'this object');
    const where = this.objectLabel(ref.id, 'that container');
    const who = this.roster.nameOf(block.holder);
    const reason =
      block.id === ref.id ? `${who} is editing it` : `${who} is editing ${this.objectLabel(block.id, 'a container')} around it`;
    return { id: block.id, holder: block.holder, message: `Can't move ${moved} into ${where}: ${reason}` };
  }

  /**
   * Refusal for an object whose subtree contains a node another member edits.
   *
   * @param targetId Object the user wants to edit.
   * @param block Held node and its holder.
   * @param verb Action named in the message.
   * @returns Refusal.
   */
  private innerRefusal(
    targetId: string,
    block: { id: string; holder: number },
    verb: string,
  ): LocksCollaborationRefusal {
    const who = this.roster.nameOf(block.holder);
    if (block.id !== targetId) {
      const inner = this.objectLabel(block.id, 'an object');
      const message = `Can't ${verb} ${this.objectLabel(targetId, 'this object')} yet: ${who} is editing ${inner} inside it`;
      return { id: block.id, holder: block.holder, message };
    }
    const nodes = this.sync.replica.applier.nodes();
    const chain = hierarchyCollaborationChain((id) => nodes.parents.get(id), nodes.parents.get(targetId) ?? '');
    const outer = chain.filter((id) => this.sync.replica.locks.holder(id) === block.holder).at(-1);
    if (outer !== undefined) return this.aroundRefusal(targetId, outer, block.holder, verb);
    return {
      id: block.id,
      holder: block.holder,
      message: `Can't ${verb} ${this.objectLabel(targetId, 'this object')} yet: ${who} is editing it`,
    };
  }

  /**
   * Refusal for an object inside a container another member edits.
   *
   * @param targetId Object the user wants to edit.
   * @param containerId Held container.
   * @param holder Holding member.
   * @param verb Action named in the message.
   * @returns Refusal.
   */
  private aroundRefusal(
    targetId: string,
    containerId: string,
    holder: number,
    verb: string,
  ): LocksCollaborationRefusal {
    const target = this.objectLabel(targetId, 'this object');
    const container = this.objectLabel(containerId, 'a container');
    const message = `Can't ${verb} ${target} yet: ${this.roster.nameOf(holder)} is editing ${container} around it`;
    return { id: containerId, holder, message };
  }

  /**
   * Selection is never refused because of other members; only before the
   * room scene arrived.
   *
   * @returns True when selecting is allowed.
   */
  private admit(): boolean {
    if (this.sync.isSynced()) return true;
    this.host.status('Still synchronizing the room scene...');
    return false;
  }

  /**
   * Admits a one-shot outliner edit (rename, visibility, lock, context menu):
   * applies it at once unless another member's running operation covers it.
   *
   * @param objects Objects the edit changes.
   * @param apply Applies the edit.
   * @param refused Called when the edit does not apply.
   */
  private edit(objects: readonly THREE.Object3D[], apply: () => void, refused: () => void): void {
    if (!this.admit()) return refused();
    for (const object of objects) {
      const refusal = this.objectRefusal(object, 'edit');
      if (refusal === null) continue;
      this.refuse(refusal);
      return refused();
    }
    this.sync.tracker.touch(this.objectIds(objects));
    apply();
  }

  /**
   * Admits an outliner move (a one-shot reparent): refuses containers and
   * objects another member's running operation covers, else applies it.
   *
   * @param objects Moved objects.
   * @param container New parent.
   * @param apply Applies the move.
   * @param refused Called when the move does not apply.
   */
  private move(
    objects: readonly THREE.Object3D[],
    container: THREE.Object3D,
    apply: () => void,
    refused: () => void,
  ): void {
    if (!this.admit()) return refused();
    const refusal = this.containerRefusal(objects, container);
    if (refusal !== null) {
      this.refuse(refusal);
      return refused();
    }
    this.edit(
      objects.filter((object) => object !== container),
      apply,
      refused,
    );
  }

  /** Keeps created ids requested after creates or moves changed the ancestors. */
  private hierarchyChanged(): void {
    this.keepRequested = true;
    this.selectionChanged();
  }

  /** Forgets created but unselected objects once an empty selection is cleared again. */
  private createdRelease(): void {
    if (this.sync.replica.locks.requestedIds().size > 0) this.selectionChanged();
  }

  /** Coalesces selection callbacks. */
  private selectionChanged(): void {
    if (this.scheduled || !this.active) return;
    this.scheduled = true;
    queueMicrotask(() => {
      this.scheduled = false;
      if (this.active && this.sync.isSynced()) this.selectionApply();
    });
  }

  /**
   * Commits pending edits, makes the selection's subtrees the nodes the
   * tracker inspects every frame and schedules the selection broadcast.
   */
  private selectionApply(): void {
    this.sync.commit();
    const ids = this.selectionIds();
    if (this.keepRequested) this.requestedKept().forEach((id) => ids.add(id));
    this.keepRequested = false;
    this.sync.replica.locks.requestSet([...ids]);
    this.selectSchedule();
    this.changed();
  }

  /** Broadcasts the selection after a short pause when the relay supports it. */
  private selectSchedule(): void {
    if (this.transport.caps?.has(LOCKS_COLLABORATION_SELECT_CAP) !== true) return;
    if (this.selectTimer !== null) clearTimeout(this.selectTimer);
    this.selectTimer = setTimeout(() => {
      this.selectTimer = null;
      if (!this.active) return;
      const ids = this.selectedRoots().slice(0, LOCKS_COLLABORATION_SELECT_IDS);
      const key = ids.join('\n');
      if (key === this.selectSent) return;
      this.selectSent = key;
      this.transport.send({ t: 'select', ids });
    }, LOCKS_COLLABORATION_SELECT_DELAY_MS);
  }

  /**
   * Returns the node ids of the selected objects (not their subtrees).
   *
   * @returns Ids.
   */
  private selectedRoots(): string[] {
    const selection = this.host.selection;
    const nodes = this.sync.replica.applier.nodes();
    const ids = new Set<string>();
    [...selection.getAllSelectedObjectsAsArray(), ...selection.getInspectorObjects()].forEach((object) => {
      const ref = nodes.forObjectOrAncestor(object);
      if (ref !== undefined) ids.add(ref.id);
    });
    return [...ids];
  }

  /**
   * Returns requested ids that still exist.
   *
   * @returns Ids.
   */
  private requestedKept(): string[] {
    const nodes = this.sync.replica.applier.nodes();
    return [...this.sync.replica.locks.requestedIds()].filter((id) => nodes.get(id) !== undefined);
  }

  /**
   * Returns the selection's ids with their subtrees.
   *
   * @returns Ids.
   */
  private selectionIds(): Set<string> {
    const selection = this.host.selection;
    return this.objectIds([...selection.getAllSelectedObjectsAsArray(), ...selection.getInspectorObjects()]);
  }

  /**
   * Returns the ids of objects with their subtrees.
   *
   * @param objects Scene objects.
   * @returns Node ids.
   */
  private objectIds(objects: readonly THREE.Object3D[]): Set<string> {
    const replica = this.sync.replica;
    replica.applier.invalidate();
    return selectionCollaborationIds(replica.applier.nodes(), objects);
  }

  /**
   * Cancels the running tool when its operation has no lease: the tool's own
   * cancel restores its preview, the agreed state is put back, the selection
   * stays and the message names the member who is editing.
   *
   * @param event Why the operation stops.
   */
  private leaseEvent(event: SyncCollaborationLeaseEvent): void {
    if (!this.active) return;
    this.host.operationCancel();
    if (event.kind === 'hidden') return;
    const locks = this.sync.replica.locks;
    const conflicts = locksCollaborationConflicts(event.conflicts);
    conflicts.filter((entry) => entry.shared !== true).forEach((entry) => locks.apply(entry.by, [entry.id], []));
    this.sync.previewDrop(this.subtreeOf(event.ids));
    this.notice(this.leaseMessage(event, conflicts));
    const blocked = this.subtreeOf(event.ids).filter((id) => locks.heldByOther(id));
    if (event.blocker !== null) blocked.unshift(event.blocker.id);
    const holder = event.blocker?.holder ?? (blocked.length === 0 ? undefined : locks.holder(blocked[0] ?? ''));
    this.waiting =
      holder === undefined || !this.sync.pressing()
        ? null
        : { ids: blocked.slice(0, 256), label: event.ids[0] ?? '', holder };
    this.changed();
  }

  /**
   * Returns ids with their subtrees.
   *
   * @param ids Ids.
   * @returns Ids and descendants.
   */
  private subtreeOf(ids: readonly string[]): string[] {
    const nodes = this.sync.replica.applier.nodes();
    const all = new Set<string>();
    ids.forEach((id) => (nodes.get(id) === undefined ? all.add(id) : nodes.subtreeCollect(id, all)));
    return [...all];
  }

  /**
   * Builds the message of a cancelled operation.
   *
   * @param event Why the operation stopped.
   * @param conflicts Parsed conflicts of a refusal.
   * @returns Friendly message.
   */
  private leaseMessage(event: SyncCollaborationLeaseEvent, conflicts: readonly LocksCollaborationConflict[]): string {
    const target = this.objectLabel(event.ids[0] ?? '', 'this object');
    if (event.kind === 'expired') return `Your edit of ${target} timed out and was reverted; try again`;
    if (event.code === 'rate_limited' || event.code === 'throttled') {
      return 'Too many operations at once; wait a moment and try again';
    }
    if (event.code === 'lock_unverified') return `Can't edit ${target}: ${verifyCollaborationReason(event.why)}`;
    if (event.code === 'lock_limit') return 'This selection is too large to edit at once';
    const first = conflicts[0];
    const blocker = event.blocker ?? (first === undefined ? null : { id: first.id, holder: first.by });
    if (blocker !== null) {
      const refusal = this.idRefusal(event.ids[0] ?? blocker.id, 'edit');
      if (refusal !== null) return `${refusal.message}; try again when they are done`;
      const who = this.roster.nameOf(blocker.holder);
      return `Can't edit ${target} yet: ${who} is editing it; try again when they are done`;
    }
    return `Can't edit ${target} right now; try again`;
  }

  /**
   * Shows a notice unless the same one was just shown.
   *
   * @param message Notice.
   */
  private notice(message: string): void {
    const now = performance.now();
    if (message === this.noticeText && now - this.noticeAt < LOCKS_COLLABORATION_NOTICE_MS) return;
    this.noticeText = message;
    this.noticeAt = now;
    this.refusal = message;
    this.host.status(message);
  }

  /**
   * Tells the user why they cannot edit an object.
   *
   * @param refusal Refusal to show.
   */
  private refuse(refusal: LocksCollaborationRefusal): void {
    this.refusalLast = refusal;
    this.refusalId = refusal.id;
    this.notice(refusal.message);
  }

  /** Clears an earlier refusal once the holder finished. */
  private refusalRetract(): void {
    if (this.refusal === '') return;
    this.host.statusRetract(this.refusal);
    this.refusal = '';
    this.refusalId = '';
  }

  /**
   * Returns a readable label for a node.
   *
   * @param id Node id.
   * @param fallback Label of unnamed nodes.
   * @returns Quoted object name, or the fallback.
   */
  private objectLabel(id: string, fallback: string): string {
    return this.nameLabel(this.sync.replica.applier.nodes().get(id)?.object.name ?? '', fallback);
  }

  /**
   * Quotes an object name.
   *
   * @param name Object name.
   * @param fallback Label of unnamed objects.
   * @returns Quoted name, or the fallback.
   */
  private nameLabel(name: string, fallback: string): string {
    return name === '' ? fallback : `"${name}"`;
  }
}

/**
 * Parses the conflicts of a refused lease request.
 *
 * @param value Untrusted conflicts value.
 * @returns Valid conflicts.
 */
export function locksCollaborationConflicts(value: unknown): LocksCollaborationConflict[] {
  if (!Array.isArray(value)) return [];
  const conflicts: LocksCollaborationConflict[] = [];
  value.forEach((item: unknown) => {
    const entry = item as { id?: unknown; by?: unknown; shared?: unknown } | null;
    if (typeof entry?.id !== 'string' || typeof entry.by !== 'number') return;
    conflicts.push(
      entry.shared === true ? { id: entry.id, by: entry.by, shared: true } : { id: entry.id, by: entry.by },
    );
  });
  return conflicts;
}
