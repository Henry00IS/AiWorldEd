import { Matrix4, Vector3 } from 'three';
import type { ModifierStackField } from '@/modifier/stack/modifier_stack_types.js';
import { modifierStackChoices } from '@/modifier/stack/modifier_stack_fields.js';
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
  private planeDistance(axis: Vector3, placement: ModifierStackArrayPlacement): number {
    const offset = Number(placement.parameters['planeOffset']);
    const box = placement.volumeBox;
    const plane = placement.parameters['plane'];
    if (box.isEmpty() || plane === 'center')
      return offset + (box.isEmpty() ? 0 : box.getCenter(new Vector3()).dot(axis));
    return offset + (plane === 'min' ? box.min.dot(axis) : box.max.dot(axis));
  }
}
