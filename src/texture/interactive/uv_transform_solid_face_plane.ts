import * as THREE from 'three';
import { composeBrushWorldFromLocal } from '@/solid/brush/solid_brush_uv_space.js';
import { SOLID_TRIANGLE_SOURCES_USERDATA_KEY } from '@/solid/model/solid_model_keys.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';

const scratchWorldFromLocal = new THREE.Matrix4();
const scratchNormalMatrix = new THREE.Matrix3();

/** Brush face identity stored on one solid result triangle. */
interface SolidFaceTriangleSource {
  brushId: string;
  surfaceIndex: number;
}

/**
 * Returns the world normal of the authored brush face that owns a triangle.
 *
 * @param mesh Mesh that may be a solid result.
 * @param triangleIndex Triangle index on the mesh.
 * @returns Unit world normal, or null when the triangle has no brush face.
 */
export function resolveSolidAuthoredFaceWorldNormal(mesh: THREE.Mesh, triangleIndex: number): THREE.Vector3 | null {
  const source = readSolidFaceTriangleSource(mesh, triangleIndex);
  if (!source) return null;
  const model = SolidModel.fromObject(mesh);
  const brush = model?.findBrush(source.brushId);
  const localNormal = brush?.brush.planes[source.surfaceIndex]?.normal;
  if (!model || !brush || !localNormal || localNormal.lengthSq() < 1e-12) return null;
  return transformBrushPlaneNormalToWorld(localNormal, brush, model.root);
}

/**
 * Picks the plane normal for a UV move, rotate, or scale gesture.
 *
 * @param mesh Hit mesh.
 * @param triangleIndex Hit triangle.
 * @param geometricNormal Triangle normal used when the hit has no brush face.
 * @returns Unit plane normal.
 */
export function resolveUvTransformPlaneNormal(
  mesh: THREE.Mesh,
  triangleIndex: number,
  geometricNormal: THREE.Vector3,
): THREE.Vector3 {
  const authored = resolveSolidAuthoredFaceWorldNormal(mesh, triangleIndex);
  if (!authored) return cloneUnitNormal(geometricNormal);
  alignNormalToHemisphere(authored, geometricNormal);
  return authored;
}

/**
 * Reads the brush face stored for one result triangle.
 *
 * @param mesh Candidate mesh.
 * @param triangleIndex Triangle index.
 * @returns Brush id and face index, or null.
 */
function readSolidFaceTriangleSource(mesh: THREE.Mesh, triangleIndex: number): SolidFaceTriangleSource | null {
  if (!SolidModel.isResultMesh(mesh)) return null;
  const sources = mesh.userData[SOLID_TRIANGLE_SOURCES_USERDATA_KEY] as SolidFaceTriangleSource[] | undefined;
  const source = sources?.[triangleIndex];
  if (!source?.brushId || typeof source.surfaceIndex !== 'number') return null;
  return source;
}

/**
 * Transforms a brush-local plane normal into world space.
 *
 * @param localNormal Brush-local plane normal.
 * @param brush Brush that owns the plane.
 * @param solidRoot Solid model root.
 * @returns Unit world normal.
 */
function transformBrushPlaneNormalToWorld(
  localNormal: THREE.Vector3,
  brush: SolidBrushInstance,
  solidRoot: THREE.Object3D,
): THREE.Vector3 {
  composeBrushWorldFromLocal(brush, solidRoot, scratchWorldFromLocal);
  scratchNormalMatrix.getNormalMatrix(scratchWorldFromLocal);
  return localNormal.clone().applyMatrix3(scratchNormalMatrix).normalize();
}

/**
 * Flips a normal onto the same side as a reference when the reference is
 * usable.
 *
 * @param normal Normal modified in place.
 * @param reference Preferred hemisphere.
 */
function alignNormalToHemisphere(normal: THREE.Vector3, reference: THREE.Vector3): void {
  if (reference.lengthSq() < 1e-12) return;
  if (normal.dot(reference) < 0) normal.negate();
}

/**
 * Returns a unit copy of a normal, or +Y when the input is degenerate.
 *
 * @param normal Source normal.
 * @returns Unit normal.
 */
function cloneUnitNormal(normal: THREE.Vector3): THREE.Vector3 {
  if (normal.lengthSq() < 1e-12) return new THREE.Vector3(0, 1, 0);
  return normal.clone().normalize();
}
