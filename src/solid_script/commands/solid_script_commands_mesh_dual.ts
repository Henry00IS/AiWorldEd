import { solidScriptListingOf, solidScriptListingOptions } from './solid_script_command_listing.js';
import { SolidScriptCommand } from './solid_script_command.js';
import { solidScriptParameterOfWhere } from './solid_script_command_of_where.js';
import { solidScriptParameter, solidScriptParameterOf } from './solid_script_command_parameters.js';
import { solidScriptMeshApply } from './solid_script_commands_meshes.js';
import { solidScriptMeshDual } from '@/solid_script/language/solid_script_mesh_dual.js';

/** The command that swaps the faces and corners of a mesh. */
export const SOLID_SCRIPT_COMMANDS_MESH_DUAL: SolidScriptCommand[] = [
  new SolidScriptCommand({
    id: 'dual_mesh',
    edits: true,
    label: 'Dual Mesh',
    category: 'Meshes',
    description: 'Swap the faces and corners of a mesh',
    manual:
      'Builds the dual of each mesh in Of that passes the 🔁 Where: a corner at the middle of every face, and a face for every corner joining the middles of the faces round it, so a cube becomes an octahedron and a triangle sphere becomes a ball of hexagons. Corners on an open edge make no face, unless Keep Boundaries is Yes: then their face also runs through the middles of their two open edges and the corner itself. Corners with fewer than three faces round them, or where more than two faces share an edge, make no face. Texture coordinates are reset. Of is the mesh; empty uses [$Selected.Objects]. A solid stops the line: wrap it in Mesh From Solids first. Example: Icosphere Mesh, then Dual Mesh, gives a football.',
    stops: [
      'A mesh with no corner that has a full ring of faces.',
      'A solid. Wrap it in Mesh From Solids first.',
      'No mesh to work on.',
    ],
    parameters: [
      solidScriptParameter(
        'keep_boundaries',
        'Keep Boundaries',
        'boolean',
        'No',
        'Yes: corners on an open edge, such as the border of a Grid Mesh, also make faces. Type Yes or No, such as Yes.',
      ),
      solidScriptParameterOfWhere('Object', '[=[$Object.Center.Y] > 0]'),
      solidScriptParameterOf('meshes', '$Selected.Objects', ['Object']),
    ],
    listing: (read) => [
      'Dual Mesh',
      ...solidScriptListingOptions([read.on('keep_boundaries') && ['Keep Boundaries']]),
      ...solidScriptListingOf(read),
    ],
    execute: (run) => {
      const keep = run.fields().flag('keep_boundaries');
      return solidScriptMeshApply(run, 'Dual Mesh', (mesh) => solidScriptMeshDual(mesh, keep));
    },
  }),
];
