import * as THREE from 'three';
import type { ToyEntry } from '@/collaboration/shared/toy_frame.js';
import type { PlayerBallSnapshot } from '@/player/ball/player_ball_link.js';

/**
 * Client-defined toy type of a hooked grapple beam (opaque to the relay): an
 * entry with no payload at the anchor, in every toy frame while hooked.
 */
export const TOY_TYPE_GRAPPLE = 5;

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
 * Finds the hooked beam among a frame's entries.
 *
 * @param entries Frame entries.
 * @returns Entry, or undefined.
 */
export function playerGrappleEntryFind(entries: readonly ToyEntry[]): ToyEntry | undefined {
  return entries.find((entry) => entry.type === TOY_TYPE_GRAPPLE && entry.payload.byteLength === 0);
}

/**
 * The other members' grapple beams: which anchor each one's toy frames name (a
 * full frame without one means let go). Their characters reach for it and draw
 * the beam from the right hand.
 */
export class PlayerGrappleRemote {
  private readonly anchors = new Map<number, THREE.Vector3>();

  /**
   * Creates no beams.
   *
   * @param reach Points a member's character at its anchor (null: let go).
   */
  constructor(private readonly reach: (member: number, anchor: THREE.Vector3 | null) => void) {}

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
