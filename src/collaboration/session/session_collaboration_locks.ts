import type * as THREE from 'three';
import type { OutlinerEditGate } from '@/outliner/ui/panel_outliner.js';
import type { SelectionAdmission } from '@/selection/object/manager_selection.js';
import type { HostCollaborationEditor } from '@/collaboration/host/host_collaboration_editor.js';
import type { SocketCollaborationMessage } from '@/collaboration/net/socket_collaboration_types.js';
import type { SessionCollaborationTransport } from '@/collaboration/session/session_collaboration_types.js';
import { sessionCollaborationStrings } from '@/collaboration/session/session_collaboration_types.js';
import type { SyncCollaborationSession } from '@/collaboration/session/session_collaboration_sync.js';
import type { MemberCollaborationRoster } from '@/collaboration/sync/member_collaboration_roster.js';
import {
  selectionCollaborationBlock,
  selectionCollaborationChunks,
  selectionCollaborationIds,
} from '@/collaboration/sync/selection_collaboration_locks.js';

/** Conflict entry of a refused lock request. */
interface LocksCollaborationConflict {
  id: string;
  by: number;
}

/**
 * Keeps the relay's selection locks equal to the local selection: selecting an
 * object locks it and its subtree, objects held by others cannot be selected,
 * and lost races deselect the contested objects.
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
  private pending: Promise<boolean>;
  private scheduled: boolean;
  private active: boolean;
  private refusal: string;
  private refusalId: string;

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
    this.editGate = (object, select, apply, refused) => this.edit(object, select, apply, refused);
    this.pending = Promise.resolve(true);
    this.scheduled = false;
    this.active = false;
    this.refusal = '';
    this.refusalId = '';
  }

  /** Installs selection admission and selection tracking. */
  install(): void {
    this.active = true;
    this.host.selection.selectionAdmissionSet(this.admission);
    this.host.selection.onSelectionChanged(this.selectionListener);
    this.host.outlinerEditGateSet(this.editGate);
  }

  /** Removes the selection hooks. */
  uninstall(): void {
    this.active = false;
    this.host.selection.selectionAdmissionSet(null);
    this.host.selection.offSelectionChanged(this.selectionListener);
    this.host.outlinerEditGateSet(null);
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
   * Decides whether objects may join the selection.
   *
   * @param meshes Meshes to select.
   * @param inspector Non-mesh objects to select.
   * @returns True when nobody else holds them.
   */
  private admit(meshes: readonly THREE.Mesh[], inspector: readonly THREE.Object3D[]): boolean {
    if (!this.sync.isSynced()) {
      this.host.status('Still synchronizing the room scene...');
      return false;
    }
    const replica = this.sync.replica;
    replica.applier.invalidate();
    const ids = selectionCollaborationIds(replica.applier.nodes(), [...meshes, ...inspector]);
    const block = selectionCollaborationBlock(replica.locks, ids);
    if (block === null) return true;
    this.refuse(block.id, block.holder);
    return false;
  }

  /**
   * Admits an outliner edit: refuses objects others hold up front, otherwise
   * selects the object, waits for its lock and only then applies the edit.
   *
   * @param object Object the edit changes.
   * @param select Selects the object's row.
   * @param apply Applies the edit.
   * @param refused Called when the edit does not apply.
   */
  private edit(object: THREE.Object3D, select: () => boolean, apply: () => void, refused: () => void): void {
    if (!this.admit([], [object])) {
      refused();
      return;
    }
    const ids = this.objectIds([object]);
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
   * Returns whether this client holds every id.
   *
   * @param ids Node ids.
   * @returns True when all are held by this client.
   */
  private heldAll(ids: ReadonlySet<string>): boolean {
    const locks = this.sync.replica.locks;
    return [...ids].every((id) => locks.holder(id) === locks.selfGet());
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
   * Commits pending edits, then replaces the held locks with the selection.
   *
   * @returns Resolves true once the relay granted the selection's locks.
   */
  private selectionSend(): Promise<boolean> {
    this.sync.commit();
    const ids = [...this.selectionIds()];
    const locks = this.sync.replica.locks;
    const requested = locks.requestedIds();
    if (ids.length === requested.size && ids.every((id) => requested.has(id))) return this.pending;
    locks.requestSet(ids);
    const chunks = selectionCollaborationChunks(ids, this.transport.limits.idsPerMessage);
    const replies =
      chunks.length === 0
        ? [this.lockRequest({ t: 'lock.release' })]
        : chunks.map((chunk, index) => this.lockRequest({ t: 'lock.acquire', ids: chunk, replace: index === 0 }));
    this.pending = Promise.all(replies).then((results) => results.every((ok) => ok));
    this.changed();
    return this.pending;
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
  private lockResult(reply: SocketCollaborationMessage): boolean {
    if (!this.active) return false;
    const locks = this.sync.replica.locks;
    if (reply['ok'] === true) {
      locks.apply(
        locks.selfGet(),
        sessionCollaborationStrings(reply['add']),
        sessionCollaborationStrings(reply['remove']),
      );
      this.refusalRetract();
      this.changed();
      return true;
    }
    if (reply['code'] === 'lock_limit') {
      this.host.selection.clearSelection();
      this.host.status('Selection is too large to lock for editing');
      return false;
    }
    this.conflictsResolve(locksCollaborationConflicts(reply['conflicts']));
    return false;
  }

  /**
   * Deselects objects another member locked first.
   *
   * @param conflicts Contested ids and their holders.
   */
  private conflictsResolve(conflicts: LocksCollaborationConflict[]): void {
    const locks = this.sync.replica.locks;
    conflicts.forEach((conflict) => locks.apply(conflict.by, [conflict.id], []));
    const contested = new Set(conflicts.map((conflict) => conflict.id));
    const nodes = this.sync.replica.applier.nodes();
    const selection = this.host.selection;
    const keep = (object: THREE.Object3D): boolean =>
      ![...selectionCollaborationIds(nodes, [object])].some((id) => contested.has(id));
    const meshes = selection.getAllSelectedObjectsAsArray().filter(keep);
    const inspector = selection.getInspectorObjects().filter(keep);
    selection.setSelection(meshes, inspector);
    const first = conflicts[0];
    if (first !== undefined) this.refuse(first.id, first.by);
    this.changed();
  }

  /**
   * Tells the user who holds an object they cannot edit.
   *
   * @param id Held node id.
   * @param holder Holding member.
   */
  private refuse(id: string, holder: number): void {
    this.refusal = `${this.objectLabel(id)} is being edited by ${this.roster.nameOf(holder)}`;
    this.refusalId = id;
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
   * @returns Quoted object name, or a generic label.
   */
  private objectLabel(id: string): string {
    const name = this.sync.replica.applier.nodes().get(id)?.object.name ?? '';
    return name === '' ? 'This object' : `"${name}"`;
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
    const entry = item as { id?: unknown; by?: unknown } | null;
    if (typeof entry?.id === 'string' && typeof entry.by === 'number') conflicts.push({ id: entry.id, by: entry.by });
  });
  return conflicts;
}
