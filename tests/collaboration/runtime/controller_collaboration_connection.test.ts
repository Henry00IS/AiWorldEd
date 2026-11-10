import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CONFIG_COLLABORATION_OFFLINE_KEY,
  CONFIG_COLLABORATION_URL_DEVELOPMENT,
  CONFIG_COLLABORATION_URL_KEY,
} from '@/collaboration/config/config_collaboration_server.js';
import { LoaderCollaborationMenu } from '@/collaboration/loader/loader_collaboration_menu.js';
import type { SocketCollaborationLike } from '@/collaboration/net/socket_collaboration_types.js';
import { ControllerCollaboration } from '@/collaboration/runtime/controller_collaboration_runtime.js';
import { RUNTIME_COLLABORATION_RETRY_MS } from '@/collaboration/runtime/runtime_collaboration_errors.js';
import { CLOSE_CODES } from '@/collaboration/shared/protocol_definitions.js';
import type { ToolbarMenuAction } from '@/ui/menu/menu_types.js';
import { HarnessCollaborationEditor } from './harness_collaboration_editor.js';

/**
 * How the fake relay answers a URL: accept, be unreachable, or refuse with a
 * close code.
 */
type FakeRelayAnswer = 'up' | 'down' | number;

/** Fake relay socket that follows the test's plan and records every request. */
class FakeRelaySocket implements SocketCollaborationLike {
  binaryType = 'blob';
  readyState = 0;
  bufferedAmount = 0;
  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  readonly sent: string[] = [];
  readonly createdAt = Date.now();

  /**
   * Schedules the open.
   *
   * @param url Requested URL.
   * @param answer Plan of the test.
   */
  constructor(
    readonly url: string,
    private readonly answer: (url: string) => FakeRelayAnswer,
  ) {
    setTimeout(() => this.start(), 0);
  }

  /**
   * Answers the handshake and room requests.
   *
   * @param data Frame.
   */
  send(data: string | Uint8Array): void {
    if (typeof data !== 'string' || this.readyState !== 1) return;
    const message = JSON.parse(data) as { t: string; r?: number };
    this.sent.push(message.t);
    if (message.t === 'hello') this.deliver({ t: 'welcome', user: 7, name: 'Tester' });
    else if (message.t === 'room.subscribe')
      this.deliver({ t: 'room.subscribed', r: message.r, rooms: [], intervalMs: 500 });
    else if (message.t === 'room.join') this.deliver(fakeJoined(message.r ?? 0));
    else if (message.t === 'room.leave') this.deliver({ t: 'ok', r: message.r });
  }

  /** Records a local close. */
  close(): void {
    this.readyState = 3;
  }

  /**
   * Simulates the relay or the network dropping the connection.
   *
   * @param code Close code.
   */
  drop(code: number): void {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.onclose?.({ code, reason: '' });
  }

  /** Opens, fails like an unreachable host, or refuses. */
  private start(): void {
    if (this.readyState === 3) return;
    const answer = this.answer(this.url);
    if (answer === 'down') {
      this.onerror?.({});
      return this.drop(1006);
    }
    this.readyState = 1;
    this.onopen?.({});
    if (typeof answer === 'number') this.drop(answer);
  }

  /**
   * Delivers a JSON message unless the socket closed meanwhile.
   *
   * @param message Message.
   */
  private deliver(message: object): void {
    setTimeout(() => {
      if (this.readyState === 1) this.onmessage?.({ data: JSON.stringify(message) });
    }, 0);
  }
}

/**
 * Builds the reply to a join request.
 *
 * @param requestId Request id.
 * @returns Joined message.
 */
function fakeJoined(requestId: number): object {
  return {
    t: 'room.joined',
    r: requestId,
    room: { id: 'room1', name: 'Room', private: false, users: 2, maxUsers: 8 },
    members: [{ user: 1, name: 'Owner', owner: true, color: 0 }],
  };
}

/**
 * Returns the visible message boxes.
 *
 * @returns Alert dialogs.
 */
function messageBoxes(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[role=alertdialog]')).filter((box) => box.isConnected);
}

/**
 * Clicks a dialog button by label.
 *
 * @param label Button text.
 */
function click(label: string): void {
  const found = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
    (each) => each.textContent === label && each.isConnected,
  );
  if (found === undefined) throw new Error(`no ${label} button`);
  found.click();
}

/**
 * Returns the gaps between consecutive connection attempts.
 *
 * @param sockets Sockets in creation order.
 * @returns Gaps in milliseconds.
 */
function gaps(sockets: FakeRelaySocket[]): number[] {
  return sockets.slice(1).map((socket, index) => socket.createdAt - (sockets[index]?.createdAt ?? 0));
}

/**
 * Always-online connection model: startup, retries, Disconnect/Connect,
 * settings, refusals.
 */
