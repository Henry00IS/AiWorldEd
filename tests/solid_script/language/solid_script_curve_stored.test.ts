import { describe, expect, it } from 'vitest';
import { curveEncode } from '@/curve/model/curve_codec.js';
import { curveFromPolyline } from '@/curve/model/curve_model.js';
import { pathAssetEncode } from '@/path/model/path_asset.js';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';
import {
  solidScriptCurveFromStored,
  solidScriptCurveFromText,
} from '@/solid_script/language/solid_script_curve_read.js';
import { solidScriptFunctionInputDefault } from '@/solid_script/language/solid_script_function_inputs.js';
import {
  solidScriptPathAssetFromStored,
  solidScriptPathAssetFromText,
} from '@/solid_script/language/solid_script_input_path.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';

/** A curve as the inspector's curve editor stores it. */
const STORED_CURVE = curveEncode(
  curveFromPolyline([
    [0, 1],
    [1, 0],
  ]),
);

/** A path as the inspector stores one drawn in the scene. */
const STORED_PATH = pathAssetEncode({
  points: [
    [0, 0, 0],
    [3, 0, 0],
  ],
  segments: [{ kind: 'Straight' }],
  closed: false,
});

describe('curve and path text', () => {
  it('read encoded values only where the inspector stored them', () => {
    expect(solidScriptCurveFromText(STORED_CURVE)).toBeNull();
    expect(solidScriptCurveFromStored(STORED_CURVE)).not.toBeNull();
    expect(solidScriptPathAssetFromText(STORED_PATH)).toBeNull();
    expect(solidScriptPathAssetFromStored(STORED_PATH)?.points).toEqual([
      [0, 0, 0],
      [3, 0, 0],
    ]);
    expect(solidScriptCurveFromStored('Classic Column')).not.toBeNull();
    expect(solidScriptPathAssetFromStored('[0, 0, 0], [1, 0, 0]')).not.toBeNull();
  });

  it('give a Curve input the curve the inspector stored, and a Path input its path', () => {
    const result = solidScriptProgramRun(
      solidScriptDocumentCreate([
        { command: 'input', values: { name: 'Shape', type: 'Curve', default: '1' } },
        { command: 'input', values: { name: 'Rail', type: 'Path' } },
        { command: 'echo', values: { value: '[=CurveAt([Shape], 1)]' } },
        { command: 'cube', values: {} },
      ]),
      { inputs: { Shape: STORED_CURVE, Rail: STORED_PATH } },
    );
    expect(result.error?.message ?? null).toBeNull();
    expect(Number(result.messages[0])).toBeCloseTo(0, 6);
  });

  it('keep $[ escapes and let a { stand in text', () => {
    const result = solidScriptProgramRun(
      solidScriptDocumentCreate([
        { command: 'echo', values: { value: '$[1$] {a}' } },
        { command: 'cube', values: {} },
      ]),
    );
    expect(result.error).toBeNull();
    expect(result.messages).toEqual(['[1] {a}']);
  });

  it('read Function input defaults as Solid Script values', () => {
    expect(solidScriptFunctionInputDefault('2.5')).toBe(2.5);
    expect(solidScriptFunctionInputDefault('Yes')).toBe(true);
    expect(solidScriptFunctionInputDefault('false')).toBe(false);
    expect(solidScriptFunctionInputDefault('"Oak"')).toBe('Oak');
    expect(solidScriptFunctionInputDefault('[1, 2, "a"]')).toEqual([1, 2, 'a']);
    expect(solidScriptFunctionInputDefault('Classic')).toBe('Classic');
  });
});
