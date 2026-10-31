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
}

/** Reassembles snapshot and asset streams from the room owner. */
export class StreamCollaborationReceiver {
  private readonly streams: Map<number, StreamCollaborationIncoming>;
  private readonly maximumBytes: number;
  private readonly maximumPayload: number;

  /**
   * Creates a receiver.
   *
   * @param maximumBytes Largest accepted stream.
   * @param maximumPayload Largest accepted chunk payload.
   */
  constructor(maximumBytes: number, maximumPayload: number) {
    this.streams = new Map();
    this.maximumBytes = maximumBytes;
    this.maximumPayload = maximumPayload;
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
    const name = typeof message['name'] === 'string' ? message['name'] : '';
    const mime = typeof message['mime'] === 'string' ? message['mime'] : '';
    const incoming: StreamCollaborationIncoming = {
      stream,
      kind,
      size,
      name,
      mime,
      bytes: new Uint8Array(size),
      received: 0,
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
    incoming.bytes.set(payload, incoming.received);
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
