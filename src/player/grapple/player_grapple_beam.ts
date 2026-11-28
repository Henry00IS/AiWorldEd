import * as THREE from 'three';
import { PLAYER_BALL_USERDATA_KEY } from '@/player/ball/player_ball_constants.js';
import type { PlayerHelperLayer } from '@/player/player_helper_layer.js';
import {
  PLAYER_GRAPPLE_BEAM_COLOR,
  PLAYER_GRAPPLE_BEAM_HAND_TAPER,
  PLAYER_GRAPPLE_BEAM_RADIUS_METERS,
  PLAYER_GRAPPLE_FIZZLE_SECONDS,
  PLAYER_GRAPPLE_FLASH_RADIUS_METERS,
  PLAYER_GRAPPLE_FLASH_SECONDS,
  PLAYER_GRAPPLE_GLOW_RADIUS_METERS,
} from './player_grapple_constants.js';

const UP = new THREE.Vector3(0, 1, 0);
const scratchDirection = new THREE.Vector3();

/**
 * A unit cylinder from y 0 (the hand, thinner) to 1 (the anchor), open at the
 * ends.
 *
 * @returns Geometry.
 */
function playerGrappleTube(): THREE.CylinderGeometry {
  return new THREE.CylinderGeometry(1, PLAYER_GRAPPLE_BEAM_HAND_TAPER, 1, 8, 1, true).translate(0, 0.5, 0);
}

/**
 * Glowing additive material.
 *
 * @param color Color.
 * @param opacity Opacity.
 * @returns Material.
 */
function playerGrappleGlow(color: number, opacity: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
}

/**
 * The drawn beam of one grapple: a white-hot core in a flickering blue glow
 * from the hand to the anchor, a flash where it hooks and a brief flicker out
 * along the aim when it misses. Helper objects that picking ignores.
 */
export class PlayerGrappleBeam {
  private readonly layer: PlayerHelperLayer;
  private readonly root = new THREE.Group();
  private readonly core: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>;
  private readonly glow: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>;
  private readonly flash: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  private flashAge = Number.POSITIVE_INFINITY;
  private fizzleAge = Number.POSITIVE_INFINITY;
  private time = 0;
  private shown = false;

  /**
   * Builds a hidden beam.
   *
   * @param layer Helper layer it is drawn on.
   */
  constructor(layer: PlayerHelperLayer) {
    this.layer = layer;
    const tube = playerGrappleTube();
    this.core = new THREE.Mesh(tube, playerGrappleGlow(0xffffff, 0.95));
    this.glow = new THREE.Mesh(tube, playerGrappleGlow(PLAYER_GRAPPLE_BEAM_COLOR, 0.45));
    this.flash = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), playerGrappleGlow(PLAYER_GRAPPLE_BEAM_COLOR, 0));
    this.root.name = 'Grapple Beam';
    this.root.add(this.core, this.glow, this.flash);
    this.root.traverse((object) => {
      object.userData[PLAYER_BALL_USERDATA_KEY] = true;
      object.raycast = () => undefined;
      object.frustumCulled = false;
      object.renderOrder = 10;
    });
    this.core.visible = this.glow.visible = this.flash.visible = false;
  }

  /**
   * Draws the beam between two points this frame.
   *
   * @param from Hand position.
   * @param to Anchor.
   */
  show(from: THREE.Vector3, to: THREE.Vector3): void {
    this.fizzleAge = Number.POSITIVE_INFINITY;
    this.span(from, to, 1);
  }

  /**
   * Flashes at the anchor (the beam just hooked).
   *
   * @param at Anchor.
   */
  hook(at: THREE.Vector3): void {
    this.flash.position.copy(at);
    this.flashAge = 0;
    this.attach();
  }

  /**
   * Flickers a short beam out along the aim (the shot missed).
   *
   * @param from Hand position.
   * @param to End of the flicker.
   */
  fizzle(from: THREE.Vector3, to: THREE.Vector3): void {
    this.span(from, to, 0.6);
    this.fizzleAge = 0;
  }

  /**
   * Keeps a playing flicker between moving ends (the hand moves on).
   *
   * @param from Hand position.
   * @param to End of the flicker.
   */
  follow(from: THREE.Vector3, to: THREE.Vector3): void {
    if (this.core.visible && Number.isFinite(this.fizzleAge)) this.span(from, to, 0.6);
  }

  /** Stops drawing the beam (a flash or flicker plays out). */
  hide(): void {
    this.core.visible = this.glow.visible = false;
  }

  /**
   * Plays the flash and flicker on, and flickers the glow.
   *
   * @param deltaSeconds Frame time.
   * @returns True while something is still drawn.
   */
  update(deltaSeconds: number): boolean {
    this.time += deltaSeconds;
    this.flashAge += deltaSeconds;
    this.fizzleAge += deltaSeconds;
    const flash = this.flashAge / PLAYER_GRAPPLE_FLASH_SECONDS;
    this.flash.visible = flash < 1;
    this.flash.scale.setScalar(PLAYER_GRAPPLE_FLASH_RADIUS_METERS * (0.3 + 0.7 * Math.sqrt(Math.min(1, flash))));
    this.flash.material.opacity = 0.9 * (1 - Math.min(1, flash));
    if (Number.isFinite(this.fizzleAge)) {
      const fade = 1 - this.fizzleAge / PLAYER_GRAPPLE_FIZZLE_SECONDS;
      if (fade <= 0) this.hide();
      this.core.material.opacity = 0.95 * Math.max(0, fade);
    } else {
      this.core.material.opacity = 0.95;
    }
    this.glow.material.opacity = 0.32 + 0.16 * Math.sin(this.time * 47) * Math.sin(this.time * 13);
    const drawn = this.core.visible || this.flash.visible;
    if (!drawn) this.detach();
    return drawn;
  }

  /**
   * Returns whether the beam itself is drawn.
   *
   * @returns True while drawn.
   */
  isShown(): boolean {
    return this.core.visible;
  }

  /** Removes the beam and frees its resources. */
  dispose(): void {
    this.detach();
    this.core.geometry.dispose();
    this.flash.geometry.dispose();
    [this.core, this.glow, this.flash].forEach((mesh) => mesh.material.dispose());
  }

  /**
   * Stretches the tubes from one point to another.
   *
   * @param from Start.
   * @param to End.
   * @param width Radius factor.
   */
  private span(from: THREE.Vector3, to: THREE.Vector3, width: number): void {
    const direction = scratchDirection.subVectors(to, from);
    const length = direction.length();
    if (length < 1e-4) return this.hide();
    direction.divideScalar(length);
    for (const [mesh, radius] of [
      [this.core, PLAYER_GRAPPLE_BEAM_RADIUS_METERS],
      [this.glow, PLAYER_GRAPPLE_GLOW_RADIUS_METERS],
    ] as const) {
      mesh.position.copy(from);
      mesh.quaternion.setFromUnitVectors(UP, direction);
      mesh.scale.set(radius * width, length, radius * width);
      mesh.visible = true;
    }
    this.attach();
  }

  /** Puts the beam on the helper layer. */
  private attach(): void {
    if (this.shown) return;
    this.shown = true;
    this.layer.helperAdd(this.root);
  }

  /** Takes the beam off the helper layer. */
  private detach(): void {
    if (!this.shown) return;
    this.shown = false;
    this.layer.helperRemove(this.root);
  }
}
