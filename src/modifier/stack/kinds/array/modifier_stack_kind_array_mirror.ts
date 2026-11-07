import { Matrix4, Plane, Vector3 } from 'three';
import type { ModifierStackField, ModifierStackUnit } from '@/modifier/stack/modifier_stack_types.js';
import type { ModifierStackContext } from '@/modifier/stack/evaluate/modifier_stack_context.js';
import { modifierStackChoices, modifierStackWhen } from '@/modifier/stack/modifier_stack_fields.js';
import { modifierStackFrame, modifierStackVolumeBox } from '@/modifier/stack/evaluate/modifier_stack_frame.js';
import { modifierStackReshapeClip } from '@/modifier/stack/evaluate/modifier_stack_reshape.js';
import { ModifierStackKindArray, type ModifierStackArrayPlacement } from './modifier_stack_kind_array.js';
import { modifierStackAroundPivot, modifierStackAxis } from './modifier_stack_array_math.js';

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
      hint: 'Cuts the input at the mirror plane and keeps one side, so the halves meet without overlap.',
    },
    {
      key: 'flip',
      label: 'Flip',
      type: 'boolean',
      default: false,
      visible: modifierStackWhen('bisect', true),
      hint: 'Keeps the negative side of the plane instead of the positive side.',
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
    const placement = { parameters, volumeBox: modifierStackVolumeBox(context.volume) };
    const sign = parameters['flip'] === true ? -1 : 1;
    const frame = new Plane(axis.clone().multiplyScalar(sign), -sign * this.planeDistance(axis, placement));
    const world = frame.applyMatrix4(modifierStackFrame(context.volume, parameters['space']));
    return world.applyMatrix4(context.solidRoot.matrixWorld.clone().invert());
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
    return modifierStackAroundPivot(reflection, axis.clone().multiplyScalar(this.planeDistance(axis, placement)));
  }

  /**
   * Returns the plane position along its axis.
   *
   * @param axis Plane normal.
   * @param placement Shared placement data.
   * @returns Signed distance from the volume origin.
   */
  private planeDistance(
    axis: Vector3,
    placement: Pick<ModifierStackArrayPlacement, 'parameters' | 'volumeBox'>,
  ): number {
    const offset = Number(placement.parameters['planeOffset']);
    const box = placement.volumeBox;
    const plane = placement.parameters['plane'];
    if (box.isEmpty() || plane === 'center')
      return offset + (box.isEmpty() ? 0 : box.getCenter(new Vector3()).dot(axis));
    return offset + (plane === 'min' ? box.min.dot(axis) : box.max.dot(axis));
  }
}
