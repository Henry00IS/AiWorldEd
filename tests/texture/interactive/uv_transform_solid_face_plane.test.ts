import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CommandStack } from '@/commands/command_stack.js';
import { modifierBevelRefreshScene } from '@/modifier/compile/modifier_bevel_scene_refresh.js';
import { ModifierVolumeBevel } from '@/modifier/volume/modifier_volume_bevel.js';
import { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { SOLID_TRIANGLE_SOURCES_USERDATA_KEY } from '@/solid/model/solid_model_keys.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { expandFaceSelectionIndices } from '@/selection/face/solid_result_face_indices.js';
import {
  resolveSolidAuthoredFaceWorldNormal,
  resolveUvTransformPlaneNormal,
} from '@/texture/interactive/uv_transform_solid_face_plane.js';
import { ControllerUvTransform } from '@/texture/interactive/controller_uv_transform.js';
import { SurfaceUvMatrix } from '@/texture/uv_matrix/surface_uv_matrix.js';
import { GridSnap } from '@/transform/snap/grid_snap.js';

describe('UV transform plane on a bevelled face', () => {
  it('uses the authored face normal when the hit triangle is a bevel segment', () => {
    const { model } = buildBeveledBox(4);
    const mesh = model.getResultMesh();
    const hit = findBevelHitOnUpFace(model);
    const geometric = triangleWorldNormal(mesh, hit);
    const resolved = resolveUvTransformPlaneNormal(mesh, hit, geometric);
    const expected = new THREE.Vector3(0, 1, 0).transformDirection(topBrushMesh(model).matrixWorld);
    expect(resolved.dot(expected)).toBeGreaterThan(0.99);
    expect(resolved.dot(geometric)).toBeLessThan(0.98);
  });

  it('follows a rotated brush so the plane is not left in brush-local axes', () => {
    const { world, model } = buildBeveledBox(2);
    const brushMesh = topBrushMesh(model);
    brushMesh.rotation.z = THREE.MathUtils.degToRad(28);
    brushMesh.updateMatrixWorld(true);
    modifierBevelRefreshScene(world);
    const mesh = model.getResultMesh();
    const hit = findBevelHitOnUpFace(model);
    const resolved = resolveSolidAuthoredFaceWorldNormal(mesh, hit);
    const expected = new THREE.Vector3(0, 1, 0).transformDirection(brushMesh.matrixWorld);
    expect(resolved).not.toBeNull();
    expect(resolved!.dot(expected)).toBeGreaterThan(0.99);
    expect(Math.abs(resolved!.x)).toBeGreaterThan(0.2);
  });

  it('keeps multi-segment bevel UVs continuous after rotating about the authored plane', () => {
    const { model } = buildBeveledBox(4);
    const mesh = model.getResultMesh();
    const hit = findBevelHitOnUpFace(model);
    const geometric = triangleWorldNormal(mesh, hit);
    const planeNormal = resolveUvTransformPlaneNormal(mesh, hit, geometric);
    const brush = brushForTriangle(model, hit);
    const surfaceIndex = surfaceIndexForTriangle(mesh, hit);
    const sample = sampleOffPlaneOrigin(mesh, hit, planeNormal);
    const before = brush.getFaceSurface(surfaceIndex).uv.project(sample);
    rotateFaceUv(mesh, hit, planeNormal, sample);
    const stored = brush.getFaceSurface(surfaceIndex).uv;
    const after = stored.project(sample);
    expect(Math.hypot(after.u - before.u, after.v - before.v)).toBeGreaterThan(0.05);
    expect(Math.abs(inPlaneAxisDot(stored, planeNormal))).toBeLessThan(1e-3);
    expect(inPlaneAxisLength(stored, planeNormal, 'u')).toBeCloseTo(1, 2);
    expect(inPlaneAxisLength(stored, planeNormal, 'v')).toBeCloseTo(1, 2);
    expect(countCrossNormalUvSeams(mesh)).toBe(0);
  });

  it('keeps the geometric normal for a content mesh', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const geometric = new THREE.Vector3(0, 0, 1);
    const resolved = resolveUvTransformPlaneNormal(mesh, 0, geometric);
    expect(resolved.z).toBeCloseTo(1, 5);
    expect(resolveSolidAuthoredFaceWorldNormal(mesh, 0)).toBeNull();
  });
});

