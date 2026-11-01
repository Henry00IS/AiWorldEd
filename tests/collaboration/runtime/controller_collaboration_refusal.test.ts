import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SocketCollaborationLike } from '@/collaboration/net/socket_collaboration_types.js';
import { ControllerCollaboration } from '@/collaboration/runtime/controller_collaboration_runtime.js';
import { CLOSE_CODES } from '@/collaboration/shared/protocol_definitions.js';
import { HarnessCollaborationEditor } from './harness_collaboration_editor.js';

/**
 * How the fake relay treats the next connection: accept it or refuse it with a
 * close code.
 */
interface FakeRefusingRelayPlan {
  refusalCode: number | null;
}

/**
 * Fake relay socket that opens and then either completes the handshake or
 * closes at once with a refusal code, like a relay refusing an origin, a proxy
 * secret or a connection over the limit.
 */
class FakeRefusingRelaySocket implements SocketCollaborationLike {
  binaryType = 'blob';
  readyState = 0;
  bufferedAmount = 0;
  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;

  /**
   * Schedules the open and, when the plan says so, the refusal.
   *
   * @param plan Shared plan of the test.
   */
  constructor(private readonly plan: FakeRefusingRelayPlan) {
    setTimeout(() => this.start(), 0);
  }

  /**
   * Answers the handshake and room requests.
   *
   * @param data Frame.
   */
  send(data: string | Uint8Array): void {
    if (typeof data !== 'string') return;
    const message = JSON.parse(data) as { t: string; r?: number };
    if (message.t === 'hello') this.deliver({ t: 'welcome', user: 7, name: 'Tester' });
    else if (message.t === 'room.subscribe')
      this.deliver({ t: 'room.subscribed', r: message.r, rooms: [], intervalMs: 500 });
    else if (message.t === 'room.join') this.deliver(fakeRoomJoined(message.r ?? 0));
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

  /** Opens, then refuses when the plan holds a refusal code. */
  private start(): void {
    this.readyState = 1;
    this.onopen?.({});
    const refusalCode = this.plan.refusalCode;
    if (refusalCode === null) return;
    this.readyState = 3;
    this.onclose?.({ code: refusalCode, reason: 'refused by test relay' });
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
 * Builds the reply to a join request.
 *
 * @param requestId Request id of the join.
 * @returns Joined message.
 */
function fakeRoomJoined(requestId: number): object {
  return {
    t: 'room.joined',
    r: requestId,
    room: { id: 'room1', name: 'Room', private: false, users: 2, maxUsers: 8 },
    members: [{ user: 1, name: 'Owner', owner: true, color: 0 }],
  };
}

/**
 * Returns the text of the visible message boxes.
 *
 * @returns Joined text of every open alert dialog.
 */
function messageBoxText(): string {
  return Array.from(document.querySelectorAll<HTMLElement>('[role=alertdialog]'))
    .filter((box) => box.isConnected && box.style.display !== 'none')
    .map((box) => box.textContent ?? '')
    .join('\n');
}

/**
 * Relay refusals (origin, proxy secret, connection limit) explained in the
 * editor instead of a bare close code.
 */
describe('collaboration relay refusals', () => {
  let plan: FakeRefusingRelayPlan;
  let requestedUrls: string[];
  let sockets: FakeRefusingRelaySocket[];
  let controller: ControllerCollaboration;

  beforeEach(() => {
    vi.useFakeTimers();
    plan = { refusalCode: null };
    requestedUrls = [];
    sockets = [];
    controller = new ControllerCollaboration(new HarnessCollaborationEditor('Tester').host, true, (url) => {
      requestedUrls.push(url);
      const socket = new FakeRefusingRelaySocket(plan);
      sockets.push(socket);
      return socket;
    });
  });

  afterEach(() => {
    controller.disconnect();
    vi.useRealTimers();
    history.replaceState(null, '', '/');
    document.body.replaceChildren();
  });

  it('names the editor origin and ALLOWED_ORIGINS when the relay refuses the origin', async () => {
    plan.refusalCode = CLOSE_CODES.originRefused;
    void controller.rooms();
    await vi.advanceTimersByTimeAsync(100);
    expect(document.body.textContent).toContain(`This relay doesn't allow editors from ${location.origin}`);
    expect(document.body.textContent).toContain('ALLOWED_ORIGINS');
    expect(document.body.textContent).not.toContain('4009');
  });

  it.each([
    [CLOSE_CODES.proxyRefused, 'FORWARDED_SECRET'],
    [CLOSE_CODES.tooManyConnections, 'too many connections from your address'],
    [CLOSE_CODES.serverFull, 'connection limit'],
  ])('explains close code %i in the room browser', async (refusalCode, expectedText) => {
    plan.refusalCode = refusalCode;
    void controller.rooms();
    await vi.advanceTimersByTimeAsync(100);
    expect(document.body.textContent).toContain(expectedText);
  });

  it('stops reconnecting and explains why when a reconnect is refused', async () => {
    const joined = controller.runtime.join('room1', '');
    await vi.advanceTimersByTimeAsync(100);
    await joined;
    plan.refusalCode = CLOSE_CODES.originRefused;
    sockets[0]?.drop(1006);
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    expect(sockets).toHaveLength(2);
    expect(controller.runtime.state).toBe('offline');
    expect(messageBoxText()).toContain(`This relay doesn't allow editors from ${location.origin}`);
  });

  it('connects to the relay named by a ?relay= link', async () => {
    const linkedRelay = 'wss://relay.example.test:8443';
    history.replaceState(null, '', `/?relay=${encodeURIComponent(linkedRelay)}`);
    void controller.rooms();
    await vi.advanceTimersByTimeAsync(100);
    expect(requestedUrls).toEqual([linkedRelay]);
    expect(document.body.textContent).toContain(linkedRelay);
  });
});
