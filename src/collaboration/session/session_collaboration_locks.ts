import type * as THREE from 'three';
import type { OutlinerEditGate, OutlinerMoveGate } from '@/outliner/ui/panel_outliner.js';
import type { SelectionAdmission } from '@/selection/object/manager_selection.js';
import type { HostCollaborationEditor } from '@/collaboration/host/host_collaboration_editor.js';
import type { SocketCollaborationMessage } from '@/collaboration/net/socket_collaboration_types.js';
import type { SessionCollaborationTransport } from '@/collaboration/session/session_collaboration_types.js';
import { verifyCollaborationReason } from '@/collaboration/sync/verify_collaboration_verdict.js';
import { sessionCollaborationStrings } from '@/collaboration/session/session_collaboration_types.js';
import type { SyncCollaborationSession } from '@/collaboration/session/session_collaboration_sync.js';
import type { TrackerCollaborationRefusal } from '@/collaboration/sync/tracker_collaboration_commit.js';
import type { MemberCollaborationRoster } from '@/collaboration/sync/member_collaboration_roster.js';
import {
  selectionCollaborationBlock,
  selectionCollaborationChunks,
  selectionCollaborationIds,
} from '@/collaboration/sync/selection_collaboration_locks.js';
import {
  hierarchyCollaborationBlock,
  hierarchyCollaborationChain,
  hierarchyCollaborationShared,
} from '@/collaboration/sync/hierarchy_collaboration_locks.js';

/** Conflict entry of a refused lock request. */
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

/** Retries of a selection lock the room owner did not confirm. */
export const LOCKS_COLLABORATION_UNVERIFIED_TRIES = 3;

/** Delay before the first retry; later retries wait proportionally longer. */
export const LOCKS_COLLABORATION_UNVERIFIED_DELAY_MS = 250;

