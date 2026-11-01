import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  NAMETAG_COLLABORATION_PRESENCE_HEIGHT_PX,
  NametagCollaborationPresence,
  nametagCollaborationOverflow,
} from '@/collaboration/presence/nametag_collaboration_presence.js';
import { screenCollaborationWorldPerPixel } from '@/collaboration/presence/screen_collaboration_presence.js';

/** Pane size used by the fake renderer. */
const PANE = { width: 960, height: 600 };

/**
 * Creates a renderer stand-in that reports one pane.
 *
 * @returns Fake renderer.
 */
function renderer(): THREE.WebGLRenderer {
  const fake = {
    getCurrentViewport: (target: THREE.Vector4) => target.set(0, 0, PANE.width, PANE.height),
    getPixelRatio: () => 1,
  };
  return fake as unknown as THREE.WebGLRenderer;
}

/**
 * Creates a camera like a joiner's default view, close to a character at the
 * spawn.
 *
 * @param position Camera position.
 * @param target Look target.
 * @returns Camera with world matrices up to date.
 */
function camera(position: THREE.Vector3, target: THREE.Vector3): THREE.PerspectiveCamera {
  const view = new THREE.PerspectiveCamera(60, PANE.width / PANE.height, 0.1, 1000);
  view.position.copy(position);
  view.lookAt(target);
  view.updateMatrixWorld(true);
  return view;
}

/**
 * Places a character tag (feet at a point, anchor 1.9 m higher) for a camera.
 *
 * @param feet Feet position.
 * @param view Pane camera.
 * @returns The tag sprite after placement.
 */
function placed(feet: THREE.Vector3, view: THREE.Camera): THREE.Sprite {
  const tag = new NametagCollaborationPresence('Henry', 0x44aaff, { world: 0.12, pixels: 8, base: feet });
  tag.anchor.copy(feet).setY(feet.y + 1.9);
  tag.sprite.onBeforeRender(
    renderer(),
    new THREE.Scene(),
    view,
    new THREE.BufferGeometry(),
    tag.sprite.material,
    new THREE.Group(),
  );
  return tag.sprite;
}

/**
 * Returns the normalized device y of the top of a placed tag.
 *
 * @param sprite Placed tag.
 * @param view Pane camera.
 * @returns Top y in -1..1 when on screen.
 */
function topY(sprite: THREE.Sprite, view: THREE.Camera): number {
  const up = new THREE.Vector3().setFromMatrixColumn(view.matrixWorld, 1).normalize();
  return sprite.position.clone().addScaledVector(up, sprite.scale.y).project(view).y;
}

describe('presence name tags', () => {
  it('are never frustum culled, so a stale position cannot hide them', () => {
    expect(new NametagCollaborationPresence('Henry', 0xff0000, { world: 0, pixels: 0 }).sprite.frustumCulled).toBe(
      false,
    );
  });

  it('pulls a character tag down into view when the head is above the pane', () => {
    const feet = new THREE.Vector3(0.75, 0, 0.75);
    const view = camera(new THREE.Vector3(2, 2, 2), new THREE.Vector3(0, 0, 0));
    const anchor = feet.clone().setY(1.9);
    expect(anchor.clone().project(view).y).toBeGreaterThan(1);
    const sprite = placed(feet, view);
    expect(topY(sprite, view)).toBeLessThanOrEqual(1);
    expect(sprite.position.clone().project(view).y).toBeGreaterThan(feet.clone().project(view).y);
  });

  it('keeps the tag above the head when it fits', () => {
    const feet = new THREE.Vector3(0, 0, 0);
    const view = camera(new THREE.Vector3(0, 1.5, 8), new THREE.Vector3(0, 1, 0));
    const sprite = placed(feet, view);
    expect(sprite.position.y).toBeGreaterThan(1.9);
  });

  it('does not move a tag whose character is off screen', () => {
    const view = camera(new THREE.Vector3(0, 1.5, 8), new THREE.Vector3(0, 1, 0));
    const base = new THREE.Vector3(0, 0, 20);
    const position = new THREE.Vector3(0, 2, 20);
    const perPixel = screenCollaborationWorldPerPixel(renderer(), view, position);
    const pane = { camera: view, pixels: PANE.height, perPixel };
    const height = NAMETAG_COLLABORATION_PRESENCE_HEIGHT_PX * perPixel;
    expect(nametagCollaborationOverflow(position, base, height, pane)).toBe(0);
  });
});
