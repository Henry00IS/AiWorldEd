import * as THREE from 'three';
import type { ModifierStackField, ModifierStackUnit } from '@/modifier/stack/modifier_stack_types.js';
import type { ModifierStackContext } from '@/modifier/stack/evaluate/modifier_stack_context.js';
import { ModifierStackKind, type ModifierStackCategory } from '@/modifier/stack/kinds/modifier_stack_kind.js';
import { modifierStackReshapeTransform } from '@/modifier/stack/evaluate/modifier_stack_reshape.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { modifierSmoothTagSet } from '@/modifier/smooth/modifier_smooth_shading.js';

/** Persisted id of the Smooth Shading modifier. */
export const MODIFIER_STACK_KIND_SMOOTH = 'smooth';

/**
 * Shades the input smoothly where its faces meet at less than a max angle, like
 * Blender's auto smooth. Only normals change: shapes, textures and the CSG stay
 * as they are, and smoothing blends across touching brushes.
 */
export class ModifierStackKindSmooth extends ModifierStackKind {
  readonly id = MODIFIER_STACK_KIND_SMOOTH;
  readonly label = 'Smooth Shading';
  readonly category: ModifierStackCategory = 'shape';
  readonly description = 'Shades faces smoothly where they meet at less than the max angle. Shapes stay unchanged.';
  readonly fields: readonly ModifierStackField[] = [
    {
      key: 'maxAngle',
      label: 'Max angle',
      type: 'number',
      default: 30,
      min: 0,
      max: 180,
      step: 1,
      hint: 'Faces meeting at less than this angle, in degrees, shade as one smooth surface; sharper edges stay hard. 0 keeps every face flat.',
    },
  ];

  /**
   * Returns false: later modifiers see the smoothed stand-ins.
   *
   * @returns False.
   */
  override passesAuthoredInput(): boolean {
    return false;
  }

  /**
   * Returns the angle summary.
   *
   * @param parameters Normalized parameters.
   * @returns Summary text.
   */
  override summary(parameters: Record<string, unknown>): string {
    return `Max ${String(parameters['maxAngle'])}°`;
  }

  /**
   * Marks every brush of the working set smooth; authored ones become unchanged
   * stand-ins that carry the shading.
   *
   * @param units Previous output.
   * @param context Evaluation context.
   * @returns Smoothed units.
   */
  apply(units: readonly ModifierStackUnit[], context: ModifierStackContext): ModifierStackUnit[] {
    const tag = {
      group: `${context.volume.uuid}#${context.step.id}`,
      maxAngle: Number(context.step.parameters['maxAngle']),
    };
    const same = new THREE.Matrix4();
    const separateBevel = !ModifierVolume.read(context.volume).modifiers.some(
      (step) => step.enabled && step.kind === 'bevel',
    );
    return units.map((unit) => {
      const brushes = unit.brushes.map((brush) => {
        const source = separateBevel && unit.authored && !unit.reshaped ? context.authoredBevel(brush) : brush;
        const standIn = modifierStackReshapeTransform(source, same, 'copied');
        modifierSmoothTagSet(standIn, tag);
        return standIn;
      });
      return { ...unit, brushes, reshaped: unit.authored || unit.reshaped };
    });
  }
}
