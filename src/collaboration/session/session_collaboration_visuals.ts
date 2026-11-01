import * as THREE from 'three';
import type { HostCollaborationEditor } from '@/collaboration/host/host_collaboration_editor.js';
import { NametagCollaborationPresence } from '@/collaboration/presence/nametag_collaboration_presence.js';
import type { SyncCollaborationSession } from '@/collaboration/session/session_collaboration_sync.js';
import {
  memberCollaborationCss,
  type MemberCollaborationRoster,
} from '@/collaboration/sync/member_collaboration_roster.js';
import type { OutlinerRemoteHolder } from '@/outliner/ui/outliner_item.js';

/** Most outline boxes drawn per remote member. */
export const VISUALS_COLLABORATION_BOXES_PER_USER = 256;
/** Opacity of a remote selection outline (an edit lease is drawn opaque). */
export const VISUALS_COLLABORATION_SELECTED_OPACITY = 0.45;
/** Lift of a name label above the labelled object, in screen pixels. */
const VISUALS_COLLABORATION_TAG_LIFT_PX = 6;

/** What a remote member does with a node. */
interface VisualsCollaborationWant {
  user: number;
  /** True while their edit lease covers the node, false when only selected. */
  editing: boolean;
}

/** Outline box of one remote member. */
interface VisualsCollaborationBox extends VisualsCollaborationWant {
  helper: THREE.BoxHelper;
}

/** Name label of one remote member, on their first outlined node. */
interface VisualsCollaborationTag extends VisualsCollaborationWant {
  id: string;
  tag: NametagCollaborationPresence;
}

/**
 * Shows what other members select and edit, like a shared spreadsheet: a
 * translucent outline in their color around each selected object, an opaque one
 * while their edit lease holds it, a name label in every viewport, and an
 * outliner marker that tells "Selected by" from "Being edited by".
 */
export class VisualsCollaborationSession {
  private readonly host: HostCollaborationEditor;
  private readonly sync: SyncCollaborationSession;
  private readonly roster: MemberCollaborationRoster;
  private readonly selections: () => ReadonlyMap<number, readonly string[]>;
  private readonly boxes: Map<string, VisualsCollaborationBox>;
  private readonly tags: Map<number, VisualsCollaborationTag>;
  private readonly resolver: (object: THREE.Object3D) => OutlinerRemoteHolder | null;
  private selected: Map<string, number>;

  /**
   * Creates the overlay manager.
   *
   * @param host Editor services.
   * @param sync Edit loop that owns the lock table.
   * @param roster Room members.
   * @param selections Remote selections by member.
   */
  constructor(
    host: HostCollaborationEditor,
    sync: SyncCollaborationSession,
    roster: MemberCollaborationRoster,
    selections: () => ReadonlyMap<number, readonly string[]> = () => new Map(),
  ) {
    this.host = host;
    this.sync = sync;
    this.roster = roster;
    this.selections = selections;
    this.boxes = new Map();
    this.tags = new Map();
    this.selected = new Map();
    this.resolver = (object) => this.holderOf(object);
  }

  /**
   * Rebuilds outlines, labels and outliner marks after locks, selections or the
   * scene changed.
   */
  update(): void {
    const wanted = this.wantedBoxes();
    this.boxes.forEach((box, id) => {
      const want = wanted.get(id);
      if (want?.user !== box.user || want.editing !== box.editing || !this.boxObject(id)) this.boxRemove(id);
    });
    wanted.forEach((want, id) => this.boxEnsure(id, want));
    this.tagsUpdate(wanted);
    this.host.outlinerHolderResolverSet(this.resolver);
  }

  /** Moves outlines and labels along with remotely transformed objects. */
  follow(): void {
    this.boxes.forEach((box) => box.helper.update());
    this.tags.forEach((entry) => this.tagAnchor(entry));
  }

  /** Removes every overlay and the outliner marks. */
  dispose(): void {
    [...this.boxes.keys()].forEach((id) => this.boxRemove(id));
    [...this.tags.keys()].forEach((user) => this.tagRemove(user));
    this.selected.clear();
    this.host.outlinerHolderResolverSet(null);
  }

