import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CURVES_COLLABORATION_CHANNEL,
  CURVES_COLLABORATION_REMOTE_READ_ONLY,
  CURVES_COLLABORATION_REQUEST_INTERVAL_MS,
  CURVES_COLLABORATION_REQUESTS_PER_MEMBER,
  CurvesCollaboration,
  curvesEncode,
  type CurvesCollaborationChannel,
  type CurvesCollaborationMessage,
  type CurvesCollaborationMember,
} from '@/collaboration/session/curves_collaboration.js';
import {
  CurveLibraryExistsError,
  curveLibraryChanged,
  type CurveLibrarySource,
} from '@/curve/library/curve_library.js';
import { curveFileWrite } from '@/curve/model/curve_file.js';
import { curveFromPolyline } from '@/curve/model/curve_model.js';

const OWNER = 1;
const EDITOR = 2;
const VIEWER = 3;

/** Peers to dispose after each test. */
const created: CurvesCollaboration[] = [];

/**
 * Builds a curve file text.
 *
 * @param name Curve name.
 * @param y End height.
 * @returns File text.
 */
function curveText(name: string, y = 1): string {
  return curveFileWrite(
    curveFromPolyline([
      [0, 0],
      [1, y],
    ]),
    name,
  );
}

/** Passes custom messages between room peers, a tick later like the relay. */
class Hub {
  private readonly listeners = new Map<number, (from: number, payload: Uint8Array) => void>();
  readonly sent: { from: number; to: number; text: string }[] = [];
  /**
   * Peers whose channel accepts messages, like the editor's custom channel that
   * drops what arrives before the runtime is in the room; null: everyone.
   */
  ready: Set<number> | null = null;
  /** The owner's curve sync, which receives list requests through the relay. */
  owner: CurvesCollaboration | null = null;

  /**
   * Passes a member's list request (an asset request) to the owner a tick
   * later.
   *
   * @param from Member.
   */
  request(from: number): void {
    this.sent.push({ from, to: OWNER, text: 'request' });
    setTimeout(() => this.owner?.requested(from), 0);
  }

  /**
   * Returns a peer's channel.
   *
   * @param user Peer.
   * @returns Channel.
   */
  channel(user: number): CurvesCollaborationChannel {
    return {
      sendToOwner: async (payload) => this.deliver(user, OWNER, payload),
      sendToMember: async (member, payload) => this.deliver(user, member, payload),
      sendToAll: async (payload) => {
        for (const peer of this.listeners.keys()) if (peer !== OWNER) this.deliver(user, peer, payload);
      },
      onMessage: (listener) => {
        this.listeners.set(user, listener);
        return () => this.listeners.delete(user);
      },
    };
  }

  /**
   * Delivers one message later.
   *
   * @param from Sender.
   * @param to Receiver.
   * @param payload Bytes.
   */
  private deliver(from: number, to: number, payload: Uint8Array): void {
    this.sent.push({ from, to, text: new TextDecoder().decode(payload) });
    setTimeout(() => {
      if (this.ready === null || this.ready.has(to)) this.listeners.get(to)?.(from, payload);
    }, 0);
  }
}

/**
 * The owner's AiWorldEd/Curves in memory.
 *
 * @param files Files by name.
 * @returns Source.
 */
function ownerSource(files: Map<string, { text: string; time: number }>): CurveLibrarySource {
  return {
    id: 'project',
    writable: () => true,
    list: () => [...files].map(([fileName, file]) => ({ fileName, size: file.text.length, lastModified: file.time })),
    read: async (fileName) => files.get(fileName)?.text ?? '',
    write: async (fileName, text, overwrite) => {
      if (!overwrite && files.has(fileName)) throw new CurveLibraryExistsError(fileName);
      files.set(fileName, { text, time: Date.now() + files.size });
      curveLibraryChanged();
    },
  };
}

/**
 * Builds the owner, an editor and a viewer in one room.
 *
 * @returns Fixture.
 */
function roomCreate(join = true) {
  const hub = new Hub();
  const clock = { now: 0 };
  const files = new Map([['Arch.aicurve', { text: curveText('Arch'), time: 1 }]]);
  const remotes = new Map<number, CurveLibrarySource | null>();
  const peers = new Map<number, CurvesCollaboration>();
  for (const user of [OWNER, EDITOR, VIEWER])
    peers.set(
      user,
      new CurvesCollaboration({
        channel: hub.channel(user),
        projectSource: () => (user === OWNER ? ownerSource(files) : null),
        remoteSet: (source) => remotes.set(user, source),
        now: () => clock.now,
        requestSend: () => hub.request(user),
      }),
    );
  const members: CurvesCollaborationMember[] = [
    { user: OWNER, owner: true },
    { user: EDITOR, owner: false },
    { user: VIEWER, owner: false },
  ];
  created.push(...peers.values());
  hub.owner = peers.get(OWNER) ?? null;
  if (join) for (const [user, peer] of peers) peer.roomSet({ self: user, owner: user === OWNER, members });
  const remote = (user: number) => {
    const source = remotes.get(user);
    if (!source) throw new Error('Expected a remote source');
    return source;
  };
  return { hub, files, peers, remote, members, remotes, clock };
}

