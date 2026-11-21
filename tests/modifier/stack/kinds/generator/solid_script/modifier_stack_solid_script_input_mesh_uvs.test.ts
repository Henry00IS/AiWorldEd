import * as fs from 'node:fs';
import * as path from 'node:path';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SceneDeserializer } from '@/io/scene/scene_deserializer.js';
import type { SceneJSON } from '@/io/scene/io_types.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { modifierStackCompile } from '@/modifier/stack/evaluate/modifier_stack_compile.js';
import { modifierStackMeshesShown } from '@/modifier/stack/meshes/modifier_stack_meshes.js';
import { solidChunkUvProject } from '@/solid/mesh/solid_brush_mesh_chunk.js';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { createDefaultFaceSurface, orientDefaultFaceSurface } from '@/texture/uv_matrix/face_surface_description.js';

/** One triangle corner in world space, with its baked UV. */
interface Corner {
  position: THREE.Vector3;
  normal: THREE.Vector3;
  uv: [number, number];
}

/** How one output corner disagrees with the source brushes. */
interface Mismatch {
  position: [number, number, number];
  output: [number, number];
  source: [number, number];
  def: [number, number];
  brush: string;
  face: number;
}

const FIXTURE = path.resolve('tests/fixtures/bug-ss-mesh-different-uvs-than-input-brushes.json');
const REPORT = path.resolve('/tmp/uv-transfer/compare.txt');

/**
 * Loads the transferred level: its solid and the SolidScript modifier volume.
 *
 * @returns World, solid, and volume.
 */
function loadLevel(): { world: THREE.Group; model: SolidModel; volume: THREE.Object3D } {
  const world = new THREE.Group();
  const data = JSON.parse(fs.readFileSync(FIXTURE, 'utf8')) as SceneJSON;
  new SceneDeserializer().deserialize(data, world);
  world.updateMatrixWorld(true);
  const model = world.children.map((child) => SolidModel.fromObject(child)).find((found) => found !== null);
  const volume = world.children.find((child) => ModifierVolume.isVolume(child));
  if (!model || !volume) throw new Error('Expected a solid and a modifier volume');
  return { world, model, volume };
}

/**
 * Turns a volume's modifier on or off and rebuilds the solid.
 *
 * @param volume Modifier volume.
 * @param model Solid.
 * @param enabled Whether the stack is on.
 */
function volumeEnabled(volume: THREE.Object3D, model: SolidModel, enabled: boolean): void {
  const settings = ModifierVolume.read(volume);
  ModifierVolume.write(volume, { ...settings, enabled });
  model.markDirty();
  model.rebuild(true);
}

/**
 * Reads world-space corners from a mesh's display buffers.
 *
 * @param mesh Mesh with position, uv, and optional normal.
 * @returns Corners.
 */
function meshCorners(mesh: THREE.Mesh): Corner[] {
  mesh.updateWorldMatrix(true, false);
  const position = mesh.geometry.getAttribute('position');
  const uv = mesh.geometry.getAttribute('uv');
  const normal = mesh.geometry.getAttribute('normal');
  if (!position || !uv) throw new Error(`${mesh.name} is missing position or uv`);
  const corners: Corner[] = [];
  for (let index = 0; index < position.count; index++) corners.push(meshCorner(mesh, position, uv, normal, index));
  return corners;
}

/**
 * Reads one corner, in world space.
 *
 * @param mesh Mesh.
 * @param position Position attribute.
 * @param uv UV attribute.
 * @param normal Normal attribute, when present.
 * @param index Vertex index.
 * @returns Corner.
 */
function meshCorner(
  mesh: THREE.Mesh,
  position: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  uv: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  normal: THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined,
  index: number,
): Corner {
  const point = new THREE.Vector3(position.getX(index), position.getY(index), position.getZ(index));
  point.applyMatrix4(mesh.matrixWorld);
  const direction = new THREE.Vector3(0, 1, 0);
  if (normal)
    direction.set(normal.getX(index), normal.getY(index), normal.getZ(index)).transformDirection(mesh.matrixWorld);
  return { position: point, normal: direction, uv: [uv.getX(index), uv.getY(index)] };
}

/**
 * Projects a world point with a brush face's authored mapping, as the editor
 * bakes brush meshes.
 *
 * @param brush Brush.
 * @param face Face index.
 * @param world Point in world space.
 * @param root Solid root, for model space.
 * @returns Texture coordinates.
 */
function sourceUv(
  brush: SolidBrushInstance,
  face: number,
  world: THREE.Vector3,
  root: THREE.Object3D,
): [number, number] {
  const model = world.clone().applyMatrix4(root.matrixWorld.clone().invert());
  const modelToBrush = brush.getModelSpaceMatrix().clone().invert();
  const coords = solidChunkUvProject(model, brush.getFaceSurface(face), modelToBrush, false);
  return [coords.u, coords.v];
}

/**
 * Projects a world point with the default face-oriented mapping in the brush's
 * centred model-space frame, the mapping Mesh From Brushes gets when no face
 * UVs were stored.
 *
 * @param brush Brush.
 * @param face Face index.
 * @param world Point in world space.
 * @param root Solid root.
 * @returns Texture coordinates.
 */
function defaultUv(
  brush: SolidBrushInstance,
  face: number,
  world: THREE.Vector3,
  root: THREE.Object3D,
): [number, number] {
  const model = world.clone().applyMatrix4(root.matrixWorld.clone().invert());
  const box = brush.getModelSpaceBounds();
  const center = box.getCenter(new THREE.Vector3());
  const local = model.sub(center);
  const plane = brush.getModelSpacePlanes()[face];
  const normal = plane?.normal.clone().normalize() ?? new THREE.Vector3(0, 1, 0);
  const surface = orientDefaultFaceSurface(createDefaultFaceSurface(), normal);
  const coords = surface.uv.project(local);
  return [coords.u, coords.v];
}

