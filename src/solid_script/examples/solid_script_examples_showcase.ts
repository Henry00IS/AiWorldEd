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

/**
 * Lines of one curved piece between two angles: four corners at each angle,
 * from a function of the angle. The corners of a piece do not need to lie in
 * flat faces; the solid wraps them, so a twisted slope still makes a clean
 * convex piece.
 *
 * @param from Start angle as field text.
 * @param to End angle as field text.
 * @param corners Four corner formulas that use [a] for the angle.
 * @returns Lines.
 */
function solidScriptExampleSweepPiece(from: string, to: string, corners: readonly string[]): SolidScriptLine[] {
  return solidScriptExamplePolyhedron(
    solidScriptExampleBlock(
      'for_each',
      { variable: 'a', list: `${from}, ${to}` },
      corners.map(solidScriptExamplePoint),
    ),
  );
}

/** A spiral staircase with a smooth sloped underside, posts and a handrail. */
export const SOLID_SCRIPT_EXAMPLE_SPIRAL_STAIRCASE: readonly SolidScriptLine[] = [
  solidScriptExampleNote('Spiral Staircase: treads around a centre column, a smooth slope below and a handrail.'),
  solidScriptExampleInput('steps', 'count', '18', { label: 'Steps', min: '3', max: '128' }),
  solidScriptExampleInput('turn', 'number', '360', { label: 'Turn', min: '30', max: '1440' }),
  solidScriptExampleInput('height', 'number', '3.2', { label: 'Height', min: '0.5' }),
  solidScriptExampleInput('outer', 'number', '1.8', { label: 'Outer Radius', min: '0.3' }),
  solidScriptExampleInput('inner', 'number', '0.3', { label: 'Column Radius', min: '0.05' }),
  solidScriptExampleInput('railHeight', 'number', '0.95', { label: 'Railing Height', min: '0.3' }),
  solidScriptExampleInput('smooth', 'count', '4', { label: 'Smoothness', min: '1', max: '16' }),
  solidScriptExampleSet('rise', '[=[height] / [steps]]'),
  solidScriptExampleSet('per', '[=[turn] / [steps]]'),
  solidScriptExampleSet('base', '[=-[height] / 2]'),
  solidScriptExampleSet('railAt', '[=[outer] - 0.1]'),
  solidScriptExampleNote('A point at an angle, a distance from the middle and a height.'),
  ...solidScriptExampleBlock('function', { name: 'spot', parameters: 'angle, radius, z' }, [
    solidScriptExampleLine('return', {
      value: '[=vector([local.radius] * cos([local.angle]), [local.radius] * sin([local.angle]), [local.z])]',
    }),
  ]),
  solidScriptExampleNote('The slope rises evenly with the angle, through the front edge of every tread.'),
  ...solidScriptExampleBlock('function', { name: 'slope', parameters: 'angle' }, [
    solidScriptExampleLine('return', { value: '[=[base] + [rise] * [local.angle] / [per]]' }),
  ]),
  ...solidScriptExampleBlock('translate', { v: '0, 0, [base]' }, [
    solidScriptExampleLine('cylinder', {
      h: '[=[height] + [railHeight]]',
      r1: '[inner]',
      r2: '[inner]',
      sides: '24',
      center: 'false',
    }),
  ]),
  ...solidScriptExampleRepeat('s', '0', '[=[steps] - 1]', [
    solidScriptExampleSet('top', '[=[base] + [rise] * ([s] + 1)]'),
    ...solidScriptExampleRepeat('p', '0', '[=[smooth] - 1]', [
      ...solidScriptExampleSweepPiece('[=[per] * ([s] + [p] / [smooth])]', '[=[per] * ([s] + ([p] + 1) / [smooth])]', [
        '[=spot([a], [inner], [top] - 0.06)]',
        '[=spot([a], [outer], [top] - 0.06)]',
        '[=spot([a], [outer], [top])]',
        '[=spot([a], [inner], [top])]',
      ]),
    ]),
    solidScriptExampleSet('middle', '[=[per] * ([s] + 0.5)]'),
    ...solidScriptExampleBlock('translate', { v: '[=spot([middle], [railAt], [top])]' }, [
      solidScriptExampleLine('cylinder', {
        h: '[railHeight]',
        r1: '0.02',
        r2: '0.02',
        sides: '8',
        center: 'false',
      }),
    ]),
  ]),
  solidScriptExampleNote('The slope and the handrail follow the turn in small pieces, so they look smooth.'),
  solidScriptExampleSet('pieces', '[=[steps] * [smooth]]'),
  ...solidScriptExampleRepeat('k', '0', '[=[pieces] - 1]', [
    solidScriptExampleSet('from', '[=[turn] * [k] / [pieces]]'),
    solidScriptExampleSet('to', '[=[turn] * ([k] + 1) / [pieces]]'),
    ...solidScriptExampleSweepPiece('[from]', '[to]', [
      '[=spot([a], [inner], slope([a]) - 0.06)]',
      '[=spot([a], [outer], slope([a]) - 0.06)]',
      '[=spot([a], [outer], slope([a]) - 0.26)]',
      '[=spot([a], [inner], slope([a]) - 0.26)]',
    ]),
    ...solidScriptExampleSweepPiece('[from]', '[to]', [
      '[=spot([a], [railAt] - 0.035, slope([a]) + [rise] * 1.5 + [railHeight] - 0.03)]',
      '[=spot([a], [railAt] + 0.035, slope([a]) + [rise] * 1.5 + [railHeight] - 0.03)]',
      '[=spot([a], [railAt] + 0.035, slope([a]) + [rise] * 1.5 + [railHeight] + 0.03)]',
      '[=spot([a], [railAt] - 0.035, slope([a]) + [rise] * 1.5 + [railHeight] + 0.03)]',
    ]),
  ]),
];
