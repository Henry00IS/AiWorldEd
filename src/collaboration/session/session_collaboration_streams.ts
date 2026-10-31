import type { HostCollaborationEditor } from '@/collaboration/host/host_collaboration_editor.js';
import { StreamCollaborationReceiver } from '@/collaboration/net/stream_collaboration_receiver.js';
import { StreamCollaborationSender } from '@/collaboration/net/stream_collaboration_sender.js';
import type { SocketCollaborationMessage } from '@/collaboration/net/socket_collaboration_types.js';
import type { NodeCollaborationState } from '@/collaboration/scene/node_collaboration_types.js';
import type { SyncCollaborationSession } from '@/collaboration/session/session_collaboration_sync.js';
import {
  TexturesCollaborationSession,
  texturesCollaborationCollect,
} from '@/collaboration/session/session_collaboration_textures.js';
import type {
  SessionCollaborationEvents,
  SessionCollaborationTransport,
} from '@/collaboration/session/session_collaboration_types.js';
import { stateCollaborationParse } from '@/collaboration/sync/state_collaboration_parse.js';
import type { EditOperation } from '@/collaboration/shared/protocol_definitions.js';

/** Version of the snapshot payload. */
export const STREAMS_COLLABORATION_SNAPSHOT_VERSION = 1;

/**
 * Encodes a scene snapshot.
 *
 * @param states Node states in parent-first order.
 * @returns UTF-8 JSON bytes.
 */
export function streamsCollaborationSnapshotEncode(states: readonly NodeCollaborationState[]): Uint8Array {
  return new TextEncoder().encode(JSON.stringify({ v: STREAMS_COLLABORATION_SNAPSHOT_VERSION, states }));
}

/**
 * Decodes a scene snapshot.
 *
 * @param bytes UTF-8 JSON bytes.
 * @returns Valid node states, or null when the payload is unusable.
 */
export function streamsCollaborationSnapshotDecode(bytes: Uint8Array): NodeCollaborationState[] | null {
  try {
    const payload = JSON.parse(new TextDecoder().decode(bytes)) as { v?: unknown; states?: unknown };
    if (payload.v !== STREAMS_COLLABORATION_SNAPSHOT_VERSION || !Array.isArray(payload.states)) return null;
    const states: NodeCollaborationState[] = [];
    payload.states.forEach((value: unknown) => {
      const state = stateCollaborationParse(value);
      if (state !== null) states.push(state);
    });
    return states;
  } catch {
    return null;
  }
}

/**
 * Returns the node states carried by edit operations.
 *
 * @param ops Operations.
 * @returns States of upserting operations.
 */
export function streamsCollaborationOpStates(ops: readonly EditOperation[]): NodeCollaborationState[] {
  const states: NodeCollaborationState[] = [];
  ops.forEach((op) => {
    const state = stateCollaborationParse((op.d as { s?: unknown } | undefined)?.s);
    if (state !== null) states.push(state);
  });
  return states;
}

/**
 * Snapshot and asset streams of a room: the owner serializes the scene for each
 * joiner and streams textures on demand; a joiner reassembles the snapshot,
 * fetches its textures, then applies it.
 */
export class StreamsCollaborationSession {
  readonly textures: TexturesCollaborationSession;
  private readonly host: HostCollaborationEditor;
  private readonly sync: SyncCollaborationSession;
  private readonly events: SessionCollaborationEvents;
  private readonly sender: StreamCollaborationSender;
  private readonly receiver: StreamCollaborationReceiver;
  private snapshotStream: number | null;

  /**
   * Creates the stream coordinator.
   *
   * @param host Editor services.
   * @param transport Relay connection.
   * @param sync Edit loop.
   * @param events Runtime notifications.
   */
  constructor(
    host: HostCollaborationEditor,
    transport: SessionCollaborationTransport,
    sync: SyncCollaborationSession,
    events: SessionCollaborationEvents,
  ) {
    const limits = transport.limits;
    this.host = host;
    this.sync = sync;
    this.events = events;
    this.sender = new StreamCollaborationSender(transport, limits.streamChunkBytes, limits.streamWindowBytes);
    this.receiver = new StreamCollaborationReceiver(
      Math.max(limits.snapshotBytes, limits.assetBytes),
      limits.maxPayloadBytes,
    );
    this.textures = new TexturesCollaborationSession(transport, this.sender);
    this.textures.arrivedSet((ids) => this.texturesArrived(ids));
    this.snapshotStream = null;
  }

  /**
   * Serializes the scene and starts the snapshot stream (owner).
   *
   * @param to Joining member.
   */
  snapshotServe(to: number): void {
    this.sync.commit();
    const bytes = streamsCollaborationSnapshotEncode(this.sync.replica.snapshotStates());
    this.sender.start(to, 'snapshot', bytes, undefined, 'application/json');
  }

