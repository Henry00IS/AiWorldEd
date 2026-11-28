import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  modifierStackPathsRecord,
  modifierStackPathsRecorded,
} from '@/modifier/stack/widgets/modifier_stack_path_record.js';
import { curveDecode } from '@/curve/model/curve_codec.js';
import { curveFromPolyline } from '@/curve/model/curve_model.js';
import { pathAssetDecode } from '@/path/model/path_asset.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptDocumentInputLayout } from '@/solid_script/document/solid_script_document_inputs.js';
import {
  solidScriptDocumentResourcesWith,
  solidScriptResourceCurve,
  solidScriptResourceText,
  type SolidScriptResource,
} from '@/solid_script/document/solid_script_resource.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptConfiguratorResourceWords } from '@/solid_script/ui/solid_script_configurator_fields.js';
import { solidScriptCommandFind } from '@/solid_script/commands/solid_script_command_catalog.js';
import { solidScriptDocumentNamesAt } from '@/solid_script/document/solid_script_document_names.js';

const RESOURCES: SolidScriptResource[] = [
  solidScriptResourceCurve(
    'Arch',
    curveFromPolyline([
      [0, 0],
      [0.5, 1],
      [1, 0],
    ]),
  ),
  {
    name: 'Rail',
    kind: 'Path',
    path: {
      points: [
        [0, 0, 0],
        [4, 0, 0],
      ],
      segments: [{ kind: 'Straight' }],
      closed: false,
    },
  },
  { name: 'Brick', kind: 'Texture', textureId: 'embedded:brick' },
  solidScriptResourceText('Note', '  hello [$Local.X]  '),
];

/**
 * Makes a script with an Input and the test resources.
 *
 * @param type Input type.
 * @param fallback Default.
 * @param more Lines after the Input.
 * @returns Script.
 */
function script(type: string, fallback: string, ...more: SolidScriptLine[]) {
  const input = { command: 'input', values: { name: 'Shape', type, default: fallback } };
  return solidScriptDocumentResourcesWith(solidScriptDocumentCreate([input, ...more, { command: 'cube' }]), RESOURCES);
}

describe('Input Defaults that pick a resource', () => {
  it('give the resource value when the inspector has not set one', () => {
    const echo = (value: string) => ({ command: 'echo', values: { value } });
    expect(solidScriptProgramRun(script('Curve', '[$Resources.Arch]', echo('[Shape.Length]'))).messages).toEqual(['3']);
    expect(solidScriptProgramRun(script('Path', '[$Resources.Rail]', echo('[Shape.Points]'))).messages).toEqual([
      '[[0, 0, 0], [4, 0, 0]]',
    ]);
    expect(solidScriptProgramRun(script('Texture', '[$Resources.Brick]', echo('[Shape]'))).messages).toEqual([
      'embedded:brick',
    ]);
    expect(solidScriptProgramRun(script('Text', '[$Resources.Note]', echo('[Shape]'))).messages).toEqual([
      '  hello [$Local.X]  ',
    ]);
  });

  it('show the resource in the inspector', () => {
    const fallback = (type: string, text: string) => {
      const item = solidScriptDocumentInputLayout(script(type, text))[0];
      return item?.kind === 'input' ? item.input.fallback : '';
    };
    expect(curveDecode(fallback('Curve', '[$Resources.Arch]'))?.points).toHaveLength(3);
    expect(pathAssetDecode(fallback('Path', '[$Resources.Rail]'))?.points[1]).toEqual([4, 0, 0]);
    expect(fallback('Texture', '[$Resources.Brick]')).toBe('embedded:brick');
    expect(fallback('Text', '[$Resources.Note]')).toBe('  hello [$Local.X]  ');
    expect(fallback('Curve', '[$Resources.Rail]')).toBe('[$Resources.Rail]');
    expect(fallback('Text', '[$Resources.Brick]')).toBe('[$Resources.Brick]');
  });

  it('offer the resources of the Input type in the Default field', () => {
    const names = solidScriptDocumentNamesAt(script('Curve', '1'), 0);
    const parameter = solidScriptCommandFind('input')!.parameters.find((each) => each.key === 'default')!;
    const words = (type: string) =>
      solidScriptConfiguratorResourceWords(parameter, { type }, names).map((word) => word.word);
    expect(words('Curve')).toEqual(['[$Resources.Arch]']);
    expect(words('path')).toEqual(['[$Resources.Rail]']);
    expect(words('Texture')).toEqual(['[$Resources.Brick]']);
    expect(words('Text')).toEqual(['[$Resources.Note]']);
    expect(words('Number')).toEqual([]);
  });
});

describe('Edit Mode and Path resources', () => {
  it('draws the Path resource an Input picks, and no other resource', () => {
    const owner = new THREE.Object3D();
    const document = solidScriptDocumentResourcesWith(
      solidScriptDocumentCreate([
        { command: 'input', values: { name: 'Track', type: 'Path', default: '[$Resources.Rail]' } },
        { command: 'cube' },
      ]),
      [...RESOURCES, { ...RESOURCES[1]!, name: 'Other' } as SolidScriptResource],
    );
    modifierStackPathsRecord(owner, 'step', document, undefined, new THREE.Matrix4());
    const paths = modifierStackPathsRecorded(owner, 'step');
    expect(paths.map((path) => path.name)).toEqual(['Track']);
    expect(paths[0]!.path.points).toEqual([
      [0, 0, 0],
      [4, 0, 0],
    ]);
  });
});
