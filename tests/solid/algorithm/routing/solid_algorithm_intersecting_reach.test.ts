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
function makeBox(id: string, min: THREE.Vector3, max: THREE.Vector3, operation: SolidOperation): SolidBrushInstance {
  const size = new THREE.Vector3().subVectors(max, min);
  const brush = SolidBrushFactory.createCenteredBox(size.x, size.y, size.z);
  const instance = new SolidBrushInstance(id, id, brush, operation);
  instance.position.copy(min).add(max).multiplyScalar(0.5);
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
 * Surface area of an axis-aligned box.
 *
 * @param box Box.
 * @returns Area.
 */
function boxArea(box: THREE.Box3): number {
  const s = box.getSize(new THREE.Vector3());
  return 2 * (s.x * s.y + s.y * s.z + s.z * s.x);
}

/**
 * Scene: an additive cube, a tall intersecting post that starts inside the cube
 * and rises far above it, and an intersecting box that only touches the post
 * above the cube.
 *
 * @param far Gap between the cube top and the upper intersecting box.
 * @returns Brushes, the expected cube ∩ post box and the upper box.
 */
function makeScene(far: number) {
  const cube = new THREE.Box3(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1));
  const post = new THREE.Box3(new THREE.Vector3(-0.5, -0.5, -0.5), new THREE.Vector3(0.5, cube.max.y + far + 2, 0.5));
  const upperMin = new THREE.Vector3(-1, cube.max.y + far, -1);
  const upper = new THREE.Box3(upperMin, upperMin.clone().add(new THREE.Vector3(2, 1, 2)));
  const brushes = [
    makeBox('cube', cube.min, cube.max, SolidOperation.Additive),
    makeBox('post', post.min, post.max, SolidOperation.Intersecting),
    makeBox('upper', upper.min, upper.max, SolidOperation.Intersecting),
  ];
  return { brushes, expected: cube.clone().intersect(post), upper };
}

describe('SolidAlgorithmIntersectingReach (touch-only intersecting)', () => {
  it('keeps the closed cube ∩ post when the upper box only touches the post outside the cube', () => {
    const { brushes, expected } = makeScene(1);
    const polygons = new SolidCsgCompiler().compile(brushes, { forceFull: true });
    expect(
      polygons.some((p) => p.brushId === 'post'),
      'post walls inside the cube survive',
    ).toBe(true);
    expect(polygons.some((p) => p.brushId === 'upper')).toBe(false);
    expect(totalArea(polygons)).toBeCloseTo(boxArea(expected), 6);
  });

  it('still intersects when the upper box reaches into the surviving part', () => {
    const { brushes, expected, upper } = makeScene(-0.5);
    const polygons = new SolidCsgCompiler().compile(brushes, { forceFull: true });
    expect(totalArea(polygons)).toBeCloseTo(boxArea(expected.clone().intersect(upper)), 6);
  });

  it('partial update after moving the upper box into reach matches a full rebuild', () => {
    const { brushes } = makeScene(1);
    const compiler = new SolidCsgCompiler();
    compiler.compile(brushes, { forceFull: true });
    brushes[2]!.position.y -= 1.5;
    const partial = compiler.compile(brushes, { dirtyBrushIds: ['upper'] });
    const full = new SolidCsgCompiler().compile(brushes, { forceFull: true });
    expect(partial.length).toBe(full.length);
    expect(totalArea(partial)).toBeCloseTo(totalArea(full), 6);
  });

  it('does not let disjoint sibling intersecting boxes cancel each other out', () => {
    const floor = new THREE.Box3(new THREE.Vector3(-4, -1, -1), new THREE.Vector3(4, 0, 1));
    const width = floor.getSize(new THREE.Vector3()).x / 4;
    const left = new THREE.Box3(floor.min.clone(), new THREE.Vector3(floor.min.x + width, 1, floor.max.z));
    const right = new THREE.Box3(
      new THREE.Vector3(floor.max.x - width, floor.min.y, floor.min.z),
      new THREE.Vector3(floor.max.x, 1, floor.max.z),
    );
    const polygons = new SolidCsgCompiler().compile(
      [
        makeBox('floor', floor.min, floor.max, SolidOperation.Additive),
        makeBox('left', left.min, left.max, SolidOperation.Intersecting),
        makeBox('right', right.min, right.max, SolidOperation.Intersecting),
      ],
      { forceFull: true },
    );
    expect(
      polygons.some((p) => p.brushId === 'floor'),
      'floor ∩ left ∩ right is empty',
    ).toBe(false);
  });
});
