import type { SocketCollaborationClient } from '@/collaboration/net/socket_collaboration_client.js';
import { customFrameEncode, customFrameParse, type CustomGuard } from '@/collaboration/shared/custom_frame.js';
import { BINARY_FRAME_KIND_CUSTOM } from '@/collaboration/shared/protocol_definitions.js';

/**
 * General-purpose opaque fork channel, including fork-managed state. Edits
 * remain the primary scene path for built-in undo, snapshots and merge.
 */
export class CustomCollaborationChannel {
  private readonly listeners = new Set<(from: number, payload: Uint8Array) => void>();

  /**
   * Creates an API bound to a runtime's current socket and membership.
   *
   * @param client Current connection.
   * @param synced Whether this runtime finished syncing.
   * @param owner Whether this runtime owns the room.
   */
  constructor(
    private readonly client: () => SocketCollaborationClient,
    private readonly synced: () => boolean,
    private readonly owner: () => boolean,
  ) {}

  /**
   * Sends application bytes to the owner; rejects on explicit relay errors.
   *
   * @param payload Application-defined bytes, at most 256 KiB.
   * @param guard Optional scene lease and target ids.
   * @returns Relay acknowledgement, not proof of application consumption.
   */
  sendToOwner(payload: Uint8Array, guard: CustomGuard = {}): Promise<unknown> {
    if (this.owner()) return Promise.reject(new Error('Only members send to the owner'));
    return this.send(0, payload, guard);
  }

  /**
   * Sends application bytes to exactly one member as the owner.
   *
   * @param member Target member id.
   * @param payload Application-defined bytes, at most 256 KiB.
   * @param guard Optional scene lease and ids.
   * @returns Relay acknowledgement, not proof of application consumption.
   */
  sendToMember(member: number, payload: Uint8Array, guard: CustomGuard = {}): Promise<unknown> {
    if (!this.owner()) return Promise.reject(new Error('Only the owner targets members'));
    return this.send(member, payload, guard);
  }

  /**
   * Broadcasts owner-managed application bytes to all synced members.
   *
   * @param payload Application-defined bytes, at most 256 KiB.
   * @param guard Optional scene lease and ids.
   * @returns Relay acknowledgement.
   */
  sendToAll(payload: Uint8Array, guard: CustomGuard = {}): Promise<unknown> {
    if (!this.owner()) return Promise.reject(new Error('Only the owner broadcasts'));
    return this.send(0, payload, { ...guard, broadcast: true });
  }

  /**
   * Subscribes to opaque bytes; fork code interprets its own payload protocol.
   *
   * @param listener Receives sender id and payload bytes.
   * @returns Unsubscribe function.
   */
  onMessage(listener: (from: number, payload: Uint8Array) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Acquires opaque keys, independent of scene ids and edit leases.
   *
   * @param keys Application-defined keys; released on leave or disconnect.
   * @returns Relay acknowledgement or lock conflict.
   */
  acquire(keys: string[]): Promise<unknown> {
    if (!this.synced()) return Promise.reject(new Error('Not synced'));
    return this.client().request({ t: 'custom.lock.acquire', keys });
  }

  /**
   * Releases owned custom keys; omitted keys releases all custom locks.
   *
   * @param keys Optional keys to release.
   * @returns Relay acknowledgement.
   */
  release(keys?: string[]): Promise<unknown> {
    if (!this.synced()) return Promise.reject(new Error('Not synced'));
    return this.client().request({ t: 'custom.lock.release', ...(keys ? { keys } : {}) });
  }

  /**
   * Routes custom binary frames without exposing them to scene decoding.
   *
   * @param frame Incoming binary frame.
   * @returns Whether the frame belongs to the custom channel.
   */
  receive(frame: Uint8Array): boolean {
    if (frame[1] !== BINARY_FRAME_KIND_CUSTOM) return false;
    const parsed = customFrameParse(frame);
    if (parsed && this.synced()) for (const listener of this.listeners) listener(parsed.peer, parsed.payload);
    return true;
  }

  /**
   * Queues bytes in the same socket FIFO as edits and locks.
   *
   * @param peer Recipient id or zero for owner.
   * @param payload Opaque bytes.
   * @param guard Optional scene lock envelope.
   * @returns Relay acknowledgement.
   */
  private send(peer: number, payload: Uint8Array, guard: CustomGuard): Promise<unknown> {
    if (!this.synced()) return Promise.reject(new Error('Not synced'));
    if (payload.length > 256 * 1024) return Promise.reject(new Error('Custom payload exceeds 256 KiB'));
    return this.client().requestBinary((r) => customFrameEncode(r, peer, payload, guard));
  }
}