describe('CurvesCollaboration', () => {
  afterEach(() => created.splice(0).forEach((peer) => peer.dispose()));

  it("gives every member the owner's curves live", async () => {
    const { files, remote, peers } = roomCreate();
    await vi.waitFor(() => expect(peers.get(EDITOR)?.remoteNames()).toEqual(['Arch.aicurve']));
    await vi.waitFor(() => expect(peers.get(VIEWER)?.remoteNames()).toEqual(['Arch.aicurve']));
    expect(await remote(VIEWER).read('Arch.aicurve')).toBe(files.get('Arch.aicurve')?.text);
    files.set('Ogee.aicurve', { text: curveText('Ogee'), time: 5 });
    curveLibraryChanged();
    await vi.waitFor(() => expect(peers.get(VIEWER)?.remoteNames()).toEqual(['Arch.aicurve', 'Ogee.aicurve']));
    files.delete('Arch.aicurve');
    curveLibraryChanged();
    await vi.waitFor(() => expect(peers.get(EDITOR)?.remoteNames()).toEqual(['Ogee.aicurve']));
  });

  it("keeps the owner's curves read-only for editors and viewers alike", async () => {
    const { files, remote, peers } = roomCreate();
    for (const user of [EDITOR, VIEWER]) {
      await vi.waitFor(() => expect(peers.get(user)?.remoteNames()).toEqual(['Arch.aicurve']));
      expect(remote(user).writable()).toBe(false);
      expect(remote(user).readOnlyReason?.()).toBe(CURVES_COLLABORATION_REMOTE_READ_ONLY);
      await expect(remote(user).write('X.aicurve', curveText('X'), true)).rejects.toThrow('read-only');
    }
    expect([...files.keys()]).toEqual(['Arch.aicurve']);
  });

  it('ignores every curve message a member sends to the owner', async () => {
    const { files, hub, peers } = roomCreate();
    await vi.waitFor(() => expect(peers.get(EDITOR)?.remoteNames()).toEqual(['Arch.aicurve']));
    const ownerSent = hub.sent.filter((m) => m.from === OWNER).length;
    const text = curveText('X');
    const forged = [
      { c: CURVES_COLLABORATION_CHANNEL, t: 'save', id: 7, f: 'X.aicurve', x: text, o: true },
      { c: CURVES_COLLABORATION_CHANNEL, t: 'put', f: 'Arch.aicurve', m: 9, x: text },
      { c: CURVES_COLLABORATION_CHANNEL, t: 'remove', f: 'Arch.aicurve' },
      { c: CURVES_COLLABORATION_CHANNEL, t: 'list', reset: true, more: false, curves: [] },
      { c: CURVES_COLLABORATION_CHANNEL, t: 'request' },
    ];
    for (const message of forged)
      for (const user of [EDITOR, VIEWER])
        await hub.channel(user).sendToOwner(new TextEncoder().encode(JSON.stringify(message)));
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect([...files.keys()]).toEqual(['Arch.aicurve']);
    expect(files.get('Arch.aicurve')?.text).toBe(curveText('Arch'));
    expect(hub.sent.filter((m) => m.from === OWNER)).toHaveLength(ownerSent);
  });

  it('ignores curve lists that do not come from the owner and drops Remote on leaving', async () => {
    const { hub, peers, remotes } = roomCreate();
    await vi.waitFor(() => expect(peers.get(VIEWER)?.remoteNames()).toEqual(['Arch.aicurve']));
    const fake = {
      c: CURVES_COLLABORATION_CHANNEL,
      t: 'list',
      reset: true,
      more: false,
      curves: [],
    } satisfies CurvesCollaborationMessage;
    await hub.channel(EDITOR).sendToMember(VIEWER, curvesEncode(fake));
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(peers.get(VIEWER)?.remoteNames()).toEqual(['Arch.aicurve']);
    peers.get(VIEWER)?.roomSet(null);
    expect(remotes.get(VIEWER)).toBeNull();
  });

  it('gives a member every curve even when the owner saw it join before its channel was ready', async () => {
    const { hub, peers, members } = roomCreate(false);
    hub.ready = new Set([OWNER]);
    // The relay roster tells the owner first; anything sent now is dropped by the member.
    peers.get(OWNER)?.roomSet({ self: OWNER, owner: true, members });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(peers.get(EDITOR)?.remoteNames()).toEqual([]);
    hub.ready.add(EDITOR);
    peers.get(EDITOR)?.roomSet({ self: EDITOR, owner: false, members });
    await vi.waitFor(() => expect(peers.get(EDITOR)?.remoteNames()).toEqual(['Arch.aicurve']));
  });

  it('registers Remote again and gets the list after a reconnect gave the member a new id', async () => {
    const { peers, members, remotes, clock } = roomCreate();
    await vi.waitFor(() => expect(peers.get(VIEWER)?.remoteNames()).toEqual(['Arch.aicurve']));
    clock.now += CURVES_COLLABORATION_REQUEST_INTERVAL_MS;
    // The hub still addresses the viewer as VIEWER; the new id only changes "self".
    peers.get(VIEWER)?.roomSet({ self: 9, owner: false, members });
    expect(remotes.get(VIEWER)).not.toBeNull();
    await vi.waitFor(() =>
      expect(
        remotes
          .get(VIEWER)
          ?.list()
          .map((entry) => entry.fileName),
      ).toEqual(['Arch.aicurve']),
    );
  });

  it('keeps asking for the list while roster updates arrive and no list came', () => {
    const timers: (() => void)[] = [];
    let requests = 0;
    const member = new CurvesCollaboration({
      channel: new Hub().channel(EDITOR),
      projectSource: () => null,
      remoteSet: () => undefined,
      requestSend: () => requests++,
      setTimer: (run) => timers.push(run),
      clearTimer: () => undefined,
    });
    created.push(member);
    const members = (): CurvesCollaborationMember[] => [
      { user: OWNER, owner: true },
      { user: EDITOR, owner: false },
    ];
    member.roomSet({ self: EDITOR, owner: false, members: members() });
    expect(requests).toBe(1);
    // The editor hands over a new room object on every state or roster change.
    member.roomSet({ self: EDITOR, owner: false, members: [...members(), { user: VIEWER, owner: false }] });
    timers.splice(0).forEach((run) => run());
    expect(requests).toBe(2);
  });

  it('answers at once and still broadcasts when the roster changes while the owner reads its curves', async () => {
    const hub = new Hub();
    const files = new Map([['Arch.aicurve', { text: curveText('Arch'), time: 1 }]]);
    const source = ownerSource(files);
    let release: () => void = () => undefined;
    let gate: Promise<void> = Promise.resolve();
    const reading: string[] = [];
    const owner = new CurvesCollaboration({
      channel: hub.channel(OWNER),
      projectSource: () => ({ ...source, read: async (name) => (reading.push(name), await gate, source.read(name)) }),
      remoteSet: () => undefined,
    });
    created.push(owner);
    hub.channel(EDITOR).onMessage(() => undefined);
    const room = (members: number[]) => ({
      self: OWNER,
      owner: true,
      members: [{ user: OWNER, owner: true }, ...members.map((user) => ({ user, owner: false }))],
    });
    const hold = () => (gate = new Promise((resolve) => (release = resolve)));
    hold();
    owner.roomSet(room([EDITOR]));
    owner.requested(EDITOR);
    owner.roomSet(room([EDITOR, VIEWER]));
    const sent = (t: string) => hub.sent.filter((m) => m.from === OWNER && m.text.includes(`"t":"${t}"`));
    // The answer does not wait for the publish in progress; its changes follow as puts.
    await vi.waitFor(() => expect(sent('list').map((m) => m.to)).toEqual([EDITOR]));
    release();
    await vi.waitFor(() => expect(sent('put').map((m) => m.to)).toEqual([EDITOR]));
    hold();
    files.set('Ogee.aicurve', { text: curveText('Ogee'), time: 5 });
    curveLibraryChanged();
    await vi.waitFor(() => expect(reading).toContain('Ogee.aicurve'));
    owner.roomSet(room([EDITOR]));
    release();
    await vi.waitFor(() =>
      expect(
        sent('put')
          .filter((m) => m.text.includes('Ogee.aicurve'))
          .map((m) => m.to),
      ).toEqual([EDITOR]),
    );
  });

  it('answers list requests only from members, from memory, at a limited rate', async () => {
    let now = 0;
    const hub = new Hub();
    let reads = 0;
    const files = new Map([['Arch.aicurve', { text: curveText('Arch'), time: 1 }]]);
    const source = ownerSource(files);
    const owner = new CurvesCollaboration({
      channel: hub.channel(OWNER),
      projectSource: () => ({ ...source, read: (name) => (reads++, source.read(name)) }),
      remoteSet: () => undefined,
      now: () => now,
    });
    created.push(owner);
    owner.roomSet({
      self: OWNER,
      owner: true,
      members: [
        { user: OWNER, owner: true },
        { user: EDITOR, owner: false },
      ],
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const readsShared = reads;
    const lists = () => hub.sent.filter((m) => m.from === OWNER && m.text.includes('"t":"list"'));
    for (let index = 0; index < 20; index++) owner.requested(EDITOR);
    owner.requested(VIEWER); // not in the roster
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(lists().map((m) => m.to)).toEqual([EDITOR]);
    for (let round = 0; round < 20; round++) {
      now += CURVES_COLLABORATION_REQUEST_INTERVAL_MS;
      owner.requested(EDITOR);
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    expect(lists()).toHaveLength(CURVES_COLLABORATION_REQUESTS_PER_MEMBER);
    expect(reads).toBe(readsShared);
    expect([...files.keys()]).toEqual(['Arch.aicurve']);
  });
});
