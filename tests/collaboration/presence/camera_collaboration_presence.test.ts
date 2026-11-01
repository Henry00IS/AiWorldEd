import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CameraCollaborationPresence } from '@/collaboration/presence/camera_collaboration_presence.js';
import type { PresenceEntry } from '@/collaboration/shared/presence_frame.js';

/**
 * Creates a renderer stand-in that reports one pane.
 *
 * @returns Fake renderer.
 */
function renderer(): THREE.WebGLRenderer {
  const fake = {
    getCurrentViewport: (target: THREE.Vector4) => target.set(0, 0, 960, 600),
    getPixelRatio: () => 1,
  };
  return fake as unknown as THREE.WebGLRenderer;
}

/**
 * Creates a perspective pane camera at a position.
 *
 * @param x Camera x.
 * @param y Camera y.
 * @param z Camera z.
 * @returns Camera with world matrices up to date.
 */
function view(x: number, y: number, z: number): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(60, 1.6, 0.1, 1000);
  camera.position.set(x, y, z);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  return camera;
}

/**
 * Runs the before-render hooks of every gizmo part for one pane and returns the
 * resulting opacities by material type.
 *
 * @param gizmo Remote camera gizmo.
 * @param camera Pane camera.
 * @returns Opacity per material type.
 */
function draw(gizmo: CameraCollaborationPresence, camera: THREE.Camera): Record<string, number> {
  const scene = new THREE.Scene();
  const opacity: Record<string, number> = {};
  gizmo.object.traverse((child) => {
    if (!(child instanceof THREE.Mesh || child instanceof THREE.LineSegments || child instanceof THREE.Sprite)) return;
    const material = child.material as THREE.Material;
    child.onBeforeRender(renderer(), scene, camera, child.geometry, material, new THREE.Group());
    opacity[material.type] = material.opacity;
  });
  return opacity;
}

/** Remote camera gizmo: per-pane fade and materials that cannot tint a view. */
describe('camera_collaboration_presence', () => {
  const entry: PresenceEntry = { id: 1, position: [2, 2, 2], quaternion: [0, 0, 0, 1], fov: 60 };

  it('is invisible in a pane whose camera sits at the remote camera and fully visible far away', () => {
    const gizmo = new CameraCollaborationPresence('Henry2', 0x22c55e);
    gizmo.target(entry, 0);
    gizmo.update(10_000);
    expect(draw(gizmo, view(2, 2, 2))).toEqual({ LineBasicMaterial: 0, MeshBasicMaterial: 0, SpriteMaterial: 0 });
    const far = draw(gizmo, view(8, 6, 8));
    expect(far['LineBasicMaterial']).toBe(1);
    expect(far['MeshBasicMaterial']).toBeCloseTo(0.22, 6);
    expect(far['SpriteMaterial']).toBe(1);
    expect(draw(gizmo, view(2, 2, 2))['MeshBasicMaterial']).toBe(0);
    gizmo.dispose();
  });

  it('never writes depth, so it cannot cover the near plane', () => {
    const gizmo = new CameraCollaborationPresence('Henry2', 0x22c55e);
    gizmo.object.traverse((child) => {
      const material = (child as THREE.Mesh).material as THREE.Material | undefined;
      if (material === undefined) return;
      expect(material.depthWrite).toBe(false);
      expect(material.transparent).toBe(true);
    });
    gizmo.dispose();
  });
});
