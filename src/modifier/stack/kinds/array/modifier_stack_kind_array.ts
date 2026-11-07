import type * as THREE from 'three';
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
      : [MODIFIER_STACK_ARRAY_COUNT_FIELD, ...MODIFIER_STACK_ARRAY_SHARED_FIELDS];
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
   * Duplicates the working set.
   *
   * @param units Previous output.
   * @param context Evaluation context.
   * @returns Originals followed by their copies.
   */
  apply(units: readonly ModifierStackUnit[], context: ModifierStackContext): ModifierStackUnit[] {
    const plan = this.planOf(units, context);
    const shared = plan.parameters['bounds'] === 'piece' ? null : this.transformsOf(plan, units);
    const output: ModifierStackUnit[] = [];
    for (const unit of units) {
      output.push(unit);
      (shared ?? this.transformsOf(plan, [unit])).forEach((transform, offset) =>
        output.push(
          modifierStackUnitCopy(unit, transform, offset + 1, this.copyPolicy(plan.parameters, offset + 1), context),
        ),
      );
    }
    return output;
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
   * Returns the model-space transform of every copy of a group.
   *
   * @param plan Evaluation plan.
   * @param group Units measured together.
   * @returns One transform per copy, original excluded.
   */
  protected transformsOf(plan: ModifierStackArrayPlan, group: readonly ModifierStackUnit[]): THREE.Matrix4[] {
    return this.modelTransforms(plan.frame, this.placementOf(plan, group), plan.solidRoot);
  }

  /**
   * Returns the placement of a group.
   *
   * @param plan Evaluation plan.
   * @param group Units measured together.
   * @returns Placement.
   */
  protected placementOf(
    plan: ModifierStackArrayPlan,
    group: readonly ModifierStackUnit[],
  ): ModifierStackArrayPlacement {
    const bounds = modifierStackUnitsBounds(group, plan.frame);
    return { parameters: plan.parameters, bounds, count: plan.count, volumeBox: plan.volumeBox };
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
    const inverse = frame.clone().invert();
    const transforms: THREE.Matrix4[] = [];
    for (let index = 1; index < placement.count; index++) {
      const world = frame.clone().multiply(this.copyTransform(index, placement)).multiply(inverse);
      transforms.push(modifierStackModelTransform(world, solidRoot));
    }
    return transforms;
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
