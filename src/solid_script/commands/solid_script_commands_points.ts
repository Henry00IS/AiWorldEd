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
import type { SolidScriptValue } from '@/solid_script/language/solid_script_value.js';
import { SolidScriptCommand } from './solid_script_command.js';
import { solidScriptParameterInto, solidScriptParameterOf } from './solid_script_command_parameters.js';
import { solidScriptFaceTargets, solidScriptFaceWrite } from './solid_script_face_of.js';

/**
 * Writes points and optional normals from a Points From line.
 *
 * @param run Running line.
 * @param label Command, for messages.
 * @param items Points.
 */
function solidScriptPointsFromWrite(
  run: SolidScriptBlockRun,
  label: string,
  items: readonly SolidScriptPointsFromItem[],
): void {
  if (items.length === 0) throw new Error(`${label} found no points`);
  const points: SolidScriptValue[] = items.map((item) => solidScriptMemberVector(item.position));
  const normals: SolidScriptValue[] = items.map((item) => solidScriptMemberVector(item.normal));
  solidScriptFaceWrite(run, 'into', points);
  solidScriptFaceWrite(run, 'normals', normals);
}

/**
 * Shared Into, Normals and Of fields of a Points From line.
 *
 * @param of What Of works on, such as faces or brushes.
 * @param fallback Selected list Of uses when empty, such as $Selected.Faces.
 * @param elements Kinds Of accepts.
 * @returns Fields.
 */
function solidScriptPointsFromFields(of: string, fallback: string, elements: readonly string[]) {
  return [
    solidScriptParameterOf(of, fallback, elements),
    {
      ...solidScriptParameterInto('the points, a list of vectors', 'Vector List', 'what is made'),
      hint: 'Variable to write the points to, a list of vectors.',
    },
    {
      ...solidScriptParameterInto('the directions, a list of vectors', 'Vector List', 'directions'),
      key: 'normals',
      label: 'Normals',
      hint: 'Optional: variable to write the direction of each point, a list of vectors.',
    },
  ];
}

/** Commands that take points from faces, edges or vertices. */
export const SOLID_SCRIPT_COMMANDS_POINTS: readonly SolidScriptCommand[] = [
  new SolidScriptCommand({
    id: 'points_from_faces',
    label: 'Points From Faces',
    category: 'Faces',
    description: 'Take a point at the center of each face',
    manual:
      'Writes a point at the center of each face in Of, and the way the face looks in Normals. Empty Of uses [$Selected.Faces]. Use the points with Place At Points, and turn on Align To Normal so each copy stands the way Place On Face would. Example: Select Faces Facing Up, Points From Faces Into [Spots] Normals [Dirs], Place At Points At [Spots] Directions [Dirs] Align To Normal, Cylinder, End.',
    stops: ['No faces.'],
    parameters: [...solidScriptPointsFromFields('faces or brushes', '$Selected.Faces', ['Brush', 'Face'])],
    listing: (read) => [
      'Points From Faces',
      ...(read.text('of') === '' ? [] : [' Of ', read.value('of')]),
      ' Into ',
      read.value('into'),
      ...(read.text('normals') === '' ? [] : [' Normals ', read.value('normals')]),
    ],
    execute: (run) => {
      solidScriptPointsFromWrite(
        run,
        'Points From Faces',
        solidScriptPointsFromFaces(solidScriptFaceTargets(run, 'Points From Faces')),
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
      'Writes a point at the middle of each edge in Of, and the way the edge looks out in Normals, from the faces that meet there. Of can be edges, faces or brushes; empty uses [$Selected.Edges], or the edges of [$Selected.Faces]. Example: Select Faces Which All, Points From Edges Into [Spots] Normals [Dirs], then Place At Points At [Spots] Directions [Dirs] Align To Normal.',
    stops: ['No edges.'],
    parameters: solidScriptPointsFromFields('edges, faces or brushes', '$Selected.Edges', ['Brush', 'Face', 'Edge']),
    listing: (read) => [
      'Points From Edges',
      ...(read.text('of') === '' ? [] : [' Of ', read.value('of')]),
      ' Into ',
      read.value('into'),
      ...(read.text('normals') === '' ? [] : [' Normals ', read.value('normals')]),
    ],
    execute: (run) => {
      solidScriptPointsFromWrite(
        run,
        'Points From Edges',
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
      'Writes a point at each vertex in Of, and the average way of the faces around it in Normals. Of can be vertices, faces or brushes; empty uses [$Selected.Vertices], or the vertices of [$Selected.Faces]. Example: Select Brushes, Points From Vertices Into [Spots] Normals [Dirs].',
    stops: ['No vertices.'],
    parameters: solidScriptPointsFromFields('vertices, faces or brushes', '$Selected.Vertices', [
      'Brush',
      'Face',
      'Vertex',
    ]),
    listing: (read) => [
      'Points From Vertices',
      ...(read.text('of') === '' ? [] : [' Of ', read.value('of')]),
      ' Into ',
      read.value('into'),
      ...(read.text('normals') === '' ? [] : [' Normals ', read.value('normals')]),
    ],
    execute: (run) => {
      solidScriptPointsFromWrite(
        run,
        'Points From Vertices',
        solidScriptPointsFromVertices(solidScriptPointsFromVertexTargets(run, 'Points From Vertices')),
      );
      return [];
    },
  }),
];
