import * as THREE from 'three';
import type { ToyEntry } from '@/collaboration/shared/toy_frame.js';
import type { PlayerBallSnapshot } from '@/player/ball/player_ball_link.js';

/**
 * Client-defined toy type of the grapple beam (opaque to the relay): while
 * hooked, an entry with no payload at the anchor in every toy frame; for a
 * moment after a missed shot, an entry at the end of its flicker with a
 * one-byte payload counting the misses.
 */
export const TOY_TYPE_GRAPPLE = 5;
/** How long a missed shot rides along in the own toy frames. */
export const PLAYER_GRAPPLE_MISS_SENT_MS = 300;

/**
 * Builds the toy entry of a hooked beam.
 *
 * @param id Toy id free in the frame.
 * @param anchor Anchor.
 * @returns Entry.
 */
export function playerGrappleEntry(id: number, anchor: THREE.Vector3): ToyEntry {
  return { type: TOY_TYPE_GRAPPLE, id, flags: 0, position: [anchor.x, anchor.y, anchor.z], payload: new Uint8Array(0) };
}

/**
 * Builds the toy entry of a missed shot.
 *
 * @param id Toy id free in the frame.
 * @param end End of the flicker.
 * @param count Miss count (wraps at 256).
 * @returns Entry.
 */
export function playerGrappleMissEntry(id: number, end: THREE.Vector3, count: number): ToyEntry {
  return {
    type: TOY_TYPE_GRAPPLE,
    id,
    flags: 0,
    position: [end.x, end.y, end.z],
    payload: Uint8Array.of(count & 0xff),
  };
}

/**
 * Finds the hooked beam or a missed shot among a frame's entries.
 *
 * @param entries Frame entries.
 * @returns Entry, or undefined.
 */
export function playerGrappleEntryFind(entries: readonly ToyEntry[]): ToyEntry | undefined {
  return entries.find((entry) => entry.type === TOY_TYPE_GRAPPLE && entry.payload.byteLength <= 1);
}

/**
 * The other members' grapple beams: which anchor each one's toy frames name (a
 * full frame without one means let go). Their characters reach for it and draw
 * the beam from the right hand; each new missed shot flickers once.
 */
export class PlayerGrappleRemote {
  private readonly anchors = new Map<number, THREE.Vector3>();
  private readonly misses = new Map<number, number>();

  /**
   * Creates no beams.
   *
   * @param reach Points a member's character at its anchor (null: let go).
   * @param missed Flickers a member's missed shot out to its end.
   */
  constructor(
    private readonly reach: (member: number, anchor: THREE.Vector3 | null) => void,
    private readonly missed: (member: number, end: THREE.Vector3) => void,
  ) {}

  /**
   * Takes a member's snapshot: hooks, moves or drops its beam.
   *
   * @param member Member id.
   * @param snapshot Its snapshot.
   */
  incoming(member: number, snapshot: PlayerBallSnapshot): void {
    const entry = snapshot.grapple;
    if (!entry) {
      if (snapshot.full) this.drop(member);
      return;
    }
    const anchor = new THREE.Vector3(...entry.position);
    const count = entry.payload[0];
    if (count !== undefined) {
      this.drop(member);
      if (this.misses.get(member) !== count) this.missed(member, anchor);
      this.misses.set(member, count);
      return;
    }
    if (this.anchors.get(member)?.equals(anchor)) return;
    this.anchors.set(member, anchor);
    this.reach(member, anchor);
  }

  /**
   * Returns a member's anchor.
   *
   * @param member Member id.
   * @returns Anchor, or null.
   */
  anchorOf(member: number): THREE.Vector3 | null {
    return this.anchors.get(member) ?? null;
  }

  /**
   * Drops the beams of members that fail a test.
   *
   * @param keep Test.
   */
  keepMembers(keep: (member: number) => boolean): void {
    [...this.anchors.keys()].filter((member) => !keep(member)).forEach((member) => this.drop(member));
    [...this.misses.keys()].filter((member) => !keep(member)).forEach((member) => this.misses.delete(member));
  }

  /** Drops every beam. */
  clear(): void {
    this.keepMembers(() => false);
  }

  /**
   * Drops one member's beam.
   *
   * @param member Member id.
   */
  private drop(member: number): void {
    if (!this.anchors.delete(member)) return;
    this.reach(member, null);
  }
}
