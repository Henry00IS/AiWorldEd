import type { SolidScriptCommand, SolidScriptCommandCategory } from './solid_script_command.js';
import { SOLID_SCRIPT_COMMANDS_PLANAR, SOLID_SCRIPT_COMMANDS_SOLIDS } from './solid_script_commands_shapes.js';
import { SOLID_SCRIPT_COMMANDS_COMBINE, SOLID_SCRIPT_COMMANDS_TRANSFORMS } from './solid_script_commands_blocks.js';
import { SOLID_SCRIPT_COMMANDS_LOGIC } from './solid_script_commands_logic.js';
import { SOLID_SCRIPT_COMMANDS_MESHES } from './solid_script_commands_meshes.js';

/** Palette groups in palette order. */
export const SOLID_SCRIPT_COMMAND_CATEGORIES: readonly SolidScriptCommandCategory[] = [
  'Solids',
  '2D Shapes',
  'Transforms',
  'Combine',
  'Meshes',
  'Logic',
  'Parts',
];

/** Every command of the script editor, the palette and MCP, in palette order. */
export const solidScriptCommands: readonly SolidScriptCommand[] = [
  ...SOLID_SCRIPT_COMMANDS_SOLIDS,
  ...SOLID_SCRIPT_COMMANDS_PLANAR,
  ...SOLID_SCRIPT_COMMANDS_TRANSFORMS,
  ...SOLID_SCRIPT_COMMANDS_COMBINE,
  ...SOLID_SCRIPT_COMMANDS_MESHES,
  ...SOLID_SCRIPT_COMMANDS_LOGIC,
];

/**
 * Finds a command.
 *
 * @param id Stored command id.
 * @returns Command, or undefined when unknown.
 */
export function solidScriptCommandFind(id: string): SolidScriptCommand | undefined {
  return solidScriptCommands.find((command) => command.id === id);
}
