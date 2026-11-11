import { describe, expect, it } from 'vitest';
import { fbxImportDocumentParse } from '@/io/fbx/import/parse/fbx_import_document.js';
import { FbxImportParserAscii } from '@/io/fbx/import/parse/fbx_import_parser_ascii.js';
import { fbxImportObjectName } from '@/io/fbx/import/parse/fbx_import_node.js';
import {
  fbxFixtureEncodeAscii,
  fbxFixtureEncodeBinary,
  fbxFixtureSceneRecords,
  type FbxFixtureScene,
} from '../fbx_import_fixture.js';

/** A large 64-bit id that a double cannot hold exactly. */
const LARGE_ID = 9007199254740993n;

const SCENE: FbxFixtureScene = {
  models: [{ id: 10, name: 'Door "A"', parent: 0, geometry: 20 }],
  geometries: [{ id: 20, vertices: [0, 0, 0, 1, 0, 0, 1, 1, 0], polygons: [[0, 1, 2]] }],
};

/** Every encoding the parser reads. */
const ENCODINGS: [string, Uint8Array][] = [
  ['ASCII', fbxFixtureEncodeAscii(fbxFixtureSceneRecords(SCENE))],
  ['binary 7.4', fbxFixtureEncodeBinary(fbxFixtureSceneRecords(SCENE), 7400)],
  ['binary 7.5 compressed', fbxFixtureEncodeBinary(fbxFixtureSceneRecords(SCENE), 7500, true)],
];

describe('fbxImportDocumentParse', () => {
  it.each(ENCODINGS)('reads objects, arrays and connections from %s files', (_label, bytes) => {
    const document = fbxImportDocumentParse(bytes);
    const model = document.object('10');
    expect(fbxImportObjectName(model?.properties[1])).toBe('Door "A"');
    expect(document.childrenOf('0').map((link) => link.id)).toEqual(['10']);
    expect(document.childrenOf('10').map((link) => link.id)).toEqual(['20']);
    expect([...(document.object('20')?.childArray('PolygonVertexIndex') ?? [])]).toEqual([0, 1, -3]);
    expect([...(document.object('20')?.childArray('Vertices') ?? [])]).toEqual([0, 0, 0, 1, 0, 0, 1, 1, 0]);
    expect(document.globalSettings.number('UnitScaleFactor', 0)).toBe(100);
  });

  it('rejects files that are not FBX 7', () => {
    expect(() => fbxImportDocumentParse(new TextEncoder().encode('hello'))).toThrow('not an FBX file');
    const old = new TextEncoder().encode('FBXHeaderExtension:  {\n\tFBXVersion: 6100\n}\n');
    expect(() => fbxImportDocumentParse(old)).toThrow('FBX 6.x files are not supported');
  });

  it('rejects truncated binary files', () => {
    const bytes = ENCODINGS[1]?.[1] ?? new Uint8Array();
    expect(() => fbxImportDocumentParse(bytes.slice(0, 120))).toThrow('truncated');
  });
});

describe('FbxImportParserAscii', () => {
  it('keeps large ids exact, skips comments and decodes quotes', () => {
    const text = [
      '; comment line with "quotes" and { braces',
      'Objects:  {',
      `\tModel: ${LARGE_ID}, "Model::Wall &quot;north&quot;", "Mesh" {`,
      '\t\tShading: Y',
      '\t\tFileName: "C:\\textures\\brick.png"',
      '\t}',
      '}',
    ].join('\n');
    const [objects] = new FbxImportParserAscii().parse(text);
    const model = objects?.child('Model');
    expect(model?.properties[0]).toBe(LARGE_ID);
    expect(fbxImportObjectName(model?.properties[1])).toBe('Wall "north"');
    expect(model?.child('Shading')?.properties).toEqual(['Y']);
    expect(model?.childString('FileName')).toBe('C:\\textures\\brick.png');
  });

  it('reads arrays spanning several lines and base64 content', () => {
    const text = [
      'Video: 1, "Video::a", "Clip" {',
      '\tContent: ,',
      '\t\t"AAEC"',
      '}',
      'V: *4 {',
      '\ta: 1,2,',
      '3,-4.5',
      '}',
    ].join('\n');
    const [video, values] = new FbxImportParserAscii().parse(text);
    expect(video?.child('Content')?.properties).toEqual(['AAEC']);
    expect([...(values?.properties[0] as Float64Array)]).toEqual([1, 2, 3, -4.5]);
  });
});
