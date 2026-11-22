import { solidScriptParameterMode } from './solid_script_command_parameters.js';
import type { SolidScriptCommandParameter } from './solid_script_command.js';
import type { SolidScriptBlockRun } from '@/solid_script/language/solid_script_machine_types.js';
import type { SolidScriptShapeMesh } from '@/solid_script/language/solid_script_mesh.js';
import { solidScriptModeOf } from '@/solid_script/language/solid_script_mode.js';

/**
 * The Mode field of a mesh block: how the mesh combines with the meshes before
 * it.
 *
 * @returns Parameter.
 */
export function solidScriptParameterMeshMode(): SolidScriptCommandParameter {
  return {
    ...solidScriptParameterMode(),
    hint: 'How this mesh combines with the meshes before it on its level: Additive adds it, Subtractive cuts it out of them, Intersecting keeps only the overlap. Type one word, such as Subtractive to cut a hole in a model.',
  };
}

/**
 * Gives a mesh the Mode its line set, if any.
 *
 * @param run Running line.
 * @param mesh Mesh.
 * @returns Mesh with its Mode.
 */
export function solidScriptMeshModeSet(run: SolidScriptBlockRun, mesh: SolidScriptShapeMesh): SolidScriptShapeMesh {
  const mode = solidScriptModeOf(run.text('mode'));
  return mode === undefined || mode === 'Additive' ? mesh : { ...mesh, mode };
}
