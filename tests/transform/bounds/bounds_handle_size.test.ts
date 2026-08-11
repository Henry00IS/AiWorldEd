import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { GizmoTransform } from '@/transform/gizmo/gizmo_transform.js';
import { TransformMode } from '@/types/transform_mode.js';
import { Theme } from '@/theme.js';
import {
  BOUNDS_CUBE_MAX_EDGE_FRACTION,
  BOUNDS_CUBE_MAX_WORLD_SIZE,
  BOUNDS_CUBE_MIN_PIXELS,
  BOUNDS_CUBE_NEAR_PIXELS,
  BOUNDS_CUBE_REFERENCE_VIEWPORT_HEIGHT,
  BOUNDS_CUBE_VISUAL_MIN_PIXELS,
  BOUNDS_EAR_ALONG_PIXELS,
  BOUNDS_SILHOUETTE_EXTERIOR_PIXELS,
  computeBoundsCubeMaxWorldSizeForFace,
  computeBoundsCubePickPixels,
  computeBoundsCubeVisualPixels,
  computeBoundsCubeVisualWorldSizeForFace,
  computeBoundsCubeWorldSizeForFace,
  computeBoundsEarScreenLayout,
  computeBoundsFaceMinFullEdge,
  computeBoundsFaceReferenceEdge,
  computeSilhouetteExteriorBandWorld,
  worldUnitsPerPixel,
} from '@/transform/bounds/bounds_handle_screen_size.js';
import type { DataOrientedBounds } from '@/transform/bounds/builder_oriented_bounds.js';
import { BOUNDS_CUBE_VISUAL_KEY } from '@/transform/bounds/gizmo_bounds.js';
import { BoundsFace } from '@/types/bounds_face.js';

