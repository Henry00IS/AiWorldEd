import { solidScriptListingOf } from './solid_script_command_listing.js';
import { solidScriptParameterOfWhere } from './solid_script_command_of_where.js';
import type { SolidScriptBlockRun } from '@/solid_script/language/solid_script_machine_types.js';
import { solidScriptMemberVector } from '@/solid_script/language/solid_script_members.js';
import {
  solidScriptPointsFromEdgeTargets,
  solidScriptPointsFromEdges,
  solidScriptPointsFromFaces,
  SolidScriptPointsFromItem,
  solidScriptPointsFromVertexTargets,
  solidScriptPointsFromVertices,
} from '@/solid_script/language/solid_script_points_from.js';
import { solidScriptGeometryFacesOutside } from '@/solid_script/language/solid_script_geometry.js';
import {
  solidScriptValueNumber,
  solidScriptValueNumbers,
  type SolidScriptValue,
} from '@/solid_script/language/solid_script_value.js';
import { SOLID_SCRIPT_LIMITS, solidScriptLimitCount } from '@/solid_script/language/solid_script_limits.js';
import { solidScriptParameterEach } from './solid_script_command_each.js';
import { SolidScriptCommand } from './solid_script_command.js';
import {
  solidScriptParameter,
  solidScriptParameterInto,
  solidScriptParameterOf,
} from './solid_script_command_parameters.js';
import { solidScriptFaceTargets, solidScriptFaceWrite } from './solid_script_face_of.js';

/**
 * Writes points and optional normals from a Points From line.
 *
 * @param run Running line.
 * @param items Points.
 */
function solidScriptPointsFromWrite(run: SolidScriptBlockRun, items: readonly SolidScriptPointsFromItem[]): void {
  const points: SolidScriptValue[] = items.map((item) => solidScriptMemberVector(item.position));
  const normals: SolidScriptValue[] = items.map((item) => solidScriptMemberVector(item.normal));
  solidScriptFaceWrite(run, 'into', points);
  solidScriptFaceWrite(run, 'normals', normals);
}

/**
 * Reads how many points a Points line makes: a whole number from 0 up to the
 * list cap.
 *
 * @param run Running line.
 * @returns Count.
 */
function solidScriptPointsCount(run: SolidScriptBlockRun): number {
  const count = solidScriptValueNumber(run.value('count'));
  const most = SOLID_SCRIPT_LIMITS.listItems;
  if (count === undefined || !Number.isInteger(count) || count < 0 || count > most)
    throw new Error(`Count needs a whole number from 0 to ${solidScriptLimitCount(most)}, such as 10`);
  return count;
}

/**
 * Makes Count points, each at the position At works out for its [$Index].
 *
 * @param run Running line.
 */
function solidScriptPointsRun(run: SolidScriptBlockRun): void {
  const count = solidScriptPointsCount(run);
  const points = Array.from({ length: count }, (_, index) => {
    const at = run.valueWith('at', { $Index: index, $Count: count });
    const numbers = solidScriptValueNumbers(at);
    if (numbers?.length !== 3)
      throw new Error('At needs three numbers for each point, such as [=Vector([$Index], 0, 0)]');
    return numbers;
  });
  solidScriptFaceWrite(run, 'into', points);
}

/** A Where for the hint of each kind of Points From line. */
const SOLID_SCRIPT_POINTS_WHERE_EXAMPLE = {
  Face: '[=[$Face.Normal.Y] > 0.9]',
  Edge: '[=[$Edge.Length] > 0.5]',
  Vertex: '[=[$Vertex.Position.Y] > 0]',
} as const;

/**
 * Shared Where, Into, Normals and Of fields of a Points From line.
 *
 * @param of What Of works on, such as faces or brushes.
 * @param fallback Selected list Of uses when empty, such as $Selected.Faces.
 * @param elements Kinds Of accepts.
 * @param each Kind of item Where reads.
 * @returns Fields.
 */
function solidScriptPointsFromFields(
  of: string,
  fallback: string,
  elements: readonly string[],
  each: 'Face' | 'Edge' | 'Vertex',
) {
  return [
    solidScriptParameterOfWhere(each, SOLID_SCRIPT_POINTS_WHERE_EXAMPLE[each]),
    solidScriptParameterOf(of, fallback, elements),
    {
      ...solidScriptParameterInto('the points, a list of vectors', 'Vector List', 'what is made', 'label'),
      hint: 'Variable to write the points to, a list of vectors, such as Path.',
    },
    {
      ...solidScriptParameterInto('the directions, a list of vectors', 'Vector List', 'directions', 'label'),
      key: 'normals',
      label: 'Normals',
      hint: 'Optional: variable to write the direction of each point, a list of vectors, such as Normals; left off writes none.',
    },
  ];
}

