import type { SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import {
  solidScriptExampleBlock,
  solidScriptExampleIf,
  solidScriptExampleInput,
  solidScriptExampleLine,
  solidScriptExampleNote,
  solidScriptExamplePoint,
  solidScriptExamplePolyhedron,
  solidScriptExampleRepeat,
  solidScriptExampleSet,
} from './solid_script_example_lines.js';

/**
 * Calls Facet with three unit-sphere corners and the remaining split count.
 *
 * @param a First corner.
 * @param b Second corner.
 * @param c Third corner.
 * @param level Remaining split count.
 * @returns Call line.
 */
function facet(a: string, b: string, c: string, level: string): SolidScriptLine {
  return solidScriptExampleLine('call', { name: 'Facet', values: `${a}, ${b}, ${c}, ${level}` });
}

/**
 * The Facet function: split each face into four at unit-sphere midpoints, or
 * add its three corners to the surrounding Polyhedron.
 */
const TRIANGLE = solidScriptExampleBlock('function', { name: 'Facet', parameters: 'A, B, C, Level' }, [
  ...solidScriptExampleIf(
    '[Local.Level] <= 1',
    [
      solidScriptExamplePoint('[=[Local.A] * [Half]]'),
      solidScriptExamplePoint('[=[Local.B] * [Half]]'),
      solidScriptExamplePoint('[=[Local.C] * [Half]]'),
    ],
    [
      solidScriptExampleSet('Local.AB', '[=Normalize([Local.A] + [Local.B])]'),
      solidScriptExampleSet('Local.BC', '[=Normalize([Local.B] + [Local.C])]'),
      solidScriptExampleSet('Local.CA', '[=Normalize([Local.C] + [Local.A])]'),
      solidScriptExampleSet('Local.Next', '[=[Local.Level] - 1]'),
      facet('[Local.A]', '[Local.AB]', '[Local.CA]', '[Local.Next]'),
      facet('[Local.AB]', '[Local.B]', '[Local.BC]', '[Local.Next]'),
      facet('[Local.CA]', '[Local.BC]', '[Local.C]', '[Local.Next]'),
      facet('[Local.AB]', '[Local.BC]', '[Local.CA]', '[Local.Next]'),
    ],
  ),
]);

/** An icosphere from twenty triangles, split and pushed onto a unit sphere. */
export const SOLID_SCRIPT_EXAMPLE_ICOSPHERE: readonly SolidScriptLine[] = [
  ...solidScriptExampleNote(
    'Icosphere starts with twenty triangles. Each Subdivision past 1 splits every triangle into four, pushing its edge middles onto a sphere. Polyhedron wraps the corners as one solid.',
  ),
  solidScriptExampleInput('Subdivisions', 'Count', '2', { label: 'Subdivisions', min: '1', max: '4' }),
  solidScriptExampleSet('Half', '[=Vector([$Box.Width], [$Box.Height], [$Box.Depth]) / 2]'),
  ...solidScriptExampleNote(
    'Facet calls itself on the four smaller triangles until Level reaches 1. Local values belong to each call, so the smaller triangles do not overwrite their parent.',
  ),
  ...TRIANGLE,
  solidScriptExampleSet('H', '[=1 / Sqrt(5)]'),
  solidScriptExampleSet('North', '0, 1, 0'),
  solidScriptExampleSet('South', '0, -1, 0'),
  ...solidScriptExampleNote(
    'Two rings of five corners, turned 36 degrees from each other, join the north and south tips. Each pair of ring edges gives four of the twenty triangles.',
  ),
  ...solidScriptExamplePolyhedron(
    solidScriptExampleRepeat('I', '0', '5', [
      solidScriptExampleSet('A', '[=FromCylinder(2 * [H], [I] * 72, [H])]'),
      solidScriptExampleSet('B', '[=FromCylinder(2 * [H], ([I] + 1) * 72, [H])]'),
      solidScriptExampleSet('C', '[=FromCylinder(2 * [H], [I] * 72 + 36, -[H])]'),
      solidScriptExampleSet('D', '[=FromCylinder(2 * [H], ([I] + 1) * 72 + 36, -[H])]'),
      facet('[North]', '[A]', '[B]', '[Subdivisions]'),
      facet('[A]', '[C]', '[B]', '[Subdivisions]'),
      facet('[B]', '[C]', '[D]', '[Subdivisions]'),
      facet('[C]', '[South]', '[D]', '[Subdivisions]'),
    ]),
  ),
];

/**
 * A rhombicuboctahedron from the 24 sign choices and orderings of three
 * coordinates.
 */
export const SOLID_SCRIPT_EXAMPLE_RHOMBICUBOCTAHEDRON: readonly SolidScriptLine[] = [
  ...solidScriptExampleNote(
    'Rhombicuboctahedron has 26 faces. Its 24 corners are every ordering of plus or minus 1, 1, Extent. Precise makes regular faces; Grid Aligned keeps the slanted faces at 45 degrees.',
  ),
  solidScriptExampleInput('Precision', 'Choice', 'Grid Aligned', {
    label: 'Precision',
    choices: 'Grid Aligned, Precise',
  }),
  solidScriptExampleSet('Extent', '[=[Precision] == "Precise" ? 1 + Sqrt(2) : 2]'),
  solidScriptExampleSet('Half', '[=Vector([$Box.Width], [$Box.Height], [$Box.Depth]) / (2 * [Extent])]'),
  ...solidScriptExamplePolyhedron(
    solidScriptExampleRepeat('Far', '0', '3', [
      ...solidScriptExampleRepeat('Signs', '0', '8', [
        solidScriptExampleSet('A', '[=([Signs] % 2) * 2 - 1]'),
        solidScriptExampleSet('B', '[=(Floor([Signs] / 2) % 2) * 2 - 1]'),
        solidScriptExampleSet('C', '[=(Floor([Signs] / 4) * 2 - 1) * [Extent]]'),
        solidScriptExamplePoint(
          '[=Pick([Far], Vector([C], [A], [B]), Vector([A], [C], [B]), Vector([A], [B], [C])) * [Half]]',
        ),
      ]),
    ]),
  ),
];
