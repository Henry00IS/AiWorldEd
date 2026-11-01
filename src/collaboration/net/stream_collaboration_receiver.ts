import { binaryFrameParse, binaryFramePayload } from '@/collaboration/shared/binary_frame.js';
import type { StreamKind } from '@/collaboration/shared/protocol_definitions.js';

/** Member-side state of one incoming stream. */
export interface StreamCollaborationIncoming {
  stream: number;
  kind: StreamKind;
  size: number;
  name: string;
  mime: string;
  bytes: Uint8Array;
  received: number;
  parts: Uint8Array[];
}

/** Streams the relay lets an owner keep open towards one member. */
export const STREAM_COLLABORATION_CONCURRENT_MAXIMUM = 8;

/**
 * Reassembles snapshot and asset streams from the room owner. Memory grows only
 * with bytes that actually arrived, so a hostile owner announcing huge streams
 * cannot make the member allocate them up front.
 */
export class StreamCollaborationReceiver {
  private readonly streams: Map<number, StreamCollaborationIncoming>;
  private readonly maximumBytes: number;
  private readonly maximumPayload: number;
  private readonly maximumConcurrent: number;

  /**
   * Creates a receiver.
   *
   * @param maximumBytes Largest accepted stream.
   * @param maximumPayload Largest accepted chunk payload.
   * @param maximumConcurrent Most streams open at once.
   */
  constructor(
    maximumBytes: number,
    maximumPayload: number,
    maximumConcurrent: number = STREAM_COLLABORATION_CONCURRENT_MAXIMUM,
  ) {
    this.streams = new Map();
    this.maximumBytes = maximumBytes;
    this.maximumPayload = maximumPayload;
    this.maximumConcurrent = maximumConcurrent;
  }

  /**
   * Starts a stream from a `stream.begin` message.
   *
   * @param message Begin message.
   * @returns The stream, or null when invalid.
   */
  begin(message: Record<string, unknown>): StreamCollaborationIncoming | null {
    const stream = message['stream'];
    const size = message['size'];
    const kind = message['kind'];
    if (typeof stream !== 'number' || typeof size !== 'number') return null;
    if (kind !== 'snapshot' && kind !== 'asset') return null;
    if (size <= 0 || size > this.maximumBytes) return null;
    if (!this.streams.has(stream) && this.streams.size >= this.maximumConcurrent) return null;
    const name = typeof message['name'] === 'string' ? message['name'] : '';
    const mime = typeof message['mime'] === 'string' ? message['mime'] : '';
    const incoming: StreamCollaborationIncoming = {
      stream,
      kind,
      size,
      name,
      mime,
      bytes: new Uint8Array(0),
      received: 0,
      parts: [],
    };
    this.streams.set(stream, incoming);
    return incoming;
  }

  /**
   * Copies one binary chunk into its stream.
   *
   * @param frame Binary frame.
   * @returns The stream, or null when the frame does not belong to a valid
   *   stream.
   */
  chunk(frame: Uint8Array): StreamCollaborationIncoming | null {
    const parsed = binaryFrameParse(frame, this.maximumPayload);
    if (parsed === null) return null;
    const incoming = this.streams.get(parsed.stream);
    if (incoming === undefined) return null;
    const payload = binaryFramePayload(frame);
    if (incoming.received + payload.byteLength > incoming.size) {
      this.streams.delete(parsed.stream);
      return null;
    }
    incoming.parts.push(payload.slice());
    incoming.received += payload.byteLength;
    return incoming;
  }

  /**
   * Completes a stream from a `stream.end` message.
   *
   * @param stream Stream id.
   * @returns The complete stream, or null when unknown or incomplete.
   */
  end(stream: number): StreamCollaborationIncoming | null {
    const incoming = this.streams.get(stream);
    this.streams.delete(stream);
    if (incoming === undefined || incoming.received !== incoming.size) return null;
    incoming.bytes = streamCollaborationPartsJoin(incoming.parts, incoming.size);
    incoming.parts = [];
    return incoming;
  }

  /**
   * Drops a stream.
   *
   * @param stream Stream id.
   * @returns The dropped stream, or undefined.
   */
  abort(stream: number): StreamCollaborationIncoming | undefined {
    const incoming = this.streams.get(stream);
    this.streams.delete(stream);
    return incoming;
  }

  /** Drops every stream. */
  clear(): void {
    this.streams.clear();
  }
}

/**
 * Joins received chunks into one buffer.
 *
 * @param parts Chunks in arrival order.
 * @param size Total byte count.
 * @returns Joined bytes.
 */
function streamCollaborationPartsJoin(parts: readonly Uint8Array[], size: number): Uint8Array {
  const joined = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    joined.set(part, offset);
    offset += part.byteLength;
  }
  return joined;
}