  /**
   * Returns the top-most node each remote member edits or selects; edits win
   * over selections.
   *
   * @returns Want by node id.
   */
  private wantedBoxes(): Map<string, VisualsCollaborationWant> {
    const wanted = new Map<string, VisualsCollaborationWant>();
    const locks = this.sync.replica.locks;
    const nodes = this.sync.replica.applier.nodes();
    const self = locks.selfGet();
    locks.byUser().forEach((ids, user) => {
      if (user === self) return;
      let count = 0;
      for (const id of ids) {
        if (count >= VISUALS_COLLABORATION_BOXES_PER_USER) break;
        if (locks.holder(nodes.parents.get(id) ?? '') === user || nodes.get(id) === undefined) continue;
        wanted.set(id, { user, editing: true });
        count += 1;
      }
    });
    this.selected = new Map();
    this.selections().forEach((ids, user) => {
      if (user === self || this.roster.get(user) === undefined) return;
      let count = 0;
      for (const id of ids) {
        if (count >= VISUALS_COLLABORATION_BOXES_PER_USER) break;
        if (nodes.get(id) === undefined) continue;
        if (!this.selected.has(id)) this.selected.set(id, user);
        if (!wanted.has(id)) wanted.set(id, { user, editing: false });
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
   * Adds an outline for a node when missing.
   *
   * @param id Node id.
   * @param want Member and mode.
   */
  private boxEnsure(id: string, want: VisualsCollaborationWant): void {
    const existing = this.boxes.get(id);
    if (existing !== undefined) {
      existing.helper.update();
      return;
    }
    const object = this.boxObject(id);
    if (object === null) return;
    const helper = new THREE.BoxHelper(object, this.roster.colorOf(want.user));
    helper.name = want.editing ? 'collaboration_remote_edit' : 'collaboration_remote_selection';
    const material = helper.material as THREE.LineBasicMaterial;
    material.depthTest = false;
    material.transparent = true;
    material.opacity = want.editing ? 1 : VISUALS_COLLABORATION_SELECTED_OPACITY;
    helper.renderOrder = want.editing ? 999 : 998;
    helper.raycast = () => undefined;
    this.host.helperAdd(helper);
    this.boxes.set(id, { helper, ...want });
  }

  /**
   * Removes the outline of a node.
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
   * Keeps one name label per remote member on their first outlined node;
   * "editing" is added while their lease holds it.
   *
   * @param wanted Wanted outlines.
   */
  private tagsUpdate(wanted: ReadonlyMap<string, VisualsCollaborationWant>): void {
    const first = new Map<number, { id: string; editing: boolean }>();
    wanted.forEach((want, id) => {
      const known = first.get(want.user);
      if (known === undefined || (want.editing && !known.editing)) first.set(want.user, { id, editing: want.editing });
    });
    this.tags.forEach((entry, user) => {
      const want = first.get(user);
      if (want === undefined || want.editing !== entry.editing || !this.boxObject(entry.id)) this.tagRemove(user);
      else entry.id = want.id;
    });
    first.forEach((want, user) => {
      if (this.tags.has(user) || this.boxObject(want.id) === null) return;
      const name = this.roster.nameOf(user);
      const tag = new NametagCollaborationPresence(
        want.editing ? `${name} · editing` : name,
        this.roster.colorOf(user),
        { world: 0, pixels: VISUALS_COLLABORATION_TAG_LIFT_PX },
      );
      tag.sprite.name = 'collaboration_remote_name';
      const entry: VisualsCollaborationTag = { user, editing: want.editing, id: want.id, tag };
      this.tagAnchor(entry);
      this.host.helperAdd(tag.sprite);
      this.tags.set(user, entry);
    });
  }

  /**
   * Places a label above the top center of its node's bounds.
   *
   * @param entry Label.
   */
  private tagAnchor(entry: VisualsCollaborationTag): void {
    const box = this.boxes.get(entry.id);
    if (box === undefined) return;
    box.helper.geometry.computeBoundingBox();
    const bounds = box.helper.geometry.boundingBox;
    if (bounds === null || bounds.isEmpty()) return;
    entry.tag.anchor.set((bounds.min.x + bounds.max.x) / 2, bounds.max.y, (bounds.min.z + bounds.max.z) / 2);
  }

  /**
   * Removes the label of a member.
   *
   * @param user Member id.
   */
  private tagRemove(user: number): void {
    const entry = this.tags.get(user);
    if (entry === undefined) return;
    this.host.helperRemove(entry.tag.sprite);
    entry.tag.dispose();
    this.tags.delete(user);
  }

  /**
   * Returns the member editing or selecting an outliner object.
   *
   * @param object Outliner object.
   * @returns Name, color and mode, or null.
   */
  private holderOf(object: THREE.Object3D): OutlinerRemoteHolder | null {
    const ref = this.sync.replica.applier.nodes().forObjectOrAncestor(object);
    if (ref === undefined) return null;
    const self = this.sync.replica.locks.selfGet();
    const holder = this.sync.replica.locks.holder(ref.id);
    if (holder !== undefined && holder !== self) {
      return {
        name: this.roster.nameOf(holder),
        color: memberCollaborationCss(this.roster.colorOf(holder)),
        editing: true,
      };
    }
    const user = this.selected.get(ref.id);
    if (user === undefined) return null;
    return { name: this.roster.nameOf(user), color: memberCollaborationCss(this.roster.colorOf(user)), editing: false };
  }
}
