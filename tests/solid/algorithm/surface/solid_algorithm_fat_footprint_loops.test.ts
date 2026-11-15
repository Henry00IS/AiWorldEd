import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SolidBrushFactory } from '@/solid/brush/solid_brush_factory.js';
import { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import type { PreparedBrush } from '@/solid/algorithm/compile/solid_compile_types.js';
import { SOLID_FAT_PLANE_EPSILON } from '@/solid/algorithm/math/solid_math_constants.js';
import { SolidAlgorithmFatFootprintLoops } from '@/solid/algorithm/surface/solid_algorithm_fat_footprint_loops.js';
import type { SolidAlgorithmSurfaceLoop } from '@/solid/algorithm/surface/solid_algorithm_surface_loop.js';

/**
 * Builds a prepared 1 m box, optionally moved and turned about Z.
 *
 * @param id Brush id.
 * @param position Box centre.
 * @param rotationZ Turn about Z in radians.
 * @returns Prepared brush.
 */
function preparedBox(id: string, position: THREE.Vector3, rotationZ = 0): PreparedBrush {
  const instance = new SolidBrushInstance(
    id,
    id,
    SolidBrushFactory.createCenteredBox(1, 1, 1),
    SolidOperation.Additive,
  );
  instance.position.copy(position);
  instance.rotation.set(0, 0, rotationZ);
  const brush = instance.getModelSpaceBrush();
  return {
    instance,
    brush,
    bounds: brush.computeLocalBounds(),
    overlappingPeerIndices: [],
    operation: SolidOperation.Additive,
  };
}

/**
 * Returns the index of the face of a prepared box whose normal points along a
 * direction.
 *
 * @param prepared Prepared box.
 * @param direction Wanted normal.
 * @returns Face index.
 */
function faceFacing(prepared: PreparedBrush, direction: THREE.Vector3): number {
  return prepared.brush.planes.findIndex((plane) => plane.normal.dot(direction) > 0.99);
}

/**
 * Collects the fat footprint loops a subject gets against a peer.
 *
 * @param subject Subject box.
 * @param peer Peer box.
 * @returns Loops on the subject.
 */
function footprintLoops(subject: PreparedBrush, peer: PreparedBrush): SolidAlgorithmSurfaceLoop[] {
  const loops: SolidAlgorithmSurfaceLoop[] = [];
  SolidAlgorithmFatFootprintLoops.appendForPair(subject, 0, peer, 1, SOLID_FAT_PLANE_EPSILON, loops);
  return loops;
}

describe('SolidAlgorithmFatFootprintLoops', () => {
  const up = new THREE.Vector3(0, 1, 0);

  it('adds nothing for a peer whose face lies exactly on the subject face', () => {
    const lower = preparedBox('lower', new THREE.Vector3(0, 0, 0));
    expect(footprintLoops(lower, preparedBox('upper', new THREE.Vector3(0.5, 1, 0.3)))).toEqual([]);
  });

  it('adds nothing for a peer clearly above the subject or crossing it steeply', () => {
    const lower = preparedBox('lower', new THREE.Vector3(0, 0, 0));
    expect(footprintLoops(lower, preparedBox('above', new THREE.Vector3(0.5, 1.01, 0.3), 0.001))).toEqual([]);
    expect(footprintLoops(lower, preparedBox('steep', new THREE.Vector3(0.5, 0.9, 0.3), 0.5))).toEqual([]);
  });

  it('cuts the face of a subject where a peer resting tilted on it ends', () => {
    const lower = preparedBox('lower', new THREE.Vector3(0, 0, 0));
    const tilted = preparedBox('tilted', new THREE.Vector3(0.5, 1, 0.3), 0.002);
    const top = faceFacing(lower, up);
    const loops = footprintLoops(lower, tilted);
    expect(loops.map((loop) => loop.basePlaneIndex)).toContain(top);
    const footprint = loops.find((loop) => loop.basePlaneIndex === top);
    const bounds = new THREE.Box3().setFromPoints(footprint?.loopVertices ?? []);
    expect(bounds.min.x).toBeGreaterThan(0 - 2 * SOLID_FAT_PLANE_EPSILON);
    expect(bounds.max.z).toBeLessThan(0.5 + 1e-9);
    expect(bounds.min.z).toBeGreaterThan(-0.2 - 2 * SOLID_FAT_PLANE_EPSILON);
    expect(bounds.max.x).toBeLessThan(0.5 + 1e-9);
  });

  it('grows the footprint by the fat band past the peer sides', () => {
    const lower = preparedBox('lower', new THREE.Vector3(0, 0, 0));
    const tilted = preparedBox('tilted', new THREE.Vector3(0.5, 1, 0.3), 0.0005);
    const top = lower.brush.faces[faceFacing(lower, up)]!;
    const footprint = SolidAlgorithmFatFootprintLoops.fatFootprintPolygon(
      lower.brush.getFaceVertices(top),
      tilted,
      SOLID_FAT_PLANE_EPSILON,
    );
    const bounds = new THREE.Box3().setFromPoints(footprint);
    expect(bounds.min.z).toBeCloseTo(-0.2 - SOLID_FAT_PLANE_EPSILON, 6);
  });
});
