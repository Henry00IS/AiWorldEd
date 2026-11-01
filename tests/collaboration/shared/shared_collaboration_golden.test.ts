import { describe, expect, it } from 'vitest';
import {
  SocketCollaborationError,
  type SocketCollaborationMessage,
} from '@/collaboration/net/socket_collaboration_types.js';
import { socketCollaborationHello } from '@/collaboration/net/socket_collaboration_client.js';
import { runtimeCollaborationErrorText } from '@/collaboration/runtime/runtime_collaboration_errors.js';
import { sessionCollaborationRoomParse } from '@/collaboration/session/session_collaboration_types.js';
import { binaryFrameParse } from '@/collaboration/shared/binary_frame.js';
import { presenceFrameCheck, presenceFrameDecode } from '@/collaboration/shared/presence_frame.js';
import { PROTOCOL_GOLDEN_VECTORS } from '@/collaboration/shared/protocol_golden_vectors.js';
import { PROTOCOL_VERSION_MAXIMUM, PROTOCOL_VERSION_MINIMUM } from '@/collaboration/shared/protocol_versioning.js';
import {
  roomCollaborationCompatible,
  roomCollaborationVersionLabel,
} from '@/collaboration/ui/room_collaboration_listing.js';

/**
 * Finds a recorded server frame of a version and parses it.
 *
 * @param version Protocol version.
 * @param name Vector name.
 * @returns Parsed frame.
 */
function serverFrame(version: number, name: string): Record<string, unknown> {
  const vector = PROTOCOL_GOLDEN_VECTORS[version]?.server.find((entry) => entry.name === name);
  if (vector === undefined) throw new Error(`missing vector ${name}`);
  return JSON.parse(vector.frame) as Record<string, unknown>;
}

/**
 * Decodes a hexadecimal binary vector.
 *
 * @param version Protocol version.
 * @param name Vector name.
 * @returns Frame bytes.
 */
function binaryFrame(version: number, name: string): Uint8Array {
  const vector = PROTOCOL_GOLDEN_VECTORS[version]?.binary.find((entry) => entry.name === name);
  if (vector === undefined) throw new Error(`missing vector ${name}`);
  return Uint8Array.from(vector.hex.match(/../g)!.map((pair) => Number.parseInt(pair, 16)));
}

/**
 * Replays the shared golden vectors through the editor's own parsers, so a
 * change that breaks a released protocol version fails the editor CI as well as
 * the relay's.
 */
describe('collaboration protocol golden vectors (editor side)', () => {
  it('has vectors for every protocol version this editor speaks', () => {
    for (let version = PROTOCOL_VERSION_MINIMUM; version <= PROTOCOL_VERSION_MAXIMUM; version++) {
      expect(PROTOCOL_GOLDEN_VECTORS[version]).toBeDefined();
    }
  });

  it('sends a hello of the recorded shape', () => {
    const hello = socketCollaborationHello('Ana') as Record<string, unknown>;
    const recorded = PROTOCOL_GOLDEN_VECTORS[PROTOCOL_VERSION_MAXIMUM]!.client.filter(
      (entry) => entry.verdict === 'accept' && entry.name.startsWith('hello'),
    );
    const allowed = new Set(recorded.flatMap((entry) => Object.keys(JSON.parse(entry.frame) as object)));
    for (const key of Object.keys(hello)) expect(allowed.has(key)).toBe(true);
    expect(hello['version']).toBe(PROTOCOL_VERSION_MAXIMUM);
    expect(hello['minVersion']).toBe(PROTOCOL_VERSION_MINIMUM);
  });

  it('parses every recorded server frame as a typed JSON object', () => {
    for (let version = PROTOCOL_VERSION_MINIMUM; version <= PROTOCOL_VERSION_MAXIMUM; version++) {
      for (const vector of PROTOCOL_GOLDEN_VECTORS[version]!.server) {
        const frame = JSON.parse(vector.frame) as Record<string, unknown>;
        expect(typeof frame['t'], vector.name).toBe('string');
      }
    }
  });

  it('shows the relay wording of version errors', () => {
    for (const name of ['protocol_unsupported', 'protocol_mismatch']) {
      const frame = serverFrame(2, name);
      const text = runtimeCollaborationErrorText(
        new SocketCollaborationError(String(frame['code']), frame as SocketCollaborationMessage),
      );
      expect(text).toBe(frame['message']);
    }
  });

  it('reads the version and editor build of a room list entry', () => {
    const rooms = serverFrame(2, 'room list entry')['rooms'] as unknown[];
    const room = sessionCollaborationRoomParse(rooms[0]);
    expect(room).not.toBeNull();
    expect(room!.protocol).toBe(2);
    expect(roomCollaborationCompatible(room!)).toBe(true);
    expect(roomCollaborationVersionLabel(room!)).toBe('v2 \u00b7 AiWorldEd/1.0');
  });

  it('decodes the recorded binary frames', () => {
    const chunk = binaryFrameParse(binaryFrame(2, 'stream chunk stream 1 peer 7 payload 010203'), 1024);
    expect(chunk).toEqual({ stream: 1, peer: 7, payloadBytes: 3 });
    expect(presenceFrameCheck(binaryFrame(2, 'presence client camera 0 at 1,2,3 fov 90'))).toBe(true);
    const relayed = presenceFrameDecode(binaryFrame(2, 'presence relayed from user 7'));
    expect(relayed?.sender).toBe(7);
    expect(relayed?.entries[0]?.position).toEqual([1, 2, 3]);
    expect(relayed?.entries[0]?.fov).toBe(90);
  });
});
