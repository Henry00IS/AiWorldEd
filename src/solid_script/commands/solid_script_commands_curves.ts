import { SolidScriptCommand, type SolidScriptCommandParameter } from './solid_script_command.js';
import { solidScriptParameter } from './solid_script_command_parameters.js';
import {
  solidScriptCurveIntoField,
  solidScriptCurvePlace,
  solidScriptCurveWrite,
} from './solid_script_commands_curve_io.js';
import { CURVE_DETAIL_DEFAULT } from '@/curve/model/curve_model.js';
import {
  solidScriptCurveDetail,
  solidScriptCurveSegmentMake,
  type SolidScriptCurveSpec,
} from '@/solid_script/language/solid_script_curve_edit.js';
import type { SolidScriptBlockRun } from '@/solid_script/language/solid_script_machine_types.js';
import { solidScriptValueNumber } from '@/solid_script/language/solid_script_value.js';

/** The fields every Curve block has. */
const SOLID_SCRIPT_CURVE_FIELDS = {
  from: solidScriptParameter(
    'from',
    'From',
    'vector2',
    '0, 0',
    'Where the curve starts at the left edge: X 0, then the height from 0 (bottom) to 1 (top), such as 0, 0.2.',
  ),
  to: solidScriptParameter(
    'to',
    'To',
    'vector2',
    '1, 1',
    'Where the curve ends at the right edge: X 1, then the height from 0 to 1, such as 1, 0.8.',
  ),
  detail: solidScriptParameter(
    'detail',
    'Detail',
    'count',
    String(CURVE_DETAIL_DEFAULT),
    'Straight pieces the curved segment is drawn in, 1 to 64, such as 8.',
  ),
} as const;

/** What a Curve block that bends its segment needs to say about Detail. */
const SOLID_SCRIPT_CURVE_STOPS = [
  'A From that is not at X 0, a To that is not at X 1, or a height outside 0 to 1.',
  'A Detail that is not a whole number from 1 to 64.',
] as const;

/**
 * Reads From and To: X 0 and X 1, with heights from 0 to 1.
 *
 * @param run Running line.
 * @param label Command, for messages.
 * @returns Height at the left end and at the right end.
 */
function solidScriptCurveEnds(run: SolidScriptBlockRun, label: string): [number, number] {
  const ends = [solidScriptCurvePlace(run, label, 'from', 'From'), solidScriptCurvePlace(run, label, 'to', 'To')];
  const [[fromX, from], [toX, to]] = ends as [[number, number], [number, number]];
  if (fromX !== 0 || toX !== 1)
    throw new Error(`${label} needs From at X 0 and To at X 1, because a curve runs from the left edge to the right`);
  if (from < 0 || from > 1 || to < 0 || to > 1)
    throw new Error(`${label} needs heights from 0 to 1 in From and To, such as 0, 0.2`);
  return [from, to];
}

/**
 * Builds a block that writes a one-segment Curve to Into.
 *
 * @param spec What differs: id, label, text, extra fields, their order in the
 *   listing and how the segment is made.
 * @returns Command.
 */
function solidScriptCurveCommand(spec: {
  id: string;
  label: string;
  description: string;
  manual: string;
  stops: readonly string[];
  fields: readonly SolidScriptCommandParameter[];
  listed: readonly string[];
  build: (run: SolidScriptBlockRun, ends: [number, number]) => SolidScriptCurveSpec;
}): SolidScriptCommand {
  return new SolidScriptCommand({
    id: spec.id,
    label: spec.label,
    synonyms: ['curve', 'profile', 'ramp'],
    category: 'Curves',
    description: spec.description,
    manual: spec.manual,
    stops: spec.stops,
    parameters: [...spec.fields, solidScriptCurveIntoField()],
    listing: (read) => [
      spec.label,
      ...spec.listed.flatMap((key) => [
        ` ${spec.fields.find((field) => field.key === key)?.label ?? key} `,
        read.value(key),
      ]),
      ' Into ',
      read.value('into'),
    ],
    execute: (run) => {
      solidScriptCurveWrite(run, solidScriptCurveSegmentMake(spec.build(run, solidScriptCurveEnds(run, spec.label))));
      return [];
    },
  });
}

/**
 * Reads the Detail field of a bent segment.
 *
 * @param run Running line.
 * @param label Command, for messages.
 * @returns Detail.
 */
function solidScriptCurveDetailRead(run: SolidScriptBlockRun, label: string): number {
  return solidScriptCurveDetail(solidScriptValueNumber(run.value('detail')), label);
}

