import { describe, expect, it } from 'vitest';
import {
  IndicatorCollaborationStatus,
  indicatorCollaborationSwatches,
  type IndicatorCollaborationView,
} from '@/collaboration/ui/indicator_collaboration_status.js';
import { MemberCollaborationRoster } from '@/collaboration/sync/member_collaboration_roster.js';
import { StatusBar, STATUS_BAR_LABEL_CLASS } from '@/ui/status/status_bar.js';
import { Theme } from '@/theme.js';

/**
 * Builds a room view with a number of members; member 1 is the owner and self.
 *
 * @param count Member count.
 * @returns View.
 */
function view(count: number): IndicatorCollaborationView {
  const roster = new MemberCollaborationRoster();
  for (let user = 1; user <= count; user++) roster.upsert(user, `Member ${user}`, user === 1, user - 1);
  return { state: 'room', room: 'Studio', self: 1, members: roster.list(), locks: new Map(), password: '' };
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

  it('lists the room password with reveal and copy only when it is known', () => {
    const bar = document.createElement('div');
    document.body.appendChild(bar);
    const indicator = new IndicatorCollaborationStatus(bar, () => undefined);
    indicator.update({ ...view(1), password: 'Correct-Horse-42' });
    bar.querySelector<HTMLButtonElement>('.editor-collaboration-status')?.click();
    const row = document.querySelector('.editor-collaboration-password');
    expect(row?.textContent).not.toContain('Correct-Horse-42');
    [...(row?.querySelectorAll('button') ?? [])].find((button) => button.textContent === 'Show')?.click();
    expect(row?.textContent).toContain('Correct-Horse-42');
    indicator.update(view(1));
    expect(document.querySelector('.editor-collaboration-password')).toBeNull();
    indicator.dispose();
    bar.remove();
  });
});

describe('collaboration status bar styling', () => {
  it('uses the status bar label style in every state', () => {
    const host = document.createElement('div');
    const statusBar = new StatusBar(host, Theme);
    const root = statusBar.getRootElement();
    const indicator = new IndicatorCollaborationStatus(root, () => undefined);
    const builtIn = [...root.querySelectorAll<HTMLElement>(`.${STATUS_BAR_LABEL_CLASS}`)].find((label) =>
      (label.textContent ?? '').startsWith('Mode:'),
    );
    expect(builtIn).toBeDefined();
    const chip = root.querySelector<HTMLElement>('.editor-collaboration-status');
    expect(chip).not.toBeNull();
    for (const state of ['connecting', 'lobby', 'offline', 'reconnecting', 'room'] as const) {
      indicator.update({ ...view(15), state });
      const label = chip?.querySelector<HTMLElement>(`span.${STATUS_BAR_LABEL_CLASS}`);
      for (const element of [chip, label]) {
        expect(element?.classList.contains(STATUS_BAR_LABEL_CLASS)).toBe(true);
        expect(element?.style.fontFamily).toBe(builtIn?.style.fontFamily);
        expect(element?.style.fontSize).toBe(builtIn?.style.fontSize);
        expect(element?.style.color).toBe(builtIn?.style.color);
      }
    }
    expect(chip?.querySelector('.editor-collaboration-strip > span:last-child')?.classList).toContain(
      STATUS_BAR_LABEL_CLASS,
    );
    indicator.dispose();
    statusBar.dispose();
  });
});
