import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SocketCollaborationLike } from '@/collaboration/net/socket_collaboration_types.js';
import { ControllerCollaboration } from '@/collaboration/runtime/controller_collaboration_runtime.js';
import { RUNTIME_COLLABORATION_RECONNECT_ATTEMPTS } from '@/collaboration/runtime/runtime_collaboration_client.js';
import { HarnessCollaborationEditor } from './harness_collaboration_editor.js';

/**
 * Fake relay socket: refuses connections, or completes the handshake and joins
 * rooms.
 */
class FakeRelaySocket implements SocketCollaborationLike {
  binaryType = 'blob';
  readyState = 0;
  bufferedAmount = 0;
  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;

  /** @param reachable Whether the relay accepts the connection. */
  constructor(private readonly reachable: () => boolean) {
    setTimeout(() => this.start(), 0);
  }

  /**
   * Answers handshake and room requests.
   *
   * @param data Frame.
   */
  send(data: string | Uint8Array): void {
    if (typeof data !== 'string') return;
    const message = JSON.parse(data) as { t: string; r?: number };
    if (message.t === 'hello') this.deliver({ t: 'welcome', user: 7, name: 'Tester' });
    else if (message.t === 'room.list') this.deliver({ t: 'room.list', r: message.r, rooms: [] });
    else if (message.t === 'room.subscribe')
      this.deliver({ t: 'room.subscribed', r: message.r, rooms: [], intervalMs: 500 });
    else if (message.t === 'room.join')
      this.deliver({
        t: 'room.joined',
        r: message.r,
        room: { id: 'room1', name: 'Room', private: false, users: 2, maxUsers: 8 },
        members: [{ user: 1, name: 'Owner', owner: true, color: 0 }],
      });
  }

  /** Records a local close. */
  close(): void {
    this.readyState = 3;
  }

  /**
   * Simulates the relay dropping the connection.
   *
   * @param code Close code.
   */
  drop(code: number): void {
    this.readyState = 3;
    this.onclose?.({ code, reason: '' });
  }

  /** Opens, or fails like an unreachable host (error then close 1006). */
  private start(): void {
    if (!this.reachable()) {
      this.onerror?.({});
      this.readyState = 3;
      this.onclose?.({ code: 1006, reason: '' });
      return;
    }
    this.readyState = 1;
    this.onopen?.({});
  }

  /**
   * Delivers a JSON message.
   *
   * @param message Message.
   */
  private deliver(message: object): void {
    setTimeout(() => this.onmessage?.({ data: JSON.stringify(message) }), 0);
  }
}

/**
 * Returns the open message boxes.
 *
 * @returns Alert dialogs.
 */
function messageBoxes(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[role=alertdialog]')).filter(
    (box) => box.isConnected && box.style.display !== 'none' && !box.closest('[hidden]'),
  );
}

/**
 * Returns a button of the open dialogs by label.
 *
 * @param label Button text.
 * @returns Button.
 */
function button(label: string): HTMLButtonElement {
  const found = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
    (each) => each.textContent === label && each.isConnected,
  );
  if (found === undefined) throw new Error(`no ${label} button`);
  return found;
}

