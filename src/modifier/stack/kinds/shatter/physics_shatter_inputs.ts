import type * as THREE from 'three';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import type { ModifierStackUnit } from '@/modifier/stack/modifier_stack_types.js';
import type { ModifierStackContext } from '@/modifier/stack/evaluate/modifier_stack_context.js';
import type { PhysicsShatterInput } from './fracture/physics_shatter_types.js';
import type { PhysicsShatterOutputSource } from './physics_shatter_output.js';
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
  gathered.inputs.push({ sourceBrushId: brush.id, brush: frameBrush });
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
