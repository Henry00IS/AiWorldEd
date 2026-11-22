import { SolidScriptCommand } from './solid_script_command.js';
import { solidScriptListingOf } from './solid_script_command_listing.js';
import { solidScriptParameterOfWhere } from './solid_script_command_of_where.js';
import {
  solidScriptParameter,
  solidScriptParameterOf,
  solidScriptParameterOptional,
} from './solid_script_command_parameters.js';
import { solidScriptFaceGroups } from './solid_script_face_of.js';
import { solidScriptMeshEdgesPicked } from './solid_script_commands_mesh_edges.js';
import { solidScriptScaleFacesVector } from './solid_script_scale_faces_how.js';
import type { SolidScriptBlockRun } from '@/solid_script/language/solid_script_machine_types.js';
import { solidScriptScaleElements } from '@/solid_script/language/solid_script_scale_faces.js';
import { solidScriptValueNumber } from '@/solid_script/language/solid_script_value.js';

/**
 * Scales the picked edges of every brush or mesh they belong to, joined edges
 * as one island about the average of their Centers.
 *
 * @param run Running line.
 */
function solidScriptScaleEdgesRun(run: SolidScriptBlockRun): void {
  const factor = solidScriptValueNumber(run.value('factor'));
  if (factor === undefined) throw new Error('Scale Edges needs a Factor, such as 1 or 0.5');
  const center = solidScriptScaleFacesVector(run.value('center'), 'Center');
  const axis = solidScriptScaleFacesVector(run.value('axis'), 'Axis');
  if (axis && axis.lengthSq() < 1e-18) throw new Error('Axis needs a direction that is not 0, 0, 0');
  const edges = solidScriptMeshEdgesPicked(run, 'Scale Edges');
  for (const [leaf, held] of solidScriptFaceGroups(edges, (edge) => edge.faces[0].leaf)) {
    const elements = held.map((edge) => ({
      corners: [edge.start, edge.end],
      how: {
        factor,
        center: center ?? edge.start.clone().lerp(edge.end, 0.5),
        axis: axis?.clone().normalize() ?? null,
      },
    }));
    run.leafReplace(leaf, solidScriptScaleElements(leaf, elements, 'Scale Edges'));
  }
}

/** Scale Edges. */
export const SOLID_SCRIPT_COMMANDS_SCALE_EDGES: readonly SolidScriptCommand[] = [
  new SolidScriptCommand({
    id: 'scale_edges',
    edits: true,
    label: 'Scale Edges',
    category: 'Edges',
    description: 'Grow or shrink edges about their middle',
    manual:
      'Moves the corners of edges toward or away from their middle. Edges that share corners scale as one island about the average of their midpoints, so a rim or a border loop shrinks as a whole, while edges that touch nothing scale about their own midpoints. Factor is how much: 0.5 halves, 2 doubles, 0 pulls each island into one point. Center is the point to scale about instead. Axis scales only along that direction. Of gives edges, or the edges of faces or objects; empty uses [$Selected.Edges], else the edges of [$Selected.Faces], else every edge of [$Selected.Objects]. Where is a 🔁 condition an edge must pass. Example: Grid Mesh, then Scale Edges By 0.5 Where [$Edge.IsBoundary] pulls its border in to half size.',
    stops: ['No edges.', 'A Factor that is not a number.', 'A Center or Axis that is not three numbers.'],
    parameters: [
      solidScriptParameter(
        'factor',
        'Factor',
        'number',
        '1',
        'How much to scale, such as 0.5. 1 leaves the edges as they are.',
      ),
      solidScriptParameterOptional(
        'center',
        'Center',
        'vector3',
        'Point to scale about, such as 0, 0, 0. Left off uses the middle of each island.',
      ),
      solidScriptParameterOptional(
        'axis',
        'Axis',
        'vector3',
        'Direction to scale along only, such as 1, 0, 0. Left off scales every way.',
      ),
      solidScriptParameterOfWhere('Edge', '[$Edge.IsBoundary]'),
      solidScriptParameterOf('edges, faces or objects', '$Selected.Edges', ['Edge', 'Face', 'Object']),
    ],
    listing: (read) => ['Scale Edges', ' By ', read.value('factor'), ...solidScriptListingOf(read)],
    execute: (run) => {
      solidScriptScaleEdgesRun(run);
      return [];
    },
  }),
];
