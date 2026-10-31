import * as THREE from 'three';
import type { HostCollaborationEditor } from '@/collaboration/host/host_collaboration_editor.js';
import type { SyncCollaborationSession } from '@/collaboration/session/session_collaboration_sync.js';
import {
  memberCollaborationColor,
  memberCollaborationCss,
  type MemberCollaborationRoster,
} from '@/collaboration/sync/member_collaboration_roster.js';
import type { OutlinerRemoteHolder } from '@/outliner/ui/outliner_item.js';

/** Most selection boxes drawn per remote member. */
export const VISUALS_COLLABORATION_BOXES_PER_USER = 256;

/** Selection box of one remote holder. */
interface VisualsCollaborationBox {
  helper: THREE.BoxHelper;
  user: number;
}

/**
 * Shows what other members are editing: a box in their color around each object
 * they hold, in every viewport, and a tinted outliner row.
 */
export class VisualsCollaborationSession {
  private readonly host: HostCollaborationEditor;
  private readonly sync: SyncCollaborationSession;
  private readonly roster: MemberCollaborationRoster;
  private readonly boxes: Map<string, VisualsCollaborationBox>;
  private readonly resolver: (object: THREE.Object3D) => OutlinerRemoteHolder | null;

  /**
   * Creates the overlay manager.
   *
   * @param host Editor services.
   * @param sync Edit loop that owns the lock table.
   * @param roster Room members.
   */
  constructor(host: HostCollaborationEditor, sync: SyncCollaborationSession, roster: MemberCollaborationRoster) {
    this.host = host;
    this.sync = sync;
    this.roster = roster;
    this.boxes = new Map();
    this.resolver = (object) => this.holderOf(object);
  }

  /** Rebuilds boxes and outliner marks after locks or the scene changed. */
  update(): void {
    const wanted = this.wantedBoxes();
    this.boxes.forEach((box, id) => {
      if (wanted.get(id) !== box.user || !this.boxObject(id)) this.boxRemove(id);
    });
    wanted.forEach((user, id) => this.boxEnsure(id, user));
    this.host.outlinerHolderResolverSet(this.resolver);
  }

  /** Moves boxes along with remotely transformed objects. */
  follow(): void {
    this.boxes.forEach((box) => box.helper.update());
  }

  /** Removes every overlay and the outliner marks. */
  dispose(): void {
    [...this.boxes.keys()].forEach((id) => this.boxRemove(id));
    this.host.outlinerHolderResolverSet(null);
  }

  /**
   * Returns the top-most held node of each remote holder.
   *
   * @returns Holder by node id.
   */
  private wantedBoxes(): Map<string, number> {
    const wanted = new Map<string, number>();
    const locks = this.sync.replica.locks;
    const nodes = this.sync.replica.applier.nodes();
    locks.byUser().forEach((ids, user) => {
      if (user === locks.selfGet()) return;
      let count = 0;
      for (const id of ids) {
        if (count >= VISUALS_COLLABORATION_BOXES_PER_USER) break;
        if (locks.holder(nodes.parents.get(id) ?? '') === user || nodes.get(id) === undefined) continue;
        wanted.set(id, user);
        count += 1;
      }
    });
    return wanted;
  }

  /**
   * Returns the live object of a node.
   *
   * @param id Node id.
   * @returns Object in the scene, or null.
   */
  private boxObject(id: string): THREE.Object3D | null {
    const object = this.sync.replica.applier.nodes().get(id)?.object ?? null;
    return object !== null && object.parent !== null ? object : null;
  }

  /**
   * Adds a box for a held node when missing.
   *
   * @param id Node id.
   * @param user Holder.
   */
  private boxEnsure(id: string, user: number): void {
    const existing = this.boxes.get(id);
    if (existing !== undefined) {
      existing.helper.update();
      return;
    }
    const object = this.boxObject(id);
    if (object === null) return;
    const helper = new THREE.BoxHelper(object, memberCollaborationColor(user));
    helper.name = 'collaboration_remote_selection';
    const material = helper.material as THREE.LineBasicMaterial;
    material.depthTest = false;
    material.transparent = true;
    helper.renderOrder = 999;
    this.host.helperAdd(helper);
    this.boxes.set(id, { helper, user });
  }

  /**
   * Removes the box of a node.
   *
   * @param id Node id.
   */
  private boxRemove(id: string): void {
    const box = this.boxes.get(id);
    if (box === undefined) return;
    this.host.helperRemove(box.helper);
    box.helper.geometry.dispose();
    (box.helper.material as THREE.Material).dispose();
    this.boxes.delete(id);
  }

  /**
   * Returns the member holding an outliner object.
   *
   * @param object Outliner object.
   * @returns Holder name and color, or null.
   */
  private holderOf(object: THREE.Object3D): OutlinerRemoteHolder | null {
    const ref = this.sync.replica.applier.nodes().forObjectOrAncestor(object);
    if (ref === undefined) return null;
    const holder = this.sync.replica.locks.holder(ref.id);
    if (holder === undefined || holder === this.sync.replica.locks.selfGet()) return null;
    return { name: this.roster.nameOf(holder), color: memberCollaborationCss(memberCollaborationColor(holder)) };
  }
}