/** Linear Curve, Bezier Curve and Quadratic Curve. */
export const SOLID_SCRIPT_COMMANDS_CURVES: readonly SolidScriptCommand[] = [
  solidScriptCurveCommand({
    id: 'linear_curve',
    label: 'Linear Curve',
    description: 'Make a curve of one straight segment',
    manual:
      'Makes a Curve of one straight segment from From at the left edge (X 0) to To at the right edge (X 1); heights run from 0 at the bottom to 1 at the top. Add bends with Insert Segment and move points with Set Curve Point. Example: Linear Curve From 0, 0 To 1, 1 Into [Ramp] makes a ramp that rises all the way.',
    stops: SOLID_SCRIPT_CURVE_STOPS.slice(0, 1),
    fields: [SOLID_SCRIPT_CURVE_FIELDS.from, SOLID_SCRIPT_CURVE_FIELDS.to],
    listed: ['from', 'to'],
    build: (_, [from, to]) => ({ mode: 'linear', from, to, detail: CURVE_DETAIL_DEFAULT }),
  }),
  solidScriptCurveCommand({
    id: 'bezier_curve',
    label: 'Bezier Curve',
    description: 'Make a curve of one segment bent by two handles',
    manual:
      'Makes a Curve of one segment from From to To, leaving From toward From Handle and coming into To from To Handle, in the same square: X from 0 to 1 and heights from 0 to 1. A handle stays between the two ends along X, as in the curve editor, so one that would go outside is moved back in; its height stays from 0 to 1 too. Detail is the number of straight pieces the segment is drawn in. Example: Bezier Curve From 0, 0 From Handle 0.4, 0 To Handle 0.6, 1 To 1, 1 Into [Smooth] makes a smooth S.',
    stops: SOLID_SCRIPT_CURVE_STOPS,
    fields: [
      SOLID_SCRIPT_CURVE_FIELDS.from,
      solidScriptParameter(
        'from_handle',
        'From Handle',
        'vector2',
        '0.4, 0',
        'Place the curve heads for as it leaves From, x then height, such as 0.4, 0.',
      ),
      solidScriptParameter(
        'to_handle',
        'To Handle',
        'vector2',
        '0.6, 1',
        'Place the curve comes from as it reaches To, x then height, such as 0.6, 1.',
      ),
      SOLID_SCRIPT_CURVE_FIELDS.to,
      SOLID_SCRIPT_CURVE_FIELDS.detail,
    ],
    listed: ['from', 'from_handle', 'to_handle', 'to', 'detail'],
    build: (run, [from, to]) => ({
      mode: 'bezier',
      from,
      to,
      detail: solidScriptCurveDetailRead(run, 'Bezier Curve'),
      handle: solidScriptCurvePlace(run, 'Bezier Curve', 'from_handle', 'From Handle'),
      handleIn: solidScriptCurvePlace(run, 'Bezier Curve', 'to_handle', 'To Handle'),
    }),
  }),
  solidScriptCurveCommand({
    id: 'quadratic_curve',
    label: 'Quadratic Curve',
    description: 'Make a curve of one segment pulled toward a middle point',
    manual:
      'Makes a Curve of one segment from From to To, pulled toward Middle, in the same square: X from 0 to 1 and heights from 0 to 1. Middle stays between the two ends along X, as in the curve editor. Detail is the number of straight pieces the segment is drawn in. Example: Quadratic Curve From 0, 0 Middle 0.5, 1 To 1, 0 Into [Hill] makes a rounded hill.',
    stops: SOLID_SCRIPT_CURVE_STOPS,
    fields: [
      SOLID_SCRIPT_CURVE_FIELDS.from,
      solidScriptParameter(
        'middle',
        'Middle',
        'vector2',
        '0.5, 1',
        'Place the curve is pulled toward between From and To, x then height, such as 0.5, 1.',
      ),
      SOLID_SCRIPT_CURVE_FIELDS.to,
      SOLID_SCRIPT_CURVE_FIELDS.detail,
    ],
    listed: ['from', 'middle', 'to', 'detail'],
    build: (run, [from, to]) => ({
      mode: 'quadratic',
      from,
      to,
      detail: solidScriptCurveDetailRead(run, 'Quadratic Curve'),
      handle: solidScriptCurvePlace(run, 'Quadratic Curve', 'middle', 'Middle'),
    }),
  }),
];
