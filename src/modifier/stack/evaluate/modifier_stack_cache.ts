import * as THREE from 'three';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import type { ModifierStackUnit, ModifierStackUnitSlot } from '@/modifier/stack/modifier_stack_types.js';
import type { ModifierStackStatus } from './modifier_stack_status.js';
import type { ModifierStackRecords } from './modifier_stack_records.js';
import type { ModifierStackCapture } from './modifier_stack_authored_bevel.js';
import type { ModifierStackSharedContext } from './modifier_stack_evaluate.js';
import { modifierStackFollowPoseKey, modifierStackPoseFollowOf } from './modifier_stack_cache_follow.js';

/** One volume's last evaluation inside one solid. */
export interface ModifierStackCacheEntry {
  /** Inputs and settings the evaluation ran with. */
  signature: string;
  /** Derived units, reused as the very same objects while inputs match. */
  units: ModifierStackUnit[];
  /** Presentation records the evaluation produced. */
  records: ModifierStackRecords;
  /** Stand-ins of authored brushes the evaluation reshaped, by authored id. */
  reshaped: ReadonlyMap<string, SolidBrushInstance>;
  /** Status the evaluation reported. */
  status: ModifierStackStatus;
  /** Brush budget the evaluation used. */
  budgetUsed: number;
  /** Brush budget left when the evaluation started. */
  budgetBefore: number;
  /** Whether the budget had limited a request by the end of the evaluation. */
  budgetLimited: boolean;
  /**
   * Frame-to-model matrix the output was placed with, for generator nodes whose
   * output follows a pure move or turn.
   */
  pose?: THREE.Matrix4 | undefined;
}

const modifierStackCacheBySolid = new WeakMap<THREE.Object3D, Map<string, ModifierStackCacheEntry>>();
const modifierStackCacheIdentities = new WeakMap<object, number>();
let modifierStackCacheIdentityNext = 1;

/**
 * Returns the evaluation cache of one solid, keyed by volume uuid.
 *
 * @param solidRoot Solid root.
 * @returns Mutable cache.
 */
export function modifierStackCacheOf(solidRoot: THREE.Object3D): Map<string, ModifierStackCacheEntry> {
  let cache = modifierStackCacheBySolid.get(solidRoot);
  if (!cache) modifierStackCacheBySolid.set(solidRoot, (cache = new Map()));
  return cache;
}

/**
 * Forgets cached volumes that are no longer active in a solid.
 *
 * @param solidRoot Solid root.
 * @param live Uuids of the volumes that ran.
 */
export function modifierStackCachePrune(solidRoot: THREE.Object3D, live: ReadonlySet<string>): void {
  const cache = modifierStackCacheOf(solidRoot);
  for (const uuid of [...cache.keys()]) if (!live.has(uuid)) cache.delete(uuid);
}

/**
 * Describes everything a volume's evaluation depends on: its pose and settings,
 * the solid frame, where generated pieces go, the remaining budget, and every
 * captured brush's pose, shape, surfaces and authored chamfer. A generator node
 * whose output follows a move or turn leaves that part of its pose out.
 *
 * @param capture Volume capture.
 * @param shared Shared context of this compile.
 * @param slot Scene-order slot of generated output.
 * @returns Signature text.
 */
export function modifierStackCacheSignature(
  capture: ModifierStackCapture,
  shared: ModifierStackSharedContext,
  slot: ModifierStackUnitSlot | undefined,
): string {
  const settings = { ...capture.settings, modifiers: capture.settings.modifiers.map((s) => ({ ...s, expanded: 0 })) };
  const head = [
    capture.volume.uuid,
    modifierStackCachePoseKey(capture, shared),
    JSON.stringify(settings),
    shared.ownsGenerated ? 1 : 0,
    JSON.stringify(slot ?? null),
  ];
  const caps = [...capture.caps].map(([id, unit]) => `cap:${id}:${modifierStackCacheUnit(unit, shared)}`);
  return [...head, ...capture.units.map((unit) => modifierStackCacheUnit(unit, shared)), ...caps].join('|');
}