describe('collaboration offline handling', () => {
  let reachable = false;
  let sockets: FakeRelaySocket[] = [];
  let editor: HarnessCollaborationEditor;
  let controller: ControllerCollaboration;

  beforeEach(() => {
    vi.useFakeTimers();
    reachable = false;
    sockets = [];
    editor = new HarnessCollaborationEditor('Tester');
    controller = new ControllerCollaboration(editor.host, true, () => {
      const socket = new FakeRelaySocket(() => reachable);
      sockets.push(socket);
      return socket;
    });
  });

  afterEach(() => {
    controller.disconnect();
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  it('shows an inline message with Retry, and no offline modal, when browsing an unreachable relay', async () => {
    void controller.rooms();
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    expect(messageBoxes()).toHaveLength(0);
    expect(document.body.textContent).toContain("Can't reach the collaboration server");
    expect(sockets).toHaveLength(1);
    expect(controller.runtime.state).toBe('offline');
    reachable = true;
    button('Retry').click();
    await vi.advanceTimersByTimeAsync(100);
    expect(document.body.textContent).toContain('No rooms yet');
    expect(messageBoxes()).toHaveLength(0);
  });

  it('goes offline quietly when a browse-only connection drops', async () => {
    reachable = true;
    void controller.rooms();
    await vi.advanceTimersByTimeAsync(100);
    expect(controller.runtime.state).toBe('lobby');
    sockets[0]?.drop(1006);
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    expect(messageBoxes()).toHaveLength(0);
    expect(controller.runtime.state).toBe('offline');
    expect(sockets).toHaveLength(1);
  });

  it('shows one Disconnected modal after losing a room, and Continue offline closes it', async () => {
    reachable = true;
    const joined = controller.runtime.join('room1', '');
    await vi.advanceTimersByTimeAsync(100);
    await joined;
    expect(controller.runtime.session).not.toBeNull();
    reachable = false;
    sockets[0]?.drop(1006);
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    expect(sockets.length).toBe(1 + RUNTIME_COLLABORATION_RECONNECT_ATTEMPTS);
    expect(messageBoxes()).toHaveLength(1);
    expect(messageBoxes()[0]?.textContent).toContain('Disconnected');
    button('Continue offline').click();
    await vi.advanceTimersByTimeAsync(1000);
    expect(messageBoxes()).toHaveLength(0);
    expect(controller.runtime.state).toBe('offline');
    expect(editor.saves).toBe(0);
  });

  it('Save locally saves and closes the Disconnected modal', async () => {
    reachable = true;
    const joined = controller.runtime.join('room1', '');
    await vi.advanceTimersByTimeAsync(100);
    await joined;
    sockets[0]?.drop(4002);
    await vi.advanceTimersByTimeAsync(100);
    expect(messageBoxes()).toHaveLength(1);
    button('Save locally').click();
    await vi.advanceTimersByTimeAsync(1000);
    expect(messageBoxes()).toHaveLength(0);
    expect(editor.saves).toBe(1);
  });
  it('shows exactly one modal however often the connection is reported lost, and it closes in one click', async () => {
    reachable = true;
    const joined = controller.runtime.join('room1', '');
    await vi.advanceTimersByTimeAsync(100);
    await joined;
    reachable = false;
    sockets[0]?.drop(1006);
    for (let round = 0; round < 50; round++) {
      // Stale sockets and the runtime itself report the loss again and again.
      for (const socket of sockets) socket.drop(1006);
      controller.runtime.connectionLost(1006);
      controller.runtime.connectionLost(4002);
      await vi.advanceTimersByTimeAsync(5000);
    }
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    expect(sockets.length).toBeLessThanOrEqual(1 + RUNTIME_COLLABORATION_RECONNECT_ATTEMPTS);
    const notice = (controller as unknown as { notice(t: string, m: string, o: boolean): Promise<void> }).notice.bind(
      controller,
    );
    for (let count = 0; count < 200; count++) void notice('Disconnected', 'lost', true);
    await vi.advanceTimersByTimeAsync(100);
    expect(messageBoxes()).toHaveLength(1);
    button('Continue offline').click();
    await vi.advanceTimersByTimeAsync(1000);
    expect(messageBoxes()).toHaveLength(0);
  });

  it('opens each collaboration dialog only once for repeated triggers', async () => {
    for (let count = 0; count < 20; count++) void controller.settings();
    await vi.advanceTimersByTimeAsync(100);
    expect(document.querySelectorAll('[role=dialog]')).toHaveLength(1);
    button('Cancel').click();
    await vi.advanceTimersByTimeAsync(100);
    expect(document.querySelectorAll('[role=dialog]')).toHaveLength(0);
    void controller.settings();
    await vi.advanceTimersByTimeAsync(100);
    expect(document.querySelectorAll('[role=dialog]')).toHaveLength(1);
  });
});
