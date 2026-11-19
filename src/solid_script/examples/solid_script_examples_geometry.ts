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
    'Scatter Points fills a box; Hull wraps the points in one lumpy solid. Change Seed for another rock.',
  ),
  solidScriptExampleInput('Size', 'Number', '2', { min: '0.5', max: '20', label: 'Size' }),
  solidScriptExampleInput('Height', 'Number', '1.2', { min: '0.2', max: '20', label: 'Height' }),
  solidScriptExampleInput('Count', 'Count', '16', { min: '4', max: '64', label: 'Points' }),
  solidScriptExampleInput('Seed', 'Number', '4', { label: 'Seed' }),
  solidScriptExampleLine('scatter_points', {
    where: 'Box',
    count: '[Count]',
    seed: '[Seed]',
    size: '[Size], [Height], [Size]',
    into: 'Spots',
  }),
  ...solidScriptExampleBlock('hull', { points: '[Spots]' }, []),
];

/** A cube whose top face is scaled about its center, making a tapered block. */
export const SOLID_SCRIPT_EXAMPLE_TAPERED_BOX: readonly SolidScriptLine[] = [
  solidScriptExampleNote('Scale Faces shrinks the top about its center, so the cube becomes a tapered block.'),
  solidScriptExampleInput('Factor', 'Number', '0.5', { min: '0.1', max: '2', label: 'Factor' }),
  solidScriptExampleLine('cube', { size: '2, 2, 2' }),
  solidScriptExampleLine('select_brushes'),
  solidScriptExampleLine('select_faces', { which: 'Up' }),
  solidScriptExampleLine('scale_faces', { factor: '[Factor]' }),
];

/**
 * A rounded rectangular rail: Path rounds the corners, Curve To Mesh sweeps a
 * tube.
 */
export const SOLID_SCRIPT_EXAMPLE_ROUNDED_RAIL: readonly SolidScriptLine[] = [
  solidScriptExampleNote('Path Points rounds the corners; Curve To Mesh sweeps a tube along that path.'),
  solidScriptExampleInput('Width', 'Number', '3', { min: '0.5', max: '20', label: 'Width' }),
  solidScriptExampleInput('Depth', 'Number', '2', { min: '0.5', max: '20', label: 'Depth' }),
  solidScriptExampleInput('Corner', 'Number', '0.4', { min: '0', max: '5', label: 'Corner' }),
  solidScriptExampleInput('Thickness', 'Number', '0.08', { min: '0.01', max: '1', label: 'Thickness' }),
  solidScriptExampleLine('path', {
    shape: 'Points',
    points:
      '[=Vector(-[Width] / 2, 0, -[Depth] / 2)], [=Vector([Width] / 2, 0, -[Depth] / 2)], [=Vector([Width] / 2, 0, [Depth] / 2)], [=Vector(-[Width] / 2, 0, [Depth] / 2)]',
    corner_radius: '[Corner]',
    sides: '6',
    closed: 'Yes',
    into: 'Rail',
  }),
  solidScriptExampleLine('curve_to_mesh', { path: '[Rail]', radius: '[Thickness]', sides: '8', closed: 'Yes' }),
];

/** A hilly floor: Grid Mesh, then Displace with Noise at each point. */
export const SOLID_SCRIPT_EXAMPLE_HILLY_FLOOR: readonly SolidScriptLine[] = [
  solidScriptExampleNote(
    'Grid Mesh lays a floor; Displace lifts each point with Noise, so the same Seed is the same hills.',
  ),
  solidScriptExampleInput('Width', 'Number', '8', { min: '0.5', max: '40', label: 'Width' }),
  solidScriptExampleInput('Depth', 'Number', '8', { min: '0.5', max: '40', label: 'Depth' }),
  solidScriptExampleInput('Columns', 'Count', '12', { min: '1', max: '32', label: 'Columns' }),
  solidScriptExampleInput('Rows', 'Count', '12', { min: '1', max: '32', label: 'Rows' }),
  solidScriptExampleInput('Height', 'Number', '0.6', { min: '0', max: '10', label: 'Height' }),
  solidScriptExampleInput('Scale', 'Number', '3', { min: '0.1', max: '40', label: 'Scale' }),
  solidScriptExampleInput('Seed', 'Number', '2', { label: 'Seed' }),
  solidScriptExampleLine('grid_mesh', { size: '[Width], 0, [Depth]', columns: '[Columns]', rows: '[Rows]' }),
  solidScriptExampleLine('select_brushes'),
  solidScriptExampleLine('displace', {
    distance: '[=[Height] * (Noise([$X], 0, [$Z], [Scale], [Seed]) * 2 - 1)]',
  }),
];
