import * as THREE from 'three';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import type { SolidBrushMeshChunk } from '@/solid/mesh/solid_brush_mesh_chunk.js';
import { ModifierSmoothCorners, type ModifierSmoothFace } from './modifier_smooth_corners.js';

/** Smoothing class of faces that always stay flat, such as caps. */
export const MODIFIER_SMOOTH_FLAT = -1;

/** How a brush is smooth shaded. */
export interface ModifierSmoothTag {
  /** Brushes of one group blend normals where they meet. */
  group: string;
  /**
   * Faces meeting at less than this angle, in degrees, shade smoothly; 0 is
   * flat.
   */
  maxAngle: number;
  /** Smoothing class per face; absent means one class for every face. */
  classes?: readonly number[] | undefined;
}

/** What a brush's chunk needs to smooth its normals. */
interface ModifierSmoothRecord {
  /** Cosine of the max angle. */
  cosine: number;
  /** Smoothing class per face, or undefined. */
  classes: readonly number[] | undefined;
  /** Corners of the whole group. */
  corners: ModifierSmoothCorners;
}

/** Smoothing of the brushes a modifier made or reshaped. */
const modifierSmoothTags = new WeakMap<SolidBrushInstance, ModifierSmoothTag>();

/** Published smoothing per brush id. */
const modifierSmoothRecords = new Map<string, ModifierSmoothRecord>();

/** Brush ids each solid published last, to drop them on the next compile. */
const modifierSmoothIdsByScope = new Map<string, string[]>();

/**
 * Marks a brush as smooth shaded.
 *
 * @param brush Brush made by a modifier.
 * @param tag Smoothing.
 */
export function modifierSmoothTagSet(brush: SolidBrushInstance, tag: ModifierSmoothTag): void {
  modifierSmoothTags.set(brush, tag);
}

/**
 * Returns the smoothing of a brush.
 *
 * @param brush Brush.
 * @returns Smoothing, or undefined when flat.
 */
export function modifierSmoothTagOf(brush: SolidBrushInstance): ModifierSmoothTag | undefined {
  return modifierSmoothTags.get(brush);
}

/**
 * Carries smoothing over to a copy or reshaped stand-in with the same faces.
 *
 * @param source Original brush.
 * @param copy Copy.
 */
export function modifierSmoothTagCopy(source: SolidBrushInstance, copy: SolidBrushInstance): void {
  const tag = modifierSmoothTags.get(source);
  if (tag) modifierSmoothTags.set(copy, tag);
}

/**
 * Publishes the smoothing of a solid's final brushes for its mesh chunks.
 *
 * @param scopeId Solid identity.
 * @param instances Final brushes of the compile.
 */
export function modifierSmoothPublish(scopeId: string, instances: readonly SolidBrushInstance[]): void {
  for (const id of modifierSmoothIdsByScope.get(scopeId) ?? []) modifierSmoothRecords.delete(id);
  const groups = new Map<string, ModifierSmoothCorners>();
  const ids: string[] = [];
  for (const brush of instances) {
    const tag = modifierSmoothTags.get(brush);
    if (!tag || tag.maxAngle <= 0) continue;
    const corners = groups.get(tag.group) ?? new ModifierSmoothCorners();
    groups.set(tag.group, corners);
    modifierSmoothCornersAdd(corners, brush, tag);
    const cosine = Math.cos(THREE.MathUtils.degToRad(Math.min(tag.maxAngle, 180)));
    modifierSmoothRecords.set(brush.id, { cosine, classes: tag.classes, corners });
    ids.push(brush.id);
  }
  modifierSmoothIdsByScope.set(scopeId, ids);
}

/**
 * Adds every face corner of a brush, in model space.
 *
 * @param corners Group corners.
 * @param brush Brush.
 * @param tag Its smoothing.
 */
function modifierSmoothCornersAdd(corners: ModifierSmoothCorners, brush: SolidBrushInstance, tag: ModifierSmoothTag) {
  const matrix = brush.getModelSpaceMatrix();
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix);
  brush.brush.faces.forEach((face, index) => {
    const plane = brush.brush.planes[index];
    if (!plane) return;
    const normal = plane.normal.clone().applyMatrix3(normalMatrix).normalize();
    const smoothClass = tag.classes?.[index] ?? 0;
    for (const vertex of brush.brush.getFaceVertices(face))
      corners.add(vertex.clone().applyMatrix4(matrix), { normal, smoothClass });
  });
}

/**
 * Smooths the normals of a brush's mesh chunk where it is smooth shaded.
 *
 * @param brushId Brush id.
 * @param chunk Model-space chunk whose sources still use the brush's face
 *   indices.
 */
export function modifierSmoothApply(brushId: string, chunk: SolidBrushMeshChunk): void {
  const record = modifierSmoothRecords.get(brushId);
  if (!record) return;
  const point = new THREE.Vector3();
  for (let vertex = 0; vertex < chunk.vertexCount; vertex++) {
    const face = chunk.triangleSources[Math.floor(vertex / 3)]?.surfaceIndex ?? -1;
    const smoothClass = record.classes?.[face] ?? 0;
    if (smoothClass === MODIFIER_SMOOTH_FLAT) continue;
    const own = new THREE.Vector3().fromArray(chunk.normals, vertex * 3);
    point.fromArray(chunk.positions, vertex * 3);
    const normal = modifierSmoothCornerNormal(record.corners.facesAt(point), own, smoothClass, record.cosine);
    if (normal) normal.toArray(chunk.normals, vertex * 3);
  }
}

/**
 * Averages the distinct normals of the faces at a corner that are in the same
 * class and within the max angle of the vertex's own face. Pairs of opposite
 * faces are touching insides between pieces and are skipped.
 *
 * @param faces Faces at the corner.
 * @param own The vertex's own face normal.
 * @param smoothClass The vertex's face class.
 * @param cosine Cosine of the max angle.
 * @returns Smooth normal, or null to keep the flat one.
 */
function modifierSmoothCornerNormal(
  faces: readonly ModifierSmoothFace[],
  own: THREE.Vector3,
  smoothClass: number,
  cosine: number,
): THREE.Vector3 | null {
  const seen: THREE.Vector3[] = [];
  for (const face of faces) {
    if (face.smoothClass !== smoothClass || face.normal.dot(own) < cosine - 1e-9) continue;
    if (faces.some((other) => other.normal.dot(face.normal) < -0.9999)) continue;
    if (!seen.some((normal) => normal.dot(face.normal) > 0.999999)) seen.push(face.normal);
  }
  if (seen.length < 2) return null;
  return seen.reduce((sum, normal) => sum.add(normal), new THREE.Vector3()).normalize();
}
