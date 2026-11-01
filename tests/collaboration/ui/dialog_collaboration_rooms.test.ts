import { afterEach, describe, expect, it } from 'vitest';
import type { RuntimeCollaborationRoomsWatcher } from '@/collaboration/runtime/runtime_collaboration_rooms_watch.js';
import type { SessionCollaborationRoomInfo } from '@/collaboration/session/session_collaboration_types.js';
import { DialogCollaborationRooms } from '@/collaboration/ui/dialog_collaboration_rooms.js';

/** Scripted live room list. */
class FakeRoomsSource {
  watcher: RuntimeCollaborationRoomsWatcher | null = null;
  watches = 0;
  unwatches = 0;
  failNext = false;

  /**
   * Starts a watch.
   *
   * @param watcher Receives updates.
   * @returns Resolves once subscribed.
   */
  async watch(watcher: RuntimeCollaborationRoomsWatcher): Promise<void> {
    this.watches++;
    if (this.failNext) {
      this.failNext = false;
      throw new Error('refused');
    }
    this.watcher = watcher;
  }

  /** Ends the watch. */
  unwatch(): void {
    this.unwatches++;
    this.watcher = null;
  }
}

/**
 * Builds a listed room.
 *
 * @param id Room id.
 * @param name Room name.
 * @param owner Owner.
 * @returns Room.
 */
function room(id: string, name: string, owner: string): SessionCollaborationRoomInfo {
  return { id, name, owner, private: false, users: 1, maxUsers: 8 };
}

/**
 * Names shown in the list, in order.
 *
 * @returns Row texts.
 */
function rows(): string[] {
  return [...document.querySelectorAll<HTMLElement>('[data-collaboration-room]')].map(
    (row) => row.dataset['collaborationRoom']!,
  );
}

/**
 * Types into the search box.
 *
 * @param text Search text.
 */
function search(text: string): void {
  const input = document.querySelector<HTMLInputElement>('[role="dialog"] input[type="search"]')!;
  input.value = text;
  input.dispatchEvent(new Event('input'));
}

/**
 * Settles pending promises.
 *
 * @returns Promise.
 */
const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/** The live, searchable room list. */
describe('dialog_collaboration_rooms', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('shows owners, filters instantly by name or owner and keeps the search across live updates', async () => {
    const source = new FakeRoomsSource();
    void new DialogCollaborationRooms(document.body, 'wss://relay', source).open();
    await tick();
    source.watcher!.update([room('a', 'Awesome room', 'Slanders'), room('b', 'Lab', 'Henry')]);
    expect(document.body.textContent).toContain("Slanders' Awesome room");
    expect(document.body.textContent).toContain("Henry's Lab");
    search('henry');
    expect(rows()).toEqual(['b']);
    expect(document.body.textContent).toContain('1 of 2 rooms matches');
    source.watcher!.update([
      room('a', 'Awesome room', 'Slanders'),
      room('b', 'Lab', 'Henry'),
      room('c', 'Henry test', 'Bob'),
    ]);
    expect(rows().sort()).toEqual(['b', 'c']);
    expect([...document.querySelectorAll('[role="dialog"] button')].map((b) => b.textContent)).not.toContain('Refresh');
  });

  it('unsubscribes exactly once when closed', async () => {
    const source = new FakeRoomsSource();
    const pending = new DialogCollaborationRooms(document.body, 'wss://relay', source).open();
    await tick();
    [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')]
      .find((b) => b.textContent === 'Close')!
      .click();
    expect(await pending).toBeNull();
    expect(source.unwatches).toBe(1);
  });

  it('shows Retry when subscribing fails or the connection is lost, and Retry subscribes again', async () => {
    const source = new FakeRoomsSource();
    source.failNext = true;
    void new DialogCollaborationRooms(document.body, 'wss://relay', source).open();
    await tick();
    const retry = (): HTMLButtonElement =>
      [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(
        (b) => b.textContent === 'Retry',
      )!;
    expect(retry()).toBeDefined();
    retry().click();
    await tick();
    expect(source.watches).toBe(2);
    source.watcher!.update([room('a', 'A', 'x')]);
    expect(rows()).toEqual(['a']);
    source.watcher!.lost(new Error('connection lost, code 1006'));
    expect(retry()).toBeDefined();
    expect(rows()).toEqual([]);
  });
});
