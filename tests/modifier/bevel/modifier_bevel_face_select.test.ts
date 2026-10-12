import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { modifierBevelRefreshScene } from '@/modifier/compile/modifier_bevel_scene_refresh.js';
import { ModifierVolumeBevel } from '@/modifier/volume/modifier_volume_bevel.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { SOLID_TRIANGLE_SOURCES_USERDATA_KEY } from '@/solid/model/solid_model_keys.js';
import { expandFaceSelectionIndices } from '@/selection/face/solid_result_face_indices.js';

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
    const indices = new Set(expanded.map((index) => sources[index]!.surfaceIndex));
    expect(indices.size).toBe(1);
    expect([...indices][0]).toBeLessThan(6);
  });
});

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
