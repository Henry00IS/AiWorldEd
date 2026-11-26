import { describe, expect, it } from 'vitest';
import { curveEncode } from '@/curve/model/curve_codec.js';
import { curveFromPolyline } from '@/curve/model/curve_model.js';
import { pathAssetEncode } from '@/path/model/path_asset.js';
import { solidScriptDocumentNormalize } from '@/solid_script/document/solid_script_document.js';
import { solidScriptDocumentResources } from '@/solid_script/document/solid_script_resource.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';

/** A curve as older scripts kept it in a field, with [ and ] escaped. */
const PROFILE = curveEncode(
  curveFromPolyline([
    [0, 1],
    [0.5, 0.4],
    [1, 1],
  ]),
).replace(/[$[\]]/g, (character) => `$${character}`);

/** A path as older scripts kept it in an Input Default. */
const RAIL = pathAssetEncode({
  points: [
    [0, 0, 0],
    [2, 0, 0],
  ],
  segments: [{ kind: 'Straight' }],
  closed: false,
});

/** A script saved on main, with inline curve and path text. */
const SAVED = {
  version: 1,
  name: 'Old',
  blocks: [
    {
      id: 'a',
      command: 'input',
      values: {
        name: 'Shape',
        type: 'Curve',
        default: curveEncode(
          curveFromPolyline([
            [0, 2],
            [1, 2],
          ]),
        ),
      },
    },
    { id: 'b', command: 'input', values: { name: 'Rail', type: 'Path', default: RAIL } },
    { id: 'c', command: 'column', values: { profile: PROFILE } },
  ],
};

describe('older inline curves and paths', () => {
  it('move into resources named after their field, and the fields name them', () => {
    const document = solidScriptDocumentNormalize(SAVED);
    expect(solidScriptDocumentResources(document).map((resource) => [resource.name, resource.kind])).toEqual([
      ['Shape', 'Curve'],
      ['Rail', 'Path'],
      ['Profile', 'Curve'],
    ]);
    expect(document.blocks.map((block) => block.values['default'] ?? block.values['profile'])).toEqual([
      '[$Resources.Shape]',
      '[$Resources.Rail]',
      '[$Resources.Profile]',
    ]);
  });

  it('build the same column as before', () => {
    const result = solidScriptProgramRun(solidScriptDocumentNormalize(SAVED));
    expect(result.error).toBeNull();
    expect(result.shapes.length).toBeGreaterThan(0);
  });

  it('leave scripts without inline text as they are, and keep a second load the same', () => {
    const once = solidScriptDocumentNormalize(SAVED);
    expect(solidScriptDocumentNormalize(JSON.parse(JSON.stringify(once)))).toEqual(once);
    const plain = {
      version: 1,
      name: '',
      blocks: [{ id: 'p', command: 'column', values: { profile: 'Classic Column' } }],
    };
    expect(solidScriptDocumentNormalize(plain).blocks[0]!.values['profile']).toBe('Classic Column');
  });
});