  /**
   * Handles stream messages for both directions.
   *
   * @param message Stream.begin, stream.end, stream.credit or stream.abort.
   */
  message(message: SocketCollaborationMessage): void {
    if (message.t === 'stream.credit') this.credited(message);
    else if (message.t === 'stream.begin') this.begun(message);
    else if (message.t === 'stream.end') this.ended(message);
    else if (message.t === 'stream.abort') this.aborted(message);
  }

  /**
   * Adds a binary chunk to its stream.
   *
   * @param frame Binary frame.
   */
  binary(frame: Uint8Array): void {
    this.receiver.chunk(frame);
  }

  /**
   * Requests textures that relayed edits reference.
   *
   * @param ops Relayed operations.
   */
  texturesForOps(ops: readonly EditOperation[]): void {
    const states = streamsCollaborationOpStates(ops);
    if (states.length > 0) void this.textures.ensure(states);
  }

  /**
   * Stops streams to a member that left.
   *
   * @param user Member user id.
   */
  memberLeft(user: number): void {
    this.sender.forgetRecipient(user);
    this.textures.forgetMember(user);
  }

  /** Drops all streams and waiters. */
  clear(): void {
    this.sender.clear();
    this.receiver.clear();
    this.textures.clear();
    this.snapshotStream = null;
  }

  /**
   * Applies a window credit (owner).
   *
   * @param message Stream.credit.
   */
  private credited(message: SocketCollaborationMessage): void {
    if (typeof message['to'] !== 'number' || typeof message['stream'] !== 'number') return;
    if (typeof message['delivered'] !== 'number') return;
    this.sender.credit(message['to'], message['stream'], message['delivered']);
    this.textures.servePump();
  }

  /**
   * Opens an incoming stream (member).
   *
   * @param message Stream.begin.
   */
  private begun(message: SocketCollaborationMessage): void {
    const incoming = this.receiver.begin(message);
    if (incoming === null) {
      if (message['kind'] === 'snapshot') this.events.failed('The room snapshot is too large or malformed');
      return;
    }
    if (incoming.kind === 'snapshot') this.snapshotStream = incoming.stream;
  }

  /**
   * Completes an incoming stream (member).
   *
   * @param message Stream.end.
   */
  private ended(message: SocketCollaborationMessage): void {
    if (typeof message['stream'] !== 'number') return;
    const isSnapshot = message['stream'] === this.snapshotStream;
    const incoming = this.receiver.end(message['stream']);
    if (isSnapshot) this.snapshotStream = null;
    if (incoming === null) {
      if (isSnapshot) this.events.failed('The room snapshot arrived incomplete');
      return;
    }
    if (incoming.kind === 'asset') this.textures.received(incoming);
    else void this.snapshotReceived(incoming.bytes);
  }

  /**
   * Handles an aborted stream in either direction.
   *
   * @param message Stream.abort.
   */
  private aborted(message: SocketCollaborationMessage): void {
    if (typeof message['stream'] !== 'number') return;
    if (typeof message['to'] === 'number') {
      this.sender.forget(message['to'], message['stream']);
      this.textures.servePump();
      return;
    }
    const incoming = this.receiver.abort(message['stream']);
    if (message['stream'] === this.snapshotStream) {
      this.snapshotStream = null;
      this.events.failed('The room snapshot transfer was aborted');
    } else if (incoming !== undefined) this.textures.settle(incoming.name);
  }

  /**
   * Fetches the snapshot's textures, then applies it.
   *
   * @param bytes Snapshot bytes.
   */
  private async snapshotReceived(bytes: Uint8Array): Promise<void> {
    const states = streamsCollaborationSnapshotDecode(bytes);
    if (states === null) {
      this.events.failed('The room snapshot could not be read');
      return;
    }
    this.host.status('Downloading room textures...');
    await this.textures.ensure(states);
    this.sync.snapshotApply(states);
    this.events.synced();
  }

  /**
   * Rebuilds synced nodes that use newly arrived textures.
   *
   * @param ids Texture ids now in the library.
   */
  private texturesArrived(ids: ReadonlySet<string>): void {
    if (!this.sync.isSynced()) return;
    this.sync.commit();
    const states: NodeCollaborationState[] = [];
    this.sync.replica.baselines.forEach((baseline) => {
      const used = new Set<string>();
      texturesCollaborationCollect(baseline.state.data, used);
      if ([...used].some((id) => ids.has(id))) states.push(baseline.state);
    });
    if (states.length === 0) return;
    this.sync.replica.statesApply(states, [], new Map(), false, 'rebuild');
    this.host.refresh();
  }
}
