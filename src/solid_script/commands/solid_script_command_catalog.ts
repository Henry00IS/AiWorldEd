import type { SolidScriptCommand, SolidScriptCommandCategory } from './solid_script_command.js';
import { SOLID_SCRIPT_COMMANDS_PLANAR, SOLID_SCRIPT_COMMANDS_SOLIDS } from './solid_script_commands_shapes.js';
import { SOLID_SCRIPT_COMMANDS_COMBINE, SOLID_SCRIPT_COMMANDS_TRANSFORMS } from './solid_script_commands_blocks.js';
import { SOLID_SCRIPT_COMMANDS_TRANSFORM } from './solid_script_commands_transform.js';
import { SOLID_SCRIPT_COMMANDS_ARRAY } from './solid_script_commands_array.js';
import { SOLID_SCRIPT_COMMANDS_LISTS } from './solid_script_commands_lists.js';
import { SOLID_SCRIPT_COMMANDS_LOGIC } from './solid_script_commands_logic.js';
import { SOLID_SCRIPT_COMMANDS_MESH_EDGES } from './solid_script_commands_mesh_edges.js';
import { SOLID_SCRIPT_COMMANDS_SCALE_EDGES } from './solid_script_commands_scale_edges.js';
import { SOLID_SCRIPT_COMMANDS_SHORTEST_PATHS } from './solid_script_commands_shortest_paths.js';
import { SOLID_SCRIPT_COMMANDS_FACE_GROUPS } from './solid_script_commands_face_groups.js';
import { SOLID_SCRIPT_COMMANDS_PATH_HANDLES } from './solid_script_commands_path_handles.js';
import { SOLID_SCRIPT_COMMANDS_PATH_FROM } from './solid_script_commands_path_from.js';
import { SOLID_SCRIPT_COMMANDS_MESH_FACES } from './solid_script_commands_mesh_faces.js';
import { SOLID_SCRIPT_COMMANDS_MESHES } from './solid_script_commands_meshes.js';
import { SOLID_SCRIPT_COMMANDS_FILL } from './solid_script_commands_fill.js';
import { SOLID_SCRIPT_COMMANDS_FACES } from './solid_script_commands_faces.js';
import { SOLID_SCRIPT_COMMANDS_DELETE } from './solid_script_commands_delete.js';
import { SOLID_SCRIPT_COMMANDS_BEVEL } from './solid_script_commands_bevel.js';
import { SOLID_SCRIPT_COMMANDS_SHADING } from './solid_script_commands_shading.js';
import { SOLID_SCRIPT_COMMANDS_POINTS } from './solid_script_commands_points.js';
import { SOLID_SCRIPT_COMMANDS_POSITIONS } from './solid_script_commands_positions.js';
import { SOLID_SCRIPT_COMMANDS_DATA } from './solid_script_commands_data.js';
import { SOLID_SCRIPT_COMMANDS_DATA_KEYS } from './solid_script_commands_data_keys.js';
import { SOLID_SCRIPT_COMMANDS_TAGS } from './solid_script_commands_tags.js';
import { SOLID_SCRIPT_COMMANDS_UVS } from './solid_script_commands_uvs.js';
import { SOLID_SCRIPT_COMMANDS_SELECT } from './solid_script_commands_select.js';
import { SOLID_SCRIPT_COMMANDS_PATHS } from './solid_script_commands_paths.js';
import { SOLID_SCRIPT_COMMANDS_GENERATORS } from './solid_script_commands_generators.js';
import { SOLID_SCRIPT_COMMANDS_PROGRAM } from './solid_script_commands_program.js';
import { SOLID_SCRIPT_COMMANDS_QUERY } from './solid_script_commands_query.js';
import { SOLID_SCRIPT_COMMANDS_CLIP } from './solid_script_commands_clip.js';
import { SolidScriptCommandCatalog } from './solid_script_command_catalog_base.js';
import { SOLID_SCRIPT_COMMAND_INPUT } from '@/solid_script/language/solid_script_input.js';

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
  ...SOLID_SCRIPT_COMMANDS_TRANSFORM,
  ...SOLID_SCRIPT_COMMANDS_ARRAY,
  ...SOLID_SCRIPT_COMMANDS_TRANSFORMS,
  ...SOLID_SCRIPT_COMMANDS_CLIP,
  ...SOLID_SCRIPT_COMMANDS_COMBINE,
  ...SOLID_SCRIPT_COMMANDS_MESHES,
  ...SOLID_SCRIPT_COMMANDS_FILL,
  ...SOLID_SCRIPT_COMMANDS_MESH_FACES,
  ...SOLID_SCRIPT_COMMANDS_MESH_EDGES,
  ...SOLID_SCRIPT_COMMANDS_SCALE_EDGES,
  ...SOLID_SCRIPT_COMMANDS_SHORTEST_PATHS,
  ...SOLID_SCRIPT_COMMANDS_FACE_GROUPS,
  ...SOLID_SCRIPT_COMMANDS_PATH_HANDLES,
  ...SOLID_SCRIPT_COMMANDS_PATH_FROM,
  ...SOLID_SCRIPT_COMMANDS_PATHS,
  ...SOLID_SCRIPT_COMMANDS_FACES.slice(0, 1),
  ...SOLID_SCRIPT_COMMANDS_SELECT,
  ...SOLID_SCRIPT_COMMANDS_FACES.slice(1),
  ...SOLID_SCRIPT_COMMANDS_BEVEL,
  ...SOLID_SCRIPT_COMMANDS_DELETE,
  ...SOLID_SCRIPT_COMMANDS_SHADING,
  ...SOLID_SCRIPT_COMMANDS_POINTS,
  ...SOLID_SCRIPT_COMMANDS_POSITIONS,
  ...SOLID_SCRIPT_COMMANDS_DATA,
  ...SOLID_SCRIPT_COMMANDS_DATA_KEYS,
  ...SOLID_SCRIPT_COMMANDS_TAGS,
  ...SOLID_SCRIPT_COMMANDS_QUERY,
  ...SOLID_SCRIPT_COMMANDS_UVS,
  ...SOLID_SCRIPT_COMMANDS_LOGIC,
  ...SOLID_SCRIPT_COMMANDS_LISTS,
  ...SOLID_SCRIPT_COMMANDS_PROGRAM,
];

