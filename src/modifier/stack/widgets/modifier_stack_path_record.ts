import { solidScriptInputResourceResolved } from '@/solid_script/language/solid_script_input_resource.js';
import type * as THREE from 'three';
import { PATH_ASSET_DEFAULT, type PathAsset } from '@/path/model/path_asset.js';
import { solidScriptInputsList } from '@/solid_script/language/solid_script_input.js';
import { solidScriptInputEffectiveValue } from '@/solid_script/language/solid_script_input_effective.js';
import { solidScriptPathAssetFromText } from '@/solid_script/language/solid_script_input_path.js';
import type { SolidScriptDocument } from '@/solid_script/document/solid_script_document.js';
import { pathReferenceRead } from '@/path/model/path_reference.js';
import { ModifierStackStepRecord } from './modifier_stack_step_record.js';

/** A Path input of a step, drawn and edited in the scene. */
export interface ModifierStackPath {
  /** Id of the step whose input it is. */
  stepId: string;
  /** Key that stays the same between evaluations of the step. */
  key: string;
  /** Name of the Input the path is stored in. */
  name: string;
  /** Caption of the Input. */
  label: string;
  /** Path as stored, in script coordinates. */
  path: PathAsset;
  /** Matrix from script coordinates to the world. */
  frame: THREE.Matrix4;
}

/** Path inputs each step had at its last evaluation, by stack owner and step id. */
const MODIFIER_STACK_PATHS = new ModifierStackStepRecord<ModifierStackPath>();

/**
 * Keeps the Path inputs of a script step as it ran: the stored path of each
 * Path input whose line is on, or the default path when none is stored (the
 * Path resource its Default picks, if any; other resources are not shown).
 * Inputs that follow a Path object are left out: they are edited on that
 * object.
 *
 * @param owner Stack owner.
 * @param stepId Step id.
 * @param document Script.
 * @param inputs Stored input values by name.
 * @param frame Matrix from script coordinates to the world.
 */
export function modifierStackPathsRecord(
  owner: THREE.Object3D,
  stepId: string,
  document: SolidScriptDocument,
  inputs: Readonly<Record<string, string>> | undefined,
  frame: THREE.Matrix4,
): void {
  const paths = solidScriptInputsList(document.blocks.filter((block) => !block.off))
    .filter((input) => input.type === 'Path')
    .map((input) => solidScriptInputResourceResolved(input, document.resources ?? []))
    .map((input) => ({ input, value: solidScriptInputEffectiveValue(input, inputs?.[input.name]) }))
    .filter(({ value }) => pathReferenceRead(value) === null)
    .map(({ input, value }) =>
      modifierStackPathOf(stepId, input, solidScriptPathAssetFromText(value) ?? PATH_ASSET_DEFAULT, frame),
    );
  MODIFIER_STACK_PATHS.record(owner, stepId, paths);
}

/**
 * Keeps the one path a step edits, such as the path of a Path object.
 *
 * @param owner Stack owner.
 * @param stepId Step id.
 * @param input Name of the input the path is stored in, and its caption.
 * @param input.name Input name.
 * @param input.label Caption.
 * @param path Path as stored.
 * @param frame Matrix from the path's coordinates to the world.
 */
export function modifierStackPathRecord(
  owner: THREE.Object3D,
  stepId: string,
  input: { name: string; label: string },
  path: PathAsset,
  frame: THREE.Matrix4,
): void {
  MODIFIER_STACK_PATHS.record(owner, stepId, [modifierStackPathOf(stepId, input, path, frame)]);
}

/**
 * Builds the record of one path.
 *
 * @param stepId Step id.
 * @param input Name of the input the path is stored in, and its caption.
 * @param input.name Input name.
 * @param input.label Caption.
 * @param path Path as stored.
 * @param frame Matrix from the path's coordinates to the world.
 * @returns Record.
 */
function modifierStackPathOf(
  stepId: string,
  input: { name: string; label: string },
  path: PathAsset,
  frame: THREE.Matrix4,
): ModifierStackPath {
  return { stepId, key: `${stepId}:${input.name}`, name: input.name, label: input.label, path, frame: frame.clone() };
}

/**
 * Returns the Path inputs a step had at its last evaluation.
 *
 * @param owner Stack owner.
 * @param stepId Step id.
 * @returns Paths; empty before the step is evaluated.
 */
export function modifierStackPathsRecorded(owner: THREE.Object3D, stepId: string): ModifierStackPath[] {
  return MODIFIER_STACK_PATHS.recorded(owner, stepId);
}
