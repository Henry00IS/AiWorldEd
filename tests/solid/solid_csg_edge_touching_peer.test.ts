import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SolidBrushFactory } from '@/solid/brush/solid_brush_factory.js';
import { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { SolidCsgCompiler } from '@/solid/algorithm/compile/solid_csg_compiler.js';
import type { SolidCompiledPolygon } from '@/solid/algorithm/compile/solid_compiled_polygon.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';

/**
 * Builds an additive box brush instance.
 *
 * @param id Brush id.
 * @param size Box edge lengths.
 * @param position World position.
 * @param rotationZ Rotation about Z in radians.
 * @returns Additive instance with its transform pushed to the mesh.
 */
function boxInstanceCreate(
  id: string,
  size: THREE.Vector3,
  position: THREE.Vector3,
  rotationZ = 0,
): SolidBrushInstance {
  const brush = SolidBrushFactory.createCenteredBox(size.x, size.y, size.z);
  const instance = new SolidBrushInstance(id, id, brush, SolidOperation.Additive);
  instance.position.copy(position);
  instance.rotation.set(0, 0, rotationZ);
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

describe('CSG peer touching a face only along an edge', () => {
  it('keeps a sloped face when a peer edge runs exactly through its centroid', () => {
    const slopeNormal = new THREE.Vector3(1, 1, 0).normalize();
    const slopeCentroid = slopeNormal.clone().multiplyScalar(0.5);
    const stepSize = 0.2;
    const step = boxInstanceCreate(
      'step',
      new THREE.Vector3(stepSize, stepSize, 0.5),
      new THREE.Vector3(slopeCentroid.x - stepSize / 2, slopeCentroid.y - stepSize / 2, 0),
    );
    const ramp = boxInstanceCreate('ramp', new THREE.Vector3(1, 1, 1), new THREE.Vector3(0, 0, 0), Math.PI / 4);
    const polygons = new SolidCsgCompiler().compile([step, ramp], { forceFull: true });
    expect(areaFacing(polygons, slopeNormal)).toBeCloseTo(1, 6);
  });

  it('still removes a face that lies inside the peer', () => {
    const inner = boxInstanceCreate('inner', new THREE.Vector3(0.5, 0.5, 0.5), new THREE.Vector3(0, 0, 0));
    const outer = boxInstanceCreate('outer', new THREE.Vector3(1, 1, 1), new THREE.Vector3(0, 0, 0));
    const polygons = new SolidCsgCompiler().compile([outer, inner], { forceFull: true });
    expect(areaFacing(polygons, new THREE.Vector3(0, 1, 0))).toBeCloseTo(1, 6);
  });
});