describe('bounds handle size vs camera distance', () => {
  it('keeps pick size manageable and visual at most pick when far', () => {
    const nearCamera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    nearCamera.position.set(0, 2, 4);
    const midCamera = new THREE.PerspectiveCamera(60, 1, 0.1, 10000);
    midCamera.position.set(0, 20, 40);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
    mesh.position.set(0, 1, 0);
    mesh.updateMatrixWorld(true);

    const gizmoNear = new GizmoTransform(Theme);
    gizmoNear.setMode(TransformMode.BOUNDS);
    gizmoNear.updateBoundsFromMeshes([mesh], nearCamera);
    const nearPick = readFirstHandleScale(gizmoNear);
    const nearVisual = readFirstVisualScale(gizmoNear);

    const gizmoMid = new GizmoTransform(Theme);
    gizmoMid.setMode(TransformMode.BOUNDS);
    gizmoMid.updateBoundsFromMeshes([mesh], midCamera);
    const midPick = readFirstHandleScale(gizmoMid);
    const midVisual = readFirstVisualScale(gizmoMid);

    expect(nearPick).toBeGreaterThan(0);
    expect(nearVisual).toBeLessThanOrEqual(nearPick + 1e-6);
    expect(midPick).toBeGreaterThan(nearPick);
    expect(midVisual).toBeLessThanOrEqual(midPick + 1e-6);
    expect(midPick).toBeLessThanOrEqual(BOUNDS_CUBE_MAX_WORLD_SIZE + 1e-6);
    expect(midPick).toBeLessThanOrEqual(2 * BOUNDS_CUBE_MAX_EDGE_FRACTION + 1e-6);

    const midVisualPixels = screenPixelsForSize(midVisual, midCamera, new THREE.Vector3(0, 1, 0));
    expect(midVisualPixels).toBeGreaterThan(0);
    expect(midVisual).toBeLessThanOrEqual(midPick + 1e-6);

    gizmoNear.dispose();
    gizmoMid.dispose();
  });

  it('falls pick and visual pixels toward floors with distance', () => {
    expect(computeBoundsCubePickPixels(4)).toBeCloseTo(BOUNDS_CUBE_NEAR_PIXELS, 5);
    expect(computeBoundsCubePickPixels(200)).toBe(BOUNDS_CUBE_MIN_PIXELS);
    expect(computeBoundsCubeVisualPixels(200)).toBe(BOUNDS_CUBE_VISUAL_MIN_PIXELS);
    expect(computeBoundsCubeVisualPixels(4)).toBeGreaterThan(computeBoundsCubeVisualPixels(40));
  });

  it('caps far 3D pick to a fraction of each face reference edge', () => {
    const bounds = unitBounds();
    const maxFromFace = computeBoundsCubeMaxWorldSizeForFace(bounds, BoundsFace.POS_Y);
    expect(maxFromFace).toBeCloseTo(2 * BOUNDS_CUBE_MAX_EDGE_FRACTION, 10);
    const nearCamera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    nearCamera.position.set(0, 2, 4);
    const farCamera = new THREE.PerspectiveCamera(60, 1, 0.1, 10000);
    farCamera.position.set(0, 200, 400);
    const nearPick = computeBoundsCubeWorldSizeForFace(bounds, nearCamera, BoundsFace.POS_Y);
    const farPick = computeBoundsCubeWorldSizeForFace(bounds, farCamera, BoundsFace.POS_Y);
    expect(farPick).toBeLessThanOrEqual(maxFromFace + 1e-6);
    expect(farPick).toBeGreaterThanOrEqual(nearPick - 1e-6);
    expect(computeBoundsCubeVisualWorldSizeForFace(bounds, farCamera, BoundsFace.POS_Y)).toBeLessThanOrEqual(
      farPick + 1e-6,
    );
  });

  it('tightens pick on large-but-far brushes so face body stays free', () => {
    const largeBounds: DataOrientedBounds = {
      center: new THREE.Vector3(0, 2, 0),
      quaternion: new THREE.Quaternion(),
      halfExtents: new THREE.Vector3(2, 2, 2),
    };
    const farCamera = new THREE.PerspectiveCamera(60, 1, 0.1, 100000);
    farCamera.position.set(0, 40, 120);
    const maxFromFace = computeBoundsCubeMaxWorldSizeForFace(largeBounds, BoundsFace.POS_Y);
    const pick = computeBoundsCubeWorldSizeForFace(largeBounds, farCamera, BoundsFace.POS_Y);
    const visual = computeBoundsCubeVisualWorldSizeForFace(largeBounds, farCamera, BoundsFace.POS_Y);
    expect(maxFromFace).toBeLessThan(BOUNDS_CUBE_MAX_WORLD_SIZE);
    expect(pick).toBeLessThanOrEqual(maxFromFace + 1e-6);
    expect(pick).toBeCloseTo(maxFromFace, 5);
    expect(visual).toBeLessThanOrEqual(pick + 1e-6);
    expect(pick / 4).toBeLessThanOrEqual(BOUNDS_CUBE_MAX_EDGE_FRACTION + 1e-6);
  });

  it('keeps large-face arrows readable on thin slabs (not thickness-capped)', () => {
    const slab: DataOrientedBounds = {
      center: new THREE.Vector3(0, 0.02, 0),
      quaternion: new THREE.Quaternion(),
      halfExtents: new THREE.Vector3(4, 0.02, 4),
    };
    expect(computeBoundsFaceMinFullEdge(slab, BoundsFace.POS_Y)).toBeCloseTo(8, 10);
    expect(computeBoundsFaceMinFullEdge(slab, BoundsFace.POS_X)).toBeCloseTo(0.04, 10);
    const topMax = computeBoundsCubeMaxWorldSizeForFace(slab, BoundsFace.POS_Y);
    const sideMax = computeBoundsCubeMaxWorldSizeForFace(slab, BoundsFace.POS_X);
    expect(topMax).toBeGreaterThan(1);
    expect(topMax).toBeGreaterThan(sideMax);
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    camera.position.set(0, 6, 10);
    const topPick = computeBoundsCubeWorldSizeForFace(slab, camera, BoundsFace.POS_Y);
    const sidePick = computeBoundsCubeWorldSizeForFace(slab, camera, BoundsFace.POS_X);
    expect(topPick).toBeGreaterThan(0.1);
    expect(sidePick).toBeGreaterThan(0.05);
    expect(topPick).toBeLessThanOrEqual(topMax + 1e-6);
    expect(sidePick).toBeLessThanOrEqual(sideMax + 1e-6);
  });

  it('keeps long thin side-face arrows grabable via geometric-mean reference edge', () => {
    const minWidth = 0.03125;
    const slab: DataOrientedBounds = {
      center: new THREE.Vector3(0, minWidth * 0.5, 0),
      quaternion: new THREE.Quaternion(),
      halfExtents: new THREE.Vector3(4, minWidth * 0.5, 4),
    };
    expect(computeBoundsFaceMinFullEdge(slab, BoundsFace.POS_X)).toBeCloseTo(minWidth, 10);
    const reference = computeBoundsFaceReferenceEdge(slab, BoundsFace.POS_X);
    expect(reference).toBeGreaterThan(minWidth);
    expect(reference).toBeCloseTo(Math.sqrt(minWidth * 8), 8);
    const sideMax = computeBoundsCubeMaxWorldSizeForFace(slab, BoundsFace.POS_X);
    expect(sideMax).toBeGreaterThan(minWidth * BOUNDS_CUBE_MAX_EDGE_FRACTION);
    expect(sideMax).toBeCloseTo(reference * BOUNDS_CUBE_MAX_EDGE_FRACTION, 8);
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    camera.position.set(8, 3, 0);
    const sidePick = computeBoundsCubeWorldSizeForFace(slab, camera, BoundsFace.POS_X);
    expect(sidePick).toBeGreaterThan(0.05);
    expect(sidePick).toBeLessThanOrEqual(sideMax + 1e-6);
  });

  it('allows pick below the soft world floor when the face edge cap is tighter', () => {
    const thinBounds: DataOrientedBounds = {
      center: new THREE.Vector3(0, 0, 0),
      quaternion: new THREE.Quaternion(),
      halfExtents: new THREE.Vector3(0.04, 0.04, 0.04),
    };
    const maxFromFace = computeBoundsCubeMaxWorldSizeForFace(thinBounds, BoundsFace.POS_Y);
    expect(maxFromFace).toBeLessThan(0.04);
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    camera.position.set(0, 1, 3);
    const pick = computeBoundsCubeWorldSizeForFace(thinBounds, camera, BoundsFace.POS_Y);
    expect(pick).toBeLessThanOrEqual(maxFromFace + 1e-6);
    expect(pick).toBeLessThan(0.04);
  });

  it('sizes orthographic ears and exterior bands in screen space', () => {
    const zoomedIn = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 1000);
    const zoomedOut = new THREE.OrthographicCamera(-50, 50, 50, -50, 0.1, 1000);
    const height = 512;
    const layoutIn = computeBoundsEarScreenLayout(zoomedIn, height);
    const layoutOut = computeBoundsEarScreenLayout(zoomedOut, height);
    // Same pixel target → larger world size when zoomed out (frustum taller).
    expect(layoutOut.alongEdge).toBeGreaterThan(layoutIn.alongEdge);
    expect(layoutOut.thickness).toBeGreaterThan(layoutIn.thickness);
    // Pixel conversion consistency.
    const uppIn = worldUnitsPerPixel(zoomedIn, height);
    expect(layoutIn.alongEdge).toBeCloseTo(uppIn * BOUNDS_EAR_ALONG_PIXELS, 5);
    const bandIn = computeSilhouetteExteriorBandWorld(zoomedIn, height);
    const bandOut = computeSilhouetteExteriorBandWorld(zoomedOut, height);
    expect(bandOut).toBeGreaterThan(bandIn);
    expect(bandIn).toBeCloseTo(uppIn * BOUNDS_SILHOUETTE_EXTERIOR_PIXELS, 5);
  });

  it('clamps 2D ear length to half the bounds side when zoomed out', () => {
    const zoomedOut = new THREE.OrthographicCamera(-100, 100, 100, -100, 0.1, 1000);
    const sideLength = 2;
    const layout = computeBoundsEarScreenLayout(zoomedOut, 512, sideLength);
    expect(layout.alongEdge).toBeLessThanOrEqual(sideLength * 0.5 + 1e-6);
    expect(layout.alongEdge).toBeCloseTo(sideLength * 0.5, 5);
  });

  it('hides 2D ears when along-edge length would be under 8px', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2, 0.2));
    mesh.updateMatrixWorld(true);
    const gizmo = new GizmoTransform(Theme);
    gizmo.setMode(TransformMode.BOUNDS);
    gizmo.setVisible(true);
    gizmo.updateBoundsFromMeshes([mesh]);
    const clone = gizmo.getHandleGroupClone('xz');
    // Huge frustum → pixel size of clamped ear on a thin brush collapses.
    const zoomedOut = new THREE.OrthographicCamera(-200, 200, 200, -200, 0.1, 1000);
    gizmo.prepareBoundsCloneForCamera(clone, zoomedOut, 'xz', 512);
    let anyVisibleEar = false;
    clone.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      if (child.userData['boundsHandleIsEar'] !== true) return;
      if (child.visible) anyVisibleEar = true;
    });
    expect(anyVisibleEar).toBe(false);
    gizmo.dispose();
  });

  it('applies screen-space ear sizing on orthographic clones', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
    mesh.updateMatrixWorld(true);
    const gizmo = new GizmoTransform(Theme);
    gizmo.setMode(TransformMode.BOUNDS);
    gizmo.setVisible(true);
    gizmo.updateBoundsFromMeshes([mesh]);
    const clone = gizmo.getHandleGroupClone('xz');
    const zoomedOut = new THREE.OrthographicCamera(-40, 40, 40, -40, 0.1, 1000);
    gizmo.prepareBoundsCloneForCamera(clone, zoomedOut, 'xz', 512);
    let earScaleX = 0;
    clone.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      if (child.userData['boundsHandleIsEar'] !== true) return;
      earScaleX = Math.max(earScaleX, child.scale.x);
    });
    // Half-extent 1 → side length 2 → max ear 50% = 1 when zoomed far out.
    const expected = computeBoundsEarScreenLayout(zoomedOut, 512, 2).alongEdge;
    expect(earScaleX).toBeCloseTo(expected, 4);
    gizmo.dispose();
  });
});

