import { describe, expect, it } from 'vitest';
import {
  IndicatorCollaborationStatus,
  indicatorCollaborationSwatches,
  type IndicatorCollaborationView,
} from '@/collaboration/ui/indicator_collaboration_status.js';
import { MemberCollaborationRoster } from '@/collaboration/sync/member_collaboration_roster.js';

/**
 * Builds a room view with a number of members; member 1 is the owner and self.
 *
 * @param count Member count.
 * @returns View.
 */
function view(count: number): IndicatorCollaborationView {
  const roster = new MemberCollaborationRoster();
  for (let user = 1; user <= count; user++) roster.upsert(user, `Member ${user}`, user === 1, user - 1);
  return { state: 'room', room: 'Studio', self: 1, members: roster.list(), locks: new Map() };
}

describe('collaboration status member strip', () => {
  it('shows one colored swatch per member with the name as tooltip', () => {
    const swatches = indicatorCollaborationSwatches(view(3));
    expect(swatches.map((swatch) => swatch.title)).toEqual(['Member 1 (you)', 'Member 2', 'Member 3']);
    expect(new Set(swatches.map((swatch) => swatch.style.background)).size).toBe(3);
  });

  it('caps the strip and counts the rest', () => {
    const swatches = indicatorCollaborationSwatches(view(15));
    expect(swatches).toHaveLength(13);
    expect(swatches.at(-1)?.textContent).toBe('+3');
  });

  it('fills the strip in a room and empties it when offline', () => {
    const bar = document.createElement('div');
    const indicator = new IndicatorCollaborationStatus(bar, () => undefined);
    indicator.update(view(2));
    expect(bar.querySelectorAll('.editor-collaboration-strip > span')).toHaveLength(2);
    indicator.update({ ...view(2), state: 'offline' });
    expect(bar.querySelectorAll('.editor-collaboration-strip > span')).toHaveLength(0);
  });
});
