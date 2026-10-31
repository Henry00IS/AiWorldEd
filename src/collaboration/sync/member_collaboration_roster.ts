import { colorCollaborationOklch } from '@/collaboration/sync/color_collaboration_oklch.js';
import { displayNameFallback } from '@/collaboration/shared/room_name_policy.js';

/** Golden ratio conjugate: successive slots land in the largest hue gap. */
export const MEMBER_COLLABORATION_GOLDEN = 0.6180339887498949;
/**
 * First OKLCH hue members may use; 25..100 degrees (orange) is the local
 * selection.
 */
export const MEMBER_COLLABORATION_HUE_START = 100;
/** Width of the usable OKLCH hue arc in degrees. */
export const MEMBER_COLLABORATION_HUE_SPAN = 285;
/** Offset that puts slot 0 (usually the owner) on blue. */
const MEMBER_COLLABORATION_HUE_OFFSET = 0.52;
/** OKLab lightness levels cycled per slot so neighbors also differ in lightness. */
const MEMBER_COLLABORATION_LIGHTNESS: readonly number[] = [0.74, 0.64, 0.84];
/** Wanted OKLCH chroma before gamut mapping. */
const MEMBER_COLLABORATION_CHROMA = 0.17;
/** Color of users the roster does not know (yet). */
export const MEMBER_COLLABORATION_UNKNOWN_COLOR = 0x9ca3af;

/** One member of the current room. */
export interface MemberCollaborationEntry {
  user: number;
  name: string;
  owner: boolean;
  /** Color slot assigned by the relay. */
  slot: number;
  /** RGB color of the slot. */
  color: number;
}

/**
 * Returns the OKLCH hue of a color slot: golden-ratio steps over the hue arc
 * without orange, so any number of members get well separated hues.
 *
 * @param slot Color slot assigned by the relay.
 * @returns Hue in degrees.
 */
export function memberCollaborationHue(slot: number): number {
  const turn = (MEMBER_COLLABORATION_HUE_OFFSET + Math.abs(Math.trunc(slot)) * MEMBER_COLLABORATION_GOLDEN) % 1;
  return (MEMBER_COLLABORATION_HUE_START + turn * MEMBER_COLLABORATION_HUE_SPAN) % 360;
}

/**
 * Returns the display color of a color slot (OKLCH, gamut mapped to sRGB).
 *
 * @param slot Color slot assigned by the relay (lowest free index).
 * @returns RGB color.
 */
export function memberCollaborationColor(slot: number): number {
  const levels = MEMBER_COLLABORATION_LIGHTNESS;
  const lightness = levels[Math.abs(Math.trunc(slot)) % levels.length] ?? 0.74;
  return colorCollaborationOklch(lightness, MEMBER_COLLABORATION_CHROMA, memberCollaborationHue(slot));
}

/**
 * Formats a color as a CSS hex string.
 *
 * @param color RGB color.
 * @returns CSS color.
 */
export function memberCollaborationCss(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

/** Members of the current room keyed by relay user id. */
export class MemberCollaborationRoster {
  private readonly members: Map<number, MemberCollaborationEntry>;

  /** Creates an empty roster. */
  constructor() {
    this.members = new Map();
  }

  /**
   * Adds or updates a member.
   *
   * @param user Relay user id.
   * @param name Display name.
   * @param owner True for the room owner.
   * @param slot Color slot assigned by the relay.
   */
  upsert(user: number, name: string, owner: boolean, slot: number): void {
    this.members.set(user, { user, name, owner, slot, color: memberCollaborationColor(slot) });
  }

  /**
   * Removes a member.
   *
   * @param user Relay user id.
   */
  remove(user: number): void {
    this.members.delete(user);
  }

  /**
   * Returns a member.
   *
   * @param user Relay user id.
   * @returns Member, or undefined.
   */
  get(user: number): MemberCollaborationEntry | undefined {
    return this.members.get(user);
  }

  /**
   * Returns a member's color, or a neutral gray for unknown users.
   *
   * @param user Relay user id.
   * @returns RGB color.
   */
  colorOf(user: number): number {
    return this.members.get(user)?.color ?? MEMBER_COLLABORATION_UNKNOWN_COLOR;
  }

  /**
   * Returns a member's display name, or a fallback.
   *
   * @param user Relay user id.
   * @returns Name.
   */
  nameOf(user: number): string {
    return this.members.get(user)?.name ?? displayNameFallback(user);
  }

  /**
   * Returns every member sorted by user id.
   *
   * @returns Members.
   */
  list(): MemberCollaborationEntry[] {
    return [...this.members.values()].sort((a, b) => a.user - b.user);
  }

  /** Forgets every member. */
  clear(): void {
    this.members.clear();
  }
}