/**
 * Builds a unit box covered by a bevel volume.
 *
 * @param segments Bevel profile segment count.
 * @returns Scene model.
 */
function buildBeveledBox(segments: number): { world: THREE.Group; model: SolidModel } {
  const world = new THREE.Group();
  const model = new SolidModel(`UvPlane${segments}`);
  world.add(model.root);
  model.addBoxBrush(1, SolidOperation.Additive);
  const volume = ModifierVolumeBevel.create();
  volume.scale.set(4, 4, 4);
  ModifierVolumeBevel.writeSegments(volume, segments);
  world.add(volume);
  world.updateMatrixWorld(true);
  modifierBevelRefreshScene(world);
  return { world, model };
}

/**
 * Returns the preview mesh of the first brush.
 *
 * @param model Solid model.
 * @returns Brush mesh.
 */
function topBrushMesh(model: SolidModel): THREE.Mesh {
  const mesh = model.getBrushes()[0]?.mesh;
  if (!mesh) throw new Error('missing brush mesh');
  return mesh;
}

/**
 * Finds a bevel triangle that belongs to the brush's local up face.
 *
 * @param model Solid model.
 * @returns Triangle index.
 */
function findBevelHitOnUpFace(model: SolidModel): number {
  const mesh = model.getResultMesh();
  const surface = upSurfaceIndex(model);
  const flat = firstTriangleOnSurface(mesh, surface);
  const authored = resolveSolidAuthoredFaceWorldNormal(mesh, flat);
  if (!authored) throw new Error('missing authored normal');
  const region = expandFaceSelectionIndices(mesh, flat);
  const bevel = region.find((triangle) => triangleWorldNormal(mesh, triangle).dot(authored) < 0.95);
  if (bevel === undefined) throw new Error('missing bevel triangle');
  return bevel;
}

/**
 * Returns the local plane index whose normal points up.
 *
 * @param model Solid model.
 * @returns Surface index.
 */
function upSurfaceIndex(model: SolidModel): number {
  const planes = model.getBrushes()[0]?.brush.planes ?? [];
  const index = planes.findIndex((plane) => plane.normal.y > 0.9);
  if (index < 0) throw new Error('missing up face');
  return index;
}

/**
 * Returns the first result triangle on an authored surface.
 *
 * @param mesh Result mesh.
 * @param surface Authored surface index.
 * @returns Triangle index.
 */
function firstTriangleOnSurface(mesh: THREE.Mesh, surface: number): number {
  const sources = mesh.userData[SOLID_TRIANGLE_SOURCES_USERDATA_KEY] as Array<{ surfaceIndex: number }>;
  const index = sources.findIndex((source) => source.surfaceIndex === surface);
  if (index < 0) throw new Error('missing surface triangles');
  return index;
}

/**
 * Reads a triangle normal from the result mesh.
 *
 * @param mesh Result mesh.
 * @param triangle Triangle index.
 * @returns Unit normal.
 */
function triangleWorldNormal(mesh: THREE.Mesh, triangle: number): THREE.Vector3 {
  const normal = mesh.geometry.getAttribute('normal');
  const vertex = triangle * 3;
  return new THREE.Vector3(normal.getX(vertex), normal.getY(vertex), normal.getZ(vertex)).normalize();
}

/**
 * Returns the brush that owns a result triangle.
 *
 * @param model Solid model.
 * @param triangle Triangle index.
 * @returns Brush instance.
 */
function brushForTriangle(model: SolidModel, triangle: number): SolidBrushInstance {
  const source = triangleSource(model.getResultMesh(), triangle);
  const brush = model.findBrush(source.brushId);
  if (!brush) throw new Error('missing brush');
  return brush;
}

/**
 * Returns the authored surface index of a result triangle.
 *
 * @param mesh Result mesh.
 * @param triangle Triangle index.
 * @returns Surface index.
 */
function surfaceIndexForTriangle(mesh: THREE.Mesh, triangle: number): number {
  return triangleSource(mesh, triangle).surfaceIndex;
}

/**
 * Reads the solid source row for a triangle.
 *
 * @param mesh Result mesh.
 * @param triangle Triangle index.
 * @returns Source row.
 */
function triangleSource(mesh: THREE.Mesh, triangle: number): { brushId: string; surfaceIndex: number } {
  const sources = mesh.userData[SOLID_TRIANGLE_SOURCES_USERDATA_KEY] as Array<{
    brushId: string;
    surfaceIndex: number;
  }>;
  const source = sources[triangle];
  if (!source) throw new Error('missing triangle source');
  return source;
}

