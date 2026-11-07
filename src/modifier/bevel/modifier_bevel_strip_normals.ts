import { Vector3 } from 'three';
import type { SolidBrushMeshChunk } from '@/solid/mesh/solid_brush_mesh_chunk.js';
import type { ModifierBevelDerivedBrush } from './modifier_bevel_derived.js';
import { modifierBevelGirderForFace } from './modifier_bevel_profile_cylinder.js';
import { modifierBevelRecordUsesVolumeTexture } from './modifier_bevel_face_record.js';

/** Shared-position polygon normals, independent of UV seams and triangle fans. */
type ModifierBevelNormalGroups = Map<string, Map<number, Vector3>>;

/**
 * Smooths generated profile strips only, preserving authored walls and cap
 * creases.
 *
 * @param chunk Model-space mesh buffers.
 * @param derived Derived topology and shading option.
 */
export function modifierBevelStripNormalsApply(chunk: SolidBrushMeshChunk, derived: ModifierBevelDerivedBrush): void {
  if (derived.options?.normals !== 'smooth') return;
  const groups = modifierBevelNormalGroups(chunk);
  const girders = derived.faces.map((_, face) => modifierBevelGirderForFace(derived.localBrush, derived.girders, face));
  for (let vertex = 0; vertex < chunk.positions.length / 3; vertex++) {
    const face = chunk.triangleSources[Math.floor(vertex / 3)]?.surfaceIndex ?? -1;
    const girder = girders[face] ?? -1;
    if (girder < 0 || !modifierBevelRecordUsesVolumeTexture(derived.faces[face])) continue;
    if ((derived.girders[girder]?.profileSegments ?? 1) <= 1) continue;
    if ((derived.girders[girder]?.profileShape ?? 0.5) <= 0.25) continue;
    const normal = modifierBevelStripVertexNormal(
      groups.get(modifierBevelNormalKey(chunk, vertex)),
      face,
      girder,
      girders,
      derived,
    );
    if (normal) normal.toArray(chunk.normals, vertex * 3);
  }
}

/**
 * Collects each incident face once at each shared vertex.
 *
 * @param chunk Unmodified flat-shaded buffers.
 */
function modifierBevelNormalGroups(chunk: SolidBrushMeshChunk): ModifierBevelNormalGroups {
  const groups: ModifierBevelNormalGroups = new Map();
  for (let vertex = 0; vertex < chunk.positions.length / 3; vertex++) {
    const key = modifierBevelNormalKey(chunk, vertex);
    const faces = groups.get(key) ?? new Map<number, Vector3>();
    const face = chunk.triangleSources[Math.floor(vertex / 3)]?.surfaceIndex ?? -1;
    faces.set(face, new Vector3().fromArray(chunk.normals, vertex * 3));
    groups.set(key, faces);
  }
  return groups;
}

/**
 * Quantizes a model-space corner without welding unrelated mesh geometry.
 *
 * @param chunk One brush chunk.
 * @param vertex Buffer vertex.
 */
function modifierBevelNormalKey(chunk: SolidBrushMeshChunk, vertex: number): string {
  return [0, 1, 2].map((axis) => Math.round((chunk.positions[vertex * 3 + axis] ?? 0) * 1e6)).join(',');
}

/**
 * Averages one strip; its wall contacts take the authored wall normal exactly.
 *
 * @param faces Incident normals.
 * @param face Current generated face.
 * @param girder Current strip.
 * @param girders Strip assignments.
 * @param derived Generated records.
 */
function modifierBevelStripVertexNormal(
  faces: Map<number, Vector3> | undefined,
  face: number,
  girder: number,
  girders: readonly number[],
  derived: ModifierBevelDerivedBrush,
): Vector3 | null {
  if (!faces) return null;
  const current = faces.get(face);
  const normals = new Vector3();
  const walls = new Vector3();
  const seen = new Set<string>();
  for (const [index, normal] of faces) {
    const key = normal
      .toArray()
      .map((value) => value.toFixed(6))
      .join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    if (!modifierBevelRecordUsesVolumeTexture(derived.faces[index]) && current && current.dot(normal) > 1e-4)
      walls.add(normal);
    else if (girders[index] === girder) normals.add(normal);
  }
  return (walls.lengthSq() > 1e-8 ? walls : normals).normalize();
}
