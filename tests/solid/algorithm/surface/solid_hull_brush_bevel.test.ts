import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { solidHullBrushFromPoints } from '@/solid/algorithm/surface/solid_hull_brush.js';
import { modifierBevelDeriveBrush } from '@/modifier/bevel/modifier_bevel_derived.js';
import { ModifierVolumeBevel } from '@/modifier/volume/modifier_volume_bevel.js';

describe('solid hull brush bevel', () => {
  it('bevels a random convex hull across segment counts', () => {
    for (const seed of [11, 29]) {
      const points = randomCloud(seed);
      const brush = solidHullBrushFromPoints(points);
      expect(brush, `hull ${seed}`).not.toBeNull();
      if (!brush) return;
      expect(
        points.every((point) => pointInsideBrush(brush, point)),
        `inside ${seed}`,
      ).toBe(true);
      expect(shellIsClosed(brush), `closed hull ${seed}`).toBe(true);
      for (const segments of [1, 3, 8]) {
        const derived = deriveHull(brush, segments);
        expect(derived, `derived ${seed} ${segments}`).not.toBeNull();
        if (!derived) return;
        expect(shellIsClosed(derived), `closed ${segments}`).toBe(true);
        expect(solidIsConvex(derived), `convex ${segments}`).toBe(true);
      }
    }
  }, 60000);
});

/**
 * Builds a seeded point cloud that spans three dimensions.
 *
 * @param seed Random seed.
 * @returns Points.
 */
function randomCloud(seed: number): THREE.Vector3[] {
  const random = randomUnit(seed);
  const count = 8 + Math.floor(random() * 9);
  const points: THREE.Vector3[] = [];
  for (let index = 0; index < count; index += 1) {
    points.push(new THREE.Vector3(random() * 2 - 1, random() * 2 - 1, random() * 2 - 1));
  }
  points.push(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, -1, 0.2), new THREE.Vector3(0, 1, -0.4));
  points.push(new THREE.Vector3(0.2, 0.1, 1));
  return points;
}

/**
 * Returns a seeded unit random function.
 *
 * @param seed Random seed.
 * @returns Function that returns values in [0, 1).
 */
function randomUnit(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/**
 * Returns whether a point is inside or on a convex brush.
 *
 * @param brush Convex brush.
 * @param point Point.
 * @returns True when the point is not outside any face.
 */
function pointInsideBrush(brush: SolidBrush, point: THREE.Vector3): boolean {
  return brush.planes.every((plane) => plane.signedDistance(point) <= 1e-3);
}

/**
 * Derives a bevel of a hull brush.
 *
 * @param brush Authored hull.
 * @param segments Profile count.
 * @returns Derived brush, or null when the volume misses the hull.
 */
function deriveHull(brush: SolidBrush, segments: number): SolidBrush | null {
  const instance = new SolidBrushInstance('hull', 'Hull', brush);
  instance.mesh = new THREE.Mesh(new THREE.BufferGeometry());
  instance.mesh.updateMatrixWorld(true);
  const derived = modifierBevelDeriveBrush(instance, [coveredVolume(segments)]);
  return derived ? derived.localBrush : null;
}

/**
 * Builds a volume large enough to contain the unit cloud.
 *
 * @param segments Profile count.
 * @returns Bevel volume.
 */
function coveredVolume(segments: number): THREE.Mesh {
  const volume = ModifierVolumeBevel.create();
  volume.scale.set(6, 6, 6);
  ModifierVolumeBevel.writeSegments(volume, segments);
  volume.updateMatrixWorld(true);
  return volume;
}

/**
 * Returns whether every wing edge has its opposite twin.
 *
 * @param brush Brush.
 * @returns True when the shell is closed.
 */
function shellIsClosed(brush: SolidBrush): boolean {
  return brush.wingEdges.every((edge, index) => {
    const twin = edge.twinIndex;
    return twin !== index && brush.wingEdges[twin]?.twinIndex === index;
  });
}

/**
 * Returns whether every face keeps the other vertices on its inside.
 *
 * @param brush Brush.
 * @returns True when the solid is convex.
 */
function solidIsConvex(brush: SolidBrush): boolean {
  return brush.faces.every((_, index) => faceKeepsInside(brush, index));
}

/**
 * Returns whether one face keeps every vertex inside.
 *
 * @param brush Brush.
 * @param index Face index.
 * @returns True when no vertex is outside.
 */
function faceKeepsInside(brush: SolidBrush, index: number): boolean {
  const plane = brush.planes[index];
  if (!plane) return false;
  return brush.vertices.every((vertex) => plane.signedDistance(vertex) <= 1e-3);
}
