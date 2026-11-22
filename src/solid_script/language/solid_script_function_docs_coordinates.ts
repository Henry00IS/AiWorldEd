import { solidScriptFunctionDocSummary } from './solid_script_function_docs_math.js';

/**
 * Docs of the coordinate helpers: flipping toward a reference, and cylinder and
 * sphere coordinates.
 */
export const SOLID_SCRIPT_FUNCTION_DOCS_COORDINATES = {
  flip_toward: {
    usage: 'FlipToward(vector, reference)',
    summary: solidScriptFunctionDocSummary(
      'Keeps a vector when it already points the same way as the reference, and reverses it when it points away.',
      [
        'FlipToward(Vector(0, -1, 0), Vector(0, 1, 0)) is Vector(0, 1, 0).',
        'FlipToward(Vector(1, 0, 0), Vector(0, 1, 0)) is Vector(1, 0, 0).',
      ],
      'Use it to make every normal face up, or toward the player.',
    ),
    group: 'Vector',
    gives: ['Vector'],
  },
  from_cylinder: {
    usage: 'FromCylinder(radius, degrees, height)',
    summary: solidScriptFunctionDocSummary(
      'Builds a point from cylinder coordinates around the up (Y) axis: how far out, which way around, and how high. 0 degrees points along X and 90 along Z.',
      ['FromCylinder(2, 0, 1) is Vector(2, 1, 0).'],
      'Use it to place things around a tower, such as pillars every 45 degrees.',
    ),
    group: 'Vector',
    gives: ['Vector'],
  },
  from_sphere: {
    usage: 'FromSphere(radius, yaw, pitch)',
    summary: solidScriptFunctionDocSummary(
      'Builds a point from sphere coordinates: how far out, Yaw around the up (Y) axis from X toward Z, and Pitch up from flat toward Y, all in degrees.',
      ['FromSphere(2, 0, 0) is Vector(2, 0, 0).'],
      'Use it to scatter lights over a dome, or aim along a yaw and pitch.',
    ),
    group: 'Vector',
    gives: ['Vector'],
  },
  to_cylinder: {
    usage: 'ToCylinder(vector)',
    summary: solidScriptFunctionDocSummary(
      'Reads a point as cylinder coordinates around the up (Y) axis: radius, degrees and height, in that order.',
      ['ToCylinder(Vector(0, 3, 2)) is Vector(2, 90, 3).'],
      'Use it to ask how far round a tower and how high a point is.',
    ),
    group: 'Vector',
    gives: ['Vector'],
  },
  to_sphere: {
    usage: 'ToSphere(vector)',
    summary: solidScriptFunctionDocSummary(
      'Reads a point as sphere coordinates: radius, yaw and pitch in degrees, in that order.',
      ['ToSphere(Vector(0, 2, 0)) is Vector(2, 0, 90).'],
      'Use it to ask how high above the horizon a point sits as seen from the center.',
    ),
    group: 'Vector',
    gives: ['Vector'],
  },
} as const;

/** Inputs of the coordinate helpers that mean something of their own. */
export const SOLID_SCRIPT_COORDINATES_ARGUMENTS = {
  flip_toward: { reference: { type: ['Vector'], about: 'The way it should point.', start: '0, 1, 0' } },
  from_cylinder: {
    radius: { type: ['Number'], about: 'How far from the up axis.', start: '1' },
    degrees: { type: ['Number'], about: 'Which way around the up axis, 0 along X.', start: '0' },
    height: { type: ['Number'], about: 'How high up.', start: '0' },
  },
  from_sphere: {
    radius: { type: ['Number'], about: 'How far from the center.', start: '1' },
    yaw: { type: ['Number'], about: 'Degrees around the up axis, 0 along X.', start: '0' },
    pitch: { type: ['Number'], about: 'Degrees up from flat.', start: '0' },
  },
} as const;
