import type { SolidScriptCommand, SolidScriptCommandCategory } from './solid_script_command.js';
import { SOLID_SCRIPT_COMMANDS_PLANAR, SOLID_SCRIPT_COMMANDS_SOLIDS } from './solid_script_commands_shapes.js';
import { SOLID_SCRIPT_COMMANDS_COMBINE, SOLID_SCRIPT_COMMANDS_TRANSFORMS } from './solid_script_commands_blocks.js';
import { SOLID_SCRIPT_COMMANDS_LISTS } from './solid_script_commands_lists.js';
import { SOLID_SCRIPT_COMMANDS_LOGIC } from './solid_script_commands_logic.js';
import { SOLID_SCRIPT_COMMANDS_MESHES } from './solid_script_commands_meshes.js';
import { SOLID_SCRIPT_COMMANDS_FACES } from './solid_script_commands_faces.js';
import { SOLID_SCRIPT_COMMANDS_UVS } from './solid_script_commands_uvs.js';
import { SOLID_SCRIPT_COMMANDS_SELECT } from './solid_script_commands_select.js';
import { SOLID_SCRIPT_COMMANDS_PATHS } from './solid_script_commands_paths.js';
import { SOLID_SCRIPT_COMMANDS_GENERATORS } from './solid_script_commands_generators.js';
import { SOLID_SCRIPT_COMMANDS_PROGRAM } from './solid_script_commands_program.js';
import { SOLID_SCRIPT_COMMANDS_QUERY } from './solid_script_commands_query.js';

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
  ...SOLID_SCRIPT_COMMANDS_FACES.slice(0, 1),
  ...SOLID_SCRIPT_COMMANDS_SELECT,
  ...SOLID_SCRIPT_COMMANDS_FACES.slice(1),
  ...SOLID_SCRIPT_COMMANDS_QUERY,
  ...SOLID_SCRIPT_COMMANDS_UVS,
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

/**
 * Palette commands of one group, sorted by their display name so a new command
 * appears in order without hand-sorting the registry.
 *
 * @param category Palette group.
 * @returns Commands of that group, sorted by label.
 */
export function solidScriptCommandsOfCategory(category: SolidScriptCommandCategory): SolidScriptCommand[] {
  return solidScriptCommands
    .filter((command) => command.inPalette && command.category === category)
    .slice()
    .sort((left, right) => left.label.localeCompare(right.label));
}

/**
 * Returns whether a command must keep brushes as brushes: it builds or wraps
 * shapes and is not a mesh block, which may turn brushes into a mesh.
 *
 * @param command Command.
 * @returns True when a brush put into or built by the command must stay a
 *   brush.
 */
export function solidScriptCommandPreservesBrushes(command: SolidScriptCommand): boolean {
  return command.category !== 'Meshes' && (command.builds || command.nesting === 'open');
}
