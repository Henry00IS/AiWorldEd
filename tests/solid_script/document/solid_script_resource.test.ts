import { describe, expect, it } from 'vitest';
import { curveFromPolyline } from '@/curve/model/curve_model.js';
import {
  solidScriptDocumentCreate,
  solidScriptDocumentNormalize,
  type SolidScriptDocument,
  type SolidScriptLine,
} from '@/solid_script/document/solid_script_document.js';
import {
  solidScriptDocumentResourcesWith,
  solidScriptResourceCurve,
  solidScriptResourceNameFree,
  type SolidScriptResource,
} from '@/solid_script/document/solid_script_resource.js';
import { solidScriptFileDecode, solidScriptFileEncode } from '@/solid_script/file/solid_script_file.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';

const RESOURCES: SolidScriptResource[] = [
  solidScriptResourceCurve(
    'Ramp',
    curveFromPolyline([
      [0, 0],
      [1, 1],
    ]),
  ),
  {
    name: 'Rail',
    kind: 'Path',
    path: {
      points: [
        [0, 0, 0],
        [2, 0, 0],
      ],
      segments: [{ kind: 'Straight' }],
      closed: false,
    },
  },
  { name: 'Brick', kind: 'Texture', textureId: 'tex-brick' },
];

/**
 * Makes a script with the test resources.
 *
 * @param lines Lines.
 * @returns Script.
 */
function script(...lines: SolidScriptLine[]): SolidScriptDocument {
  return solidScriptDocumentResourcesWith(solidScriptDocumentCreate([...lines, { command: 'cube' }]), RESOURCES);
}

/**
 * Echoes values in a script with the test resources.
 *
 * @param values Echo values.
 * @returns Messages, or the error.
 */
function echo(...values: string[]): string[] | string {
  const run = solidScriptProgramRun(script(...values.map((value) => ({ command: 'echo', values: { value } }))));
  return run.error ? run.error.message : run.messages;
}

describe('Script resources', () => {
  it('reads a curve, a path and a texture as $Resource.Name, in any case', () => {
    expect(echo('[$Resource.Ramp.Length]', '[$resource.rail.Points]', '[$Resource.Brick]')).toEqual([
      '2',
      '[[0, 0, 0], [2, 0, 0]]',
      'tex-brick',
    ]);
    expect(Number(echo('[=CurveAt([$Resource.Ramp], 0.5)]')[0])).toBeCloseTo(0.5, 6);
  });

  it('feeds a resource curve to functions that take a curve', () => {
    expect(echo('[=Len(CurveProfile([$Resource.Ramp], 1, 0.2, "Normal", 4)) > 2]')).toEqual(['Yes']);
  });

  it('works on a copy, so the stored resource never changes', () => {
    const document = script({ command: 'variable', values: { name: 'Mine', value: '[$Resource.Ramp]' } });
    solidScriptProgramRun(document);
    expect(document.resources).toEqual(RESOURCES);
  });

  it('says which resources there are when a name is wrong, and refuses to set one', () => {
    expect(echo('[$Resource.Nope]')).toContain('add it in the Resources tab, or use one of Ramp, Rail, Brick');
    const run = solidScriptProgramRun(script({ command: 'variable', values: { name: '$Resource.Ramp', value: '1' } }));
    expect(run.error?.message).toContain('can only be read');
  });

  it('keeps resources through a saved script file and drops broken ones', async () => {
    const decoded = await solidScriptFileDecode(await solidScriptFileEncode(script()));
    expect(decoded.resources).toEqual(RESOURCES);
    const normalized = solidScriptDocumentNormalize({
      blocks: [],
      resources: [...RESOURCES, { name: 'Ramp', kind: 'Texture', textureId: 'x' }, { name: '1bad', kind: 'Curve' }],
    });
    expect(normalized.resources).toEqual(RESOURCES);
  });

  it('leaves resources out of a script that has none, so older scripts stay the same', () => {
    expect('resources' in solidScriptDocumentNormalize({ blocks: [] })).toBe(false);
    expect(solidScriptResourceNameFree(RESOURCES, 'Ramp')).toBe('Ramp2');
    expect(solidScriptResourceNameFree(RESOURCES, 'my curve')).toBe('mycurve');
  });

  it('reads many resources quickly', () => {
    const many = Array.from({ length: 200 }, (_, index) =>
      solidScriptResourceCurve(
        `C${index}`,
        curveFromPolyline([
          [0, index / 200],
          [1, 1],
        ]),
      ),
    );
    const document = solidScriptDocumentResourcesWith(
      solidScriptDocumentCreate([
        ...many.map((resource) => ({ command: 'echo', values: { value: `[$Resource.${resource.name}.Length]` } })),
        { command: 'cube' },
      ]),
      many,
    );
    const started = performance.now();
    expect(solidScriptProgramRun(document).messages).toHaveLength(200);
    expect(performance.now() - started).toBeLessThan(5000);
  });
});
