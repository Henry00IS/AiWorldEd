import type { SolidTreeBrush } from '@/solid/commands/tree/solid_tree_node.js';
import type { ModifierStackContext } from '@/modifier/stack/evaluate/modifier_stack_context.js';
import { MODIFIER_SMOOTH_FLAT, type ModifierSmoothTag } from '@/modifier/smooth/modifier_smooth_shading.js';

/**
 * Returns the smooth shading a script gave a brush's faces: faces without it
 * stay flat, and the brush blends up to its largest angle with the other smooth
 * solids of the same script.
 *
 * @param node Brush node from the script.
 * @param context Evaluation context.
 * @returns Smoothing, or undefined when every face is flat.
 */
export function modifierStackSolidScriptSmooth(
  node: SolidTreeBrush,
  context: ModifierStackContext,
): ModifierSmoothTag | undefined {
  const angles = node.faceSmooth;
  if (!angles) return undefined;
  const maxAngle = Math.max(0, ...angles.map((angle) => angle ?? 0));
  if (maxAngle <= 0) return undefined;
  const last = Math.max(0, ...node.brush.faces.map((face) => face.surfaceIndex));
  const classes = new Array<number>(last + 1).fill(MODIFIER_SMOOTH_FLAT);
  node.brush.faces.forEach((face, index) => {
    if (angles[index] !== undefined) classes[face.surfaceIndex] = 0;
  });
  return { group: `${context.volume.uuid}#${context.step.id}`, maxAngle, classes };
}
