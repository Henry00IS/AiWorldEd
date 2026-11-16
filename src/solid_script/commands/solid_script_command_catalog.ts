import type { SolidScriptCommand, SolidScriptCommandCategory } from './solid_script_command.js';
import { SOLID_SCRIPT_COMMANDS_PLANAR, SOLID_SCRIPT_COMMANDS_SOLIDS } from './solid_script_commands_shapes.js';
import { SOLID_SCRIPT_COMMANDS_COMBINE, SOLID_SCRIPT_COMMANDS_TRANSFORMS } from './solid_script_commands_blocks.js';
import { SOLID_SCRIPT_COMMANDS_LISTS } from './solid_script_commands_lists.js';
import { SOLID_SCRIPT_COMMANDS_LOGIC } from './solid_script_commands_logic.js';
import { SOLID_SCRIPT_COMMANDS_MESHES } from './solid_script_commands_meshes.js';
import { SOLID_SCRIPT_COMMANDS_FACES } from './solid_script_commands_faces.js';
import { SOLID_SCRIPT_COMMANDS_PATHS } from './solid_script_commands_paths.js';
import { SOLID_SCRIPT_COMMANDS_GENERATORS } from './solid_script_commands_generators.js';
import { SOLID_SCRIPT_COMMANDS_PROGRAM } from './solid_script_commands_program.js';

/** Palette groups in palette order. */
export const SOLID_SCRIPT_COMMAND_CATEGORIES: readonly SolidScriptCommandCategory[] = [
  'Solids',
  'Generators',
  '2D Shapes',
  'Transforms',
  'Combine',
  'Meshes',
  'Faces',
  'Inputs',
  'Logic',
  'Lists',
  'Parts',
];

/** Every command of the script editor, the palette and MCP, in palette order. */
export const solidScriptCommands: readonly SolidScriptCommand[] = [
  ...SOLID_SCRIPT_COMMANDS_SOLIDS,
  ...SOLID_SCRIPT_COMMANDS_GENERATORS,
  ...SOLID_SCRIPT_COMMANDS_PLANAR,
  ...SOLID_SCRIPT_COMMANDS_TRANSFORMS,
  ...SOLID_SCRIPT_COMMANDS_COMBINE,
  ...SOLID_SCRIPT_COMMANDS_MESHES,
  ...SOLID_SCRIPT_COMMANDS_PATHS,
  ...SOLID_SCRIPT_COMMANDS_FACES,
  ...SOLID_SCRIPT_COMMANDS_LOGIC,
  ...SOLID_SCRIPT_COMMANDS_LISTS,
  ...SOLID_SCRIPT_COMMANDS_PROGRAM,
];

/** Commands by id. */
const SOLID_SCRIPT_COMMANDS_BY_ID: ReadonlyMap<string, SolidScriptCommand> = new Map(
  solidScriptCommands.map((command) => [command.id, command]),
);

/**
 * Finds a command.
 *
 * @param id Stored command id.
 * @returns Command, or undefined when unknown.
 */
export function solidScriptCommandFind(id: string): SolidScriptCommand | undefined {
  return SOLID_SCRIPT_COMMANDS_BY_ID.get(id);
}
