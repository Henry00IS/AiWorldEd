/**
 * Distinct member colors; orange hues are reserved for the local selection
 * highlight.
 */
export const MEMBER_COLLABORATION_COLORS: readonly number[] = [
  0x4aa3ff, 0x4cd964, 0xe056fd, 0x2fd4d4, 0xef4444, 0x9b6bff, 0xff5fa2, 0xa3e635, 0x14b8a6, 0x6366f1, 0xf5e663,
  0x38bdf8,
];

/** One member of the current room. */
export interface MemberCollaborationEntry {
  user: number;
  name: string;
  owner: boolean;
  color: number;
}

/**
 * Returns the display color of a user.
 *
 * @param user Relay user id.
 * @returns RGB color.
 */
export function memberCollaborationColor(user: number): number {
  const palette = MEMBER_COLLABORATION_COLORS;
  return palette[Math.abs(Math.trunc(user)) % palette.length] ?? 0x4aa3ff;
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
   */
  upsert(user: number, name: string, owner: boolean): void {
    this.members.set(user, { user, name, owner, color: memberCollaborationColor(user) });
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
   * Returns a member's display name, or a fallback.
   *
   * @param user Relay user id.
   * @returns Name.
   */
  nameOf(user: number): string {
    return this.members.get(user)?.name ?? `User ${user}`;
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