describe('collaboration connection', () => {
  let answer: (url: string) => FakeRelayAnswer;
  let sockets: FakeRelaySocket[];
  let editor: HarnessCollaborationEditor;
  let controller: ControllerCollaboration;
  let bar: HTMLElement;
  let menu: LoaderCollaborationMenu;

  /**
   * Returns a Collaborate menu entry by its static label.
   *
   * @param label Label.
   * @returns Entry.
   */
  function entry(label: string): ToolbarMenuAction {
    const found = menu.entries().find((each) => 'label' in each && each.label.startsWith(label));
    return found as ToolbarMenuAction;
  }

  /**
   * Returns whether a menu entry is enabled.
   *
   * @param label Label.
   * @returns True when enabled.
   */
  function enabled(label: string): boolean {
    return entry(label).isEnabled?.() ?? true;
  }

  /**
   * Returns the open socket, failing when there is none.
   *
   * @returns Socket.
   */
  function live(): FakeRelaySocket {
    const open = sockets.filter((socket) => socket.readyState === 1);
    expect(open).toHaveLength(1);
    return open[0] as FakeRelaySocket;
  }

  /**
   * Creates a controller and its menu on the shared storage.
   *
   * @returns Controller.
   */
  function controllerCreate(): ControllerCollaboration {
    const created = new ControllerCollaboration(editor.host, true, (url) => {
      const socket = new FakeRelaySocket(url, (each) => answer(each));
      sockets.push(socket);
      return socket;
    });
    menu = new LoaderCollaborationMenu(() => editor.host, true);
    Object.assign(menu, { controller: created, loading: Promise.resolve(created) });
    return created;
  }

  /** Joins the fake room through the runtime. */
  async function joinRoom(): Promise<void> {
    const joined = controller.runtime.join('room1', '');
    await vi.advanceTimersByTimeAsync(100);
    await joined;
    expect(controller.inRoom()).toBe(true);
  }

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    answer = () => 'up';
    sockets = [];
    editor = new HarnessCollaborationEditor('Tester');
    bar = document.createElement('div');
    document.body.appendChild(bar);
    (editor.host as { statusBarElement: () => HTMLElement | null }).statusBarElement = () => bar;
    controller = controllerCreate();
  });

  afterEach(() => {
    controller.runtime.disconnect();
    vi.useRealTimers();
    localStorage.clear();
    document.body.replaceChildren();
  });

  it('shows the connection state in the status bar from startup', async () => {
    controller.startup();
    expect(bar.textContent).toContain('Connecting');
    await vi.advanceTimersByTimeAsync(50);
    expect(bar.textContent).toContain('Online');
    expect(sockets).toHaveLength(1);
  });

  it('retries a relay that is down at startup every 5 s, quietly, and comes online', async () => {
    answer = () => 'down';
    controller.startup();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(bar.textContent).toContain('Offline');
    expect(messageBoxes()).toHaveLength(0);
    expect(sockets.length).toBeGreaterThanOrEqual(11);
    expect(sockets.length).toBeLessThanOrEqual(13);
    for (const gap of gaps(sockets)) expect(gap).toBeGreaterThanOrEqual(RUNTIME_COLLABORATION_RETRY_MS);
    for (const gap of gaps(sockets)) expect(gap).toBeLessThanOrEqual(RUNTIME_COLLABORATION_RETRY_MS + 500);
    answer = () => 'up';
    await vi.advanceTimersByTimeAsync(RUNTIME_COLLABORATION_RETRY_MS + 500);
    expect(controller.runtime.state).toBe('lobby');
    expect(bar.textContent).toContain('Online');
  });

  it('reconnects at once after losing a long-lived lobby connection, then every 5 s', async () => {
    controller.startup();
    await vi.advanceTimersByTimeAsync(30_000);
    answer = () => 'down';
    live().drop(1006);
    await vi.advanceTimersByTimeAsync(10);
    expect(sockets).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(4000);
    expect(sockets).toHaveLength(2);
    answer = () => 'up';
    await vi.advanceTimersByTimeAsync(2000);
    expect(sockets).toHaveLength(3);
    expect(controller.runtime.state).toBe('lobby');
  });

  it('never opens more than one socket per 5 s when a relay accepts and drops at once', async () => {
    answer = () => 1006;
    controller.startup();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sockets.length).toBeLessThanOrEqual(13);
    for (const gap of gaps(sockets)) expect(gap).toBeGreaterThanOrEqual(RUNTIME_COLLABORATION_RETRY_MS);
  });

  it('ignores repeated online and wake events: no duplicate sockets, no early retries', async () => {
    answer = () => 'down';
    controller.startup();
    await vi.advanceTimersByTimeAsync(100);
    for (let count = 0; count < 20; count++) {
      window.dispatchEvent(new Event('online'));
      document.dispatchEvent(new Event('visibilitychange'));
    }
    await vi.advanceTimersByTimeAsync(4000);
    expect(sockets).toHaveLength(1);
    answer = () => 'up';
    await vi.advanceTimersByTimeAsync(1500);
    expect(sockets).toHaveLength(2);
    for (let count = 0; count < 20; count++) window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sockets).toHaveLength(2);
    expect(live()).toBe(sockets[1]);
  });

  it('retries at once when the tab wakes after a long sleep', async () => {
    answer = () => 'down';
    controller.startup();
    await vi.advanceTimersByTimeAsync(100);
    vi.setSystemTime(Date.now() + 10 * 60_000);
    answer = () => 'up';
    window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(10);
    expect(controller.runtime.state).toBe('lobby');
    expect(sockets).toHaveLength(2);
  });

  it('rejoins the room after a relay restart, as a guest and with a lost-connection notice as the owner', async () => {
    controller.startup();
    await joinRoom();
    answer = () => 'down';
    live().drop(CLOSE_CODES.shuttingDown);
    await vi.advanceTimersByTimeAsync(12_000);
    expect(controller.runtime.state).toBe('reconnecting');
    expect(bar.textContent).toContain('Reconnecting');
    answer = () => 'up';
    await vi.advanceTimersByTimeAsync(6000);
    expect(controller.inRoom()).toBe(true);
    expect(live().sent).toContain('room.join');
    expect(enabled('Collaboration Settings')).toBe(false);
    expect(['Browse Rooms', 'Create Room'].map(enabled)).toEqual([false, false]);
  });

  it('keeps reconnecting in the lobby after a room is lost for good', async () => {
    controller.startup();
    await joinRoom();
    answer = () => 'down';
    live().drop(1006);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(messageBoxes()).toHaveLength(1);
    click('Continue');
    answer = () => 'up';
    await vi.advanceTimersByTimeAsync(6000);
    expect(controller.runtime.state).toBe('lobby');
    expect(controller.isOnline()).toBe(true);
  });

  it('grays out the settings in a room and refuses to open them', async () => {
    controller.startup();
    await vi.advanceTimersByTimeAsync(50);
    expect(enabled('Collaboration Settings')).toBe(true);
    await joinRoom();
    expect(enabled('Collaboration Settings')).toBe(false);
    await controller.settings();
    expect(document.querySelectorAll('[role=dialog]')).toHaveLength(0);
  });

  it('Disconnect goes fully offline, grays out all but the settings, persists, and Connect restores it', async () => {
    controller.startup();
    await vi.advanceTimersByTimeAsync(50);
    expect(entry('Disconnect').labelLive?.()).toBe('Disconnect');
    entry('Disconnect').onClick();
    await vi.advanceTimersByTimeAsync(50);
    expect(controller.runtime.state).toBe('offline');
    expect(bar.textContent).toContain('Offline');
    expect(localStorage.getItem(CONFIG_COLLABORATION_OFFLINE_KEY)).toBe('1');
    expect(entry('Disconnect').labelLive?.()).toBe('Connect');
    expect(['Browse Rooms', 'Create Room', 'Leave Room', 'Room Chat', 'Restore Scene'].map(enabled)).toEqual([
      false,
      false,
      false,
      false,
      false,
    ]);
    expect(enabled('Collaboration Settings')).toBe(true);
    window.dispatchEvent(new Event('online'));
    await controller.rooms();
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(sockets).toHaveLength(1);
    controller.runtime.disconnect();
    controller = controllerCreate();
    controller.startup();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sockets).toHaveLength(1);
    expect(bar.textContent).toContain('Offline');
    entry('Disconnect').onClick();
    await vi.advanceTimersByTimeAsync(50);
    expect(controller.runtime.state).toBe('lobby');
    expect(localStorage.getItem(CONFIG_COLLABORATION_OFFLINE_KEY)).toBeNull();
    expect(entry('Disconnect').labelLive?.()).toBe('Disconnect');
  });

  it('Disconnect in a room leaves it first; Stay keeps the room and the connection', async () => {
    controller.startup();
    await joinRoom();
    void controller.disconnect();
    await vi.advanceTimersByTimeAsync(50);
    click('Stay');
    await vi.advanceTimersByTimeAsync(50);
    expect(controller.inRoom()).toBe(true);
    void controller.disconnect();
    await vi.advanceTimersByTimeAsync(50);
    const socket = live();
    click('Leave');
    await vi.advanceTimersByTimeAsync(50);
    expect(socket.sent).toContain('room.leave');
    expect(controller.runtime.state).toBe('offline');
    expect(controller.isOnline()).toBe(false);
  });

  it('offers the owner Save or Continue after Disconnect closes the room', async () => {
    controller.startup();
    await joinRoom();
    vi.spyOn(controller, 'isOwner').mockReturnValue(true);
    void controller.disconnect();
    await vi.advanceTimersByTimeAsync(50);
    click('Leave');
    await vi.advanceTimersByTimeAsync(50);
    const labels = Array.from(messageBoxes()[0]?.querySelectorAll('button') ?? []).map((each) => each.textContent);
    expect(labels).toEqual(['Continue', 'Save']);
    click('Save');
    await vi.advanceTimersByTimeAsync(50);
    expect(editor.saves).toBe(1);
    expect(controller.runtime.state).toBe('offline');
  });

  it('reconnects at once to a changed URL, ignores the old socket, and clears a manual Disconnect', async () => {
    const changed = 'wss://other.example.test/ws';
    controller.startup();
    await vi.advanceTimersByTimeAsync(50);
    await controller.disconnect();
    void controller.settings();
    await vi.advanceTimersByTimeAsync(50);
    const input = document.querySelector<HTMLInputElement>('input');
    if (input === null) throw new Error('no URL field');
    input.value = changed;
    click('Save');
    await vi.advanceTimersByTimeAsync(50);
    expect(localStorage.getItem(CONFIG_COLLABORATION_URL_KEY)).toBe(changed);
    expect(localStorage.getItem(CONFIG_COLLABORATION_OFFLINE_KEY)).toBeNull();
    expect(live().url).toBe(changed);
    sockets[0]?.drop(1006);
    await vi.advanceTimersByTimeAsync(50);
    expect(controller.runtime.state).toBe('lobby');
    expect(sockets).toHaveLength(2);
  });

  it('two quick URL changes end on the last URL with one socket', async () => {
    answer = (url) => (url.includes('slow') ? 'down' : 'up');
    controller.startup();
    localStorage.setItem(CONFIG_COLLABORATION_URL_KEY, 'wss://slow.example.test/ws');
    controller.runtime.reconnectNow();
    localStorage.setItem(CONFIG_COLLABORATION_URL_KEY, 'wss://fast.example.test/ws');
    controller.runtime.reconnectNow();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(live().url).toBe('wss://fast.example.test/ws');
    expect(controller.runtime.state).toBe('lobby');
    expect(sockets).toHaveLength(3);
    expect(sockets[0]?.url).toBe(CONFIG_COLLABORATION_URL_DEVELOPMENT);
  });

  it('retries an unreachable URL every 5 s and follows a fix in the settings at once', async () => {
    answer = (url) => (url.includes('typo') ? 'down' : 'up');
    localStorage.setItem(CONFIG_COLLABORATION_URL_KEY, 'wss://typo.example.test/ws');
    controller.startup();
    await vi.advanceTimersByTimeAsync(22_000);
    expect(sockets).toHaveLength(5);
    expect(messageBoxes()).toHaveLength(0);
    localStorage.setItem(CONFIG_COLLABORATION_URL_KEY, 'wss://fixed.example.test/ws');
    controller.runtime.reconnectNow();
    await vi.advanceTimersByTimeAsync(50);
    expect(live().url).toBe('wss://fixed.example.test/ws');
  });

  it.each([CLOSE_CODES.originRefused, CLOSE_CODES.proxyRefused, CLOSE_CODES.protocolUnsupported])(
    'stops after permanent refusal %i, shows it once, and offers Connect',
    async (code) => {
      answer = () => code;
      controller.startup();
      await vi.advanceTimersByTimeAsync(10 * 60_000);
      expect(sockets).toHaveLength(1);
      expect(messageBoxes()).toHaveLength(1);
      expect(entry('Disconnect').labelLive?.()).toBe('Connect');
      expect(enabled('Browse Rooms')).toBe(true);
      answer = () => 'up';
      entry('Disconnect').onClick();
      await vi.advanceTimersByTimeAsync(50);
      expect(controller.runtime.state).toBe('lobby');
    },
  );

  it('retries a connection limit refusal every 5 s and shows it only once', async () => {
    answer = () => CLOSE_CODES.tooManyConnections;
    controller.startup();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(sockets.length).toBeGreaterThanOrEqual(6);
    expect(sockets.length).toBeLessThanOrEqual(7);
    expect(messageBoxes()).toHaveLength(1);
    answer = () => 'up';
    await vi.advanceTimersByTimeAsync(6000);
    expect(controller.runtime.state).toBe('lobby');
  });

  it('a refused room reconnect leaves the room and stops for a permanent refusal', async () => {
    controller.startup();
    await joinRoom();
    answer = () => CLOSE_CODES.originRefused;
    live().drop(1006);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(sockets).toHaveLength(2);
    expect(controller.runtime.state).toBe('offline');
    expect(controller.isOnline()).toBe(false);
  });
});
