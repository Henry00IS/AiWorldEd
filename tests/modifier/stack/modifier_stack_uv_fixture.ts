import * as THREE from 'three';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import type { SolidModel } from '@/solid/model/solid_model.js';
import { SOLID_TRIANGLE_SOURCES_USERDATA_KEY } from '@/solid/model/solid_model_keys.js';
import { stackFixture } from './modifier_stack_fixture.js';

/** Per-triangle source row on a solid result mesh. */
export type StackUvTriangleSource = { brushId: string; surfaceIndex: number; derivedId?: string };

/**
 * Builds a mirror volume around one box brush placed off the mirror plane, with
 * rotated, stretched and offset face UVs, compiled once.
 *
 * @returns Stack fixture with a compiled mirrored copy.
 */
export function stackUvFixtureMirror() {
  const fixture = stackFixture(['mirror'], 8);
  fixture.source.mesh!.position.set(2, 0.3, 0.1);
  stackUvStyleBrushFaces(fixture.source);
  fixture.world.updateMatrixWorld(true);
  fixture.model.syncBrushesFromScene();
  fixture.refresh();
  fixture.model.markDirty();
  fixture.model.rebuild(true);
  return fixture;
}

/**
 * Rotates, stretches and offsets every face UV of a brush so mirrored or moved
 * copies of the mapping can not match it by accident.
 *
 * @param brush Brush whose face UVs change.
 */
export function stackUvStyleBrushFaces(brush: SolidBrushInstance): void {
  const tweak = new THREE.Matrix4().makeRotationZ(0.4).multiply(new THREE.Matrix4().makeScale(1.7, 0.6, 1));
  tweak.setPosition(0.3, 0.2, 0);
  brush.brush.faces.forEach((_, faceIndex) => {
    const surface = brush.getFaceSurface(faceIndex);
    surface.uv = surface.uv.multiplyMatrix4(tweak);
    brush.setFaceSurface(faceIndex, surface);
  });
}

/**
 * Serializes every face UV matrix of a brush for byte-exact comparisons.
 *
 * @param brush Brush to read.
 * @returns Stable text of all face UV matrices.
 */
export function stackUvFaceKey(brush: SolidBrushInstance): string {
  return JSON.stringify(brush.brush.faces.map((_, faceIndex) => brush.getFaceSurface(faceIndex).uv.serialize()));
}

/**
 * Returns the per-triangle sources of a solid result mesh.
 *
 * @param model Solid model.
 * @returns Source rows by triangle index.
 */
export function stackUvResultSources(model: SolidModel): StackUvTriangleSource[] {
  return (model.getResultMesh().userData[SOLID_TRIANGLE_SOURCES_USERDATA_KEY] as StackUvTriangleSource[]) ?? [];
}

/**
 * Returns result triangles of one brush face, either the authored ones or the
 * ones of its modifier copies.
 *
 * @param model Solid model.
 * @param brushId Authored brush id.
 * @param surfaceIndex Brush face index.
 * @param derived True for copy triangles, false for authored ones.
 * @returns Triangle indices.
 */
export function stackUvFaceTriangles(model: SolidModel, brushId: string, surfaceIndex: number, derived: boolean) {
  const rows = stackUvResultSources(model);
  return rows.flatMap((row, triangleIndex) =>
    row.brushId === brushId && row.surfaceIndex === surfaceIndex && (row.derivedId !== undefined) === derived
      ? [triangleIndex]
      : [],
  );
}

/**
 * Returns sorted position and UV text of the given result triangles so two
 * results can be compared regardless of triangle order.
 *
 * @param model Solid model.
 * @param triangleIndices Result triangles.
 * @returns Sorted corner texts.
 */
export function stackUvTriangleCorners(model: SolidModel, triangleIndices: readonly number[]): string[] {
  const geometry = model.getResultMesh().geometry;
  const positions = geometry.getAttribute('position');
  const uvs = geometry.getAttribute('uv');
  const index = geometry.getIndex();
  const corners = triangleIndices.flatMap((triangle) => [0, 1, 2].map((corner) => triangle * 3 + corner));
  return corners
    .map((slot) => (index ? index.getX(slot) : slot))
    .map((vertex) => [
      positions.getX(vertex),
      positions.getY(vertex),
      positions.getZ(vertex),
      uvs.getX(vertex),
      uvs.getY(vertex),
    ])
    .map((values) => values.map((value) => value.toFixed(4)).join(','))
    .sort();
}
