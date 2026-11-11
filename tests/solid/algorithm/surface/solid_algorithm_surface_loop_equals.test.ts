import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  type SolidAlgorithmSurfaceLoop,
  solidAlgorithmSurfaceLoopEquals,
} from '@/solid/algorithm/surface/solid_algorithm_surface_loop.js';

/**
 * Builds a square loop at a given x offset.
 *
 * @param offsetX X offset of the square.
 * @returns Surface loop on face 2 against peer 1.
 */
function squareLoop(offsetX: number): SolidAlgorithmSurfaceLoop {
  return {
    subjectBrushIndex: 0,
    peerBrushIndex: 1,
    basePlaneIndex: 2,
    interiorCategory: 1,
    loopVertices: [
      new THREE.Vector3(offsetX, 0, 0),
      new THREE.Vector3(offsetX + 1, 0, 0),
      new THREE.Vector3(offsetX + 1, 1, 0),
      new THREE.Vector3(offsetX, 1, 0),
    ],
  };
}

/**
 * Value equality of surface loops used to replay faces whose loops did not
 * change.
 */
describe('solidAlgorithmSurfaceLoopEquals', () => {
  it('treats separately built loops with identical vertices as equal', () => {
    expect(solidAlgorithmSurfaceLoopEquals(squareLoop(0), squareLoop(0))).toBe(true);
  });

  it('distinguishes moved vertices', () => {
    expect(solidAlgorithmSurfaceLoopEquals(squareLoop(0), squareLoop(1e-9))).toBe(false);
  });

  it('distinguishes a different peer, face, or category', () => {
    const base = squareLoop(0);
    expect(solidAlgorithmSurfaceLoopEquals(base, { ...squareLoop(0), peerBrushIndex: 3 })).toBe(false);
    expect(solidAlgorithmSurfaceLoopEquals(base, { ...squareLoop(0), basePlaneIndex: 0 })).toBe(false);
    expect(solidAlgorithmSurfaceLoopEquals(base, { ...squareLoop(0), interiorCategory: 2 })).toBe(false);
  });

  it('distinguishes the same vertices in another order', () => {
    const rotated = squareLoop(0);
    rotated.loopVertices.push(rotated.loopVertices.shift() as THREE.Vector3);
    expect(solidAlgorithmSurfaceLoopEquals(squareLoop(0), rotated)).toBe(false);
  });
});
