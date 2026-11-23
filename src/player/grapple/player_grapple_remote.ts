import * as THREE from 'three';
import type { ToyEntry } from '@/collaboration/shared/toy_frame.js';
import type { PlayerBallPlayer, PlayerBallSnapshot } from '@/player/ball/player_ball_link.js';
import type { PlayerHelperLayer } from '@/player/player_helper_layer.js';
import { PlayerGrappleBeam } from './player_grapple_beam.js';
import { PLAYER_GRAPPLE_HAND_HEIGHT_METERS } from './player_grapple_constants.js';

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

/** One other member's hooked beam. */
interface PlayerGrappleRemoteBeam {
  anchor: THREE.Vector3;
  beam: PlayerGrappleBeam;
}

const scratchHand = new THREE.Vector3();

/**
 * The other members' grapple beams, drawn from their characters' hands to the
 * anchors their toy frames name. A full frame without one means let go.
 */
export class PlayerGrappleRemote {
  private readonly beams = new Map<number, PlayerGrappleRemoteBeam>();

  /**
   * Creates no beams.
   *
   * @param layer Helper layer for the beams.
   */
  constructor(private readonly layer: PlayerHelperLayer) {}

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
    const known = this.beams.get(member);
    if (known?.anchor.equals(anchor)) return;
    const beam = known?.beam ?? new PlayerGrappleBeam(this.layer);
    beam.hook(anchor);
    this.beams.set(member, { anchor, beam });
  }

  /**
   * Draws the beams from the shown characters (none for a member not shown).
   *
   * @param players Other members in play mode.
   * @param deltaSeconds Frame time.
   * @returns True while a beam is drawn.
   */
  update(players: readonly PlayerBallPlayer[], deltaSeconds: number): boolean {
    let drawn = false;
    this.beams.forEach(({ anchor, beam }, member) => {
      const player = players.find((other) => other.member === member);
      if (player)
        beam.show(scratchHand.copy(player.feet).setY(player.feet.y + PLAYER_GRAPPLE_HAND_HEIGHT_METERS), anchor);
      else beam.hide();
      drawn = beam.update(deltaSeconds) || drawn;
    });
    return drawn;
  }

  /**
   * Returns a member's anchor.
   *
   * @param member Member id.
   * @returns Anchor, or null.
   */
  anchorOf(member: number): THREE.Vector3 | null {
    return this.beams.get(member)?.anchor ?? null;
  }

  /**
   * Drops the beams of members that fail a test.
   *
   * @param keep Test.
   */
  keepMembers(keep: (member: number) => boolean): void {
    [...this.beams.keys()].filter((member) => !keep(member)).forEach((member) => this.drop(member));
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
    this.beams.get(member)?.beam.dispose();
    this.beams.delete(member);
  }
}
