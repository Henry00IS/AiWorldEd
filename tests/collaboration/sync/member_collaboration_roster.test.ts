import { describe, expect, it } from 'vitest';
import {
  MEMBER_COLLABORATION_COLORS,
  MemberCollaborationRoster,
  memberCollaborationColor,
  memberCollaborationCss,
} from '@/collaboration/sync/member_collaboration_roster.js';

/**
 * Returns the hue of an RGB color in degrees.
 *
 * @param color RGB color.
 * @returns Hue.
 */
function colorHue(color: number): number {
  const r = ((color >> 16) & 255) / 255;
  const g = ((color >> 8) & 255) / 255;
  const b = (color & 255) / 255;
  const max = Math.max(r, g, b);
  const delta = max - Math.min(r, g, b);
  if (delta === 0) return 0;
  if (max === r) return (60 * ((g - b) / delta) + 360) % 360;
  if (max === g) return 60 * ((b - r) / delta + 2);
  return 60 * ((r - g) / delta + 4);
}

/** Member roster and colors. */
describe('member_collaboration_roster', () => {
  it('never uses orange, which is reserved for the local selection', () => {
    MEMBER_COLLABORATION_COLORS.forEach((color) => {
      const hue = colorHue(color);
      expect(hue >= 15 && hue <= 45).toBe(false);
    });
  });

  it('assigns stable colors and formats them as CSS', () => {
    expect(memberCollaborationColor(7)).toBe(memberCollaborationColor(7));
    expect(memberCollaborationColor(-3)).toBe(memberCollaborationColor(3));
    expect(memberCollaborationCss(0x0000ff)).toBe('#0000ff');
  });

  it('lists members by user id and names unknown users', () => {
    const roster = new MemberCollaborationRoster();
    roster.upsert(5, 'Bob', false);
    roster.upsert(2, 'Alice', true);
    expect(roster.list().map((entry) => entry.name)).toEqual(['Alice', 'Bob']);
    expect(roster.nameOf(9)).toBe('User 9');
    roster.remove(5);
    expect(roster.get(5)).toBeUndefined();
    roster.clear();
    expect(roster.list()).toEqual([]);
  });
});
