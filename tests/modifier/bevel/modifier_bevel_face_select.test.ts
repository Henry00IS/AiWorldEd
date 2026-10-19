import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { modifierBevelRefreshScene } from '@/modifier/compile/modifier_bevel_scene_refresh.js';
import { ModifierVolumeBevel } from '@/modifier/volume/modifier_volume_bevel.js';
import {
  MODIFIER_VOLUME_BEVEL_UV_OWNER_SINGLE,
  MODIFIER_VOLUME_BEVEL_UV_POSITIVE_Y,
} from '@/modifier/volume/modifier_volume_bevel_keys.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { SOLID_TRIANGLE_SOURCES_USERDATA_KEY } from '@/solid/model/solid_model_keys.js';
import { expandFaceSelectionIndices } from '@/selection/face/solid_result_face_indices.js';
import { findSameSolidBrushSurfaceIndicesFast } from '@/selection/face/solid_triangle_source_index.js';

describe('bevel face selection identity', () => {
  it('selects the authored face together with the bevel that extends it', () => {
    const world = new THREE.Group();
    const model = new SolidModel('BevelSelect');
    world.add(model.root);
    model.addBoxBrush(1, SolidOperation.Additive);
    const volume = ModifierVolumeBevel.create();
    volume.scale.set(4, 4, 4);
    ModifierVolumeBevel.writeSegments(volume, 4);
    world.add(volume);
    world.updateMatrixWorld(true);
    modifierBevelRefreshScene(world);
    const mesh = model.getResultMesh();
    const sources = mesh.userData[SOLID_TRIANGLE_SOURCES_USERDATA_KEY] as Array<{
      brushId: string;
      surfaceIndex: number;
    }>;
    const position = mesh.geometry.getAttribute('position');
    const normal = mesh.geometry.getAttribute('normal');
    const bevelTriangle = findBevelTriangle(position, normal, sources.length);
    expect(bevelTriangle).toBeGreaterThanOrEqual(0);
    const expanded = expandFaceSelectionIndices(mesh, bevelTriangle);
    const expandedNormals = uniqueNormalKeys(normal, expanded);
    expect(expanded.length).toBeGreaterThan(2);
    expect(expandedNormals.length).toBeGreaterThan(1);
    expect(expanded.some((index) => isAxialTriangle(normal, index))).toBe(true);
    const indices = surfaceIndices(sources, expanded);
    expect(indices.size).toBe(1);
    expect([...indices][0]).toBeLessThan(6);
  });

  it('rebuilds face groups when the uv flow changes the parent', () => {
    const { world, mesh, volume } = chamferedSelectionWorld();
    const beforeSources = readTriangleSources(mesh);
    const before = beforeSources.map((source) => source.surfaceIndex);
    findSameSolidBrushSurfaceIndicesFast(mesh, 0);
    ModifierVolumeBevel.writeUvFlow(volume, MODIFIER_VOLUME_BEVEL_UV_POSITIVE_Y);
    modifierBevelRefreshScene(world);
    const afterSources = readTriangleSources(mesh);
    const seed = changedSourceIndex(before, afterSources);
    expect(afterSources).not.toBe(beforeSources);
    expect(selectionMatchesParent(mesh, afterSources, seed)).toBe(true);
  });
});

/**
 * Collects parent surface indices for the selected triangles.
 *
 * @param sources Triangle source rows.
 * @param triangles Selected triangle indices.
 * @returns Unique parent indices.
 */
function surfaceIndices(
  sources: ReadonlyArray<{ surfaceIndex: number } | undefined>,
  triangles: readonly number[],
): Set<number> {
  const indices = new Set<number>();
  for (const index of triangles) {
    const source = sources[index];
    if (source) indices.add(source.surfaceIndex);
  }
  return indices;
}

/**
 * Builds a chamfered box and returns its result mesh.
 *
 * @returns Result mesh and the covering volume.
 */
