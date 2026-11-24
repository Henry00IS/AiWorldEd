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
      { variable: 'A', list: `${from}, ${to}` },
      corners.map(solidScriptExamplePoint),
    ),
  );
}

/**
 * A spiral staircase with a smooth sloped underside, an outer stringer, posts
 * and a handrail.
 */
export const SOLID_SCRIPT_EXAMPLE_SPIRAL_STAIRCASE: readonly SolidScriptLine[] = [
  ...solidScriptExampleNote(
    'This is a showcase of a finished piece. If you are new, start with Wall With a Doorway under Basics, then come back. Treads go around a center column, with a smooth slope below, a stringer and a handrail.',
  ),
  solidScriptExampleInput('Steps', 'Count', '18', { label: 'Steps', min: '3', max: '128' }),
  solidScriptExampleInput('Turn', 'Number', '360', { label: 'Turn', min: '30', max: '1440' }),
  solidScriptExampleInput('Height', 'Number', '3.2', { label: 'Height', min: '0.5' }),
  solidScriptExampleInput('Outer', 'Number', '1.8', { label: 'Outer Radius', min: '0.3' }),
  solidScriptExampleInput('Inner', 'Number', '0.3', { label: 'Column Radius', min: '0.05' }),
  solidScriptExampleInput('RailHeight', 'Number', '0.95', { label: 'Railing Height', min: '0.3' }),
  solidScriptExampleInput('Smooth', 'Count', '4', { label: 'Smoothness', min: '1', max: '16' }),
  solidScriptExampleSet('Rise', '[=[Height] / [Steps]]'),
  solidScriptExampleSet('Per', '[=[Turn] / [Steps]]'),
  solidScriptExampleSet('Base', '[=-[Height] / 2]'),
  ...solidScriptExampleNote('RingPoint takes the width across a ring, twice its radius, at an angle and a height.'),
  solidScriptExampleSet('InnerWidth', '[=[Inner] * 2]'),
  solidScriptExampleSet('OuterWidth', '[=[Outer] * 2]'),
  solidScriptExampleSet('RailWidth', '[=[OuterWidth] - 0.2]'),
  ...solidScriptExampleNote('The slope rises evenly with the angle, through the front edge of every tread.'),
  ...solidScriptExampleBlock('function', { name: 'Slope', parameters: 'Angle' }, [
    solidScriptExampleLine('return', { value: '[=[Base] + [Rise] * [Local.Angle] / [Per]]' }),
  ]),
  ...solidScriptExampleBlock('transform', { move: '0, [Base], 0' }, [
    solidScriptExampleLine('cylinder', {
      h: '[=[Height] + [RailHeight]]',
      r1: '[Inner]',
      r2: '[Inner]',
      sides: '24',
      anchor: 'Center, Bottom, Center',
    }),
  ]),
  ...solidScriptExampleRepeat('S', '0', '[Steps]', [
    solidScriptExampleSet('Top', '[=[Base] + [Rise] * ([S] + 1)]'),
    ...solidScriptExampleRepeat('P', '0', '[Smooth]', [
      ...solidScriptExampleSweepPiece('[=[Per] * ([S] + [P] / [Smooth])]', '[=[Per] * ([S] + ([P] + 1) / [Smooth])]', [
        '[=RingPoint([A], [InnerWidth], [Top] - 0.06)]',
        '[=RingPoint([A], [OuterWidth], [Top] - 0.06)]',
        '[=RingPoint([A], [OuterWidth], [Top])]',
        '[=RingPoint([A], [InnerWidth], [Top])]',
      ]),
    ]),
    solidScriptExampleSet('Middle', '[=[Per] * ([S] + 0.5)]'),
    ...solidScriptExampleBlock('transform', { move: '[=RingPoint([Middle], [RailWidth], [Top])]' }, [
      solidScriptExampleLine('cylinder', {
        h: '[RailHeight]',
        r1: '0.02',
        r2: '0.02',
        sides: '8',
        anchor: 'Center, Bottom, Center',
      }),
    ]),
  ]),
  ...solidScriptExampleNote(
    'The slope, the outer stringer and the handrail follow the turn in small twisted pieces, so they look smooth.',
  ),
  solidScriptExampleSet('Pieces', '[=[Steps] * [Smooth]]'),
  ...solidScriptExampleRepeat('K', '0', '[Pieces]', [
    solidScriptExampleSet('From', '[=[Turn] * [K] / [Pieces]]'),
    solidScriptExampleSet('To', '[=[Turn] * ([K] + 1) / [Pieces]]'),
    ...solidScriptExampleSweepPiece('[From]', '[To]', [
      '[=RingPoint([A], [InnerWidth], Slope([A]) - 0.06)]',
      '[=RingPoint([A], [OuterWidth], Slope([A]) - 0.06)]',
      '[=RingPoint([A], [OuterWidth], Slope([A]) - 0.26)]',
      '[=RingPoint([A], [InnerWidth], Slope([A]) - 0.26)]',
    ]),
    ...solidScriptExampleSweepPiece('[From]', '[To]', [
      '[=RingPoint([A], [OuterWidth], Slope([A]) - 0.26)]',
      '[=RingPoint([A], [OuterWidth] + 0.08, Slope([A]) - 0.26)]',
      '[=RingPoint([A], [OuterWidth] + 0.08, Slope([A]) + [Rise] + 0.04)]',
      '[=RingPoint([A], [OuterWidth], Slope([A]) + [Rise] + 0.04)]',
    ]),
    ...solidScriptExampleNote(
      'The handrail runs through the post tops: a post stands half a step past the front edge.',
    ),
    ...solidScriptExampleSweepPiece('[From]', '[To]', [
      '[=RingPoint([A], [RailWidth] - 0.07, Slope([A]) + [Rise] * 0.5 + [RailHeight] - 0.03)]',
      '[=RingPoint([A], [RailWidth] + 0.07, Slope([A]) + [Rise] * 0.5 + [RailHeight] - 0.03)]',
      '[=RingPoint([A], [RailWidth] + 0.07, Slope([A]) + [Rise] * 0.5 + [RailHeight] + 0.03)]',
      '[=RingPoint([A], [RailWidth] - 0.07, Slope([A]) + [Rise] * 0.5 + [RailHeight] + 0.03)]',
    ]),
  ]),
];
