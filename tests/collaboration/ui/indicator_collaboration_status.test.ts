import { describe, expect, it } from 'vitest';
import {
  IndicatorCollaborationStatus,
  indicatorCollaborationCaption,
  indicatorCollaborationSwatches,
  type IndicatorCollaborationView,
} from '@/collaboration/ui/indicator_collaboration_status.js';
import { MemberCollaborationRoster } from '@/collaboration/sync/member_collaboration_roster.js';
import { StatusBar, STATUS_BAR_LABEL_CLASS } from '@/ui/status/status_bar.js';
import { FloatingPanelStack } from '@/ui/floating_panel/panel_floating_stack.js';
import {
  menuPopoverDismissProbeEscape,
  menuPopoverDismissProbePress,
  menuPopoverDismissProbeShortcutsInstall,
  menuPopoverDismissProbeViewportCreate,
} from '../../ui/menu/menu_popover_dismiss_probe.js';

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
    const statusBar = new StatusBar(host);
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

  it('shows the worldwide count online and capitalized users in a room', () => {
    expect(indicatorCollaborationCaption({ ...view(2), state: 'lobby', online: 15 })).toBe(
      'Online \u00b7 15 Worldwide \u{1F310}',
    );
    expect(indicatorCollaborationCaption({ ...view(1), state: 'lobby' })).toBe('Online');
    expect(indicatorCollaborationCaption(view(1))).toBe('Studio \u00b7 1 User');
    expect(indicatorCollaborationCaption(view(2))).toBe('Studio \u00b7 2 Users');
  });
});

/** Room captions, popup headers and remote member names remain text everywhere. */
it('keeps hostile room and member strings inert in the header, swatches and roster popup', () => {
  const payload = '<script>alert(1)</script><img src=x onerror=alert(1)>javascript:alert(1)' + 'x'.repeat(5000);
  const bar = document.createElement('div');
  document.body.append(bar);
  const indicator = new IndicatorCollaborationStatus(bar, () => undefined);
  const original = view(2);
  indicator.update({
    ...original,
    room: payload,
    members: original.members.map((member) => ({ ...member, name: payload })),
  });
  expect(bar.textContent).toContain(payload);
  expect(bar.querySelector('script,img,iframe,a')).toBeNull();
  bar.querySelector<HTMLButtonElement>('.editor-collaboration-status')?.click();
  expect(document.body.textContent).toContain(payload);
  expect(document.body.querySelector('script,img,iframe,a')).toBeNull();
  indicator.dispose();
  bar.remove();
});

/** Open users popover with its status bar and cleanup. */
interface IndicatorCollaborationOpenPopover {
  popover: HTMLElement;
  chip: HTMLButtonElement;
  close: () => void;
}

/**
 * Builds an indicator in a room and opens its users popover from the chip.
 *
 * @returns Open popover parts.
 */
function indicatorCollaborationPopoverOpen(): IndicatorCollaborationOpenPopover {
  const bar = document.createElement('div');
  document.body.appendChild(bar);
  const indicator = new IndicatorCollaborationStatus(bar, () => undefined);
  indicator.update({ ...view(2), password: 'Correct-Horse-42' });
  const chip = bar.querySelector<HTMLButtonElement>('.editor-collaboration-status');
  if (chip === null) throw new Error('status chip missing');
  menuPopoverDismissProbePress(chip);
  chip.click();
  const popover = [...document.querySelectorAll<HTMLElement>('.editor-collaboration-users')].at(-1);
  if (popover === undefined) throw new Error('users popover missing');
  const close = () => {
    indicator.dispose();
    bar.remove();
  };
  return { popover, chip, close };
}

describe('collaboration users popover dismissal', () => {
  it('closes on a viewport press that prevents the default mouse events', () => {
    const open = indicatorCollaborationPopoverOpen();
    expect(open.popover.style.display).toBe('block');
    const viewport = menuPopoverDismissProbeViewportCreate();
    menuPopoverDismissProbePress(viewport.canvas);
    expect(open.popover.style.display).toBe('none');
    viewport.remove();
    open.close();
  });

  it('closes on Escape without reaching editor shortcuts', () => {
    const open = indicatorCollaborationPopoverOpen();
    const shortcuts = menuPopoverDismissProbeShortcutsInstall();
    menuPopoverDismissProbeEscape();
    expect(open.popover.style.display).toBe('none');
    expect(shortcuts.keydown).not.toHaveBeenCalled();
    shortcuts.remove();
    open.close();
  });

  it('stays open for presses inside and blocks viewport hits under it', () => {
    const open = indicatorCollaborationPopoverOpen();
    const reveal = [...open.popover.querySelectorAll('button')].find((button) => button.textContent === 'Show');
    menuPopoverDismissProbePress(reveal ?? open.popover);
    expect(open.popover.style.display).toBe('block');
    expect(FloatingPanelStack.containsEventTarget(reveal ?? open.popover)).toBe(true);
    open.close();
    expect(FloatingPanelStack.containsEventTarget(open.popover)).toBe(false);
  });

  it('toggles closed from the chip without reopening', () => {
    const open = indicatorCollaborationPopoverOpen();
    menuPopoverDismissProbePress(open.chip);
    open.chip.click();
    expect(open.popover.style.display).toBe('none');
    open.close();
  });
});

/**
 * Moderation controls are present only for the owner and dispatch exact member
 * ids.
 */
it('shows owner-only permission checkboxes and kick, and labels viewers', async () => {
  const bar = document.createElement('div');
  document.body.append(bar);
  const indicator = new IndicatorCollaborationStatus(bar, () => undefined);
  const current = view(2);
  const viewer = current.members[1];
  if (!viewer) throw new Error('missing viewer fixture');
  viewer.canEdit = false;
  const calls: unknown[] = [];
  indicator.update({
    ...current,
    permissionSet: async (user, allowed) => {
      calls.push([user, allowed]);
    },
    memberKick: async (user) => {
      calls.push(user);
    },
  });
  bar.querySelector<HTMLButtonElement>('button')?.click();
  document.querySelector<HTMLInputElement>('input[aria-label="Allow Member 2 to edit"]')?.click();
  await Promise.resolve();
  document.querySelector<HTMLButtonElement>('button[aria-label="Kick Member 2 from room"]')?.click();
  expect(calls).toEqual([[2, true], 2]);
  indicator.update({ ...current, self: 2 });
  expect(document.querySelector('input[aria-label="Allow Member 2 to edit"]')).toBeNull();
  expect(document.querySelector('button[aria-label="Kick Member 2 from room"]')).toBeNull();
  expect(bar.textContent).toContain('Viewing');
  indicator.dispose();
  bar.remove();
});
