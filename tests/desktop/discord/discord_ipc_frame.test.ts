import { describe, expect, it } from 'vitest';
import {
  discordIpcBytesConcat,
  discordIpcFrameEncode,
  discordIpcFramePayloadParse,
  DiscordIpcFrameReader,
  DISCORD_IPC_HEADER_LENGTH,
} from '@/desktop/discord/discord_ipc_frame.js';
import { DISCORD_IPC_OPCODE_FRAME, DISCORD_IPC_OPCODE_PING } from '@/desktop/discord/discord_ipc_opcode.js';

describe('discord_ipc_frame', () => {
  it('encodes a little-endian opcode and length header in front of the JSON body', () => {
    const frame = discordIpcFrameEncode(DISCORD_IPC_OPCODE_PING, { nonce: '1' });
    const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
    const body = '{"nonce":"1"}';
    expect(view.getUint32(0, true)).toBe(DISCORD_IPC_OPCODE_PING);
    expect(view.getUint32(4, true)).toBe(body.length);
    expect(new TextDecoder().decode(frame.subarray(DISCORD_IPC_HEADER_LENGTH))).toBe(body);
  });

  it('decodes a frame that arrives in several socket chunks', () => {
    const encoded = discordIpcFrameEncode(DISCORD_IPC_OPCODE_FRAME, { evt: 'READY' });
    const reader = new DiscordIpcFrameReader();
    expect(reader.push(encoded.subarray(0, 3))).toEqual([]);
    expect(reader.push(encoded.subarray(3, 10))).toEqual([]);
    expect(reader.push(encoded.subarray(10))).toEqual([
      { opcode: DISCORD_IPC_OPCODE_FRAME, payload: { evt: 'READY' } },
    ]);
  });

  it('decodes two frames from one concatenated chunk', () => {
    const first = discordIpcFrameEncode(DISCORD_IPC_OPCODE_PING, { a: 1 });
    const second = discordIpcFrameEncode(DISCORD_IPC_OPCODE_FRAME, { b: 2 });
    const reader = new DiscordIpcFrameReader();
    expect(reader.push(discordIpcBytesConcat(first, second))).toEqual([
      { opcode: DISCORD_IPC_OPCODE_PING, payload: { a: 1 } },
      { opcode: DISCORD_IPC_OPCODE_FRAME, payload: { b: 2 } },
    ]);
  });

  it('returns a null payload when the frame body is not JSON', () => {
    const body = new TextEncoder().encode('not-json');
    const frame = new Uint8Array(DISCORD_IPC_HEADER_LENGTH + body.byteLength);
    const view = new DataView(frame.buffer);
    view.setUint32(0, DISCORD_IPC_OPCODE_FRAME, true);
    view.setUint32(4, body.byteLength, true);
    frame.set(body, DISCORD_IPC_HEADER_LENGTH);
    expect(new DiscordIpcFrameReader().push(frame)).toEqual([{ opcode: DISCORD_IPC_OPCODE_FRAME, payload: null }]);
    expect(discordIpcFramePayloadParse(body)).toBeNull();
  });
});
