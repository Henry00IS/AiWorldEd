import * as THREE from 'three';
import { solidScriptValueText } from './solid_script_value.js';
import type { SolidScriptBlockRun } from './solid_script_machine_types.js';
import type { SolidScriptShapeSolid, SolidScriptUvPolicy } from './solid_script_shape.js';
import { surfaceUvApplyPolicy } from '@/texture/uv_matrix/surface_uv_policy.js';
import type { SurfaceUvMatrix } from '@/texture/uv_matrix/surface_uv_matrix.js';

/**
 * Reads a Textures field, or none when it is left off and optional.
 *
 * @param run Running line.
 * @param required True stops when the field is empty or unknown.
 * @returns Copied or world, or undefined when optional and empty.
 */
export function solidScriptUvPolicyTextures(
  run: SolidScriptBlockRun,
  required: boolean,
): 'copied' | 'world' | undefined {
  const raw = solidScriptValueText(run.value('textures')).trim();
  if (raw === '') {
    if (required) throw new Error('Textures must be Move With Shape or World Aligned');
    return undefined;
  }
  const textures = raw.toLowerCase();
  if (textures !== 'move with shape' && textures !== 'world aligned')
    throw new Error(`Textures must be Move With Shape or World Aligned, not "${raw}"`);
  return textures === 'world aligned' ? 'world' : 'copied';
}

/**
 * The texture policy of a solid: its own, or the one Input Objects stored on a
 * received brush.
 *
 * @param leaf Solid.
 * @returns Policy, with missing fields left undefined.
 */
export function solidScriptUvPolicyOf(leaf: SolidScriptShapeSolid): SolidScriptUvPolicy {
  const received = leaf.received;
  const own = leaf.uvPolicy;
  const textures = received?.textures ?? own?.textures;
  const readable = received?.readable ?? own?.readable;
  const shiftU = received?.shiftU ?? own?.shiftU;
  const shiftV = received?.shiftV ?? own?.shiftV;
  return {
    ...(textures !== undefined ? { textures } : {}),
    ...(readable !== undefined ? { readable } : {}),
    ...(shiftU !== undefined ? { shiftU } : {}),
    ...(shiftV !== undefined ? { shiftV } : {}),
  };
}

/**
 * Writes a policy onto a solid, and onto its received record when it has one.
 *
 * @param leaf Solid.
 * @param policy Fields to merge; undefined fields stay as they were.
 * @returns Solid with the policy stored.
 */
export function solidScriptUvPolicyWrite(
  leaf: SolidScriptShapeSolid,
  policy: SolidScriptUvPolicy,
  mode: 'set' | 'add' = 'set',
): SolidScriptShapeSolid {
  const before = solidScriptUvPolicyOf(leaf);
  const textures = policy.textures ?? before.textures;
  const readable = policy.readable ?? before.readable;
  const shiftU = mode === 'add' ? (before.shiftU ?? 0) + (policy.shiftU ?? 0) : (policy.shiftU ?? before.shiftU ?? 0);
  const shiftV = mode === 'add' ? (before.shiftV ?? 0) + (policy.shiftV ?? 0) : (policy.shiftV ?? before.shiftV ?? 0);
  const next: SolidScriptUvPolicy = {
    ...(textures !== undefined ? { textures } : {}),
    ...(readable !== undefined ? { readable } : {}),
    shiftU,
    shiftV,
  };
  const received = leaf.received
    ? {
        ...leaf.received,
        ...(textures !== undefined ? { textures } : {}),
        ...(readable !== undefined ? { readable } : {}),
        shiftU,
        shiftV,
      }
    : undefined;
  return { ...leaf, uvPolicy: next, ...(received ? { received } : {}) };
}

/**
 * Writes a policy onto the same solid object, so a received brush stays a
 * received brush.
 *
 * @param leaf Solid.
 * @param policy Fields to merge; undefined fields stay as they were.
 * @param mode Replace or add the shift.
 * @returns The same solid.
 */
export function solidScriptUvPolicyApply(
  leaf: SolidScriptShapeSolid,
  policy: SolidScriptUvPolicy,
  mode: 'set' | 'add' = 'set',
): SolidScriptShapeSolid {
  const next = solidScriptUvPolicyWrite(leaf, policy, mode);
  if (next.uvPolicy) leaf.uvPolicy = next.uvPolicy;
  if (next.received) leaf.received = next.received;
  return leaf;
}

/**
 * Applies a readable U flip and UV shift to a mapping, given the face corners.
 *
 * @param uv Mapping.
 * @param points Face corners in the same space as `uv`.
 * @param pose Matrix multiplied first, or none.
 * @param reverseU True flips U inside the face's chart.
 * @param shiftU Tiles added to U.
 * @param shiftV Tiles added to V.
 * @returns Mapping after the pose, flip and shift.
 */
export function solidScriptUvPolicyMap(
  uv: SurfaceUvMatrix,
  points: readonly THREE.Vector3[],
  pose: THREE.Matrix4 | null,
  reverseU: boolean,
  shiftU: number,
  shiftV: number,
): SurfaceUvMatrix {
  return surfaceUvApplyPolicy(uv, points, pose, reverseU, shiftU, shiftV);
}