/**
 * Picks the source face whose plane holds a world point and looks the same way.
 *
 * @param brushes Input brushes.
 * @param corner Output corner.
 * @param root Solid root.
 * @returns Brush and face, or none.
 */
function sourceFace(
  brushes: readonly SolidBrushInstance[],
  corner: Corner,
  root: THREE.Object3D,
): { brush: SolidBrushInstance; face: number } | null {
  const model = corner.position.clone().applyMatrix4(root.matrixWorld.clone().invert());
  let best: { brush: SolidBrushInstance; face: number; score: number } | null = null;
  for (const brush of brushes) {
    const planes = brush.getModelSpacePlanes();
    if (planes.some((plane) => plane.normal.dot(model) + plane.offset > 0.02)) continue;
    for (let face = 0; face < planes.length; face++) {
      const plane = planes[face]!;
      const distance = Math.abs(plane.normal.dot(model) + plane.offset);
      const align = plane.normal.dot(corner.normal);
      if (distance > 0.02 || align < 0.85) continue;
      const score = distance - align;
      if (!best || score < best.score) best = { brush, face, score };
    }
  }
  return best;
}

/**
 * Rounds a number for the report.
 *
 * @param value Number.
 * @returns Rounded number.
 */
function rounded(value: number): number {
  return Math.round(value * 1e4) / 1e4 + 0;
}

/**
 * Writes the comparison report.
 *
 * @param source Source-mesh corners.
 * @param output Modifier-mesh corners.
 * @param mismatches Differing corners.
 */
function writeReport(source: Corner[], output: Corner[], mismatches: Mismatch[]): void {
  const lines: string[] = [];
  lines.push(`source corners: ${source.length}`);
  lines.push(`output corners: ${output.length}`);
  lines.push(`mismatches (uv delta > 0.01): ${mismatches.length}`);
  const groups = new Map<string, Mismatch[]>();
  for (const row of mismatches) {
    const key = `${row.brush} face ${row.face}`;
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }
  for (const [key, rows] of groups) {
    const first = rows[0]!;
    const dSrc = [first.output[0] - first.source[0], first.output[1] - first.source[1]].map(rounded);
    const sameSrc = rows.every(
      (row) =>
        Math.abs(row.output[0] - row.source[0] - (first.output[0] - first.source[0])) < 0.02 &&
        Math.abs(row.output[1] - row.source[1] - (first.output[1] - first.source[1])) < 0.02,
    );
    const vsDef = rows.filter((row) => Math.hypot(row.output[0] - row.def[0], row.output[1] - row.def[1]) < 0.02);
    lines.push(
      `${key}: ${rows.length} corners; constant offset vs source=${sameSrc} ${dSrc.join(', ')}; ` +
        `match default ${vsDef.length}/${rows.length}; example out=${first.output.map(rounded).join(',')} ` +
        `src=${first.source.map(rounded).join(',')} def=${first.def.map(rounded).join(',')} ` +
        `pos=${first.position.map(rounded).join(', ')}`,
    );
  }
  const leftover = mismatches.filter(
    (row) => Math.hypot(row.output[0] - row.def[0], row.output[1] - row.def[1]) >= 0.02,
  );
  lines.push(`not default remapping: ${leftover.length}`);
  for (const row of leftover.slice(0, 30)) {
    lines.push(
      `  pos ${row.position.map(rounded).join(', ')} ${row.brush} face ${row.face} ` +
        `out=${row.output.map(rounded).join(',')} src=${row.source.map(rounded).join(',')} ` +
        `def=${row.def.map(rounded).join(',')}`,
    );
  }
  fs.writeFileSync(REPORT, `${lines.join('\n')}\n`);
  fs.writeFileSync('/tmp/uv-transfer/mismatches.json', JSON.stringify(mismatches, null, 2));
}

describe('Mesh From Brushes of Input Brushes keeps the source UVs', () => {
  it('keeps the transferred level’s brush UVs on the output mesh', () => {
    const { model, volume } = loadLevel();
    expect(model.getBrushes()).toHaveLength(3);
    volumeEnabled(volume, model, false);
    const source = meshCorners(model.getResultMesh());
    volumeEnabled(volume, model, true);
    modifierStackCompile(model.getBrushes(), model.root);
    const shown = modifierStackMeshesShown(volume)[0];
    expect(shown, 'the modifier should show a mesh').toBeTruthy();
    const output = meshCorners(shown!);
    const brushes = model.getBrushes();
    const mismatches: Mismatch[] = [];
    for (const corner of output) {
      const hit = sourceFace(brushes, corner, model.root);
      if (!hit) continue;
      const expected = sourceUv(hit.brush, hit.face, corner.position, model.root);
      const def = defaultUv(hit.brush, hit.face, corner.position, model.root);
      if (Math.hypot(corner.uv[0] - expected[0], corner.uv[1] - expected[1]) <= 0.01) continue;
      mismatches.push({
        position: [corner.position.x, corner.position.y, corner.position.z],
        output: corner.uv,
        source: expected,
        def,
        brush: hit.brush.name,
        face: hit.face,
      });
    }
    writeReport(source, output, mismatches);
    expect(mismatches.length, `see ${REPORT}`).toBe(0);
  });
});
