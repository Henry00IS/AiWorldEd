import type * as THREE from 'three';
import type {
  ModifierStackSettings,
  ModifierStackStepReport,
  ModifierStackUnit,
} from '@/modifier/stack/modifier_stack_types.js';
import type { ModifierStackContext } from './modifier_stack_context.js';
import { modifierStackKindFind } from '@/modifier/stack/modifier_stack_catalog.js';
import { modifierStackValidUnits } from './modifier_stack_validity.js';

/** Context fields shared by every modifier of one solid's compile. */
export type ModifierStackSharedContext = Omit<ModifierStackContext, 'volume' | 'step' | 'report'>;

/** Result of running one volume's stack. */
export interface ModifierStackRun {
  /** Final working set. */
  units: ModifierStackUnit[];
  /** Feedback of each modifier, in stack order. */
  reports: ModifierStackStepReport[];
}

/**
 * Runs a volume's modifiers in exact stack order. Each modifier receives the
 * previous modifier's output; muted modifiers pass their input through.
 *
 * @param volume Modifier volume.
 * @param settings Normalized stack settings.
 * @param captured Authored units the volume captured.
 * @param shared Shared evaluation context.
 * @returns Final working set and feedback.
 */
export function modifierStackEvaluateVolume(
  volume: THREE.Object3D,
  settings: ModifierStackSettings,
  captured: ModifierStackUnit[],
  shared: ModifierStackSharedContext,
): ModifierStackRun {
  let units = captured;
  const reports = settings.modifiers.map(() => ({ outputs: 0, error: '' }));
  settings.modifiers.forEach((step, index) => {
    const report = reports[index] ?? { outputs: 0, error: '' };
    const kind = modifierStackKindFind(step.kind);
    if (!kind) report.error = 'This modifier type is not installed; it passes its input through.';
    if (kind && step.enabled)
      units = modifierStackValidStepUnits(kind.apply(units, { ...shared, volume, step, report }), report);
    report.outputs = modifierStackBrushCount(units);
  });
  return { units, reports };
}

/**
 * Counts brushes in a working set.
 *
 * @param units Working set.
 * @returns Brush count.
 */
export function modifierStackBrushCount(units: readonly ModifierStackUnit[]): number {
  return units.reduce((sum, unit) => sum + unit.brushes.length, 0);
}

/**
 * Keeps only valid generated brushes of a step and reports the dropped ones.
 *
 * @param units Step output.
 * @param report Step report.
 * @returns Valid output.
 */
function modifierStackValidStepUnits(units: ModifierStackUnit[], report: ModifierStackStepReport): ModifierStackUnit[] {
  const valid = modifierStackValidUnits(units);
  if (valid.dropped > 0) report.error = `${report.error} Skipped ${valid.dropped} invalid generated brush(es).`.trim();
  return valid.units;
}