/**
 * Reads pick root scale from the first bounds handle.
 *
 * @param gizmo Transform gizmo after bounds update.
 * @returns Uniform pick scale, or 0.
 */
function readFirstHandleScale(gizmo: GizmoTransform): number {
  const handles = gizmo.getHandles();
  if (handles.length === 0) return 0;
  return handles[0]!.getVisualMesh().scale.x;
}

/**
 * Reads world visual cube scale from the first handle (pick * child ratio).
 *
 * @param gizmo Transform gizmo after bounds update.
 * @returns Visual edge length in world units, or 0.
 */
function readFirstVisualScale(gizmo: GizmoTransform): number {
  const handles = gizmo.getHandles();
  if (handles.length === 0) return 0;
  const pick = handles[0]!.getVisualMesh();
  let visualLocal = 1;
  pick.traverse((child) => {
    if (child.userData[BOUNDS_CUBE_VISUAL_KEY] === true) {
      visualLocal = child.scale.x;
    }
  });
  return pick.scale.x * visualLocal;
}

/**
 * Converts a world cube edge length into approximate CSS pixels.
 *
 * @param worldSize Cube edge in world units.
 * @param camera Perspective camera.
 * @param worldPoint Bounds center.
 * @returns Approximate on-screen edge length in pixels.
 */
function screenPixelsForSize(worldSize: number, camera: THREE.PerspectiveCamera, worldPoint: THREE.Vector3): number {
  const distance = camera.position.distanceTo(worldPoint);
  const worldHeight = 2 * distance * Math.tan(THREE.MathUtils.degToRad(camera.fov) * 0.5);
  return (worldSize / worldHeight) * BOUNDS_CUBE_REFERENCE_VIEWPORT_HEIGHT;
}

/**
 * Unit OBB at the origin.
 *
 * @returns Oriented bounds data.
 */
function unitBounds(): DataOrientedBounds {
  return {
    center: new THREE.Vector3(0, 0, 0),
    quaternion: new THREE.Quaternion(),
    halfExtents: new THREE.Vector3(1, 1, 1),
  };
}
