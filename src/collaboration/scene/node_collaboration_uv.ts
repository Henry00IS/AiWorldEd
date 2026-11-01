import * as THREE from 'three';
import type { ObjectEntry } from '@/io/scene/io_types.js';
import type { NodeCollaborationEntryData } from '@/collaboration/scene/node_collaboration_types.js';
import { ensureUniqueTriangleVertices, rebakeStoredFaceTextureMaps } from '@/texture/uv/planar_uv_projector.js';
import { isContentMeshEligibleForTextureLockRebake } from '@/texture/lock/texture_lock_settings.js';
import { shouldRebakeContentAfterTransform } from '@/texture/lock/texture_lock_transform.js';
import type { TextureLockFlags } from '@/texture/lock/texture_lock_transform.js';

/** Largest gap between two poses still treated as unchanged. */
const NODE_UV_POSE_EPSILON = 1e-10;

/**
 * Most UV components relayed literally (4096 vertices, about 100 KB); denser
 * primitives are baked by receivers from the relayed face texture maps.
 */
export const NODE_UV_MAX_COMPONENTS = 8192;

/** Significant digits that round-trip every 32-bit float exactly. */
const NODE_UV_DIGITS = 9;

/**
 * Returns the literal vertex UVs of a primitive world mesh. Primitive entries
 * only carry constructor parameters, so without these the receiver would show
 * the primitive's default UVs instead of the ones texture lock baked. Buffer
 * meshes already carry their UVs in the geometry data.
 *
 * @param object Encoded object.
 * @param entry Its scene entry.
 * @returns UV components, or null when the entry already describes them or they
 *   exceed {@link NODE_UV_MAX_COMPONENTS}.
 */
export function nodeUvEncode(object: THREE.Object3D, entry: ObjectEntry): number[] | null {
  if (!nodeUvPrimitive(object, entry)) return null;
  const uv = (object as THREE.Mesh).geometry.getAttribute('uv');
  if (!(uv instanceof THREE.BufferAttribute) || uv.itemSize !== 2) return null;
  if (uv.array.length > NODE_UV_MAX_COMPONENTS) return null;
  return Array.from(uv.array as ArrayLike<number>, (value) => Number(value.toPrecision(NODE_UV_DIGITS)));
}

/**
 * Returns whether an object is a world mesh whose entry describes its geometry
 * by primitive parameters instead of literal buffers.
 *
 * @param object Scene object.
 * @param entry Its scene entry.
 * @returns True for primitive meshes.
 */
function nodeUvPrimitive(object: THREE.Object3D, entry: ObjectEntry): boolean {
  return object instanceof THREE.Mesh && entry.type === 'mesh' && entry.geometryData === undefined;
}

/**
 * Writes the sender's vertex UVs into a replicated primitive mesh. A primitive
 * that the sender split per triangle is split the same way first. Without
 * literal UVs (dense primitives, older senders) or when the layouts still
 * differ, the UVs are baked from the relayed face texture maps, which hold the
 * sender's texture lock result.
 *
 * @param object Replicated object (already attached to its parent).
 * @param data Relayed entry payload.
 */
export function nodeUvApply(object: THREE.Object3D, data: NodeCollaborationEntryData): void {
  if (!nodeUvPrimitive(object, data.entry)) return;
  const mesh = object as THREE.Mesh;
  const uv = data.uv ?? [];
  if (nodeUvCount(mesh) !== uv.length && uv.length > 0) ensureUniqueTriangleVertices(mesh);
  if (nodeUvCount(mesh) === uv.length) {
    mesh.geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv.slice(), 2));
    return;
  }
  if (!isContentMeshEligibleForTextureLockRebake(mesh)) return;
  mesh.updateWorldMatrix(true, false);
  rebakeStoredFaceTextureMaps(mesh);
}

/**
 * Returns the number of UV components a mesh's vertex layout holds.
 *
 * @param mesh Mesh.
 * @returns Vertex count times two.
 */
function nodeUvCount(mesh: THREE.Mesh): number {
  const position = (mesh.geometry as THREE.BufferGeometry).getAttribute('position');
  return position === undefined ? 0 : position.count * 2;
}

/**
 * Returns the local pose of an object as position, quaternion and scale
 * components.
 *
 * @param object Scene object.
 * @returns Ten pose components.
 */
export function nodeUvPoseOf(object: THREE.Object3D): number[] {
  return [...object.position.toArray(), ...object.quaternion.toArray(), ...object.scale.toArray()];
}

/**
 * Previews the texture lock of a live world mesh pose the way the dragger's
 * transform does: a scale change follows Stretch Lock, a pure move follows Pos
 * Lock, and an unlocked change bakes the UVs from the stored world face maps.
 * Locked changes keep the UVs as they are.
 *
 * @param object Posed object.
 * @param before Pose components from {@link nodeUvPoseOf} before the pose.
 * @param locks Texture locks of the dragger's transform, or null for stuck UVs.
 */
export function nodeUvPose(object: THREE.Object3D, before: readonly number[], locks: TextureLockFlags | null): void {
  if (locks === null || !(object instanceof THREE.Mesh) || !isContentMeshEligibleForTextureLockRebake(object)) return;
  const after = nodeUvPoseOf(object);
  const scaled = !nodeUvPoseSame(before.slice(7), after.slice(7));
  const moved = !scaled && !nodeUvPoseSame(before.slice(0, 7), after.slice(0, 7));
  if (!shouldRebakeContentAfterTransform(locks, moved, scaled)) return;
  object.updateWorldMatrix(true, false);
  rebakeStoredFaceTextureMaps(object);
}

/**
 * Returns whether two component lists match within the pose epsilon.
 *
 * @param a First components.
 * @param b Second components.
 * @returns True when equal.
 */
function nodeUvPoseSame(a: readonly number[], b: readonly number[]): boolean {
  return a.every((value, index) => Math.abs(value - (b[index] ?? 0)) <= NODE_UV_POSE_EPSILON);
}
