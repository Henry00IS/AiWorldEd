import { Matrix4, Plane, type Box3, type Object3D } from 'three';
import { modifierStackMirrorGuide } from './modifier_stack_mirror_guide.js';
import type { ModifierStackField, ModifierStackUnit } from '@/modifier/stack/modifier_stack_types.js';
import type { ModifierStackContext } from '@/modifier/stack/evaluate/modifier_stack_context.js';
import { modifierStackChoices, modifierStackWhen } from '@/modifier/stack/modifier_stack_fields.js';
import { modifierStackFrame } from '@/modifier/stack/evaluate/modifier_stack_frame.js';
import { modifierStackReshapeClip } from '@/modifier/stack/evaluate/modifier_stack_reshape.js';
import { ModifierStackKindArray, type ModifierStackArrayPlacement } from './modifier_stack_kind_array.js';
import { modifierStackAroundPivot, modifierStackAxis } from './modifier_stack_array_math.js';
import {
  modifierStackMirrorBox,
  modifierStackMirrorDistance,
  modifierStackMirrorKeptSign,
} from './modifier_stack_mirror_plane.js';

/** Warning when Bisect cut every captured brush away. */
export const MODIFIER_STACK_MIRROR_BISECT_EMPTY =
  'Bisect kept nothing: every captured brush lies on the dropped side of the plane. Turn on Flip or move the plane.';

/** Adds one reflected copy across a plane of the volume. */
export class ModifierStackKindArrayMirror extends ModifierStackKindArray {
  readonly id = 'mirror';
  readonly label = 'Mirror';
  readonly description = 'Adds a reflected copy across the volume centre or one of its sides. Winding stays outward.';
  protected override readonly fixedCount = 2;
  protected readonly specificFields: readonly ModifierStackField[] = [
    {
      key: 'axis',
      label: 'Axis',
      type: 'choice',
      default: 'x',
      choices: modifierStackChoices([
        ['x', 'X'],
        ['y', 'Y'],
        ['z', 'Z'],
      ]),
      hint: 'Normal of the mirror plane.',
    },
    {
      key: 'plane',
      label: 'Plane',
      type: 'choice',
      default: 'center',
      choices: modifierStackChoices([
        ['center', 'Volume centre'],
        ['min', 'Negative side'],
        ['max', 'Positive side'],
      ]),
    },
    {
      key: 'planeOffset',
      label: 'Offset',
      type: 'number',
      default: 0,
      step: 0.25,
      hint: 'Moves the plane along its axis, in metres.',
    },
    {
      key: 'bisect',
      label: 'Bisect',
      type: 'boolean',
      default: false,
      hint: 'Like Blender: cuts the captured brushes at the mirror plane (the pink guide while the volume or generator is selected and this card is unfolded), drops the part on the far side and mirrors the rest, so the halves meet without overlap. Brushes wholly on the far side disappear. Keeps the positive side of the centre plane, or the inside of a side plane.',
    },
    {
      key: 'flip',
      label: 'Flip',
      type: 'boolean',
      default: false,
      visible: modifierStackWhen('bisect', true),
      hint: 'Keeps the other side of the plane; the guide arrow points at the kept side.',
    },
    {
      key: 'readable',
      label: 'Readable text',
      type: 'boolean',
      default: true,
      visible: (parameters) => parameters['uv'] !== 'world',
      hint: 'Flips U on the mirrored copy so lettering is not reversed.',
    },
  ];

  /**
   * Returns the copy count summary.
   *
   * @returns Empty, since a mirror always makes one copy.
   */
  override summary(): string {
    return '';
  }

  /**
   * Draws the mirror plane, with an arrow at the kept side when bisecting, in a
   * volume or a generator node alike.
   *
   * @param volume Owning volume or generator node.
   * @param parameters Normalized parameters.
   * @returns The plane guide.
   */
  override helpers(volume: Object3D, parameters: Record<string, unknown>): Object3D[] {
    return [modifierStackMirrorGuide(volume, parameters)];
  }

  /**
   * Returns false while bisecting: the cut authored brushes replace the
   * originals, so authored bevels stop here.
   *
   * @param parameters Normalized parameters.
   * @returns True unless bisect is on.
   */
  override passesAuthoredInput(parameters: Record<string, unknown>): boolean {
    return parameters['bisect'] !== true;
  }

  /**
   * Cuts the input at the mirror plane when bisecting, then mirrors what is
   * left. Authored brushes cut away entirely leave the CSG.
   *
   * @param units Previous output.
   * @param context Evaluation context.
   * @returns Kept halves followed by their reflections.
   */
  override apply(units: readonly ModifierStackUnit[], context: ModifierStackContext): ModifierStackUnit[] {
    if (context.step.parameters['bisect'] !== true) return super.apply(units, context);
    const plane = this.keptHalf(context);
    const kept = units.flatMap((unit) => {
      const brushes = unit.brushes.flatMap((brush) => {
        const cut = modifierStackReshapeClip(brush, plane);
        if (!cut && unit.authored) context.records.hiddenAdd(brush.id);
        return cut ? [cut] : [];
      });
      return brushes.length > 0 ? [{ ...unit, brushes, reshaped: unit.authored || unit.reshaped }] : [];
    });
    if (kept.length === 0 && units.length > 0) context.report.error = MODIFIER_STACK_MIRROR_BISECT_EMPTY;
    return super.apply(kept, context);
  }

  /**
   * Returns the kept half-space in model coordinates; its normal points at the
   * kept side.
   *
   * @param context Evaluation context.
   * @returns Model-space plane.
   */
  private keptHalf(context: ModifierStackContext): Plane {
    const parameters = context.step.parameters;
    const axis = modifierStackAxis(parameters['axis']);
    const distance = modifierStackMirrorDistance(axis, parameters, this.volumeBoxOf(context));
    const sign = modifierStackMirrorKeptSign(parameters);
    const frame = new Plane(axis.clone().multiplyScalar(sign), -sign * distance);
    const world = frame.applyMatrix4(modifierStackFrame(context.volume, parameters['space']));
    return world.applyMatrix4(context.solidRoot.matrixWorld.clone().invert());
  }

  /**
   * Returns the box the plane is placed in: the volume's own box, or its
   * world-aligned bounds with world axes.
   *
   * @param context Evaluation context.
   * @returns Box in the placement frame.
   */
  protected override volumeBoxOf(context: ModifierStackContext): Box3 {
    return modifierStackMirrorBox(context.volume, context.step.parameters['space']);
  }

  /**
   * Reflects copy one across the chosen plane.
   *
   * @param index Copy index.
   * @param placement Shared placement data.
   * @returns Reflection, or identity for the original.
   */
  protected copyTransform(index: number, placement: ModifierStackArrayPlacement): Matrix4 {
    if (index === 0) return new Matrix4();
    const axis = modifierStackAxis(placement.parameters['axis']);
    const scale = axis.clone().multiplyScalar(-2).addScalar(1);
    const reflection = new Matrix4().makeScale(scale.x, scale.y, scale.z);
    return modifierStackAroundPivot(
      reflection,
      axis.clone().multiplyScalar(modifierStackMirrorDistance(axis, placement.parameters, placement.volumeBox)),
    );
  }
}