/**
 * Keeps the relay's selection locks equal to the local selection. Locks are
 * hierarchical: a selected object is held with its whole subtree, its ancestors
 * are shared, objects inside or around what others edit cannot be selected, and
 * lost races deselect the contested objects.
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
  private pending: Promise<boolean>;
  private scheduled: boolean;
  private active: boolean;
  private refusal: string;
  private refusalId: string;
  private refusalLast: LocksCollaborationRefusal | null;
  private sharedSent: string | null;
  private keepRequested: boolean;
  private unverifiedTries: number;

  /**
   * Creates the lock coordinator.
   *
   * @param host Editor services.
   * @param transport Relay connection.
   * @param sync Edit loop that owns the lock table.
   * @param roster Room members.
   * @param changed Called after any lock change.
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
    this.admission = (meshes, inspector) => this.admit(meshes, inspector);
    this.selectionListener = () => this.selectionChanged();
    this.editGate = (object, select, apply, refused) => this.edit([object], select, apply, refused);
    this.moveGate = (objects, container, select, apply, refused) =>
      this.move(objects, container, select, apply, refused);
    this.pending = Promise.resolve(true);
    this.scheduled = false;
    this.active = false;
    this.refusal = '';
    this.refusalId = '';
    this.refusalLast = null;
    this.sharedSent = '';
    this.unverifiedTries = 0;
    this.keepRequested = false;
  }

  /** Installs selection admission, selection tracking and the outliner gates. */
  install(): void {
    this.active = true;
    this.host.selection.selectionAdmissionSet(this.admission);
    this.host.selection.onSelectionChanged(this.selectionListener);
    this.host.selection.emptyClearListenerSet(() => this.createdRelease());
    this.host.outlinerEditGateSet(this.editGate);
    this.host.outlinerMoveGateSet(this.moveGate);
    this.sync.hierarchyListenerSet(() => this.hierarchyChanged());
    this.sync.refusalDescriberSet((refusal) => this.refusalDescribe(refusal));
  }

  /**
   * Describes a create or move the tracker refused.
   *
   * @param refusal Refused node and the container another member holds.
   * @returns Status message.
   */
  private refusalDescribe(refusal: TrackerCollaborationRefusal): string {
    const verb = refusal.created ? 'add' : 'move';
    const object = this.nameLabel(refusal.name, 'this object');
    const container = this.nameLabel(refusal.containerName, 'that container');
    const who = this.roster.nameOf(refusal.holder);
    return `Can't ${verb} ${object} into ${container}: it is being edited by ${who}; reverted`;
  }

  /** Removes the selection hooks. */
  uninstall(): void {
    this.active = false;
    this.host.selection.selectionAdmissionSet(null);
    this.host.selection.offSelectionChanged(this.selectionListener);
    this.host.selection.emptyClearListenerSet(null);
    this.host.outlinerEditGateSet(null);
    this.host.outlinerMoveGateSet(null);
    this.sync.hierarchyListenerSet(null);
  }

  /**
   * Applies a lock broadcast or the lock list of room.joined.
   *
   * @param by Holder.
   * @param add Ids now held.
   * @param remove Ids released.
   */
  remoteLocks(by: number, add: readonly string[], remove: readonly string[]): void {
    this.sync.replica.locks.apply(by, add, remove);
    if (remove.includes(this.refusalId)) this.refusalRetract();
    this.changed();
  }

  /** Requests locks for the current selection (after sync completes). */
  selectionResend(): void {
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
   * Resolves with the outcome of the selection lock request in flight, once
   * pending selection callbacks were sent.
   *
   * @returns Resolves true when the selection is held.
   */
  async selectionSettled(): Promise<boolean> {
    await new Promise((resolve) => setTimeout(resolve, 0));
    return this.pending;
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
   * Returns why an object cannot be edited: another member edits it, something
   * inside it, or a container around it.
   *
   * @param object Scene object.
   * @param verb Action named in the message, for example "edit" or "move".
   * @returns Refusal, or null when the local user may lock it.
   */
  objectRefusal(object: THREE.Object3D, verb: string): LocksCollaborationRefusal | null {
    const replica = this.sync.replica;
    replica.applier.invalidate();
    const nodes = replica.applier.nodes();
    const ref = nodes.forObjectOrAncestor(object);
    if (ref === undefined) return null;
    const subtree = new Set<string>();
    nodes.subtreeCollect(ref.id, subtree);
    const inner = selectionCollaborationBlock(replica.locks, subtree);
    if (inner !== null) return this.innerRefusal(ref.id, inner, verb);
    const chain = hierarchyCollaborationChain((id) => nodes.parents.get(id), nodes.parents.get(ref.id) ?? '');
    const outer = hierarchyCollaborationBlock(replica.locks, chain);
    return outer === null ? null : this.aroundRefusal(ref.id, outer.id, outer.holder, verb);
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
    const reason = block.id === ref.id ? 'it is' : `${this.objectLabel(block.id, 'a container')} around it is`;
    return {
      id: block.id,
      holder: block.holder,
      message: `Can't move ${moved} into ${where}: ${reason} being edited by ${who}`,
    };
  }

  /**
   * Refusal for an object whose subtree contains a node another member holds.
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
      const message = `Can't ${verb} ${this.objectLabel(targetId, 'this object')}: ${inner} inside it is being edited by ${who}`;
      return { id: block.id, holder: block.holder, message };
    }
    const nodes = this.sync.replica.applier.nodes();
    const chain = hierarchyCollaborationChain((id) => nodes.parents.get(id), nodes.parents.get(targetId) ?? '');
    const outer = chain.filter((id) => this.sync.replica.locks.holder(id) === block.holder).at(-1);
    if (outer !== undefined) return this.aroundRefusal(targetId, outer, block.holder, verb);
    return {
      id: block.id,
      holder: block.holder,
      message: `${this.objectLabel(targetId, 'This object')} is being edited by ${who}`,
    };
  }

  /**
   * Refusal for an object inside a container another member holds.
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
    const message = `Can't ${verb} ${target}: ${container} around it is being edited by ${this.roster.nameOf(holder)}`;
    return { id: containerId, holder, message };
  }

  /**
   * Decides whether objects may join the selection.
   *
   * @param meshes Meshes to select.
   * @param inspector Non-mesh objects to select.
   * @returns True when nobody else holds them, anything inside or around them.
   */
  private admit(meshes: readonly THREE.Mesh[], inspector: readonly THREE.Object3D[]): boolean {
    if (!this.sync.isSynced()) {
      this.host.status('Still synchronizing the room scene...');
      return false;
    }
    for (const object of [...meshes, ...inspector]) {
      const refusal = this.objectRefusal(object, 'edit');
      if (refusal === null) continue;
      this.refuse(refusal);
      return false;
    }
    return true;
  }

  /**
   * Admits an outliner edit: refuses objects others hold up front, otherwise
   * selects the objects, waits for their locks and only then applies the edit.
   *
   * @param objects Objects the edit changes.
   * @param select Selects the objects' rows.
   * @param apply Applies the edit.
   * @param refused Called when the edit does not apply.
   */
  private edit(
    objects: readonly THREE.Object3D[],
    select: () => boolean,
    apply: () => void,
    refused: () => void,
  ): void {
    if (!this.admit([], objects)) {
      refused();
      return;
    }
    const ids = this.objectIds(objects);
    if (this.heldAll(ids)) {
      apply();
      return;
    }
    if (!select()) {
      refused();
      return;
    }
    void this.selectionSend().then((ok) => (ok && this.active && this.heldAll(ids) ? apply() : refused()));
  }

  /**
   * Admits an outliner move: refuses containers another member edits, then
   * gates the moved objects like any other outliner edit.
   *
   * @param objects Moved objects.
   * @param container New parent.
   * @param select Selects the moved rows.
   * @param apply Applies the move.
   * @param refused Called when the move does not apply.
   */
  private move(
    objects: readonly THREE.Object3D[],
    container: THREE.Object3D,
    select: () => boolean,
    apply: () => void,
    refused: () => void,
  ): void {
    const refusal = this.containerRefusal(objects, container);
    if (refusal !== null) {
      this.refuse(refusal);
      refused();
      return;
    }
    const moved = objects.filter((object) => object !== container);
    const block = moved.map((object) => this.objectRefusal(object, 'move')).find((entry) => entry !== null);
    if (block !== undefined && block !== null) {
      this.refuse(block);
      refused();
      return;
    }
    this.edit(moved, select, () => (this.containerRefusal(moved, container) === null ? apply() : refused()), refused);
  }

  /**
   * Returns whether this client holds every id.
   *
   * @param ids Node ids.
   * @returns True when all are held by this client.
   */
  private heldAll(ids: ReadonlySet<string>): boolean {
    const locks = this.sync.replica.locks;
    return [...ids].every((id) => locks.holder(id) === locks.selfGet());
  }

  /** Forces the next lock request after creates or moves changed the ancestors. */
  private hierarchyChanged(): void {
    this.sharedSent = null;
    this.keepRequested = true;
    this.selectionChanged();
  }

  /**
   * Releases objects this client created but never selected once the user
   * clears an already empty selection.
   */
  private createdRelease(): void {
    if (this.sync.replica.locks.requestedIds().size > 0) this.selectionChanged();
  }

  /** Coalesces selection callbacks into one lock request. */
  private selectionChanged(): void {
    if (this.scheduled || !this.active) return;
    this.scheduled = true;
    queueMicrotask(() => {
      this.scheduled = false;
      if (this.active && this.sync.isSynced()) void this.selectionSend();
    });
  }

  /**
   * Commits pending edits, then replaces the held locks with the selection: its
   * subtrees exclusively and their ancestors shared.
   *
   * @returns Resolves true once the relay granted the selection's locks.
   */
  private selectionSend(): Promise<boolean> {
    this.sync.commit();
    const exclusive = this.selectionIds();
    if (this.keepRequested) this.requestedKept().forEach((id) => exclusive.add(id));
    this.keepRequested = false;
    const ids = [...exclusive];
    const shared = this.sharedFor(exclusive, exclusive);
    const key = [...shared].sort().join('\n');
    const locks = this.sync.replica.locks;
    const requested = locks.requestedIds();
    const same = ids.length === requested.size && ids.every((id) => requested.has(id));
    if (same && key === this.sharedSent) return this.pending;
    locks.requestSet(ids);
    this.sharedSent = key;
    this.pending = Promise.all(this.lockMessages(ids, exclusive).map((message) => this.lockRequest(message))).then(
      (results) => results.every((ok) => ok),
    );
    this.changed();
    return this.pending;
  }

  /**
   * Returns requested ids that still exist (created but unselected nodes keep
   * their lock when only the ancestors changed).
   *
   * @returns Ids.
   */
  private requestedKept(): string[] {
    const nodes = this.sync.replica.applier.nodes();
    return [...this.sync.replica.locks.requestedIds()].filter((id) => nodes.get(id) !== undefined);
  }

  /**
   * Returns the ancestors some ids of a selection share, within the relay id
   * limit; the room owner confirms them against those ids.
   *
   * @param exclusive Every exclusive id of the selection.
   * @param members Ids whose ancestors are wanted.
   * @returns Shared ancestor ids.
   */
  private sharedFor(exclusive: ReadonlySet<string>, members: ReadonlySet<string>): string[] {
    if (members.size === 0) return [];
    const shared = hierarchyCollaborationShared(this.sync.replica.applier.nodes().parents, members);
    return shared.filter((id) => !exclusive.has(id)).slice(0, this.transport.limits.idsPerMessage);
  }

  /**
   * Builds the lock messages of a selection; the first replaces both kinds and
   * each carries the ancestors of its own ids.
   *
   * @param ids Exclusive ids.
   * @param exclusive Exclusive ids as a set.
   * @returns Messages in order.
   */
  private lockMessages(ids: readonly string[], exclusive: ReadonlySet<string>): object[] {
    const chunks = selectionCollaborationChunks(ids, this.transport.limits.idsPerMessage);
    if (chunks.length === 0) return [{ t: 'lock.release' }];
    return chunks.map((chunk, index) => {
      const message = { t: 'lock.acquire', ids: chunk, replace: index === 0 };
      const shared =
        chunks.length === 1 ? this.sharedFor(exclusive, exclusive) : this.sharedFor(exclusive, new Set(chunk));
      return shared.length > 0 ? { ...message, shared } : message;
    });
  }

  /**
   * Returns the ids the current selection must hold.
   *
   * @returns Selected node ids with their subtrees.
   */
  private selectionIds(): Set<string> {
    const selection = this.host.selection;
    return this.objectIds([...selection.getAllSelectedObjectsAsArray(), ...selection.getInspectorObjects()]);
  }

  /**
   * Returns the ids objects must hold to be edited.
   *
   * @param objects Scene objects.
   * @returns Node ids with their subtrees.
   */
  private objectIds(objects: readonly THREE.Object3D[]): Set<string> {
    const replica = this.sync.replica;
    replica.applier.invalidate();
    return selectionCollaborationIds(replica.applier.nodes(), objects);
  }

  /**
   * Sends a lock request and applies its result.
   *
   * @param message Lock message.
   * @returns Resolves true when the relay granted the request.
   */
  private lockRequest(message: object): Promise<boolean> {
    return this.transport
      .request(message)
      .then((reply) => this.lockResult(reply))
      .catch(() => false);
  }

  /**
   * Applies a lock result.
   *
   * @param reply Lock.result message.
   * @returns True when the request was granted.
   */
  private lockResult(reply: SocketCollaborationMessage): boolean | Promise<boolean> {
    if (!this.active) return false;
    const locks = this.sync.replica.locks;
    if (reply['ok'] === true) {
      locks.apply(
        locks.selfGet(),
        sessionCollaborationStrings(reply['add']),
        sessionCollaborationStrings(reply['remove']),
      );
      this.unverifiedTries = 0;
      this.refusalRetract();
      this.changed();
      return true;
    }
    this.sharedSent = null;
    if (reply['code'] === 'lock_unverified') return this.unverified(String(reply['why'] ?? ''));
    if (reply['code'] === 'lock_limit') {
      this.host.selection.clearSelection();
      this.host.status('Selection is too large to lock for editing');
      return false;
    }
    this.conflictsResolve(locksCollaborationConflicts(reply['conflicts']));
    return false;
  }

  /**
   * Retries a lock the room owner did not confirm after a short delay (the
   * hierarchy may have changed in flight), then gives up: clears the selection
   * and says why.
   *
   * @param why Relay detail of the denial.
   * @returns Result of the retry, or false.
   */
  private unverified(why: string): boolean | Promise<boolean> {
    const final = why === 'owner_timeout' || why === 'owner_left';
    if (!final && this.unverifiedTries < LOCKS_COLLABORATION_UNVERIFIED_TRIES) {
      this.unverifiedTries++;
      const delay = LOCKS_COLLABORATION_UNVERIFIED_DELAY_MS * this.unverifiedTries;
      return new Promise<void>((resolve) => setTimeout(resolve, delay)).then(() => this.unverifiedRetry());
    }
    this.unverifiedTries = 0;
    this.host.selection.clearSelection();
    this.refuse({ id: '', holder: -1, message: `Can't edit the selection: ${verifyCollaborationReason(why)}` });
    return false;
  }

  /**
   * Sends the current selection again after a denial.
   *
   * @returns Resolves true once the relay granted it.
   */
  private unverifiedRetry(): Promise<boolean> {
    if (!this.active || !this.sync.isSynced()) return Promise.resolve(false);
    this.sharedSent = null;
    return this.selectionSend();
  }

  /**
   * Deselects objects another member locked first, inside or around them.
   * Shared conflicts (someone edits inside) never enter the exclusive table.
   *
   * @param conflicts Contested ids and their holders.
   */
  private conflictsResolve(conflicts: LocksCollaborationConflict[]): void {
    const locks = this.sync.replica.locks;
    conflicts.filter((entry) => entry.shared !== true).forEach((entry) => locks.apply(entry.by, [entry.id], []));
    const contested = new Set(conflicts.map((conflict) => conflict.id));
    const selection = this.host.selection;
    const dropped: THREE.Object3D[] = [];
    const keep = (object: THREE.Object3D): boolean => {
      const hit = [...this.reach(object)].some((id) => contested.has(id));
      if (hit) dropped.push(object);
      return !hit;
    };
    const meshes = selection.getAllSelectedObjectsAsArray().filter(keep);
    const inspector = selection.getInspectorObjects().filter(keep);
    selection.setSelection(meshes, inspector);
    this.conflictReport(conflicts, dropped);
    this.changed();
  }

  /**
   * Returns the ids an object's lock touches: its subtree and its ancestors.
   *
   * @param object Scene object.
   * @returns Ids.
   */
  private reach(object: THREE.Object3D): Set<string> {
    const nodes = this.sync.replica.applier.nodes();
    const ids = selectionCollaborationIds(nodes, [object]);
    const ref = nodes.forObjectOrAncestor(object);
    if (ref === undefined) return ids;
    const parent = nodes.parents.get(ref.id) ?? '';
    hierarchyCollaborationChain((id) => nodes.parents.get(id), parent).forEach((id) => ids.add(id));
    return ids;
  }

  /**
   * Tells the user why a lock race was lost.
   *
   * @param conflicts Contested ids and their holders.
   * @param dropped Objects removed from the selection.
   */
  private conflictReport(conflicts: readonly LocksCollaborationConflict[], dropped: readonly THREE.Object3D[]): void {
    const first = conflicts[0];
    if (first === undefined) return;
    const object = dropped[0];
    const refusal = object === undefined ? null : this.objectRefusal(object, 'edit');
    if (refusal !== null) return this.refuse(refusal);
    const who = this.roster.nameOf(first.by);
    const label = this.objectLabel(first.id, 'This object');
    const message =
      first.shared === true
        ? `Can't edit ${label}: something inside it is being edited by ${who}`
        : `${label} is being edited by ${who}`;
    this.refuse({ id: first.id, holder: first.by, message });
  }

  /**
   * Tells the user why they cannot edit an object.
   *
   * @param refusal Refusal to show.
   */
  private refuse(refusal: LocksCollaborationRefusal): void {
    this.refusalLast = refusal;
    this.refusal = refusal.message;
    this.refusalId = refusal.id;
    this.host.status(this.refusal);
  }

  /** Clears an earlier refusal once a lock request succeeded. */
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
 * Parses the conflicts of a refused lock request.
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
