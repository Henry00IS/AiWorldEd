import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SolidBrushFactory } from '@/solid/brush/solid_brush_factory.js';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { SolidCsgCompiler } from '@/solid/algorithm/compile/solid_csg_compiler.js';
import type { SolidCompiledPolygon } from '@/solid/algorithm/compile/solid_compiled_polygon.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';

/**
 * Builds a unit box whose (+x, -z) vertical edge is pulled inwards, so the
 * brush keeps the full box bounds but no longer fills the box.
 *
 * @returns Brush with a cut corner.
 */
function cutCornerBrushCreate(): SolidBrush {
  const brush = SolidBrushFactory.createCenteredBox(1, 1, 1);
  for (const vertex of brush.vertices) {
    if (vertex.x > 0.4 && vertex.z < -0.4) {
      vertex.set(0.3, vertex.y, -0.35);
    }
  }
  brush.recalculatePlanes();
  return brush;
}

/**
 * Wraps a brush in an instance at the origin.
 *
 * @param id Brush id.
 * @param brush Local brush geometry.
 * @param operation CSG operation.
 * @returns Instance with its transform pushed to the mesh.
 */
function instanceCreate(id: string, brush: SolidBrush, operation: SolidOperation): SolidBrushInstance {
  const instance = new SolidBrushInstance(id, id, brush, operation);
  instance.pushTransformToMesh();
  return instance;
}

/**
 * Computes the area of one convex polygon.
 *
 * @param vertices Polygon vertices in order.
 * @returns Polygon area.
 */
function polygonArea(vertices: readonly THREE.Vector3[]): number {
  const sum = new THREE.Vector3();
  const first = vertices[0];
  if (!first) {
    return 0;
  }
  for (let index = 1; index + 1 < vertices.length; index++) {
    const edgeA = new THREE.Vector3().subVectors(vertices[index] ?? first, first);
    const edgeB = new THREE.Vector3().subVectors(vertices[index + 1] ?? first, first);
    sum.add(edgeA.cross(edgeB));
  }
  return sum.length() * 0.5;
}

/**
 * Sums the area of result polygons facing a direction.
 *
 * @param polygons Compiled polygons.
 * @param facing Facing direction.
 * @returns Total area.
 */
function areaFacing(polygons: readonly SolidCompiledPolygon[], facing: THREE.Vector3): number {
  let area = 0;
  for (const polygon of polygons) {
    if (polygon.normal.dot(facing) >= 0.9999) {
      area += polygonArea(polygon.vertices);
    }
  }
  return area;
}

describe('CSG peer with the same bounds but a different shape', () => {
  it('keeps the box top and bottom where a later cut-corner brush does not cover them', () => {
    const box = instanceCreate('box', SolidBrushFactory.createCenteredBox(1, 1, 1), SolidOperation.Additive);
    const cut = instanceCreate('cut', cutCornerBrushCreate(), SolidOperation.Additive);
    const polygons = new SolidCsgCompiler().compile([box, cut], { forceFull: true });
    expect(areaFacing(polygons, new THREE.Vector3(0, 1, 0))).toBeCloseTo(1, 6);
    expect(areaFacing(polygons, new THREE.Vector3(0, -1, 0))).toBeCloseTo(1, 6);
  });

  it('leaves the cut-off corner closed when the cut-corner brush is subtracted', () => {
    const box = instanceCreate('box', SolidBrushFactory.createCenteredBox(1, 1, 1), SolidOperation.Additive);
    const cut = instanceCreate('cut', cutCornerBrushCreate(), SolidOperation.Subtractive);
    const polygons = new SolidCsgCompiler().compile([box, cut], { forceFull: true });
    const cornerArea =
      1 -
      polygonArea([
        new THREE.Vector3(-0.5, 0, -0.5),
        new THREE.Vector3(0.3, 0, -0.35),
        new THREE.Vector3(0.5, 0, 0.5),
        new THREE.Vector3(-0.5, 0, 0.5),
      ]);
    expect(areaFacing(polygons, new THREE.Vector3(0, 1, 0))).toBeCloseTo(cornerArea, 6);
    expect(areaFacing(polygons, new THREE.Vector3(0, -1, 0))).toBeCloseTo(cornerArea, 6);
  });

  it('still emits one copy of the shared faces for two identical boxes', () => {
    const first = instanceCreate('first', SolidBrushFactory.createCenteredBox(1, 1, 1), SolidOperation.Additive);
    const second = instanceCreate('second', SolidBrushFactory.createCenteredBox(1, 1, 1), SolidOperation.Additive);
    const polygons = new SolidCsgCompiler().compile([first, second], { forceFull: true });
    expect(areaFacing(polygons, new THREE.Vector3(0, 1, 0))).toBeCloseTo(1, 6);
  });
});
