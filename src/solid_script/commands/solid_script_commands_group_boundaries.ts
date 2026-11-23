import { SolidScriptCommand } from './solid_script_command.js';
import { solidScriptParameterEach } from './solid_script_command_each.js';
import { solidScriptListingOf } from './solid_script_command_listing.js';
import { solidScriptParameterOfWhere } from './solid_script_command_of_where.js';
import {
  solidScriptParameterInto,
  solidScriptParameterOf,
  solidScriptParameterOptional,
} from './solid_script_command_parameters.js';
import { solidScriptElementOf } from './solid_script_element_of.js';
import { solidScriptFaceWrite } from './solid_script_face_of.js';
import { solidScriptConditionHolds } from '@/solid_script/language/solid_script_condition.js';
import type { SolidScriptFaceFacts } from '@/solid_script/language/solid_script_geometry.js';
import type { SolidScriptBlockRun } from '@/solid_script/language/solid_script_machine_types.js';
import {
  solidScriptValueEquals,
  type SolidScriptElement,
  type SolidScriptValue,
} from '@/solid_script/language/solid_script_value.js';

/**
 * Picks the edges of one object, face or edge that pass Where and lie between
 * two faces whose Group differs; an edge with one face is no boundary.
 *
 * @param run Running line.
 * @param object Object, face or edge element.
 * @param groupOf Group of a face, worked out once per face.
 * @returns Boundary edges.
 */
function solidScriptGroupBoundariesOf(
  run: SolidScriptBlockRun,
  object: SolidScriptElement,
  groupOf: (face: SolidScriptFaceFacts) => SolidScriptValue,
): SolidScriptValue[] {
  return run.elements
    .edges(object)
    .map((edge) => [edge, run.elements.edge(edge)] as const)
    .filter(([edge, element], index) => {
      const [first, second] = edge.faces;
      if (!second || solidScriptValueEquals(groupOf(first), groupOf(second))) return false;
      return solidScriptConditionHolds(run, 'where', { $Edge: element, $Index: index });
    })
    .map(([, element]) => element);
}

/**
 * Picks the edges between faces of different groups, writes them to
 * [$Selected.Edges] and Into.
 *
 * @param run Running line.
 */
function solidScriptGroupBoundariesRun(run: SolidScriptBlockRun): void {
  const groups = new Map<SolidScriptFaceFacts, SolidScriptValue>();
  const groupOf = (face: SolidScriptFaceFacts): SolidScriptValue => {
    if (!groups.has(face)) groups.set(face, run.valueWith('group', { $Face: run.elements.face(face) }));
    return groups.get(face);
  };
  const edges = solidScriptElementOf(run, 'objects', 'Select Group Boundaries').flatMap((object) =>
    solidScriptGroupBoundariesOf(run, object, groupOf),
  );
  const picked = edges.filter((edge, index) => edges.indexOf(edge) === index);
  run.selectedSet('edges', picked);
  solidScriptFaceWrite(run, 'into', picked);
}

/** Select Group Boundaries. */
export const SOLID_SCRIPT_COMMANDS_GROUP_BOUNDARIES: readonly SolidScriptCommand[] = [
  new SolidScriptCommand({
    id: 'select_group_boundaries',
    label: 'Select Group Boundaries',
    category: 'Edges',
    description: 'Pick the edges where face groups meet',
    manual:
      'Picks, in [$Selected.Edges], the edges between two faces whose Group differs, so a later line can bevel, cut or trace where regions meet. Group is a 🔁 value worked out for every face, with [$Face] the face, such as its tags or which way it faces; faces with equal values are one group. An edge with only one face is no boundary. Of gives the objects, faces or edges to look in; empty uses [$Selected.Objects]. Where is a 🔁 condition an edge must pass, with [$Edge] the edge. Into also writes the edges as an Edge List. Example: Cube, then Select Group Boundaries Group [=[$Face.Normal.Y] > 0.9] and Bevel Edges rounds the rim of the top.',
    stops: ['No objects.'],
    parameters: [
      solidScriptParameterEach(
        {
          ...solidScriptParameterOptional(
            'group',
            'Group',
            'value',
            'The group of a face, such as [=[$Face.Tags]]; faces with equal values are one group.',
          ),
          optional: false,
          default: '[=[$Face.Tags]]',
        },
        'Face',
      ),
      solidScriptParameterOfWhere('Edge', '[=[$Edge.Length] < 2]'),
      solidScriptParameterOf('objects, faces or edges', '$Selected.Objects', ['Object', 'Face', 'Edge']),
      solidScriptParameterInto('the boundary edges, an Edge list', 'Edge List', 'boundary edges', 'label'),
    ],
    listing: (read) => ['Select Group Boundaries', ' Group ', read.value('group'), ...solidScriptListingOf(read)],
    execute: (run) => {
      solidScriptGroupBoundariesRun(run);
      return [];
    },
  }),
];
