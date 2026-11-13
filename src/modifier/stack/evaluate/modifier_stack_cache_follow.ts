import * as THREE from 'three';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { modifierStackKindFind } from '@/modifier/stack/modifier_stack_catalog.js';
import type { ModifierStackPoseFollow } from '@/modifier/stack/kinds/modifier_stack_kind.js';
import type { ModifierStackUnit } from '@/modifier/stack/modifier_stack_types.js';
import type { ModifierStackCapture } from './modifier_stack_authored_bevel.js';
import type { ModifierStackCacheEntry } from './modifier_stack_cache.js';
import { modifierStackCopyBrush, type ModifierStackUvPolicy } from './modifier_stack_copy.js';
import { modifierStackFrame } from './modifier_stack_frame.js';
import { ModifierStackRecords } from './modifier_stack_records.js';

/**
 * Returns how a generator node's last output can follow a pure move or turn of
 * the node: every enabled step must say so, and the node must name no cap
 * pieces. Volumes that capture brushes always evaluate again.
 *
 * @param capture Capture of the node.
 * @returns Follow mode, or null when the node must evaluate again.
 */
export function modifierStackPoseFollowOf(capture: ModifierStackCapture): ModifierStackPoseFollow | null {
  if (!ModifierVolume.isGenerator(capture.volume) || capture.units.length > 0 || capture.caps.size > 0) return null;
  const modes = capture.settings.modifiers
    .filter((step) => step.enabled)
    .map((step) => modifierStackKindFind(step.kind)?.volumePoseFollow(step.parameters) ?? null);
  if (modes.length === 0 || modes.includes(null)) return null;
  return modes.includes('translate') ? 'translate' : 'rigid';
}

/**
 * Returns the matrix from a node's frame to its solid's model space: where its
 * pieces were placed.
 *
 * @param volume Generator node.
 * @param solidRoot Solid root.
 * @returns Frame-to-model matrix.
 */
export function modifierStackFollowPose(volume: THREE.Object3D, solidRoot: THREE.Object3D): THREE.Matrix4 {
  return solidRoot.matrixWorld.clone().invert().multiply(modifierStackFrame(volume, 'volume'));
}

/**
 * Describes the part of a node's pose its output depends on: the box size, plus
 * the turn when textures stay world aligned.
 *
 * @param volume Generator node.
 * @param solidRoot Solid root.
 * @param mode Follow mode.
 * @returns Pose text for the cache signature.
 */
export function modifierStackFollowPoseKey(
  volume: THREE.Object3D,
  solidRoot: THREE.Object3D,
  mode: ModifierStackPoseFollow,
): string {
  const scale = modifierStackFollowRounded(new THREE.Vector3().setFromMatrixScale(volume.matrixWorld).toArray());
  if (mode === 'rigid') return `rigid:${scale}`;
  const linear = new THREE.Matrix3().setFromMatrix4(modifierStackFollowPose(volume, solidRoot));
  return `translate:${scale}:${modifierStackFollowRounded(linear.elements)}`;
}

/**
 * Formats values rounded past floating-point noise, so a move or turn that
 * leaves a value unchanged in practice keeps the same signature.
 *
 * @param values Values.
 * @returns Text.
 */
function modifierStackFollowRounded(values: readonly number[]): string {
  return values.map((value) => Math.round(value * 1e9)).join(',');
}

/**
 * Carries a cached node output to the node's new pose without evaluating the
 * node again. Returns the entry itself when the pose is unchanged, and null
 * when the output holds more than plain pieces.
 *
 * @param entry Cached evaluation with its pose.
 * @param pose Frame-to-model matrix now.
 * @param mode Follow mode.
 * @param staging Staging group of this compile.
 * @returns Entry at the new pose, or null to evaluate again.
 */
export function modifierStackCacheEntryFollow(
  entry: ModifierStackCacheEntry,
  pose: THREE.Matrix4,
  mode: ModifierStackPoseFollow,
  staging: THREE.Object3D,
): ModifierStackCacheEntry | null {
  if (!entry.pose || !modifierStackFollowPlain(entry)) return null;
  if (entry.pose.equals(pose)) return entry;
  const delta = pose.clone().multiply(entry.pose.clone().invert());
  const policy: ModifierStackUvPolicy = {
    uv: mode === 'rigid' ? 'copied' : 'world',
    readable: false,
    shiftU: 0,
    shiftV: 0,
  };
  const records = new ModifierStackRecords();
  const units = entry.units.map((unit) => modifierStackFollowUnit(unit, delta, policy, staging));
  for (const unit of units) for (const brush of unit.brushes) records.derivedAdd(brush);
  return { ...entry, units, records, pose: pose.clone() };
}

/**
 * Returns whether a cached output is only pieces: no reshaped, hidden, bevelled
 * or shaded records that would need moving too.
 *
 * @param entry Cached evaluation.
 * @returns True for plain pieces.
 */
function modifierStackFollowPlain(entry: ModifierStackCacheEntry): boolean {
  const records = entry.records;
  if (entry.reshaped.size > 0 || records.hiddenAll().size > 0) return false;
  return records.bevelsAll().size === 0 && records.normalsAll().size === 0;
}

/**
 * Moves one unit by copying its brushes and rebuilding its group tree.
 *
 * @param unit Cached unit.
 * @param delta Model-space move from the cached pose to the new one.
 * @param policy Texture placement of the copies.
 * @param staging Staging group of this compile.
 * @returns Moved unit with fresh brushes and tree.
 */
function modifierStackFollowUnit(
  unit: ModifierStackUnit,
  delta: THREE.Matrix4,
  policy: ModifierStackUvPolicy,
  staging: THREE.Object3D,
): ModifierStackUnit {
  const copies = new Map<THREE.Object3D, SolidBrushInstance>();
  for (const brush of unit.brushes) {
    const matrix = delta.clone().multiply(brush.getModelSpaceMatrix());
    if (brush.mesh) copies.set(brush.mesh, modifierStackCopyBrush(brush, matrix, brush.id, policy));
  }
  const tree = modifierStackFollowNode(unit.tree, copies);
  staging.add(tree);
  tree.updateMatrixWorld(true);
  const brushes = unit.brushes.map((brush) => (brush.mesh ? copies.get(brush.mesh) : undefined) ?? brush);
  return { ...unit, tree, brushes };
}

/**
 * Rebuilds one node of a unit tree around the moved brush meshes.
 *
 * @param node Cached tree node.
 * @param copies Moved brush per cached mesh.
 * @returns Node of the moved tree.
 */
function modifierStackFollowNode(
  node: THREE.Object3D,
  copies: ReadonlyMap<THREE.Object3D, SolidBrushInstance>,
): THREE.Object3D {
  const copy = copies.get(node);
  if (copy?.mesh) return copy.mesh;
  const group = new THREE.Group();
  group.name = node.name;
  group.userData = { ...node.userData };
  for (const child of node.children)
    if (SolidBrushVisual.isBrushObject(child) || child instanceof THREE.Group)
      group.add(modifierStackFollowNode(child, copies));
  return group;
}
