/** Byte length of the opcode and payload-length header. */
export const DISCORD_IPC_HEADER_LENGTH = 8;

/** One decoded Discord IPC frame. */
export interface DiscordIpcDecodedFrame {
  opcode: number;
  payload: unknown;
}

/**
 * Encodes a Discord IPC frame.
 *
 * @param opcode Frame opcode.
 * @param payload JSON-serializable body.
 * @returns Header and UTF-8 JSON body.
 */
export function discordIpcFrameEncode(opcode: number, payload: unknown): Uint8Array {
  const body = new TextEncoder().encode(JSON.stringify(payload));
  const frame = new Uint8Array(DISCORD_IPC_HEADER_LENGTH + body.byteLength);
  const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
  view.setUint32(0, opcode, true);
  view.setUint32(4, body.byteLength, true);
  frame.set(body, DISCORD_IPC_HEADER_LENGTH);
  return frame;
}

/**
 * Concatenates two byte arrays.
 *
 * @param left Leading bytes.
 * @param right Trailing bytes.
 * @returns Combined copy.
 */
export function discordIpcBytesConcat(left: Uint8Array, right: Uint8Array): Uint8Array {
  const combined = new Uint8Array(left.byteLength + right.byteLength);
  combined.set(left, 0);
  combined.set(right, left.byteLength);
  return combined;
}

/**
 * Parses a UTF-8 JSON frame body.
 *
 * @param body Frame body bytes.
 * @returns Parsed value, or null when the body is not JSON.
 */
export function discordIpcFramePayloadParse(body: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(body));
  } catch {
    return null;
  }
}

/** Accumulates socket chunks and yields complete IPC frames. */
export class DiscordIpcFrameReader {
  private leftover: Uint8Array = new Uint8Array(0);

  /**
   * Accepts a socket chunk and returns every complete frame it finished.
   *
   * @param chunk Newly received bytes.
   * @returns Frames completed by this chunk.
   */
  push(chunk: Uint8Array): DiscordIpcDecodedFrame[] {
    this.leftover = discordIpcBytesConcat(this.leftover, chunk);
    return this.drain();
  }

  /**
   * Removes and returns every complete frame in the leftover buffer.
   *
   * @returns Complete frames.
   */
  private drain(): DiscordIpcDecodedFrame[] {
    const frames: DiscordIpcDecodedFrame[] = [];
    for (;;) {
      const frame = this.takeFrame();
      if (frame === null) return frames;
      frames.push(frame);
    }
  }

  /**
   * Removes one complete frame from the leftover buffer when enough bytes are
   * present.
   *
   * @returns The frame, or null when the buffer is incomplete.
   */
  private takeFrame(): DiscordIpcDecodedFrame | null {
    if (this.leftover.byteLength < DISCORD_IPC_HEADER_LENGTH) return null;
    const view = new DataView(this.leftover.buffer, this.leftover.byteOffset, this.leftover.byteLength);
    const length = view.getUint32(4, true);
    const total = DISCORD_IPC_HEADER_LENGTH + length;
    if (this.leftover.byteLength < total) return null;
    return this.consumeFrame(view.getUint32(0, true), total);
  }

  /**
   * Slices one frame off the leftover buffer and parses its JSON body.
   *
   * @param opcode Frame opcode.
   * @param total Header plus body length.
   * @returns The frame, or a frame with a null payload when the body is not
   *   JSON.
   */
  private consumeFrame(opcode: number, total: number): DiscordIpcDecodedFrame {
    const body = this.leftover.subarray(DISCORD_IPC_HEADER_LENGTH, total);
    const payload = discordIpcFramePayloadParse(body);
    this.leftover = this.leftover.slice(total);
    return { opcode, payload };
  }
}
