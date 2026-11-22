import { solidScriptListingOf } from './solid_script_command_listing.js';
import { solidScriptParameterEach } from './solid_script_command_each.js';
import { SolidScriptCommand } from './solid_script_command.js';
import {
  solidScriptParameter,
  solidScriptParameterOf,
  solidScriptParameterOptional,
} from './solid_script_command_parameters.js';
import type { SolidScriptBlockRun } from '@/solid_script/language/solid_script_machine_types.js';
import { solidScriptConditionHolds } from '@/solid_script/language/solid_script_condition.js';
import { solidScriptOfEmpty } from '@/solid_script/language/solid_script_select.js';
import {
  solidScriptValueNumbers,
  type SolidScriptElement,
  type SolidScriptValue,
} from '@/solid_script/language/solid_script_value.js';

/**
 * What a To or Where field of Set Positions reads for one corner: the corner,
 * its number and how many corners there are; $X and $NX read the corner.
 *
 * @param vertex Corner.
 * @param index Number of the corner from 0.
 * @param count How many corners the line moves.
 * @returns Fills.
 */
function solidScriptSetPositionsFills(
  vertex: SolidScriptElement,
  index: number,
  count: number,
): Record<string, SolidScriptValue> {
  return { $Vertex: vertex, $Index: index, $Count: count };
}

/**
 * Adds the Offset of one corner to its To; an empty Offset leaves To as it is.
 *
 * @param to Position To gives.
 * @param offset Offset for the corner.
 * @returns Where the corner goes.
 */
function solidScriptSetPositionsOffset(to: SolidScriptValue, offset: SolidScriptValue): SolidScriptValue {
  if (offset === undefined || (typeof offset === 'string' && offset.trim() === '')) return to;
  const moves = solidScriptValueNumbers(offset);
  if (moves?.length !== 3) throw new Error('Offset needs three numbers, such as 0, 1, 0');
  const numbers = solidScriptValueNumbers(to);
  if (numbers?.length !== 3) throw new Error('To needs three numbers, such as 0, 1, 0');
  return numbers.map((number, axis) => number + (moves[axis] ?? 0));
}

/**
 * Moves every corner of Of that passes Where to the position To gives for it.
 *
 * @param run Running line.
 */
function solidScriptSetPositionsRun(run: SolidScriptBlockRun): void {
  const given = run.ofValues();
  const picked = run.selectedGet('vertices');
  const items = given ?? (picked.length > 0 ? picked : run.selectedGet('faces'));
  if (items.length === 0)
    throw new Error(
      given
        ? 'Set Positions has no corners in Of; check that Of holds vertices, faces, edges, objects'
        : solidScriptOfEmpty('Set Positions', 'vertices'),
    );
  run.positionsMove(items, (vertex, index, count) => {
    const fills = solidScriptSetPositionsFills(vertex, index, count);
    if (!solidScriptConditionHolds(run, 'where', fills)) return null;
    return solidScriptSetPositionsOffset(run.valueWith('to', fills), run.valueWith('offset', fills));
  });
}

/** Set Positions: moves corners one by one to positions a formula works out. */
export const SOLID_SCRIPT_COMMANDS_POSITIONS: readonly SolidScriptCommand[] = [
  new SolidScriptCommand({
    id: 'set_positions',
    label: 'Set Positions',
    category: 'Faces',
    description: 'Move corners to positions worked out one by one, or by an Offset',
    manual:
      'Moves each corner in Of to the position To works out for it. To is worked out once per corner, and Offset, when given, is added after it, so Offset 0, 0.5, 0 lifts every corner by half a metre without writing [=[$Vertex.Position] + …]. Where, when given, is a 🔁 condition a corner must pass to move. Every position is read from the shape before the line, and all corners move together. Of gives vertices, or the corners of faces, edges, objects; empty uses [$Selected.Vertices], or the corners of [$Selected.Faces] when no vertices are selected. A mesh takes any position. A solid stays a solid, rebuilt around its corners while they make a convex solid. A solid may be left not convex for now, so later lines can keep moving its corners; only when the script ends does a warning list the solids still not convex, which are not built. The same as Set [$Selected.Vertices.Positions], with Of and Where added. Example: Cube, Select Vertices Where [=[$Vertex.Position.Y] > 0], then Set Positions To [=[$Vertex.Position] * Vector(0.5, 1, 0.5)] narrows the top into a frustum.',
    stops: [
      'No corners: an empty Of with nothing in [$Selected.Vertices] or [$Selected.Faces].',
      'A To that is not three numbers, such as 0, 1, 0.',
    ],
    parameters: [
      solidScriptParameterEach(
        solidScriptParameter(
          'to',
          'To',
          'vector3',
          '[=[$Vertex.Position]]',
          'Where each corner goes, such as [=[$Vertex.Position] + Vector(0, [$X] * 0.1, 0)].',
        ),
        'Vertex',
      ),
      solidScriptParameterEach(
        solidScriptParameterOptional(
          'offset',
          'Offset',
          'vector3',
          'How far each corner moves on from To, such as 0, 0.5, 0 or [=Vector(0, Noise([$Vertex.Position], 2), 0)]. Left off adds nothing.',
        ),
        'Vertex',
      ),
      solidScriptParameterEach(
        solidScriptParameterOptional(
          'where',
          'Where',
          'value',
          'A condition each corner must pass to move, such as [=[$Y] > 0]. Left off moves every corner.',
        ),
        'Vertex',
      ),
      solidScriptParameterOf('vertices, faces, edges, objects', '$Selected.Vertices', [
        'Vertex',
        'Face',
        'Edge',
        'Object',
      ]),
    ],
    listing: (read) => [
      'Set Positions',
      ' To ',
      read.value('to'),
      ...(read.text('offset').trim() === '' ? [] : [' Offset ', read.value('offset')]),
      ...solidScriptListingOf(read),
    ],
    execute: (run) => {
      solidScriptSetPositionsRun(run);
      return [];
    },
  }),
];
