import type { SolidScriptFunctionDoc } from './solid_script_function_docs.js';
import { solidScriptFunctionDocSummary } from './solid_script_function_docs_math.js';
import type { SolidScriptBuiltinName } from './solid_script_functions_builtin.js';

/** Docs of the functions that find main axes of points and matrices. */
export const SOLID_SCRIPT_FUNCTION_DOCS_PRINCIPAL = {
  principal_axes: {
    usage: 'PrincipalAxes(points, output)',
    summary: solidScriptFunctionDocSummary(
      'The main directions of a cloud of points. Output Axes (the default) gives three unit axes square to each other, the one the points spread along most first; Spread gives how far the points spread along each axis (the standard deviation); Center gives their average position.',
      [
        'First(PrincipalAxes(List(Vector(0, 0, 0), Vector(1, 1, 0), Vector(2, 2, 0)))) is [0.707106781, 0.707106781, 0].',
        'PrincipalAxes([Box.Vertices.Positions], "Spread") gives the size along each axis.',
      ],
      'Use it to line up a box with a tilted cluster of points, or find the long side of a shape.',
    ),
    group: 'List',
    gives: ['List'],
  },
  matrix_svd: {
    usage: 'MatrixSvd(matrix, output)',
    summary: solidScriptFunctionDocSummary(
      'Splits the turn and scale part of a matrix into a turn, stretches along three axes, and another turn. Output S (the default) gives the three stretches, largest first; U and V give the turns as matrices, so the matrix is U, then S, then V turned around (MatrixTranspose). U mirrors when the matrix does.',
      ['MatrixSvd(Transform(Vector(0, 0, 0), Vector(0, 30, 0), Vector(1, 3, 2))) is [3, 2, 1].'],
      'Use it to read the stretch of a skewed matrix, or how far it is from a plain turn.',
    ),
    group: 'Vector',
    gives: ['List'],
  },
} as const satisfies Partial<Record<SolidScriptBuiltinName, SolidScriptFunctionDoc>>;

/** Inputs of PrincipalAxes and MatrixSvd that mean something of their own. */
export const SOLID_SCRIPT_PRINCIPAL_ARGUMENTS = {
  principal_axes: {
    points: {
      type: ['List'],
      about: 'The points, such as [Box.Vertices.Positions].',
      start: '[Box.Vertices.Positions]',
    },
    output: {
      type: ['Text'],
      about: 'Axes, Spread or Center.',
      choices: ['Axes', 'Spread', 'Center'],
      default: 'Axes',
    },
  },
  matrix_svd: {
    matrix: {
      type: ['List'],
      about: 'A matrix, such as Transform(move, rotate, scale).',
      start: 'Transform(Vector(0, 0, 0), Vector(0, 0, 0), Vector(1, 2, 3))',
    },
    output: { type: ['Text'], about: 'S, U or V.', choices: ['S', 'U', 'V'], default: 'S' },
  },
} as const;
