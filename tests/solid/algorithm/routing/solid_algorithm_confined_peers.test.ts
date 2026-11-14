import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SolidBrushFactory } from '@/solid/brush/solid_brush_factory.js';
import { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { SolidCsgCompiler } from '@/solid/algorithm/compile/solid_csg_compiler.js';
import type { SolidCompiledPolygon } from '@/solid/algorithm/compile/solid_compiled_polygon.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';

/**
 * Builds an axis-aligned box brush instance spanning min..max.
 *
 * @param id Brush id.
 * @param min Box minimum corner.
 * @param max Box maximum corner.
 * @param operation CSG operation.
 * @returns Configured instance.
 */
function makeBox(id: string, min: number[], max: number[], operation: SolidOperation): SolidBrushInstance {
  const lo = new THREE.Vector3().fromArray(min);
  const hi = new THREE.Vector3().fromArray(max);
  const size = new THREE.Vector3().subVectors(hi, lo);
  const brush = SolidBrushFactory.createCenteredBox(size.x, size.y, size.z);
  const instance = new SolidBrushInstance(id, id, brush, operation);
  instance.position.copy(lo).add(hi).multiplyScalar(0.5);
  return instance;
}

/**
 * Sums the area of compiled polygons.
 *
 * @param polygons Compiled polygons.
 * @returns Total area.
 */
function totalArea(polygons: readonly SolidCompiledPolygon[]): number {
  let area = 0;
  for (const polygon of polygons) {
    const v = polygon.vertices;
    for (let i = 1; i + 1 < v.length; i++) {
      area +=
        new THREE.Vector3()
          .subVectors(v[i]!, v[0]!)
          .cross(new THREE.Vector3().subVectors(v[i + 1]!, v[0]!))
          .length() / 2;
    }
  }
  return area;
}

/**
 * A unit cube, a tall post beside (or through) it, and an intersecting box that
 * clips the post well above the cube without touching the cube.
 *
 * @param postOperation Post operation.
 * @param postMinX Post minimum x (-0.75 touches the cube side, -0.5 overlaps
 *   it).
 * @returns Brushes in tree order.
 */
function makeScene(postOperation: SolidOperation, postMinX: number): SolidBrushInstance[] {
  return [
    makeBox('cube', [-0.25, -0.25, -0.5], [0.75, 0.75, 0.5], SolidOperation.Additive),
    makeBox('post', [postMinX, -0.5, -0.25], [postMinX + 0.5, 2.5, 0.25], postOperation),
    makeBox('clip', [-1, 1.25, -0.5], [0, 2.25, 0.5], SolidOperation.Intersecting),
  ];
}

/** Cube surface (6) plus the clipped post piece (0.5 x 1 x 0.5 box). */
const CUBE_AND_CLIPPED_POST = 6 + 2.5;

describe('SolidAlgorithmConfinedPeers (touch-only intersecting)', () => {
  it('keeps the cube side where a clipped post only touched it', () => {
    const polygons = new SolidCsgCompiler().compile(makeScene(SolidOperation.Additive, -0.75), { forceFull: true });
    expect(totalArea(polygons)).toBeCloseTo(CUBE_AND_CLIPPED_POST, 6);
  });

  it('keeps the cube closed where a clipped post passed through it', () => {
    const polygons = new SolidCsgCompiler().compile(makeScene(SolidOperation.Additive, -0.5), { forceFull: true });
    expect(totalArea(polygons)).toBeCloseTo(CUBE_AND_CLIPPED_POST, 6);
  });

  it('a clipped subtractive post does not carve the cube it no longer reaches', () => {
    const polygons = new SolidCsgCompiler().compile(makeScene(SolidOperation.Subtractive, -0.5), { forceFull: true });
    expect(totalArea(polygons)).toBeCloseTo(6, 6);
  });

  it('partial updates while moving the clip box away and back match full rebuilds', () => {
    const brushes = makeScene(SolidOperation.Additive, -0.75);
    const compiler = new SolidCsgCompiler();
    compiler.compile(brushes, { forceFull: true });
    for (const dy of [3, -3, 0.5, -0.5]) {
      brushes[2]!.position.y += dy;
      const partial = compiler.compile(brushes, { dirtyBrushIds: ['clip'] });
      const full = new SolidCsgCompiler().compile(brushes, { forceFull: true });
      expect(partial.length).toBe(full.length);
      expect(totalArea(partial)).toBeCloseTo(totalArea(full), 6);
    }
  });
});
