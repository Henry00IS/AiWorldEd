import type { Object3D } from 'three';
import {
  solidScriptProgramRun,
  type SolidScriptProgram,
  type SolidScriptProgramOptions,
} from '@/solid_script/language/solid_script_program.js';
import type { SolidScriptRun } from '@/solid_script/language/solid_script_machine_types.js';

/** The last run of a step's script, with what it ran from. */
interface ModifierStackSolidScriptSharedRun {
  /** Lines and run options, as text. */
  readonly key: string;
  /** Run result. */
  readonly run: SolidScriptRun;
  /** True when the run timed its lines. */
  readonly profiled: boolean;
  /**
   * True when the inspector or the editor made it and the stack has not used it
   * yet.
   */
  fresh: boolean;
}

/** Last run of each step's script, by owner, then by step id. */
const modifierStackSolidScriptRuns = new WeakMap<Object3D, Map<string, ModifierStackSolidScriptSharedRun>>();

/** Steps whose script editor is open, so every run of them times its lines. */
const modifierStackSolidScriptRunsTimed = new WeakMap<Object3D, Set<string>>();

/**
 * Writes lines and run options as text in which equal values read the same:
 * keys sorted, and minus zero and numbers JSON cannot hold kept apart.
 *
 * @param program Lines.
 * @param options Run options; whether to time lines is left out.
 * @returns Key.
 */
function modifierStackSolidScriptRunKey(program: SolidScriptProgram, options: SolidScriptProgramOptions): string {
  const { profile: _profile, ...rest } = options;
  return JSON.stringify([program.blocks, rest], (_name, value: unknown) => {
    if (typeof value === 'number') return Object.is(value, -0) || !Number.isFinite(value) ? `#${value}` : value;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  });
}

/**
 * Runs a step's script and keeps the run as its last.
 *
 * @param owner Volume, brush or group owning the stack.
 * @param stepId Step id.
 * @param program Lines.
 * @param options Run options.
 * @param key Key of the lines and options.
 * @param fresh True when the inspector or the editor asks.
 * @returns Run.
 */
function modifierStackSolidScriptRunKeep(
  owner: Object3D,
  stepId: string,
  program: SolidScriptProgram,
  options: SolidScriptProgramOptions,
  key: string,
  fresh: boolean,
): SolidScriptRun {
  const profiled = options.profile === true || modifierStackSolidScriptRunsTimed.get(owner)?.has(stepId) === true;
  const run = solidScriptProgramRun(program, { ...options, profile: profiled });
  let bySteps = modifierStackSolidScriptRuns.get(owner);
  if (!bySteps) modifierStackSolidScriptRuns.set(owner, (bySteps = new Map()));
  bySteps.set(stepId, { key, run, profiled, fresh });
  return run;
}

/**
 * Runs a step's script for the stack to build, or takes the run the inspector
 * or the editor made of the same lines and options since the stack last ran it,
 * so one edit runs the script once. A run the stack made itself is never taken
 * again: every build runs the script as before.
 *
 * @param owner Volume, brush or group owning the stack.
 * @param stepId Step id.
 * @param program Lines.
 * @param options Run options.
 * @returns Run.
 */
export function modifierStackSolidScriptRunBuilt(
  owner: Object3D,
  stepId: string,
  program: SolidScriptProgram,
  options: SolidScriptProgramOptions,
): SolidScriptRun {
  const key = modifierStackSolidScriptRunKey(program, options);
  const last = modifierStackSolidScriptRuns.get(owner)?.get(stepId);
  if (!last?.fresh || last.key !== key)
    return modifierStackSolidScriptRunKeep(owner, stepId, program, options, key, false);
  last.fresh = false;
  return last.run;
}

/**
 * Runs a step's script for the inspector or the editor to show, or takes the
 * step's last run when it ran the same lines with the same options and, when
 * asked, timed its lines.
 *
 * @param owner Volume, brush or group owning the stack.
 * @param stepId Step id.
 * @param program Lines.
 * @param options Run options.
 * @returns Run.
 */
export function modifierStackSolidScriptRunShown(
  owner: Object3D,
  stepId: string,
  program: SolidScriptProgram,
  options: SolidScriptProgramOptions,
): SolidScriptRun {
  const key = modifierStackSolidScriptRunKey(program, options);
  const last = modifierStackSolidScriptRuns.get(owner)?.get(stepId);
  if (last && last.key === key && (last.profiled || options.profile !== true)) return last.run;
  return modifierStackSolidScriptRunKeep(owner, stepId, program, options, key, true);
}

/**
 * Makes every run of a step's script time its lines while its editor is open,
 * so the editor can show the run the stack or the inspector made.
 *
 * @param owner Volume, brush or group owning the stack.
 * @param stepId Step id.
 * @param timed True while the editor is open.
 */
export function modifierStackSolidScriptRunTimed(owner: Object3D, stepId: string, timed: boolean): void {
  let steps = modifierStackSolidScriptRunsTimed.get(owner);
  if (!steps) modifierStackSolidScriptRunsTimed.set(owner, (steps = new Set()));
  if (timed) steps.add(stepId);
  else steps.delete(stepId);
}
