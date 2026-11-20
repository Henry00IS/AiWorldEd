import type { SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import {
  solidScriptExampleBlock,
  solidScriptExampleInput,
  solidScriptExampleLine,
  solidScriptExampleNote,
} from './solid_script_example_lines.js';

/** An irregular convex rock: Scatter Points in a box, then Hull around them. */
export const SOLID_SCRIPT_EXAMPLE_IRREGULAR_ROCK: readonly SolidScriptLine[] = [
  solidScriptExampleNote(
    'Scatter Points drops random points. Where In Box fills a box of this Size and Height. Count is how many points, and Seed picks the layout: the same Seed is the same rock. Into writes the points to $[Spots$], a list you can use later.',
  ),
  solidScriptExampleInput('Size', 'Number', '2', { min: '0.5', max: '20', label: 'Size' }),
  solidScriptExampleInput('Height', 'Number', '1.2', { min: '0.2', max: '20', label: 'Height' }),
  solidScriptExampleInput('Count', 'Count', '16', { min: '4', max: '64', label: 'Points' }),
  solidScriptExampleInput('Seed', 'Number', '4', { label: 'Seed' }),
  solidScriptExampleLine('scatter_points', {
    where: 'In Box',
    count: '[Count]',
    seed: '[Seed]',
    size: '[Size], [Height], [Size]',
    into: 'Spots',
  }),
  solidScriptExampleNote(
    'Hull wraps those points in one lumpy solid. The points themselves are only a list; Hull is the rock you see.',
  ),
  ...solidScriptExampleBlock('hull', { points: '[Spots]' }, []),
];

/** A cube whose top face is scaled about its center, making a tapered block. */
export const SOLID_SCRIPT_EXAMPLE_TAPERED_BOX: readonly SolidScriptLine[] = [
  solidScriptExampleNote(
    'An Input is a knob in the inspector. Change Factor and the top of the box shrinks or grows. The default is 0.5.',
  ),
  solidScriptExampleInput('Factor', 'Number', '0.5', { min: '0.1', max: '2', label: 'Factor' }),
  solidScriptExampleNote(
    'This Cube has no Anchor written, so it uses the usual Center, Center, Center. Select Brushes picks brushes. Which Between keeps everything built since the last Select Brushes. This is the first Select, so it picks the cube, the same as All.',
  ),
  solidScriptExampleLine('cube', { size: '2, 2, 2' }),
  solidScriptExampleLine('select_brushes', { which: 'Between' }),
  solidScriptExampleNote(
    'Select Faces picks faces of those brushes. Which Facing Up keeps the faces that point up, so only the top is kept.',
  ),
  solidScriptExampleLine('select_faces', { which: 'Facing Up' }),
  solidScriptExampleNote(
    'Scale Faces shrinks or grows the selected faces about their centers. Factor 0.5 makes the top half as wide, so the cube becomes a tapered block.',
  ),
  solidScriptExampleLine('scale_faces', { factor: '[Factor]' }),
];

/**
 * A rounded rectangular rail: Path rounds the corners, Curve To Mesh sweeps a
 * tube.
 */
export const SOLID_SCRIPT_EXAMPLE_ROUNDED_RAIL: readonly SolidScriptLine[] = [
  solidScriptExampleNote(
    'Path From Points draws a path through these four corners. Corner rounds them, Closed joins the last back to the first, and Into writes the path to $[Rail$].',
  ),
  solidScriptExampleInput('Width', 'Number', '3', { min: '0.5', max: '20', label: 'Width' }),
  solidScriptExampleInput('Depth', 'Number', '2', { min: '0.5', max: '20', label: 'Depth' }),
  solidScriptExampleInput('Corner', 'Number', '0.4', { min: '0', max: '5', label: 'Corner' }),
  solidScriptExampleInput('Thickness', 'Number', '0.08', { min: '0.01', max: '1', label: 'Thickness' }),
  solidScriptExampleLine('path', {
    shape: 'From Points',
    points:
      '[=Vector(-[Width] / 2, 0, -[Depth] / 2)], [=Vector([Width] / 2, 0, -[Depth] / 2)], [=Vector([Width] / 2, 0, [Depth] / 2)], [=Vector(-[Width] / 2, 0, [Depth] / 2)]',
    corner_radius: '[Corner]',
    sides: '6',
    closed: 'Yes',
    into: 'Rail',
  }),
  solidScriptExampleNote('Curve To Mesh sweeps a tube along that path. Radius is how thick the rail is.'),
  solidScriptExampleLine('curve_to_mesh', { path: '[Rail]', radius: '[Thickness]', sides: '8', closed: 'Yes' }),
];

/** A hilly floor: Grid Mesh, then Displace with Noise at each point. */
export const SOLID_SCRIPT_EXAMPLE_HILLY_FLOOR: readonly SolidScriptLine[] = [
  solidScriptExampleNote('Grid Mesh lays a flat floor of this Width and Depth, divided into Columns and Rows.'),
  solidScriptExampleInput('Width', 'Number', '8', { min: '0.5', max: '40', label: 'Width' }),
  solidScriptExampleInput('Depth', 'Number', '8', { min: '0.5', max: '40', label: 'Depth' }),
  solidScriptExampleInput('Columns', 'Count', '12', { min: '1', max: '32', label: 'Columns' }),
  solidScriptExampleInput('Rows', 'Count', '12', { min: '1', max: '32', label: 'Rows' }),
  solidScriptExampleInput('Height', 'Number', '0.6', { min: '0', max: '10', label: 'Height' }),
  solidScriptExampleInput('Scale', 'Number', '3', { min: '0.1', max: '40', label: 'Scale' }),
  solidScriptExampleInput('Seed', 'Number', '2', { label: 'Seed' }),
  solidScriptExampleLine('grid_mesh', { size: '[Width], 0, [Depth]', columns: '[Columns]', rows: '[Rows]' }),
  solidScriptExampleLine('select_brushes'),
  solidScriptExampleNote(
    "Displace moves each selected point along its normal. The distance uses Noise, which turns a point into a smooth random height: the same Seed is the same hills. $[X$] and $[Z$] are the point's place on the floor.",
  ),
  solidScriptExampleLine('displace', {
    distance: '[=[Height] * (Noise([$X], 0, [$Z], [Scale], [Seed]) * 2 - 1)]',
  }),
];
