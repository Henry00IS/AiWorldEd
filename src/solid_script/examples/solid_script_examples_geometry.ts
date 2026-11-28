import type { SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import {
  solidScriptExampleBlock,
  solidScriptExampleInput,
  solidScriptExampleLine,
  solidScriptExampleNote,
  solidScriptExamplePoint,
  solidScriptExamplePolyhedron,
  solidScriptExampleRepeat,
  solidScriptExampleSet,
} from './solid_script_example_lines.js';

/** An irregular convex rock: Scatter In Box, then Hull around the points. */
export const SOLID_SCRIPT_EXAMPLE_IRREGULAR_ROCK: readonly SolidScriptLine[] = [
  ...solidScriptExampleNote(
    'Scatter In Box drops random points in the generator box, [Box]. Count is how many points, and Seed picks the layout: the same Seed is the same rock. Into writes the points to [Spots], a list you can use later.',
  ),
  solidScriptExampleInput('Count', 'Count', '16', { min: '4', max: '64', label: 'Points' }),
  solidScriptExampleInput('Seed', 'Number', '4', { label: 'Seed' }),
  solidScriptExampleLine('scatter_in_box', {
    count: '[Count]',
    seed: '[Seed]',
    size: '[$Box.Size]',
    into: 'Spots',
  }),
  ...solidScriptExampleNote(
    'Hull wraps those points in one lumpy solid. The points themselves are only a list; Hull is the rock you see.',
  ),
  ...solidScriptExampleBlock('hull', { points: '[Spots]' }, []),
];

/** A cube whose top face is scaled about its center, making a tapered block. */
export const SOLID_SCRIPT_EXAMPLE_TAPERED_BOX: readonly SolidScriptLine[] = [
  ...solidScriptExampleNote(
    'An Input is a knob in the inspector. Change Factor and the top of the box shrinks or grows. The default is 0.5.',
  ),
  solidScriptExampleInput('Factor', 'Number', '0.5', { min: '0.1', max: '2', label: 'Factor' }),
  ...solidScriptExampleNote(
    "This Cube's Size is [Box.Size], so it fills the generator box you draw in the editor. It has no Anchor written, so it uses the usual Center, Center, Center. Select Objects picks solids. Which Between keeps everything built since the last Select Objects. This is the first Select, so it picks the cube.",
  ),
  solidScriptExampleLine('cube', { size: '[$Box.Size]' }),
  solidScriptExampleLine('select_objects', { which: 'Between' }),
  ...solidScriptExampleNote(
    'Select Faces picks faces of those solids. Which Facing Up keeps the faces that point up, so only the top is kept.',
  ),
  solidScriptExampleLine('select_faces', { which: 'Facing Up' }),
  ...solidScriptExampleNote(
    'Scale Faces shrinks or grows the selected faces about their centers. Factor 0.5 makes the top half as wide, so the cube becomes a tapered block.',
  ),
  solidScriptExampleLine('scale_faces', { factor: '[Factor]' }),
];

/**
 * A rounded rectangular rail: Path rounds the corners, Sweep Along Path sweeps
 * a tube.
 */
export const SOLID_SCRIPT_EXAMPLE_ROUNDED_RAIL: readonly SolidScriptLine[] = [
  ...solidScriptExampleNote(
    'Path From Points draws a path through the four corners of the generator box, [Box], at its mid-height. Corner rounds them, Closed joins the last back to the first, and Into writes the path to [Rail].',
  ),
  solidScriptExampleInput('Corner', 'Number', '0.4', { min: '0', max: '5', label: 'Corner' }),
  solidScriptExampleInput('Thickness', 'Number', '0.08', { min: '0.01', max: '1', label: 'Thickness' }),
  solidScriptExampleLine('path_from_points', {
    points:
      '[=Vector(-[$Box.Extents.X], 0, -[$Box.Extents.Z])], [=Vector([$Box.Extents.X], 0, -[$Box.Extents.Z])], [=Vector([$Box.Extents.X], 0, [$Box.Extents.Z])], [=Vector(-[$Box.Extents.X], 0, [$Box.Extents.Z])]',
    corner_radius: '[Corner]',
    sides: '6',
    closed: 'Yes',
    into: 'Rail',
  }),
  ...solidScriptExampleNote('Sweep Along Path sweeps a tube along that closed Path. Radius is how thick the rail is.'),
  solidScriptExampleLine('sweep_along_path', { path: '[Rail]', radius: '[Thickness]', sides: '8' }),
];

/**
 * A baseboard along a Path input: trace the bottom corners of a room with it
 * and Sweep Along Path runs a moulding profile along them.
 */
export const SOLID_SCRIPT_EXAMPLE_BASEBOARD: readonly SolidScriptLine[] = [
  ...solidScriptExampleNote(
    'Wall is the path around the room. Select this object, click Edit and Ctrl+Click each bottom corner; the board follows as you draw. These room corner points are the starting path. To follow a Path object in the scene instead, pick it under Wall in the inspector.',
  ),
  solidScriptExampleInput('Wall', 'Path', '[2, 0, 1.5], [2, 0, -1.5], [-2, 0, -1.5], [-2, 0, 1.5]', {
    label: 'Wall',
  }),
  solidScriptExampleInput('Height', 'Number', '0.12', { min: '0.02', max: '1', label: 'Height' }),
  solidScriptExampleInput('Thickness', 'Number', '0.02', { min: '0.005', max: '0.2', label: 'Thickness' }),
  ...solidScriptExampleNote(
    'Sweep Along Path runs the moulding profile along the wall: x runs to the side of the path and y up, so the flat back sits on the wall and the bevelled face points into the room.',
  ),
  solidScriptExampleLine('sweep_along_path', {
    path: '[Wall]',
    profile:
      '[0, 0], [[Thickness], 0], [[Thickness], [=[Height] * 0.8]], [[=[Thickness] / 2], [Height]], [0, [Height]]',
    up: '0, 1, 0',
  }),
];

/**
 * A baseboard built from a Curve input: Curve turns the curve into a 2D XY
 * cross-section and Sweep Along Path sweeps it along the wall path.
 */
export const SOLID_SCRIPT_EXAMPLE_CURVE_BASEBOARD: readonly SolidScriptLine[] = [
  ...solidScriptExampleNote(
    'Edit Moulding to reshape the baseboard cross-section: left is the bottom against the floor and right is the top.',
  ),
  solidScriptExampleInput(
    'Moulding',
    'Curve',
    '[0, 1], [0.35, 1], [0.35, 0.72], [0.5, 0.65], [0.68, 0.45], [0.85, 0.35], [1, 0]',
    { label: 'Moulding' },
  ),
  solidScriptExampleInput('Height', 'Number', '0.15', { min: '0.02', max: '1', label: 'Height' }),
  solidScriptExampleInput('Depth', 'Number', '0.03', { min: '0.005', max: '0.2', label: 'Depth' }),
  solidScriptExampleLine('curve_profile', {
    curve: '[Moulding]',
    height: '[Height]',
    depth: '[Depth]',
    side: 'Normal',
    segments: '16',
    into: 'Profile',
  }),
  solidScriptExampleLine('path_from_points', {
    points: '[1.5, 0, 1], [1.5, 0, -1], [-1.5, 0, -1], [-1.5, 0, 1]',
    into: 'Wall',
  }),
  solidScriptExampleLine('sweep_along_path', { path: '[Wall]', profile: '[Profile]', up: '0, 1, 0' }),
];

/**
 * Lines of the Side and Corner functions Path Stairs uses: the way to the right
 * of a stretch seen from above, and where a side meets the next stretch's.
 *
 * @returns Lines.
 */
function solidScriptExamplePathStairsFunctions(): SolidScriptLine[] {
  return [
    ...solidScriptExampleNote(
      'Side gives the way to the right of a stretch from From to To, seen from above, one long. A stretch that only climbs straight up has no side, so it gives 0, 0, 0.',
    ),
    ...solidScriptExampleBlock('function', { name: 'Side', parameters: 'From, To' }, [
      solidScriptExampleSet(
        '$Local.Flat',
        '[=Vector([$Local.To.Z] - [$Local.From.Z], 0, [$Local.From.X] - [$Local.To.X])]',
      ),
      solidScriptExampleLine('return', { value: '[=[$Local.Flat] / Max(0.0001, [$Local.Flat.Length])]' }),
    ]),
    ...solidScriptExampleNote(
      'Corner turns the Side before a bend and the Side after it into the one corner both steps share, stretched so both stay Width wide. A bend that turns right back keeps the Side after it.',
    ),
    ...solidScriptExampleBlock('function', { name: 'Corner', parameters: 'Before, After' }, [
      solidScriptExampleSet('$Local.Sum', '[=[$Local.Before] + [$Local.After]]'),
      solidScriptExampleSet('$Local.Mitre', '[=[$Local.Sum] / Max(0.5, Dot([$Local.Sum], [$Local.After]))]'),
      solidScriptExampleLine('return', {
        value: '[=Lerp([$Local.After], [$Local.Mitre], Min(1, [$Local.Sum.Length] * 4))]',
      }),
    ]),
  ];
}

/**
 * Lines of one step of Path Stairs: a Polyhedron from the flight's base up to
 * the step's top, between its two pairs of corners.
 *
 * @returns Lines.
 */
function solidScriptExamplePathStairsStep(): SolidScriptLine[] {
  return [
    ...solidScriptExampleNote(
      'The first step of a stretch starts at the corner it shares with the stretch before, and the last ends at the one it shares with the next, so steps round a bend meet with no gap. Steps between them are square.',
    ),
    solidScriptExampleSet('Near', '[=Lerp([Side], [Start], Max(0, 1 - [S])) * [Width] / 2]'),
    solidScriptExampleSet('Far', '[=Lerp([Side], [End], Max(0, [S] + 2 - [Steps])) * [Width] / 2]'),
    solidScriptExampleSet('From', '[=Lerp([A], [B], [S] / [Steps])]'),
    solidScriptExampleSet('To', '[=Lerp([A], [B], ([S] + 1) / [Steps])]'),
    solidScriptExampleSet('Top', '[=Lerp([A.Y], [B.Y], ([S] + 1) / [Steps])]'),
    ...solidScriptExampleNote(
      'Each step is a block from below the flight up to its own top; a level stretch has one step, which is the landing.',
    ),
    ...solidScriptExamplePolyhedron([
      ...solidScriptExampleBlock(
        'for_each',
        { variable: 'C', list: '[=List([From] + [Near], [From] - [Near], [To] + [Far], [To] - [Far])]' },
        [
          solidScriptExamplePoint('[=Vector([C.X], [Base], [C.Z])]'),
          solidScriptExamplePoint('[=Vector([C.X], [Top], [C.Z])]'),
        ],
      ),
    ]),
  ];
}

/**
 * Stairs along a Path input: every sloped stretch becomes a flight of steps and
 * every level stretch a landing, the steps round each bend sharing corners.
 */
export const SOLID_SCRIPT_EXAMPLE_PATH_STAIRS: readonly SolidScriptLine[] = [
  ...solidScriptExampleNote(
    'Run is a Path you draw in the scene: a sloped stretch becomes a flight of steps and a level stretch a landing. Click Edit, then drag the points, or Ctrl+Click to add a point after the picked one. An Arc stretch winds the stairs round.',
  ),
  solidScriptExampleInput('Run', 'Path', '[-3, -1.2, 0], [-1, 0, 0], [1, 0, 0], [3, 1.2, 0]', { label: 'Run' }),
  solidScriptExampleInput('Width', 'Number', '1.2', { min: '0.3', max: '10', label: 'Width' }),
  solidScriptExampleInput('Rise', 'Number', '0.18', { min: '0.05', max: '1', label: 'Target Rise' }),
  ...solidScriptExamplePathStairsFunctions(),
  solidScriptExampleSet('P', '[Run.Points]'),
  ...solidScriptExampleRepeat('I', '0', '[=Len([P]) - 1]', [
    ...solidScriptExampleNote(
      '[A] and [B] are the ends of one stretch. [Start] and [End] are its corners at A and at B, shared with the stretches either side.',
    ),
    solidScriptExampleSet('A', '[=ItemClamp([P], [I])]'),
    solidScriptExampleSet('B', '[=ItemClamp([P], [I] + 1)]'),
    solidScriptExampleSet('Side', '[=Side([A], [B])]'),
    solidScriptExampleSet('Start', '[=Corner(Side(ItemClamp([P], [I] - 1), [A]), [Side])]'),
    solidScriptExampleSet('End', '[=Corner([Side], Side([B], ItemClamp([P], [I] + 2)))]'),
    solidScriptExampleSet('Steps', '[=Max(1, Round(Abs([B.Y] - [A.Y]) / [Rise]))]'),
    solidScriptExampleSet('Base', '[=Min([A.Y], [B.Y]) - [Rise]]'),
    ...solidScriptExampleRepeat('S', '0', '[Steps]', solidScriptExamplePathStairsStep()),
  ]),
];

/** A hilly floor: Grid Mesh, then Displace with Noise at each point. */
export const SOLID_SCRIPT_EXAMPLE_HILLY_FLOOR: readonly SolidScriptLine[] = [
  ...solidScriptExampleNote(
    'Grid Mesh lays a flat floor that fills the width and depth of the generator box, [Box], divided into Columns and Rows.',
  ),
  solidScriptExampleInput('Columns', 'Count', '12', { min: '1', max: '32', label: 'Columns' }),
  solidScriptExampleInput('Rows', 'Count', '12', { min: '1', max: '32', label: 'Rows' }),
  solidScriptExampleInput('Scale', 'Number', '3', { min: '0.1', max: '40', label: 'Scale' }),
  solidScriptExampleInput('Seed', 'Number', '2', { label: 'Seed' }),
  solidScriptExampleLine('grid_mesh', {
    size: '[$Box.Width], 0, [$Box.Depth]',
    columns: '[Columns]',
    rows: '[Rows]',
  }),
  solidScriptExampleLine('select_objects'),
  ...solidScriptExampleNote(
    "Displace moves each selected point along its normal. The distance uses Noise, which turns a point into a smooth random height: the same Seed is the same hills, and the hills fill the height of the generator box. [X] and [Z] are the point's place on the floor.",
  ),
  solidScriptExampleLine('displace', {
    distance: '[=[$Box.Height] * (Noise(Vector([$X], 0, [$Z]), [Scale], [Seed]) * 2 - 1)]',
  }),
];