/**
 * Builds a world sample on the face plane, away from a face vertex.
 *
 * @param mesh Result mesh.
 * @param triangle Triangle whose first vertex is the pivot.
 * @param planeNormal Face plane normal.
 * @returns Sample point.
 */
function sampleOffPlaneOrigin(mesh: THREE.Mesh, triangle: number, planeNormal: THREE.Vector3): THREE.Vector3 {
  const position = mesh.geometry.getAttribute('position');
  const pivot = new THREE.Vector3().fromBufferAttribute(position, triangle * 3);
  const tangent = new THREE.Vector3(1, 0, 0);
  if (Math.abs(tangent.dot(planeNormal)) > 0.9) tangent.set(0, 0, 1);
  tangent.addScaledVector(planeNormal, -tangent.dot(planeNormal)).normalize();
  return pivot.addScaledVector(tangent, 0.35);
}

/**
 * Rotates face UVs about the authored plane through the live controller.
 *
 * @param mesh Result mesh.
 * @param triangle Selected triangle.
 * @param planeNormal Authored plane normal.
 * @param sample Point used as the orbit start.
 */
function rotateFaceUv(mesh: THREE.Mesh, triangle: number, planeNormal: THREE.Vector3, sample: THREE.Vector3): void {
  const controller = new ControllerUvTransform(new CommandStack(4), new GridSnap(false, 1));
  const pivot = sample.clone().addScaledVector(planeTangent(planeNormal), -0.35);
  controller.begin({
    mode: 'rotate',
    selections: [{ mesh, faceIndex: triangle }],
    worldStart: pivot,
    planeNormal,
    snapEnabled: false,
  });
  controller.applyWorldSample(sample);
  controller.applyWorldSample(orbitPoint(pivot, sample, planeNormal, 37));
  controller.end();
}

/**
 * Returns a unit tangent of a plane.
 *
 * @param planeNormal Unit plane normal.
 * @returns Unit tangent.
 */
function planeTangent(planeNormal: THREE.Vector3): THREE.Vector3 {
  const tangent = new THREE.Vector3(1, 0, 0);
  if (Math.abs(tangent.dot(planeNormal)) > 0.9) tangent.set(0, 0, 1);
  return tangent.addScaledVector(planeNormal, -tangent.dot(planeNormal)).normalize();
}

/**
 * Orbits a sample around a pivot on a plane.
 *
 * @param pivot Orbit center.
 * @param sample Start sample.
 * @param planeNormal Orbit axis.
 * @param degrees Signed degrees.
 * @returns Orbited point.
 */
function orbitPoint(
  pivot: THREE.Vector3,
  sample: THREE.Vector3,
  planeNormal: THREE.Vector3,
  degrees: number,
): THREE.Vector3 {
  return sample.clone().sub(pivot).applyAxisAngle(planeNormal, THREE.MathUtils.degToRad(degrees)).add(pivot);
}

/**
 * Measures the in-plane dot of the UV axis directions.
 *
 * @param uv UV matrix.
 * @param planeNormal Face plane normal.
 * @returns Dot of the unit in-plane axes.
 */
function inPlaneAxisDot(uv: SurfaceUvMatrix, planeNormal: THREE.Vector3): number {
  const u = inPlaneRow(uv, planeNormal, 'u');
  const v = inPlaneRow(uv, planeNormal, 'v');
  if (u.lengthSq() < 1e-12 || v.lengthSq() < 1e-12) return 1;
  return u.normalize().dot(v.normalize());
}

/**
 * Measures one in-plane UV axis length.
 *
 * @param uv UV matrix.
 * @param planeNormal Face plane normal.
 * @param axis U or V row.
 * @returns Length of the row after removing the plane component.
 */
function inPlaneAxisLength(uv: SurfaceUvMatrix, planeNormal: THREE.Vector3, axis: 'u' | 'v'): number {
  return inPlaneRow(uv, planeNormal, axis).length();
}

/**
 * Removes the plane component from one UV row.
 *
 * @param uv UV matrix.
 * @param planeNormal Face plane normal.
 * @param axis U or V row.
 * @returns In-plane row vector.
 */
