import { SOLID_SCRIPT_CURVE_PROFILE_SIDES } from './solid_script_curve_profile.js';
import { solidScriptFunctionDocSummary } from './solid_script_function_docs_math.js';

/**
 * Docs of CurveProfile, which turns a curve into a closed 2D XY moulding
 * profile.
 */
export const SOLID_SCRIPT_FUNCTION_DOCS_CURVE_PROFILE = {
  curve_profile: {
    usage: 'CurveProfile(curve, height, depth, side, segments)',
    summary: solidScriptFunctionDocSummary(
      'Turns a Curve into a closed 2D XY profile by rotating it -90 degrees along a vertical edge: the curve left (0) sits at the bottom and right (1) at the top, and curve height scales outward depth. Side is Normal (outward), Flipped (inward) or Mirrored (both sides).',
      ['CurveProfile([Moulding], 0.15, 0.03, "Normal", 16) builds a baseboard profile for Sweep Along Path.'],
      'Use it to sweep baseboards, cornices and trim profiles along any path.',
    ),
    group: 'Curve',
    gives: ['List'],
  },
} as const;

/**
 * Input definitions of CurveProfile for formulas, autocomplete and the Formula
 * Editor.
 */
export const SOLID_SCRIPT_CURVE_PROFILE_ARGUMENTS = {
  curve_profile: {
    curve: {
      type: ['Text'],
      about: 'Curve profile, such as 1 or [Wall].',
      curve: true,
    },
    height: {
      type: ['Number'],
      about: 'Height of the vertical profile in metres, such as 0.15.',
      default: '1',
      start: '1',
    },
    depth: {
      type: ['Number'],
      about: 'Outward depth at curve value 1 in metres, such as 0.03.',
      default: '0.2',
      start: '0.2',
    },
    side: {
      type: ['Text'],
      about: 'Which side the curve shapes: Normal, Flipped or Mirrored, such as Normal.',
      choices: SOLID_SCRIPT_CURVE_PROFILE_SIDES,
      default: 'Normal',
      start: 'Normal',
    },
    segments: {
      type: ['Number'],
      about: 'Straight steps along the height, from 1 to 256, such as 16.',
      default: '16',
      start: '16',
    },
  },
} as const;
