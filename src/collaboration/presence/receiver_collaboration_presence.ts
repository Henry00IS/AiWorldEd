import type { HostCollaborationEditor } from '@/collaboration/host/host_collaboration_editor.js';
import {
  CameraCollaborationPresence,
  type PresenceCollaborationItem,
} from '@/collaboration/presence/camera_collaboration_presence.js';
import {
  CHARACTER_COLLABORATION_MODEL_PLAYER,
  CharacterCollaborationPresence,
  type CharacterCollaborationModel,
} from '@/collaboration/presence/character_collaboration_presence.js';
import { PRESENCE_ID_CHARACTER, type PresenceFrame } from '@/collaboration/shared/presence_frame.js';
import type { MemberCollaborationRoster } from '@/collaboration/sync/member_collaboration_roster.js';

/** Clock and frame scheduling of the receiver (replaceable in tests). */
export interface ReceiverCollaborationPresenceOptions {
  now: () => number;
  schedule: (callback: () => void) => void;
  model: CharacterCollaborationModel;
}

/** Default receiver options: performance clock, animation frames, player model. */
export const RECEIVER_COLLABORATION_PRESENCE_DEFAULTS: ReceiverCollaborationPresenceOptions = {
  now: () => performance.now(),
  schedule: (callback) => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(callback);
    else setTimeout(callback, 16);
  },
  model: CHARACTER_COLLABORATION_MODEL_PLAYER,
};

/**
 * Shows the other members' cameras and characters as editor helpers and
 * interpolates between their updates, animating only while something moves.
 */
export class ReceiverCollaborationPresence {
  private readonly host: HostCollaborationEditor;
  private readonly roster: MemberCollaborationRoster;
  private readonly options: ReceiverCollaborationPresenceOptions;
  private readonly members: Map<number, Map<number, PresenceCollaborationItem>>;
  private scheduled: boolean;

  /**
   * Creates an empty receiver.
   *
   * @param host Editor services.
   * @param roster Member names and colors.
   * @param options Clock, scheduler and character model.
   */
  constructor(
    host: HostCollaborationEditor,
    roster: MemberCollaborationRoster,
    options: ReceiverCollaborationPresenceOptions = RECEIVER_COLLABORATION_PRESENCE_DEFAULTS,
  ) {
    this.host = host;
    this.roster = roster;
    this.options = options;
    this.members = new Map();
    this.scheduled = false;
  }

  /**
   * Applies a member's latest presence; entries missing from it disappear.
   *
   * @param frame Decoded frame.
   */
  frame(frame: PresenceFrame): void {
    if (this.roster.get(frame.sender) === undefined) return;
    const items = this.members.get(frame.sender) ?? new Map<number, PresenceCollaborationItem>();
    const now = this.options.now();
    const ids = new Set(frame.entries.map((entry) => entry.id));
    [...items.keys()].filter((id) => !ids.has(id)).forEach((id) => this.itemRemove(items, id));
    frame.entries.forEach((entry) => {
      const item = items.get(entry.id) ?? this.itemCreate(frame.sender, entry.id, items);
      item.target(entry, now);
    });
    if (items.size > 0) this.members.set(frame.sender, items);
    else this.members.delete(frame.sender);
    this.animate();
  }

  /**
   * Removes everything a member showed.
   *
   * @param user Member id.
   */
  memberLeft(user: number): void {
    const items = this.members.get(user);
    if (items === undefined) return;
    [...items.keys()].forEach((id) => this.itemRemove(items, id));
    this.members.delete(user);
  }

  /** Removes all remote presence. */
  clear(): void {
    [...this.members.keys()].forEach((user) => this.memberLeft(user));
  }

  /**
   * Returns the helper objects shown for a member.
   *
   * @param user Member id.
   * @returns Objects keyed by entry id.
   */
  objectsOf(user: number): Map<number, PresenceCollaborationItem['object']> {
    const items = this.members.get(user) ?? new Map<number, PresenceCollaborationItem>();
    return new Map([...items].map(([id, item]) => [id, item.object]));
  }

  /**
   * Creates and shows one item.
   *
   * @param user Member id.
   * @param id Entry id.
   * @param items Member items.
   * @returns New item.
   */
  private itemCreate(
    user: number,
    id: number,
    items: Map<number, PresenceCollaborationItem>,
  ): PresenceCollaborationItem {
    const name = this.roster.nameOf(user);
    const color = this.roster.colorOf(user);
    const item =
      id === PRESENCE_ID_CHARACTER
        ? new CharacterCollaborationPresence(name, color, this.options.model)
        : new CameraCollaborationPresence(name, color);
    items.set(id, item);
    this.host.helperAdd(item.object);
    return item;
  }

  /**
   * Hides and frees one item.
   *
   * @param items Member items.
   * @param id Entry id.
   */
  private itemRemove(items: Map<number, PresenceCollaborationItem>, id: number): void {
    const item = items.get(id);
    if (item === undefined) return;
    this.host.helperRemove(item.object);
    item.dispose();
    items.delete(id);
  }

  /** Runs interpolation frames until nothing moves. */
  private animate(): void {
    if (this.scheduled) return;
    this.scheduled = true;
    this.options.schedule(() => {
      this.scheduled = false;
      const now = this.options.now();
      let moving = false;
      this.members.forEach((items) => items.forEach((item) => (moving = item.update(now) || moving)));
      if (moving) this.animate();
    });
  }
}