function chamferedSelectionWorld(): { world: THREE.Group; mesh: THREE.Mesh; volume: THREE.Mesh } {
  const world = new THREE.Group();
  const model = new SolidModel('BevelSelectFlow');
  world.add(model.root);
  model.addBoxBrush(1, SolidOperation.Additive);
  const volume = ModifierVolumeBevel.create();
  volume.scale.set(4, 4, 4);
  ModifierVolumeBevel.writeSegments(volume, 5);
  const settings = ModifierVolumeBevel.readSettings(volume);
  ModifierVolumeBevel.writeSettings(volume, { ...settings, uvOwner: MODIFIER_VOLUME_BEVEL_UV_OWNER_SINGLE });
  world.add(volume);
  world.updateMatrixWorld(true);
  modifierBevelRefreshScene(world);
  return { world, mesh: model.getResultMesh(), volume };
}

/**
 * Reads solid triangle sources from a result mesh.
 *
 * @param mesh Result mesh.
 * @returns Source rows.
 */
function readTriangleSources(mesh: THREE.Mesh): Array<{ brushId: string; surfaceIndex: number }> {
  const sources = mesh.userData[SOLID_TRIANGLE_SOURCES_USERDATA_KEY] as
    Array<{ brushId: string; surfaceIndex: number }> | undefined;
  return sources ?? [];
}

/**
 * Returns the first triangle whose parent changed.
 *
 * @param before Parent index per triangle before the flow change.
 * @param after Sources after the flow change.
 * @returns Triangle index, or -1.
 */
function changedSourceIndex(before: readonly number[], after: ReadonlyArray<{ surfaceIndex: number }>): number {
  return after.findIndex((source, index) => source.surfaceIndex !== before[index]);
}

/**
 * Returns whether expanding one triangle stays on its current parent.
 *
 * @param mesh Result mesh.
 * @param sources Current triangle sources.
 * @param seed Triangle whose parent changed.
 * @returns True when the group matches that parent and no other.
 */
function selectionMatchesParent(
  mesh: THREE.Mesh,
  sources: ReadonlyArray<{ surfaceIndex: number }>,
  seed: number,
): boolean {
  const group = findSameSolidBrushSurfaceIndicesFast(mesh, seed);
  const parent = sources[seed]?.surfaceIndex;
  if (!group || parent === undefined) return false;
  const expected = sources.flatMap((source, index) => (source.surfaceIndex === parent ? [index] : []));
  return group.every((index) => sources[index]?.surfaceIndex === parent) && sameIndices(group, expected);
}

/**
 * Returns whether two index lists contain the same values.
 *
 * @param left First list.
 * @param right Second list.
 * @returns True when the sorted lists match.
 */
function sameIndices(left: readonly number[], right: readonly number[]): boolean {
  if (left.length !== right.length) return false;
  const sortedLeft = [...left].sort((a, b) => a - b);
  const sortedRight = [...right].sort((a, b) => a - b);
  return sortedLeft.every((value, index) => value === sortedRight[index]);
}

/**
 * Finds a triangle whose normal is not a world axis (a round bevel sample).
 *
 * @param position Position attribute.
 * @param normal Normal attribute.
 * @param triangleCount Triangle count.
 * @returns Triangle index, or -1.
 */
function findBevelTriangle(
  position: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  normal: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  triangleCount: number,
): number {
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const nx = normal.getX(triangle * 3);
    const ny = normal.getY(triangle * 3);
    const nz = normal.getZ(triangle * 3);
    const axial = Math.max(Math.abs(nx), Math.abs(ny), Math.abs(nz));
    if (axial < 0.95) return triangle;
    void position;
  }
  return -1;
}

/**
 * Collects distinct normal directions for triangles.
 *
 * @param normal Normal attribute.
 * @param triangles Triangle indices.
 * @returns Quantized normal keys.
 */
function isAxialTriangle(normal: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, triangle: number): boolean {
  const axial = Math.max(
    Math.abs(normal.getX(triangle * 3)),
    Math.abs(normal.getY(triangle * 3)),
    Math.abs(normal.getZ(triangle * 3)),
  );
  return axial > 0.95;
}

function uniqueNormalKeys(
  normal: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  triangles: number[],
): string[] {
  const keys = new Set<string>();
  for (const triangle of triangles) {
    const nx = normal.getX(triangle * 3).toFixed(2);
    const ny = normal.getY(triangle * 3).toFixed(2);
    const nz = normal.getZ(triangle * 3).toFixed(2);
    keys.add(`${nx},${ny},${nz}`);
  }
  return [...keys];
}
