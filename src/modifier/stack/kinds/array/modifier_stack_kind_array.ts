import * as THREE from 'three';
import type { ModifierStackField, ModifierStackUnit } from '@/modifier/stack/modifier_stack_types.js';
import type { ModifierStackContext } from '@/modifier/stack/evaluate/modifier_stack_context.js';
import { ModifierStackKind, type ModifierStackCategory } from '@/modifier/stack/kinds/modifier_stack_kind.js';
import { modifierStackChoices, modifierStackNumber } from '@/modifier/stack/modifier_stack_fields.js';
import {
  modifierStackFrame,
  modifierStackModelTransform,
  modifierStackUnitsBounds,
  modifierStackVolumeBox,
} from '@/modifier/stack/evaluate/modifier_stack_frame.js';
import { modifierStackUnitCopy } from '@/modifier/stack/evaluate/modifier_stack_unit_copy.js';
import type { ModifierStackUvPolicy } from '@/modifier/stack/evaluate/modifier_stack_copy.js';
import { MODIFIER_STACK_ARRAY_CAP_FIELDS, modifierStackArrayCapsPlace } from './modifier_stack_array_caps.js';
import { MODIFIER_STACK_ARRAY_RANDOM_FIELDS, modifierStackRandomTransform } from './modifier_stack_array_random.js';
import { modifierStackReshapeTransform } from '@/modifier/stack/evaluate/modifier_stack_reshape.js';

/** Largest copy count, including the original, of one duplicate modifier. */
export const MODIFIER_STACK_ARRAY_MAX_COUNT = 256;

/** Placement data shared by every copy of one evaluation. */
export interface ModifierStackArrayPlacement {
  /** Normalized parameters. */
  parameters: Record<string, unknown>;
  /** Working set bounds in placement coordinates. */
  bounds: THREE.Box3;
  /** Copy count including the original. */
  count: number;
  /** Volume box in placement coordinates. */
  volumeBox: THREE.Box3;
  /** Piece index that varies random values per piece; zero for the whole input. */
  salt: number;
}

/** What every copy of one evaluation shares. */
export interface ModifierStackArrayPlan {
  /** Normalized parameters. */
  parameters: Record<string, unknown>;
  /** Placement frame in world space. */
  frame: THREE.Matrix4;
  /** Copy count including the original. */
  count: number;
  /** Volume box in placement coordinates. */
  volumeBox: THREE.Box3;
  /** Solid root the copies are expressed in. */
  solidRoot: THREE.Object3D;
}

/** Copy count field shared by array kinds that expose a count. */
const MODIFIER_STACK_ARRAY_COUNT_FIELD: ModifierStackField = {
  key: 'count',
  label: 'Count',
  type: 'number',
  default: 3,
  min: 1,
  max: MODIFIER_STACK_ARRAY_MAX_COUNT,
  integer: true,
  step: 1,
  hint: 'Copies including the original.',
};

/** Chooses whether sizes and centres come from the whole input or each piece. */
export const MODIFIER_STACK_ARRAY_BOUNDS_FIELD: ModifierStackField = {
  key: 'bounds',
  label: 'Size from',
  type: 'choice',
  default: 'whole',
  choices: modifierStackChoices([
    ['whole', 'Whole input'],
    ['piece', 'Each piece'],
  ]),
  hint: 'Whole input spaces copies by the size of everything entering this modifier. Each piece uses every brush group on its own.',
};

/** Axis basis and texture fields shared by every array kind. */
const MODIFIER_STACK_ARRAY_SHARED_FIELDS: readonly ModifierStackField[] = [
  {
    key: 'space',
    label: 'Axes',
    type: 'choice',
    default: 'volume',
    choices: modifierStackChoices([
      ['volume', 'Volume'],
      ['world', 'World'],
    ]),
    hint: 'Follow the volume rotation or the world axes.',
  },
  {
    key: 'uv',
    label: 'Textures',
    type: 'choice',
    default: 'copied',
    choices: modifierStackChoices([
      ['copied', 'Move with copy'],
      ['world', 'World aligned'],
    ]),
  },
  {
    key: 'uvShiftU',
    label: 'UV shift U',
    type: 'number',
    default: 0,
    min: -100,
    max: 100,
    step: 0.05,
    group: 'Per copy texture',
    hint: 'Moves the texture of each copy this many tiles along U, adding up copy by copy.',
  },
  {
    key: 'uvShiftV',
    label: 'UV shift V',
    type: 'number',
    default: 0,
    min: -100,
    max: 100,
    step: 0.05,
    group: 'Per copy texture',
    hint: 'Moves the texture of each copy this many tiles along V, adding up copy by copy.',
  },
];

/**
 * Base class of modifiers that duplicate the whole working set with rigid or
 * reflected transforms. The original always remains as copy zero.
 */
export abstract class ModifierStackKindArray extends ModifierStackKind {
  readonly category: ModifierStackCategory = 'duplicate';
  /** Fixed copy count, or null when the user chooses it. */
  protected readonly fixedCount: number | null = null;

