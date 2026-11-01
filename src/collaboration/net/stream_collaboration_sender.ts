import { binaryFrameEncode } from '@/collaboration/shared/binary_frame.js';
import type { StreamKind } from '@/collaboration/shared/protocol_definitions.js';

/** Transport used by the stream sender. */
export interface StreamCollaborationTransport {
  send(message: object): void;
  sendBinary(frame: Uint8Array): void;
}

/** Owner-side state of one outgoing stream. */
interface StreamCollaborationOutgoing {
  to: number;
  stream: number;
  bytes: Uint8Array;
  offset: number;
  delivered: number;
  name: string | undefined;
  tag: string | undefined;
}

/** Name and content tag of an outgoing stream, as seen by abort filters. */
export interface StreamCollaborationOutgoingInfo {
  to: number;
  name: string | undefined;
  tag: string | undefined;
}

/**
 * Streams snapshots and assets from the room owner to members in chunks,
 * keeping the bytes sent but not yet credited by the relay within its window.
 */
export class StreamCollaborationSender {
  private readonly transport: StreamCollaborationTransport;
  private readonly chunkBytes: number;
  private readonly windowBytes: number;
  private readonly streams: Map<string, StreamCollaborationOutgoing>;
  private next: number;

  /**
   * Creates a sender.
   *
   * @param transport Socket transport.
   * @param chunkBytes Payload bytes per binary frame.
   * @param windowBytes Maximum uncredited bytes per stream.
   */
  constructor(transport: StreamCollaborationTransport, chunkBytes: number, windowBytes: number) {
    this.transport = transport;
    this.chunkBytes = Math.max(1, chunkBytes);
    this.windowBytes = Math.max(this.chunkBytes, windowBytes);
    this.streams = new Map();
    this.next = 1;
  }

  /**
   * Announces a stream and sends as much of it as the window allows.
   *
   * @param to Recipient user id.
   * @param kind Stream kind.
   * @param bytes Payload (at least one byte).
   * @param name Asset name, or undefined for snapshots.
   * @param mime Asset MIME type, or undefined.
   * @param tag Content tag kept for abort filters.
   * @returns Stream id.
   */
  start(to: number, kind: StreamKind, bytes: Uint8Array, name?: string, mime?: string, tag?: string): number {
    const stream = this.next;
    this.next = this.next >= 0x7fffffff ? 1 : this.next + 1;
    const begin = { t: 'stream.begin', to, stream, kind, size: bytes.byteLength };
    this.transport.send({ ...begin, ...(name === undefined ? {} : { name }), ...(mime ? { mime } : {}) });
    const outgoing: StreamCollaborationOutgoing = { to, stream, bytes, offset: 0, delivered: 0, name, tag };
    this.streams.set(streamCollaborationKey(to, stream), outgoing);
    this.pump(outgoing);
    return stream;
  }

  /**
   * Applies a relay credit and continues the stream.
   *
   * @param to Recipient user id.
   * @param stream Stream id.
   * @param delivered Cumulative bytes delivered to the recipient.
   */
  credit(to: number, stream: number, delivered: number): void {
    const outgoing = this.streams.get(streamCollaborationKey(to, stream));
    if (outgoing === undefined) return;
    outgoing.delivered = Math.max(outgoing.delivered, delivered);
    this.pump(outgoing);
  }

  /**
   * Forgets a stream without notifying the relay (it was aborted remotely).
   *
   * @param to Recipient user id.
   * @param stream Stream id.
   */
  forget(to: number, stream: number): void {
    this.streams.delete(streamCollaborationKey(to, stream));
  }

  /**
   * Aborts unfinished streams a filter selects and tells the relay.
   *
   * @param select Returns true for streams to abort.
   * @param reason Abort reason (printable ASCII).
   * @returns Number of streams aborted.
   */
  abortWhere(select: (info: StreamCollaborationOutgoingInfo) => boolean, reason: string): number {
    let count = 0;
    this.streams.forEach((outgoing, key) => {
      if (!select({ to: outgoing.to, name: outgoing.name, tag: outgoing.tag })) return;
      this.streams.delete(key);
      this.transport.send({ t: 'stream.abort', to: outgoing.to, stream: outgoing.stream, reason });
      count += 1;
    });
    return count;
  }

  /**
   * Forgets every stream to a recipient.
   *
   * @param to Recipient user id.
   */
  forgetRecipient(to: number): void {
    this.streams.forEach((outgoing, key) => {
      if (outgoing.to === to) this.streams.delete(key);
    });
  }

  /**
   * Returns the number of unfinished streams to one recipient.
   *
   * @param to Recipient user id.
   * @returns Active stream count.
   */
  activeCountFor(to: number): number {
    let count = 0;
    this.streams.forEach((outgoing) => {
      if (outgoing.to === to) count += 1;
    });
    return count;
  }

  /**
   * Returns the number of streams in flight.
   *
   * @returns Stream count.
   */
  activeCount(): number {
    return this.streams.size;
  }

  /** Forgets every stream. */
  clear(): void {
    this.streams.clear();
  }

  /**
   * Sends chunks while they fit the window and ends the stream when complete.
   *
   * @param outgoing Stream state.
   */
  private pump(outgoing: StreamCollaborationOutgoing): void {
    const size = outgoing.bytes.byteLength;
    while (outgoing.offset < size) {
      const length = Math.min(this.chunkBytes, size - outgoing.offset);
      if (outgoing.offset + length - outgoing.delivered > this.windowBytes) return;
      const payload = outgoing.bytes.subarray(outgoing.offset, outgoing.offset + length);
      this.transport.sendBinary(binaryFrameEncode(outgoing.stream, outgoing.to, payload));
      outgoing.offset += length;
    }
    this.transport.send({ t: 'stream.end', to: outgoing.to, stream: outgoing.stream });
    this.streams.delete(streamCollaborationKey(outgoing.to, outgoing.stream));
  }
}

/**
 * Builds the map key of a stream.
 *
 * @param to Recipient user id.
 * @param stream Stream id.
 * @returns Key.
 */
function streamCollaborationKey(to: number, stream: number): string {
  return `${to}:${stream}`;
}
