import { SolidScriptCommand } from './solid_script_command.js';
import { solidScriptParameterEach } from './solid_script_command_each.js';
import { solidScriptListingOf } from './solid_script_command_listing.js';
import { solidScriptParameterOfWhere } from './solid_script_command_of_where.js';
import {
  solidScriptParameterInto,
  solidScriptParameterOf,
  solidScriptParameterOptional,
} from './solid_script_command_parameters.js';
import { solidScriptFaceGroups, solidScriptFaceTargets, solidScriptFaceWrite } from './solid_script_face_of.js';
import { solidScriptConditionHolds } from '@/solid_script/language/solid_script_condition.js';
import { solidScriptFaceIslands } from '@/solid_script/language/solid_script_face_islands.js';
import { solidScriptGeometryEdges, type SolidScriptEdgeFacts } from '@/solid_script/language/solid_script_geometry.js';
import type { SolidScriptBlockRun } from '@/solid_script/language/solid_script_machine_types.js';
import type { SolidScriptValue } from '@/solid_script/language/solid_script_value.js';

/**
 * Groups the faces of Of that pass Where, object by object, joining faces
 * across every shared edge that does not pass Cut.
 *
 * @param run Running line.
 * @returns One Face List per group.
 */
function solidScriptFaceGroupsRun(run: SolidScriptBlockRun): SolidScriptValue[] {
  const faces = solidScriptFaceTargets(run, 'Face Groups');
  const cuts = run.source('cut').trim() !== '';
  const joins = (edge: SolidScriptEdgeFacts, index: number): boolean =>
    !cuts || !solidScriptConditionHolds(run, 'cut', () => ({ $Edge: run.elements.edge(edge), $Index: index }));
  return [...solidScriptFaceGroups(faces, (face) => face.leaf)].flatMap(([leaf, held]) =>
    solidScriptFaceIslands(held, solidScriptGeometryEdges([leaf]), joins).map((group) =>
      group.map((face) => run.elements.face(face)).filter((face, at, all) => all.indexOf(face) === at),
    ),
  );
}

/** Face Groups. */
export const SOLID_SCRIPT_COMMANDS_FACE_GROUPS: readonly SolidScriptCommand[] = [
  new SolidScriptCommand({
    id: 'face_groups',
    label: 'Face Groups',
    category: 'Faces',
    description: 'Split faces into groups at chosen edges',
    manual:
      'Splits faces into groups, object by object, of faces joined through shared edges, and writes them to Into as a list with one Face List per group, in the order their first face was built. Cut is a 🔁 condition, with [$Edge] the edge: faces never join across an edge that passes it, so a group stops there, such as at seams or sharp creases. Left off, the groups are the islands of [$Object.Islands]. The edges between two groups are those whose [$Edge.Faces] lie in different groups. Of gives the faces, or objects for all their faces; empty uses [$Selected.Faces]. Where is a 🔁 condition a face must pass to be grouped. Example: Select Faces All, then Face Groups Cut [=[$Edge.Angle] > 30] Into [Panels], then For Each Panel In [Panels], Tag Faces gives each flat panel its own tag.',
    stops: ['No objects.', 'An empty Into.'],
    parameters: [
      solidScriptParameterEach(
        solidScriptParameterOptional(
          'cut',
          'Cut',
          'value',
          'A condition an edge must pass for groups to stop there, such as [=[$Edge.Angle] > 30]. Left off cuts nowhere.',
        ),
        'Edge',
      ),
      solidScriptParameterOfWhere('Face', '[=[$Face.Normal.Y] > 0.9]'),
      solidScriptParameterOf('faces or objects', '$Selected.Faces'),
      {
        ...solidScriptParameterInto('the groups, one Face List each', 'List', 'face groups', 'label'),
        optional: false,
        default: 'Groups',
      },
    ],
    listing: (read) => [
      'Face Groups',
      ...(read.text('cut').trim() === '' ? [] : [' Cut ', read.value('cut')]),
      ...solidScriptListingOf(read),
      ' Into ',
      read.value('into'),
    ],
    execute: (run) => {
      solidScriptFaceWrite(run, 'into', solidScriptFaceGroupsRun(run));
      return [];
    },
  }),
];
