import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LoaderCollaborationMenu } from '@/collaboration/loader/loader_collaboration_menu.js';
import type { SocketCollaborationLike } from '@/collaboration/net/socket_collaboration_types.js';
import { ControllerCollaboration } from '@/collaboration/runtime/controller_collaboration_runtime.js';
import { memberCollaborationColor } from '@/collaboration/sync/member_collaboration_roster.js';
import { HarnessCollaborationEditor } from './harness_collaboration_editor.js';

const SELF = 7;
const FIRST_SLOT = 1;
const NEXT_SLOT = 4;

/** Fake relay that accepts a join including this client in the roster. */
class FakeRelaySocket implements SocketCollaborationLike {
  binaryType = 'blob';
  readyState = 0;
  bufferedAmount = 0;
  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;

  /**
   * Schedules the open.
   *
   * @param _url Requested URL.
   */
  constructor(_url: string) {
    setTimeout(() => this.start(), 0);
  }

  /**
   * Answers the handshake and room requests.
   *
   * @param data Frame.
   */
  send(data: string | Uint8Array): void {
    if (typeof data !== 'string' || this.readyState !== 1) {
      return;
    }
    const message = JSON.parse(data) as { t: string; r?: number };
    if (message.t === 'hello') {
      this.deliver({ t: 'welcome', user: SELF, name: 'Tester' });
    } else if (message.t === 'room.subscribe') {
      this.deliver({ t: 'room.subscribed', r: message.r, rooms: [], intervalMs: 500 });
    } else if (message.t === 'room.join') {
      this.deliver({
        t: 'room.joined',
        r: message.r,
        you: SELF,
        room: { id: 'room1', name: 'Room', private: false, users: 2, maxUsers: 8 },
        members: [
          { user: 1, name: 'Owner', owner: true, color: 0 },
          { user: SELF, name: 'Tester', owner: false, color: FIRST_SLOT },
        ],
      });
    } else if (message.t === 'room.leave') {
      this.deliver({ t: 'ok', r: message.r });
    }
  }

  /** Records a local close. */
  close(): void {
    this.readyState = 3;
  }

  /** Opens the socket. */
  private start(): void {
    if (this.readyState === 3) {
      return;
    }
    this.readyState = 1;
    this.onopen?.({});
  }

  /**
   * Delivers a JSON message unless the socket closed meanwhile.
   *
   * @param message Message.
   */
  private deliver(message: object): void {
    setTimeout(() => {
      if (this.readyState === 1) {
        this.onmessage?.({ data: JSON.stringify(message) });
      }
    }, 0);
  }
}

describe('collaboration own room color', () => {
  let editor: HarnessCollaborationEditor;
  let controller: ControllerCollaboration;

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    editor = new HarnessCollaborationEditor('Tester');
    controller = new ControllerCollaboration(editor.host, true, (url) => new FakeRelaySocket(url));
    const menu = new LoaderCollaborationMenu(() => editor.host, true);
    Object.assign(menu, { controller, loading: Promise.resolve(controller) });
  });

  afterEach(() => {
    controller.runtime.disconnect();
    vi.useRealTimers();
    localStorage.clear();
  });

  it('hands play mode the local member color, updates it, and clears it on leave', async () => {
    controller.startup();
    await vi.advanceTimersByTimeAsync(50);
    const joined = controller.runtime.join('room1', '');
    await vi.advanceTimersByTimeAsync(100);
    await joined;
    expect(controller.inRoom()).toBe(true);
    expect(editor.ownColor).toBe(memberCollaborationColor(FIRST_SLOT));

    controller.runtime.session?.roster.upsert(SELF, 'Tester', false, NEXT_SLOT, true);
    controller.runtime.rosterChanged();
    expect(editor.ownColor).toBe(memberCollaborationColor(NEXT_SLOT));

    const left = controller.runtime.leave();
    await vi.advanceTimersByTimeAsync(100);
    await left;
    expect(editor.ownColor).toBeNull();
    expect(editor.ownColorHistory).toContain(memberCollaborationColor(FIRST_SLOT));
    expect(editor.ownColorHistory).toContain(memberCollaborationColor(NEXT_SLOT));
    expect(editor.ownColorHistory.at(-1)).toBeNull();
  });
});