  /**
   * Returns the transform of one copy in placement coordinates.
   *
   * @param index Copy index; zero is the original.
   * @param placement Shared placement data.
   * @returns Placement-space operator.
   */
  protected abstract copyTransform(index: number, placement: ModifierStackArrayPlacement): THREE.Matrix4;

  /** Kind-specific fields shown after the shared ones. */
  protected abstract readonly specificFields: readonly ModifierStackField[];

  /**
   * Returns shared and kind-specific fields.
   *
   * @returns Field list.
   */
  get fields(): readonly ModifierStackField[] {
    return [...this.sharedFields(), ...this.specificFields];
  }

  /**
   * Returns the copy count, count, basis and texture fields.
   *
   * @returns Shared fields.
   */
  private sharedFields(): ModifierStackField[] {
    return this.fixedCount
      ? [...MODIFIER_STACK_ARRAY_SHARED_FIELDS]
      : [
          MODIFIER_STACK_ARRAY_COUNT_FIELD,
          ...MODIFIER_STACK_ARRAY_SHARED_FIELDS,
          ...MODIFIER_STACK_ARRAY_CAP_FIELDS,
          ...MODIFIER_STACK_ARRAY_RANDOM_FIELDS,
        ];
  }

  /**
   * Returns the header summary.
   *
   * @param parameters Normalized parameters.
   * @returns Copy count summary.
   */
  override summary(parameters: Record<string, unknown>): string {
    return `×${this.countOf(parameters)}`;
  }

  /**
   * Returns false when randomize also moves the original, which then replaces
   * the authored brushes.
   *
   * @param parameters Normalized parameters.
   * @returns True unless the original is randomized.
   */
  override passesAuthoredInput(parameters: Record<string, unknown>): boolean {
    return !this.randomizesFirst(parameters);
  }

  /**
   * Returns whether randomize also moves the original.
   *
   * @param parameters Normalized parameters.
   * @returns True when the first item is randomized.
   */
  private randomizesFirst(parameters: Record<string, unknown>): boolean {
    return !this.fixedCount && parameters['randomize'] === true && parameters['randomExcludeFirst'] === false;
  }

  /**
   * Duplicates the working set.
   *
   * @param units Previous output.
   * @param context Evaluation context.
   * @returns Originals followed by their copies.
   */
  apply(units: readonly ModifierStackUnit[], context: ModifierStackContext): ModifierStackUnit[] {
    const plan = this.planOf(units, context);
    const piece = plan.parameters['bounds'] === 'piece';
    const whole = piece ? null : this.placementOf(plan, units, 0);
    const output: ModifierStackUnit[] = [];
    units.forEach((unit, index) => {
      const placement = whole ?? this.placementOf(plan, [unit], index + 1);
      output.push(this.originalOf(unit, plan, placement));
      this.modelTransforms(plan.frame, placement, plan.solidRoot).forEach((transform, offset) =>
        output.push(
          modifierStackUnitCopy(unit, transform, offset + 1, this.copyPolicy(plan.parameters, offset + 1), context),
        ),
      );
    });
    return [...output, ...this.capsOf(units, plan, context)];
  }

  /**
   * Returns the original, reshaped by its random transform when randomize
   * includes the first item.
   *
   * @param unit Original unit.
   * @param plan Evaluation plan.
   * @param placement Placement of the unit's group.
   * @returns Original or reshaped unit.
   */
  private originalOf(
    unit: ModifierStackUnit,
    plan: ModifierStackArrayPlan,
    placement: ModifierStackArrayPlacement,
  ): ModifierStackUnit {
    if (!this.randomizesFirst(plan.parameters)) return unit;
    const model = this.modelTransformOf(plan.frame, this.randomOf(0, placement), plan.solidRoot);
    const uv = String(plan.parameters['uv']);
    const brushes = unit.brushes.map((brush) => modifierStackReshapeTransform(brush, model, uv));
    return { ...unit, brushes, reshaped: unit.authored || unit.reshaped };
  }

  /**
   * Returns one copy's random transform about the centre of its group.
   *
   * @param index Copy index.
   * @param placement Placement of the group.
   * @returns Placement-space operator.
   */
  private randomOf(index: number, placement: ModifierStackArrayPlacement): THREE.Matrix4 {
    const pivot = placement.bounds.isEmpty() ? new THREE.Vector3() : placement.bounds.getCenter(new THREE.Vector3());
    const copy = { index, count: placement.count, salt: placement.salt, pivot };
    return modifierStackRandomTransform(placement.parameters, copy);
  }

