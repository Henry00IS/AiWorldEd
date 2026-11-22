import { SolidScriptCommand } from './solid_script_command.js';
import { solidScriptListingOf } from './solid_script_command_listing.js';
import { solidScriptParameterOfWhere } from './solid_script_command_of_where.js';
import { solidScriptParameterInto, solidScriptParameterOf } from './solid_script_command_parameters.js';
import { solidScriptMeshEdgesPicked } from './solid_script_commands_mesh_edges.js';
import { solidScriptFaceTargets, solidScriptFaceWrite } from './solid_script_face_of.js';
import { solidScriptPathChains } from '@/solid_script/language/solid_script_path_chains.js';

/** The Into field of both lines: a list of Paths. */
const SOLID_SCRIPT_PATH_FROM_INTO = {
  ...solidScriptParameterInto('the paths, a list of Paths', 'Path List', 'what is made', 'label'),
  hint: 'Variable to write the paths to, a list of Paths, such as Rims.',
  optional: false,
  default: 'Paths',
} as const;

/** Path From Edges and Path From Faces: paths along mesh or solid edges. */
export const SOLID_SCRIPT_COMMANDS_PATH_FROM: readonly SolidScriptCommand[] = [
  new SolidScriptCommand({
    id: 'path_from_edges',
    label: 'Path From Edges',
    category: 'Paths',
    description: 'Turn edges into paths',
    manual:
      'Joins edges that share corners into Paths and writes them to Into as a list of Paths. A path runs on through every corner where exactly two of the edges meet and stops at an open end or where three or more meet; edges that go all the way round give a closed path. Of gives edges, or the edges of faces or objects; empty uses [$Selected.Edges], else the edges of [$Selected.Faces], else every edge of [$Selected.Objects]. Where is a 🔁 condition an edge must pass. Example: Path From Edges Of [Box.Faces] Where [=[$Edge.Angle] > 30] Into [Rims], then For Each Rim In [Rims], Sweep Along Path along [Rim].',
    stops: ['No edges.', 'An empty Into.'],
    parameters: [
      solidScriptParameterOfWhere('Edge', '[=[$Edge.Angle] > 30]'),
      solidScriptParameterOf('edges, faces or objects', '$Selected.Edges', ['Edge', 'Face', 'Object']),
      SOLID_SCRIPT_PATH_FROM_INTO,
    ],
    listing: (read) => ['Path From Edges', ...solidScriptListingOf(read), ' Into ', read.value('into')],
    execute: (run) => {
      const edges = solidScriptMeshEdgesPicked(run, 'Path From Edges');
      if (edges.length === 0) throw new Error('Path From Edges has no edges; check Of and Where');
      const chains = solidScriptPathChains(edges.map((edge) => [edge.start, edge.end] as const));
      solidScriptFaceWrite(run, 'into', run.pathsMake(chains));
      return [];
    },
  }),
  new SolidScriptCommand({
    id: 'path_from_faces',
    label: 'Path From Faces',
    category: 'Paths',
    description: 'Turn the edges round each face into closed paths',
    manual:
      'Writes the edges round each face to Into as a list of closed Paths, one per face, running round its corners in order. Of gives faces or objects; empty uses [$Selected.Faces]. Where is a 🔁 condition a face must pass. Example: Path From Faces Of [Box] Where [=[$Face.Normal.Y] > 0.9] Into [Tops], then Sweep Along Path along [Tops(0)] with a small Radius trims the top.',
    stops: ['No faces.', 'An empty Into.'],
    parameters: [
      solidScriptParameterOfWhere('Face', '[=[$Face.Normal.Y] > 0.9]'),
      solidScriptParameterOf('faces, objects', '$Selected.Faces'),
      SOLID_SCRIPT_PATH_FROM_INTO,
    ],
    listing: (read) => ['Path From Faces', ...solidScriptListingOf(read), ' Into ', read.value('into')],
    execute: (run) => {
      const faces = solidScriptFaceTargets(run, 'Path From Faces');
      solidScriptFaceWrite(run, 'into', run.pathsMake(faces.map((face) => ({ points: face.corners, closed: true }))));
      return [];
    },
  }),
];