/** Commands that take points from faces, edges or vertices. */
export const SOLID_SCRIPT_COMMANDS_POINTS: readonly SolidScriptCommand[] = [
  new SolidScriptCommand({
    id: 'points',
    label: 'Points',
    category: 'Faces',
    description: 'Make a list of points from a formula',
    manual:
      'Makes Count points and writes them to Into, a list of vectors. At is worked out once per point, with [$Index] its number from 0 and [$Count] how many there are, so one line lays out a row, a ring or a spiral without Repeat and Add Item. Use the points with Place At Points, Path From Points or Sweep Along Path. Example: Points Count 8 At [=Vector(Cos([$Index] * 45) * 3, 0, Sin([$Index] * 45) * 3)] Into [Ring], then Place At Points At [Ring] with a Cylinder inside, makes a ring of 8 posts.',
    stops: ['A Count that is not a whole number from 0.', 'An At that is not three numbers.'],
    parameters: [
      solidScriptParameter('count', 'Count', 'count', '10', 'How many points to make, such as 10.'),
      solidScriptParameterEach(
        solidScriptParameter(
          'at',
          'At',
          'vector3',
          '[=Vector([$Index], 0, 0)]',
          'Where each point goes, such as [=Vector([$Index], 0, 0)] for a row 1 m apart.',
        ),
        'Index',
      ),
      {
        ...solidScriptParameterInto('the points, a list of vectors', 'Vector List', 'what is made', 'label'),
        hint: 'Variable to write the points to, a list of vectors, such as Points.',
      },
    ],
    listing: (read) => ['Points', read.value('count'), ' At ', read.value('at'), ' Into ', read.value('into')],
    execute: (run) => {
      solidScriptPointsRun(run);
      return [];
    },
  }),
  new SolidScriptCommand({
    id: 'points_from_faces',
    label: 'Points From Faces',
    category: 'Faces',
    description: 'Take a point at the center of each face',
    manual:
      'Writes a point at the center of each face in Of, and the way the face looks in Normals. Empty Of uses [$Selected.Faces]. Faces that lie back to back against another object in Of, inside the shape, are skipped. Use the points with Place At Points, and turn on Align To Normal so each copy stands the way Place On Face would. Example: Select Faces Facing Up, Points From Faces Into [Spots] Normals [Dirs], Place At Points At [Spots] Directions [Dirs] Align To Normal, Cylinder, End.',
    stops: ['No faces.'],
    parameters: [...solidScriptPointsFromFields('faces or objects', '$Selected.Faces', ['Object', 'Face'], 'Face')],
    listing: (read) => [
      'Points From Faces',
      ...solidScriptListingOf(read),
      ' Into ',
      read.value('into'),
      ...(read.text('normals') === '' ? [] : [' Normals ', read.value('normals')]),
    ],
    execute: (run) => {
      solidScriptPointsFromWrite(
        run,
        solidScriptPointsFromFaces(solidScriptGeometryFacesOutside(solidScriptFaceTargets(run, 'Points From Faces'))),
      );
      return [];
    },
  }),
  new SolidScriptCommand({
    id: 'points_from_edges',
    label: 'Points From Edges',
    category: 'Faces',
    description: 'Take a point at the middle of each edge',
    manual:
      'Writes a point at the middle of each edge in Of, and the way the edge looks out in Normals, from the faces that meet there. Of can be edges, faces or objects; empty uses [$Selected.Edges], or the edges of [$Selected.Faces]. Example: Select Faces Which All, Points From Edges Into [Spots] Normals [Dirs], then Place At Points At [Spots] Directions [Dirs] Align To Normal.',
    stops: ['No edges.'],
    parameters: solidScriptPointsFromFields(
      'edges, faces or objects',
      '$Selected.Edges',
      ['Object', 'Face', 'Edge'],
      'Edge',
    ),
    listing: (read) => [
      'Points From Edges',
      ...solidScriptListingOf(read),
      ' Into ',
      read.value('into'),
      ...(read.text('normals') === '' ? [] : [' Normals ', read.value('normals')]),
    ],
    execute: (run) => {
      solidScriptPointsFromWrite(
        run,
        solidScriptPointsFromEdges(solidScriptPointsFromEdgeTargets(run, 'Points From Edges')),
      );
      return [];
    },
  }),
  new SolidScriptCommand({
    id: 'points_from_vertices',
    label: 'Points From Vertices',
    category: 'Faces',
    description: 'Take a point at each vertex',
    manual:
      'Writes a point at each vertex in Of, and the average way of the faces around it in Normals. Of can be vertices, faces or objects; empty uses [$Selected.Vertices], or the vertices of [$Selected.Faces]. Example: Select Objects, Points From Vertices Into [Spots] Normals [Dirs].',
    stops: ['No vertices.'],
    parameters: solidScriptPointsFromFields(
      'vertices, faces or objects',
      '$Selected.Vertices',
      ['Object', 'Face', 'Vertex'],
      'Vertex',
    ),
    listing: (read) => [
      'Points From Vertices',
      ...solidScriptListingOf(read),
      ' Into ',
      read.value('into'),
      ...(read.text('normals') === '' ? [] : [' Normals ', read.value('normals')]),
    ],
    execute: (run) => {
      solidScriptPointsFromWrite(
        run,
        solidScriptPointsFromVertices(solidScriptPointsFromVertexTargets(run, 'Points From Vertices')),
      );
      return [];
    },
  }),
];
