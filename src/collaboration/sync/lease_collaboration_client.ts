import type { SocketCollaborationMessage } from '@/collaboration/net/socket_collaboration_types.js';

/**
 * How often a running operation renews its lease (relay:
 * `LOCK_RENEW_INTERVAL_MS`).
 */
export const LEASE_COLLABORATION_RENEW_MS = 1500;

/** Shortest wait before an operation that was refused asks again. */
export const LEASE_COLLABORATION_RETRY_MS = 400;

/** Relay link used by the lease client. */
export interface LeaseCollaborationLink {
  /**
   * Sends a message and resolves with the reply carrying the same `r`.
   *
   * @param message Message.
   * @returns Reply.
   */
  request(message: object): Promise<SocketCollaborationMessage>;
  /**
   * Sends a message without waiting.
   *
   * @param message Message.
   */
  send(message: object): void;
}

/** State of the one operation this client runs. */
export type LeaseCollaborationState = 'none' | 'pending' | 'granted';

/** Answer to an acquire. */
export type LeaseCollaborationOutcome =
  | { ok: true; lease: number; add: string[]; remove: string[] }
  | { ok: false; lease: number; code: string; conflicts: unknown; why: string };

/**
 * Client half of the relay's one-operation-at-a-time rule: a member runs at
 * most one edit lease, named by a number that only grows. Starting a drag or a
 * tool acquires (replacing whatever ran before), the same number extends it,
 * renewals keep it alive only while input is active, and committing or
 * cancelling releases it. Late answers for older numbers are ignored.
 */
export class LeaseCollaborationClient {
  private readonly link: LeaseCollaborationLink;
  private counter: number;
  private current: number;
  private stateValue: LeaseCollaborationState;
  private readonly granted: Set<string>;
  private readonly asked: Set<string>;
  private renewedAt: number;
  private refusedAt: number;

  /**
   * Creates the client.
   *
   * @param link Relay link.
   */
  constructor(link: LeaseCollaborationLink) {
    this.link = link;
    this.counter = 0;
    this.current = 0;
    this.stateValue = 'none';
    this.granted = new Set();
    this.asked = new Set();
    this.renewedAt = 0;
    this.refusedAt = -Infinity;
  }

  /**
   * Returns the state of the running operation.
   *
   * @returns State.
   */
  state(): LeaseCollaborationState {
    return this.stateValue;
  }

  /**
   * Returns the number of the running (or requested) lease.
   *
   * @returns Lease number, 0 when none ran yet.
   */
  lease(): number {
    return this.current;
  }

  /**
   * Returns whether the granted lease covers every id.
   *
   * @param ids Ids.
   * @returns True when an edit of them may carry the lease number.
   */
  covers(ids: Iterable<string>): boolean {
    if (this.stateValue !== 'granted') return false;
    for (const id of ids) if (!this.granted.has(id)) return false;
    return true;
  }

  /**
   * Returns whether the running or pending lease asked for every id.
   *
   * @param ids Ids.
   * @returns True when the ids belong to the current operation.
   */
  asks(ids: Iterable<string>): boolean {
    if (this.stateValue === 'none') return false;
    for (const id of ids) if (!this.asked.has(id)) return false;
    return true;
  }

  /**
   * Returns whether a refused operation may ask again.
   *
   * @param now Monotonic time in milliseconds.
   * @returns True once the retry pause passed.
   */
  retryAllowed(now: number): boolean {
    return now - this.refusedAt >= LEASE_COLLABORATION_RETRY_MS;
  }