/** Favorite command ids before the user changes them: Note, Echo, Set and Input. */
export const SOLID_SCRIPT_EDITOR_FAVORITES_DEFAULT: readonly string[] = [
  'note',
  'echo',
  'variable',
  SOLID_SCRIPT_COMMAND_INPUT,
];

/** The script editor's commands. */
export const SOLID_SCRIPT_COMMAND_CATALOG = new SolidScriptCommandCatalog(
  'script',
  SOLID_SCRIPT_COMMAND_CATEGORIES,
  solidScriptCommands,
  SOLID_SCRIPT_EDITOR_FAVORITES_DEFAULT,
);

/**
 * Finds a command of the script editor.
 *
 * @param id Stored command id.
 * @returns Command, or undefined when unknown.
 */
export function solidScriptCommandFind(id: string): SolidScriptCommand | undefined {
  return SOLID_SCRIPT_COMMAND_CATALOG.find(id);
}

/**
 * Palette commands of one group of the script editor, sorted by their display
 * name.
 *
 * @param category Palette group.
 * @returns Commands of that group, sorted by label.
 */
export function solidScriptCommandsOfCategory(category: SolidScriptCommandCategory): SolidScriptCommand[] {
  return SOLID_SCRIPT_COMMAND_CATALOG.ofCategory(category);
}

/**
 * Returns whether a command must keep brushes as brushes. Only Mesh, Mesh From
 * Solids, Grid Mesh and Fill Paths may emit a mesh; every other command either
 * keeps a brush or stops with a plain error.
 *
 * @param command Command.
 * @returns True when the command must not emit a mesh from a brush.
 */
export function solidScriptCommandPreservesBrushes(command: SolidScriptCommand): boolean {
  return !['mesh', 'mesh_from_solids', 'grid_mesh', 'icosphere_mesh', 'fill_paths'].includes(command.id);
}
