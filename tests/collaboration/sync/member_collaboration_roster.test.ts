import { describe, expect, it } from 'vitest';
import {
  MEMBER_COLLABORATION_UNKNOWN_COLOR,
  MemberCollaborationRoster,
  memberCollaborationColor,
  memberCollaborationCss,
  memberCollaborationHue,
} from '@/collaboration/sync/member_collaboration_roster.js';

/** Slots checked for distinctness: a full room of twelve. */
const SLOTS = Array.from({ length: 12 }, (_, slot) => slot);

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
    Array.from({ length: 64 }, (_, slot) => memberCollaborationColor(slot)).forEach((color) => {
      const hue = colorHue(color);
      expect(hue >= 15 && hue <= 50).toBe(false);
    });
  });

  it('spreads the hues of a full room by golden-ratio steps', () => {
    const hues = SLOTS.map(memberCollaborationHue);
    hues.forEach((hue, index) =>
      hues.slice(index + 1).forEach((other) => {
        const gap = Math.min(Math.abs(hue - other), 360 - Math.abs(hue - other));
        expect(gap).toBeGreaterThan(9);
      }),
    );
    expect(new Set(SLOTS.map(memberCollaborationColor)).size).toBe(SLOTS.length);
  });

  it('assigns stable colors per slot and formats them as CSS', () => {
    expect(memberCollaborationColor(7)).toBe(memberCollaborationColor(7));
    expect(memberCollaborationColor(-3)).toBe(memberCollaborationColor(3));
    expect(colorHue(memberCollaborationColor(0))).toBeGreaterThan(190);
    expect(colorHue(memberCollaborationColor(0))).toBeLessThan(230);
    expect(memberCollaborationCss(0x0000ff)).toBe('#0000ff');
  });

  it('lists members by user id and names unknown users', () => {
    const roster = new MemberCollaborationRoster();
    roster.upsert(5, 'Bob', false, 1);
    roster.upsert(2, 'Alice', true, 0);
    expect(roster.colorOf(5)).toBe(memberCollaborationColor(1));
    expect(roster.colorOf(9)).toBe(MEMBER_COLLABORATION_UNKNOWN_COLOR);
    expect(roster.list().map((entry) => entry.name)).toEqual(['Alice', 'Bob']);
    expect(roster.nameOf(9)).toBe('User 9');
    roster.remove(5);
    expect(roster.get(5)).toBeUndefined();
    roster.clear();
    expect(roster.list()).toEqual([]);
  });
});