/**
 * Describes the pose a volume's evaluation depends on: the full volume and
 * solid matrices, or only what a generator node's output cannot follow.
 *
 * @param capture Volume capture.
 * @param shared Shared context of this compile.
 * @returns Pose text.
 */
function modifierStackCachePoseKey(capture: ModifierStackCapture, shared: ModifierStackSharedContext): string {
  const follow = modifierStackPoseFollowOf(capture);
  if (follow) return modifierStackFollowPoseKey(capture.volume, shared.solidRoot, follow);
  return `${modifierStackCacheMatrix(capture.volume.matrixWorld)}|${modifierStackCacheMatrix(shared.solidRoot.matrixWorld)}`;
}

/**
 * Returns whether a cached evaluation still holds under the budget left now:
 * the same budget, or one that covers everything an evaluation the budget never
 * limited used.
 *
 * @param entry Cached evaluation.
 * @param remaining Budget left now.
 * @returns True when the evaluation would come out the same.
 */
export function modifierStackCacheBudgetFits(entry: ModifierStackCacheEntry, remaining: number): boolean {
  return remaining === entry.budgetBefore || (!entry.budgetLimited && remaining >= entry.budgetUsed);
}

/**
 * Describes one captured unit.
 *
 * @param unit Captured unit.
 * @param shared Shared context.
 * @returns Unit text.
 */
function modifierStackCacheUnit(unit: ModifierStackUnit, shared: ModifierStackSharedContext): string {
  const group = unit.tree instanceof THREE.Group ? JSON.stringify(unit.tree.userData) : '';
  const brushes = unit.brushes.map((brush) => modifierStackCacheBrush(brush, shared)).join(';');
  return `${unit.origin ?? ''}:${unit.tree.uuid}:${group}:${brushes}`;
}

/**
 * Describes one captured brush.
 *
 * @param brush Captured brush.
 * @param shared Shared context.
 * @returns Brush text.
 */
function modifierStackCacheBrush(brush: SolidBrushInstance, shared: ModifierStackSharedContext): string {
  const chamfer = shared.records.bevelGet(brush.id)?.derived;
  const surfaces = JSON.stringify([brush.serializeDefaultSurface(), brush.serializeFaceSurfaces()]);
  const matrix = modifierStackCacheMatrix(brush.getModelSpaceMatrix());
  const shape = modifierStackCacheShape(brush);
  return `${brush.id},${brush.operation},${brush.visible ? 1 : 0},${matrix},${shape},${modifierStackCacheIdentity(chamfer)},${surfaces}`;
}

/**
 * Hashes brush vertices and face count.
 *
 * @param brush Brush.
 * @returns Shape text.
 */
function modifierStackCacheShape(brush: SolidBrushInstance): string {
  let hash = 2166136261;
  for (const vertex of brush.brush.vertices)
    for (const value of [vertex.x, vertex.y, vertex.z]) hash = Math.imul(hash ^ Math.round(value * 1e6), 16777619);
  return `${brush.brush.vertices.length}/${brush.brush.faces.length}/${hash >>> 0}`;
}

/**
 * Formats matrix elements.
 *
 * @param matrix Matrix.
 * @returns Text.
 */
function modifierStackCacheMatrix(matrix: THREE.Matrix4): string {
  return matrix.elements.join(',');
}

/**
 * Returns a stable number for an object, or zero for undefined.
 *
 * @param value Object or undefined.
 * @returns Identity number.
 */
function modifierStackCacheIdentity(value: object | undefined): number {
  if (!value) return 0;
  let identity = modifierStackCacheIdentities.get(value);
  if (identity === undefined) modifierStackCacheIdentities.set(value, (identity = modifierStackCacheIdentityNext++));
  return identity;
}
