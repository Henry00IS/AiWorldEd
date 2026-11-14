import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ToysCollaborationSession } from '@/collaboration/toys/session_collaboration_toys.js';
import { toyTennisBallEncode } from '@/collaboration/toys/toy_tennis_ball.js';
import type { HostCollaborationEditor } from '@/collaboration/host/host_collaboration_editor.js';
import { SOCKET_COLLABORATION_LIMITS_DEFAULT } from '@/collaboration/net/socket_collaboration_types.js';
import type { ReceiverCollaborationPresence } from '@/collaboration/presence/receiver_collaboration_presence.js';
import type { SessionCollaborationTransport } from '@/collaboration/session/session_collaboration_types.js';
import { toyFrameCheck, toyFrameEncode, toyFrameRelay } from '@/collaboration/shared/toy_frame.js';
import {
  MemberCollaborationRoster,
  memberCollaborationColor,
} from '@/collaboration/sync/member_collaboration_roster.js';
import type {
  PlayerBallLink,
  PlayerBallLinkListener,
  PlayerBallSnapshot,
  PlayerBallState,
} from '@/player/ball/player_ball_link.js';

/** Test fixture around one toys session. */
interface Fixture {
  session: ToysCollaborationSession;
  links: (PlayerBallLink | null)[];
  sent: Uint8Array[];
  idle: { value: boolean };
  heard: string[];
  held: [number, string][];
}

/**
 * Builds a session with members 1 (owner), 2 and 3, where member 3 shows a
 * play-mode character at x = 5 walking at 2 m/s.
 *
 * @param caps Relay capabilities.
 * @returns Fixture.
 */
function fixture(caps: string[] = ['toys']): Fixture {
  const links: (PlayerBallLink | null)[] = [];
  const sent: Uint8Array[] = [];
  const idle = { value: true };
  const host = {
    toyLinkSet: (link: PlayerBallLink | null) => links.push(link),
  } as unknown as HostCollaborationEditor;
  const transport: SessionCollaborationTransport = {
    limits: SOCKET_COLLABORATION_LIMITS_DEFAULT,
    caps: new Set(caps),
    send: () => undefined,
    sendBinary: () => undefined,
    sendPresence: (frame) => idle.value && sent.push(frame) > 0,
    request: () => Promise.reject(new Error('unused')),
  };
  const roster = new MemberCollaborationRoster();
  roster.upsert(1, 'Owner', true, 0);
  roster.upsert(2, 'Bea', false, 1);
  roster.upsert(3, 'Cy', false, 2);
  const character = { user: 3, feet: new THREE.Vector3(5, 0, 0), velocity: new THREE.Vector3(2, 0, 0) };
  const held: [number, string][] = [];
  const presence = {
    characters: () => [character],
    holdSet: (user: number, kind: string) => held.push([user, kind]),
  } as unknown as ReceiverCollaborationPresence;
  const heard: string[] = [];
  const session = new ToysCollaborationSession(host, transport, roster, presence);
  session.listen(listenerRecording(heard));
  return { session, links, sent, idle, heard, held };
}

/**
 * Builds a listener that records what it hears.
 *
 * @param heard Receives one line per call.
 * @returns Listener.
 */
function listenerRecording(heard: string[]): PlayerBallLinkListener {
  return {
    snapshot: (member, snapshot) =>
      heard.push(`snapshot ${member} ${snapshot.full} ${snapshot.tick} ${snapshot.balls.length}`),
    memberJoined: (member) => heard.push(`joined ${member}`),
    memberLeft: (member) => heard.push(`left ${member}`),
  };
}

/** A resting ball. */
const BALL: PlayerBallState = {
  ...{ id: 1, position: [1, 2, 3], velocity: [0, 0, 0], sleeping: true, rolling: false },
  ...{ bounces: 3, strength: 4 },
};
/** A changes-only snapshot of it at tick 40. */
const SNAPSHOT: PlayerBallSnapshot = { full: false, tick: 40, balls: [BALL] };

/**
 * Builds the relayed frame of a member's snapshot.
 *
 * @param sender Thrower, stamped by the relay.
 * @param snapshot Its balls.
 * @returns Relayed frame.
 */
function relayed(sender: number, snapshot: PlayerBallSnapshot = SNAPSHOT): Uint8Array {
  return toyFrameRelay(toyFrameEncode(toyTennisBallEncode(snapshot)), sender);
}

describe('ToysCollaborationSession', () => {
  it('hands play mode a link only when the relay supports toys, and takes it back', () => {
    const plain = fixture(['select']);
    plain.session.start(2);
    expect(plain.links).toEqual([]);
    const { session, links } = fixture();
    session.start(2);
    session.start(2);
    expect(links).toEqual([session]);
    session.stop();
    session.stop();
    expect(links).toEqual([session, null]);
  });

  it('lets every member publish its own balls as a valid toy frame, only while running', () => {
    const { session, sent, idle } = fixture();
    expect(session.publish(SNAPSHOT)).toBe(false);
    session.start(2);
    expect(session.publish(SNAPSHOT)).toBe(true);
    expect(sent).toHaveLength(1);
    expect(toyFrameCheck(sent[0] ?? new Uint8Array())).toBe(true);
    idle.value = false;
    expect(session.publish(SNAPSHOT)).toBe(false);
  });

  it("passes every other member's snapshot on with the stamped sender, never its own", () => {
    const { session, heard } = fixture();
    session.start(2);
    session.binary(relayed(3));
    session.binary(relayed(1));
    session.binary(relayed(2));
    session.binary(new Uint8Array([0xa7, 5, 1]));
    expect(heard).toEqual(['snapshot 3 false 40 1', 'snapshot 1 false 40 1']);
  });

  it('reports joining and leaving members and lists the play-mode players with their colors', () => {
    const { session, heard } = fixture();
    session.start(2);
    session.memberJoined(4);
    session.memberLeft(3);
    expect(heard).toEqual(['joined 4', 'left 3']);
    expect(session.self()).toBe(2);
    const players = session.players();
    expect(players.map((player) => [player.member, player.feet.x, player.velocity.x])).toEqual([[3, 5, 2]]);
    expect(session.colorOf(3)).toBe(memberCollaborationColor(2));
  });

  it('shows the toy each member holds from its hand entry, else from the kind of a toy it just threw', () => {
    const { session, held, heard } = fixture();
    session.start(2);
    session.binary(relayed(3, { full: true, tick: 1, balls: [], held: 'plane' }));
    expect(held).toEqual([[3, 'plane']]);
    expect(heard).toEqual(['snapshot 3 true 1 0']);
    const four = [1, 2, 3, 4].map((id) => ({ ...BALL, id }));
    session.binary(relayed(1, { full: true, tick: 2, balls: four, held: 'soccer' }));
    expect(held.at(-1)).toEqual([1, 'tennis']);
    session.binary(relayed(1, { full: false, tick: 3, balls: [{ ...BALL, id: 2, kind: 'soccer' }] }));
    expect(held.at(-1)).toEqual([1, 'soccer']);
    session.binary(relayed(1, { full: false, tick: 4, balls: [{ ...BALL, id: 2, kind: 'soccer' }] }));
    expect(held).toHaveLength(3);
    session.binary(relayed(1, { full: true, tick: 5, balls: [...four.slice(1), { ...BALL, id: 1, spawn: 1 }] }));
    expect(held).toHaveLength(4);
  });
});