function inPlaneRow(uv: SurfaceUvMatrix, planeNormal: THREE.Vector3, axis: 'u' | 'v'): THREE.Vector3 {
  const row = axis === 'u' ? uv.u : uv.v;
  const vector = new THREE.Vector3(row.x, row.y, row.z);
  return vector.addScaledVector(planeNormal, -vector.dot(planeNormal));
}

/**
 * Counts shared vertices whose UVs disagree across different normals.
 *
 * @param mesh Result mesh.
 * @returns Mismatched vertex pairs.
 */
function countCrossNormalUvSeams(mesh: THREE.Mesh): number {
  const grouped = groupCornersByPosition(mesh);
  let gaps = 0;
  grouped.forEach((corners) => {
    gaps += mismatchedCornerPairs(corners);
  });
  return gaps;
}

/**
 * Groups triangle corners that share a position.
 *
 * @param mesh Result mesh.
 * @returns Corners keyed by quantized position.
 */
function groupCornersByPosition(mesh: THREE.Mesh): Map<string, CornerSample[]> {
  const position = mesh.geometry.getAttribute('position');
  const uv = mesh.geometry.getAttribute('uv');
  const normal = mesh.geometry.getAttribute('normal');
  const sources = mesh.userData[SOLID_TRIANGLE_SOURCES_USERDATA_KEY] as Array<{ surfaceIndex: number }>;
  const grouped = new Map<string, CornerSample[]>();
  for (let triangle = 0; triangle < sources.length; triangle += 1) {
    appendTriangleCorners(position, uv, normal, sources[triangle]!.surfaceIndex, triangle, grouped);
  }
  return grouped;
}

/** One corner used when comparing UVs across a bevel seam. */
interface CornerSample {
  u: number;
  v: number;
  normal: THREE.Vector3;
  surface: number;
}

/**
 * Appends the three corners of one triangle into the position groups.
 *
 * @param position Position attribute.
 * @param uv UV attribute.
 * @param normal Normal attribute.
 * @param surface Authored surface index.
 * @param triangle Triangle index.
 * @param grouped Output groups.
 */
function appendTriangleCorners(
  position: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  uv: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  normal: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  surface: number,
  triangle: number,
  grouped: Map<string, CornerSample[]>,
): void {
  for (let corner = 0; corner < 3; corner += 1) {
    const vertex = triangle * 3 + corner;
    const key = positionKey(position, vertex);
    const list = grouped.get(key) ?? [];
    list.push(readCorner(uv, normal, vertex, surface));
    grouped.set(key, list);
  }
}

/**
 * Quantizes a vertex position into a map key.
 *
 * @param position Position attribute.
 * @param vertex Vertex index.
 * @returns Key.
 */
function positionKey(position: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, vertex: number): string {
  return `${position.getX(vertex).toFixed(3)},${position.getY(vertex).toFixed(3)},${position.getZ(vertex).toFixed(3)}`;
}

/**
 * Reads one corner sample.
 *
 * @param uv UV attribute.
 * @param normal Normal attribute.
 * @param vertex Vertex index.
 * @param surface Authored surface index.
 * @returns Corner sample.
 */
function readCorner(
  uv: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  normal: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  vertex: number,
  surface: number,
): CornerSample {
  return {
    u: uv.getX(vertex),
    v: uv.getY(vertex),
    normal: new THREE.Vector3(normal.getX(vertex), normal.getY(vertex), normal.getZ(vertex)),
    surface,
  };
}

/**
 * Counts UV mismatches between corners that share a surface but not a normal.
 *
 * @param corners Corners at one position.
 * @returns Mismatch count.
 */
function mismatchedCornerPairs(corners: CornerSample[]): number {
  let gaps = 0;
  for (let i = 0; i < corners.length; i += 1) {
    for (let j = i + 1; j < corners.length; j += 1) {
      if (cornersDisagree(corners[i]!, corners[j]!)) gaps += 1;
    }
  }
  return gaps;
}

/**
 * Returns whether two corners should share a UV and do not.
 *
 * @param left First corner.
 * @param right Second corner.
 * @returns True when the UV seam is open.
 */
function cornersDisagree(left: CornerSample, right: CornerSample): boolean {
  if (left.surface !== right.surface) return false;
  if (left.normal.distanceTo(right.normal) < 0.05) return false;
  return Math.hypot(left.u - right.u, left.v - right.v) > 0.02;
}