  /**
   * Starts a new operation over `ids` (exclusive) and `shared` (ancestors),
   * replacing the running one. Large id sets go out in chunks that extend the
   * same lease.
   *
   * @param ids Exclusive ids (subtrees of the edited objects).
   * @param shared Ancestor ids.
   * @param perMessage Most ids per message.
   * @param now Monotonic time in milliseconds.
   * @returns Outcome of the whole request.
   */
  acquire(
    ids: readonly string[],
    shared: readonly string[],
    perMessage: number,
    now: number,
  ): Promise<LeaseCollaborationOutcome> {
    const lease = ++this.counter;
    this.current = lease;
    this.stateValue = 'pending';
    this.granted.clear();
    this.asked.clear();
    ids.forEach((id) => this.asked.add(id));
    this.renewedAt = now;
    const size = Math.max(1, perMessage);
    const messages: object[] = [];
    for (let start = 0; start < Math.max(1, ids.length); start += size) {
      const chunk = ids.slice(start, start + size);
      const first = start === 0;
      const sharedPart = first ? shared.slice(0, size) : [];
      messages.push({
        t: 'lock.acquire',
        lease,
        ids: chunk,
        ...(first ? { replace: true } : {}),
        ...(sharedPart.length > 0 ? { shared: sharedPart } : {}),
      });
    }
    const replies = messages.map((message) =>
      this.link
        .request(message)
        .catch((): SocketCollaborationMessage => ({ t: 'lock.result', ok: false, code: 'timeout' })),
    );
    return Promise.all(replies).then((list) => this.settle(lease, list, now));
  }

  /**
   * Applies the answers of one acquire.
   *
   * @param lease Lease number asked for.
   * @param replies Answers in order.
   * @param now Time of the request.
   * @returns Outcome.
   */
  private settle(lease: number, replies: SocketCollaborationMessage[], now: number): LeaseCollaborationOutcome {
    const add: string[] = [];
    const remove: string[] = [];
    for (const reply of replies) {
      if (reply['ok'] !== true) {
        if (lease === this.current && this.stateValue === 'pending') {
          this.stateValue = 'none';
          this.asked.clear();
          this.refusedAt = now;
        }
        return {
          ok: false,
          lease,
          code: String(reply['code'] ?? 'refused'),
          conflicts: reply['conflicts'],
          why: String(reply['why'] ?? ''),
        };
      }
      add.push(...leaseCollaborationStrings(reply['add']));
      remove.push(...leaseCollaborationStrings(reply['remove']));
    }
    if (lease === this.current && this.stateValue === 'pending') {
      this.stateValue = 'granted';
      this.asked.forEach((id) => this.granted.add(id));
    }
    return { ok: true, lease, add, remove };
  }

  /**
   * Adds ids to the granted lease (a created object joined the operation).
   *
   * @param ids Ids.
   */
  adopt(ids: Iterable<string>): void {
    if (this.stateValue === 'none') return;
    for (const id of ids) {
      this.asked.add(id);
      if (this.stateValue === 'granted') this.granted.add(id);
    }
  }

  /**
   * Forgets ids the relay released (deleted objects).
   *
   * @param ids Ids.
   */
  forget(ids: Iterable<string>): void {
    for (const id of ids) {
      this.granted.delete(id);
      this.asked.delete(id);
    }
  }

  /**
   * Renews the running lease when due.
   *
   * @param now Monotonic time in milliseconds.
   * @returns True when a renewal went out.
   */
  renew(now: number): boolean {
    if (this.stateValue !== 'granted' || now - this.renewedAt < LEASE_COLLABORATION_RENEW_MS) return false;
    this.renewedAt = now;
    this.link.send({ t: 'lock.renew', lease: this.current });
    return true;
  }

  /**
   * Notes that an accepted edit kept the lease alive.
   *
   * @param now Monotonic time in milliseconds.
   */
  progressed(now: number): void {
    this.renewedAt = now;
  }

  /**
   * Ends the running operation.
   *
   * @returns True when a release went out.
   */
  release(): boolean {
    if (this.stateValue === 'none') return false;
    this.stateValue = 'none';
    this.granted.clear();
    this.asked.clear();
    this.link.send({ t: 'lock.release' });
    return true;
  }

  /** Forgets the running operation after the relay expired it (nothing is sent). */
  expired(): void {
    this.stateValue = 'none';
    this.granted.clear();
    this.asked.clear();
  }

  /** A new press is a deliberate retry: it may ask again at once. */
  retryNow(): void {
    this.refusedAt = -Infinity;
  }

  /** Forgets everything (left the room). */
  clear(): void {
    this.expired();
    this.refusedAt = -Infinity;
  }
}

/**
 * Keeps the strings of an untrusted list.
 *
 * @param value Untrusted list.
 * @returns Strings.
 */
function leaseCollaborationStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}
