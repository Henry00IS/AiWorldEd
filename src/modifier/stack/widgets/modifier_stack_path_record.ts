import type * as THREE from 'three';
import { pathAssetDecode, PATH_ASSET_DEFAULT, type PathAsset } from '@/path/model/path_asset.js';
import { solidScriptInputsList } from '@/solid_script/language/solid_script_input.js';
import type { SolidScriptDocument } from '@/solid_script/document/solid_script_document.js';
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
 * Path input whose line is on, or the default path when none is stored.
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
    .map((input) => ({
      stepId,
      key: `${stepId}:${input.name}`,
      name: input.name,
      label: input.label,
      path: pathAssetDecode(inputs?.[input.name] ?? input.fallback) ?? PATH_ASSET_DEFAULT,
      frame: frame.clone(),
    }));
  MODIFIER_STACK_PATHS.record(owner, stepId, paths);
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