  /**
   * Places the start and end caps, one step past either end of the whole input.
   * Kinds with a fixed count have no caps.
   *
   * @param units Array input.
   * @param plan Evaluation plan.
   * @param context Evaluation context.
   * @returns Cap copies.
   */
  private capsOf(
    units: readonly ModifierStackUnit[],
    plan: ModifierStackArrayPlan,
    context: ModifierStackContext,
  ): ModifierStackUnit[] {
    if (this.fixedCount || units.length === 0) return [];
    const placement = this.placementOf(plan, units);
    if (placement.bounds.isEmpty()) return [];
    const ends = {
      startCap: this.copyTransform(1, placement).invert(),
      endCap: this.copyTransform(plan.count, placement),
    };
    return modifierStackArrayCapsPlace(units, plan, placement, ends, context);
  }

  /**
   * Collects what every copy of one evaluation shares.
   *
   * @param units Working set.
   * @param context Evaluation context.
   * @returns Evaluation plan.
   */
  protected planOf(units: readonly ModifierStackUnit[], context: ModifierStackContext): ModifierStackArrayPlan {
    const parameters = context.step.parameters;
    return {
      parameters,
      frame: modifierStackFrame(context.volume, parameters['space']),
      count: this.grantedCount(units, parameters, context),
      volumeBox: this.volumeBoxOf(context),
      solidRoot: context.solidRoot,
    };
  }

  /**
   * Returns the placement of a group.
   *
   * @param plan Evaluation plan.
   * @param group Units measured together.
   * @param salt Piece index, zero for the whole input.
   * @returns Placement.
   */
  protected placementOf(
    plan: ModifierStackArrayPlan,
    group: readonly ModifierStackUnit[],
    salt = 0,
  ): ModifierStackArrayPlacement {
    const bounds = modifierStackUnitsBounds(group, plan.frame);
    return { parameters: plan.parameters, bounds, count: plan.count, volumeBox: plan.volumeBox, salt };
  }

  /**
   * Returns how the faces of one copy keep their textures, including the
   * per-copy UV shift.
   *
   * @param parameters Normalized parameters.
   * @param steps Copy index.
   * @returns Texture policy.
   */
  protected copyPolicy(parameters: Record<string, unknown>, steps: number): ModifierStackUvPolicy {
    return {
      uv: String(parameters['uv']),
      readable: parameters['readable'] !== false,
      shiftU: Number(parameters['uvShiftU'] ?? 0) * steps,
      shiftV: Number(parameters['uvShiftV'] ?? 0) * steps,
    };
  }

  /**
   * Returns the volume box used by kinds that place relative to it.
   *
   * @param context Evaluation context.
   * @returns Volume box in the volume's own frame.
   */
  protected volumeBoxOf(context: ModifierStackContext): THREE.Box3 {
    return modifierStackVolumeBox(context.volume);
  }

  /**
   * Converts every copy transform into model space.
   *
   * @param frame Placement-to-world matrix.
   * @param placement Shared placement data.
   * @param solidRoot Solid model root.
   * @returns One model-space operator per copy after the original.
   */
  private modelTransforms(
    frame: THREE.Matrix4,
    placement: ModifierStackArrayPlacement,
    solidRoot: THREE.Object3D,
  ): THREE.Matrix4[] {
    const transforms: THREE.Matrix4[] = [];
    for (let index = 1; index < placement.count; index++) {
      const local = this.copyTransform(index, placement).multiply(this.randomOf(index, placement));
      transforms.push(this.modelTransformOf(frame, local, solidRoot));
    }
    return transforms;
  }

  /**
   * Converts a placement-space operator into model space.
   *
   * @param frame Placement-to-world matrix.
   * @param local Placement-space operator.
   * @param solidRoot Solid model root.
   * @returns Model-space operator.
   */
  private modelTransformOf(frame: THREE.Matrix4, local: THREE.Matrix4, solidRoot: THREE.Object3D): THREE.Matrix4 {
    const world = frame.clone().multiply(local).multiply(frame.clone().invert());
    return modifierStackModelTransform(world, solidRoot);
  }

  /**
   * Returns the requested count, reduced to what the brush budget allows.
   *
   * @param units Working set.
   * @param parameters Normalized parameters.
   * @param context Evaluation context.
   * @returns Granted count including the original.
   */
  private grantedCount(
    units: readonly ModifierStackUnit[],
    parameters: Record<string, unknown>,
    context: ModifierStackContext,
  ): number {
    const wanted = this.countOf(parameters);
    const brushes = units.reduce((sum, unit) => sum + unit.brushes.length, 0);
    const granted = 1 + context.budget.takeCopies(brushes, wanted - 1);
    if (granted < wanted) context.report.error = `Brush budget reached: ${granted} of ${wanted} copies made.`;
    return granted;
  }

  /**
   * Reads the copy count.
   *
   * @param parameters Normalized parameters.
   * @returns Count including the original.
   */
  protected countOf(parameters: Record<string, unknown>): number {
    if (this.fixedCount) return this.fixedCount;
    return Math.round(modifierStackNumber(parameters['count'], 3, 1, MODIFIER_STACK_ARRAY_MAX_COUNT));
  }
}
