import type * as THREE from 'three';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import type { ModifierStackUnit } from '@/modifier/stack/modifier_stack_types.js';
import type { ModifierStackContext } from '@/modifier/stack/evaluate/modifier_stack_context.js';
import type { PhysicsShatterInput } from './fracture/physics_shatter_types.js';
import type { PhysicsShatterOutputSource } from './physics_shatter_output.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { MODIFIER_STACK_USERDATA_KEY } from '@/modifier/volume/modifier_volume_record.js';
import { modifierStackReverseWinding } from '@/modifier/stack/evaluate/modifier_stack_copy.js';

/** Fracture inputs with the sources the output builder needs. */
export interface PhysicsShatterGathered {
  /** Fracture inputs in the modifier frame, in working-set order. */
  inputs: PhysicsShatterInput[];
  /** Source per input index. */
  sources: PhysicsShatterOutputSource[];
}

/**
 * Collects every brush of the working set as a fracture input in the modifier
 * frame. Authored brushes that a bevel volume chamfers are taken chamfered.
 *
 * @param units Working set.
 * @param context Evaluation context.
 * @param modelToFrame Solid model to modifier frame matrix.
 * @returns Inputs and sources.
 */
export function physicsShatterGather(
  units: readonly ModifierStackUnit[],
  context: ModifierStackContext,
  modelToFrame: THREE.Matrix4,
): PhysicsShatterGathered {
  const gathered: PhysicsShatterGathered = { inputs: [], sources: [] };
  for (const unit of units) {
    for (const authored of unit.brushes) {
      const brush = unit.authored && !unit.reshaped ? context.authoredBevel(authored) : authored;
      physicsShatterGatherBrush(gathered, brush, modelToFrame, unit.origin);
    }
  }
  return gathered;
}

/**
 * Adds one brush as a fracture input.
 *
 * @param gathered Inputs collected so far.
 * @param brush Brush to add.
 * @param modelToFrame Solid model to modifier frame matrix.
 * @param origin Scene node the brush's unit is placed after.
 */
function physicsShatterGatherBrush(
  gathered: PhysicsShatterGathered,
  brush: SolidBrushInstance,
  modelToFrame: THREE.Matrix4,
  origin: string | null,
): void {
  const localToFrame = modelToFrame.clone().multiply(brush.getModelSpaceMatrix());
  const frameBrush = brush.brush.clone();
  frameBrush.transformVertices(localToFrame);
  if (localToFrame.determinant() < 0) modifierStackReverseWinding(frameBrush);
  gathered.inputs.push({ sourceBrushId: brush.id, brush: frameBrush, operation: brush.operation });
  gathered.sources.push({ brush, localToFrame, origin });
}

/**
 * Hides the authored brushes the working set captured, since their pieces
 * replace them.
 *
 * @param units Working set.
 * @param context Evaluation context.
 */
export function physicsShatterHideAuthored(units: readonly ModifierStackUnit[], context: ModifierStackContext): void {
  for (const unit of units) {
    if (unit.authored) for (const brush of unit.brushes) context.records.hiddenAdd(brush.id);
  }
}

/** Feedback when the inputs sit under another stack that the pieces miss. */
export const PHYSICS_SHATTER_OUTER_STACK =
  "Its brushes' group has its own modifiers, which don't reach the pieces: add Physics Shatter to that group's stack after them instead.";

/** Feedback when intersecting inputs were left out. */
export const PHYSICS_SHATTER_INTERSECT_SKIPPED = 'Intersecting brushes are not shattered.';

/**
 * Lists notes about inputs the fracture cannot honour: brushes under a group or
 * brush whose own stack would change them, and intersecting brushes.
 *
 * @param units Working set.
 * @param context Evaluation context.
 * @returns Feedback messages.
 */
export function physicsShatterInputNotes(units: readonly ModifierStackUnit[], context: ModifierStackContext): string[] {
  const brushes = units.flatMap((unit) => (unit.authored ? unit.brushes : []));
  const notes: string[] = [];
  if (brushes.some((brush) => physicsShatterUnderOtherStack(brush, context))) notes.push(PHYSICS_SHATTER_OUTER_STACK);
  if (units.some((unit) => unit.brushes.some((brush) => brush.operation === SolidOperation.Intersecting)))
    notes.push(PHYSICS_SHATTER_INTERSECT_SKIPPED);
  return notes;
}

/**
 * Returns whether a brush or one of its groups carries a stack other than the
 * evaluating one.
 *
 * @param brush Authored brush.
 * @param context Evaluation context.
 * @returns True when another stack would reshape the brush.
 */
function physicsShatterUnderOtherStack(brush: SolidBrushInstance, context: ModifierStackContext): boolean {
  for (let node: THREE.Object3D | null = brush.mesh ?? null; node && node !== context.solidRoot; node = node.parent)
    if (node !== context.volume && physicsShatterCarriesStack(node)) return true;
  return false;
}

/**
 * Returns whether a scene node stores a non-empty modifier stack.
 *
 * @param node Brush mesh or group.
 * @returns True when the node owns modifiers.
 */
function physicsShatterCarriesStack(node: THREE.Object3D): boolean {
  const stored = node.userData[MODIFIER_STACK_USERDATA_KEY] as { modifiers?: unknown } | undefined;
  return Array.isArray(stored?.modifiers) && stored.modifiers.length > 0;
}
