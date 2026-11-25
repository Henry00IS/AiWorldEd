import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { modifierGeneratorNodeCreate } from '@/modifier/stack/modifier_generator_node.js';
import { MODIFIER_STACK_PATH_KIND } from '@/modifier/stack/kinds/generator/path/modifier_stack_path_object.js';
import { MODIFIER_STACK_SOLID_SCRIPT_KIND } from '@/modifier/stack/kinds/generator/solid_script/modifier_stack_solid_script_keys.js';
import { modifierStackCompile } from '@/modifier/stack/evaluate/modifier_stack_compile.js';
import { modifierStackPaths } from '@/modifier/stack/widgets/modifier_stack_sliders.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { pathAssetEncode, type PathAsset } from '@/path/model/path_asset.js';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';
import { solidScriptDocumentListing } from '@/solid_script/document/solid_script_document_listing.js';
import { SOLID_SCRIPT_EXAMPLES } from '@/solid_script/examples/solid_script_examples.js';
import { solidScriptCurveFromText } from '@/solid_script/language/solid_script_curve_read.js';
import { solidScriptFieldMistake } from '@/solid_script/language/solid_script_field_mistakes.js';
import { solidScriptInputsList } from '@/solid_script/language/solid_script_input.js';
import { solidScriptPathAssetFromText } from '@/solid_script/language/solid_script_input_path.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptCommandFind } from '@/solid_script/commands/solid_script_command_catalog.js';
import { SolidScriptEditorHelp } from '@/solid_script/ui/solid_script_editor_help.js';

describe('Solid Script Path and Curve input defaults', () => {
  it('stores Baseboard Wall in Solid Script syntax with Follows instead of JSON', () => {
    const baseboard = SOLID_SCRIPT_EXAMPLES.find((example) => example.id === 'baseboard');
    expect(baseboard).toBeDefined();
    const document = solidScriptDocumentCreate(baseboard!.lines);
    const inputLine = document.blocks.find((block) => block.command === 'input' && block.values['name'] === 'Wall');
    expect(inputLine?.values['default']).toBe('[-2, 0, 1.5], [-2, 0, -1.5], [2, 0, -1.5], [2, 0, 1.5]');
    expect(inputLine?.values['follows']).toBe('Room Wall');
    expect(JSON.stringify(inputLine)).not.toContain('{"scene":');
    const listing = solidScriptDocumentListing(document).join('\n');
    expect(listing).toContain("Input 'Wall' ('Path') = '[-2, 0, 1.5], [-2, 0, -1.5], [2, 0, -1.5], [2, 0, 1.5]'");
    expect(listing).toContain("Follows 'Room Wall'");
    expect(listing).not.toContain('{');

    const help = new SolidScriptEditorHelp();
    help.show(solidScriptCommandFind('input')!, inputLine!);
    expect(help.element.textContent).not.toContain('{"scene":');
    expect(help.element.textContent).toContain('[-2, 0, 1.5], [-2, 0, -1.5], [2, 0, -1.5], [2, 0, 1.5]');
  });

  it('parses Solid Script Path point lists and Curve presets/point lists', () => {
    const open = solidScriptPathAssetFromText('[-2, 0, 1.5], [-2, 0, -1.5], [2, 0, -1.5], [2, 0, 1.5]');
    expect(open).toEqual({
      points: [
        [-2, 0, 1.5],
        [-2, 0, -1.5],
        [2, 0, -1.5],
        [2, 0, 1.5],
      ],
      segments: [{ kind: 'Straight' }, { kind: 'Straight' }, { kind: 'Straight' }],
      closed: false,
    });
    const closed = solidScriptPathAssetFromText('[0, 0, 0], [1, 0, 0], [1, 0, 1], Closed');
    expect(closed?.closed).toBe(true);
    expect(closed?.points).toHaveLength(3);
    expect(solidScriptCurveFromText('Classic Column')?.points.length).toBeGreaterThanOrEqual(4);
    expect(solidScriptCurveFromText('[0, 1], [0.5, 0.4], [1, 0]')?.points).toHaveLength(3);
    expect(solidScriptFieldMistake('[-1.5, 0, 1], [1.5, 0, 1]')).toBe('');
  });

  it('links Baseboard to a Room Wall Path object in the scene from its Follows setting', () => {
    const baseboard = SOLID_SCRIPT_EXAMPLES.find((example) => example.id === 'baseboard')!;
    const world = new THREE.Group();
    const model = new SolidModel('Room');
    world.add(model.root);
    const pathNode = modifierGeneratorNodeCreate(MODIFIER_STACK_PATH_KIND);
    pathNode.name = 'Room Wall';
    const roomWall: PathAsset = {
      points: [
        [0, 0, 0],
        [6, 0, 0],
      ],
      segments: [{ kind: 'Straight' }],
      closed: false,
    };
    const pathMod = ModifierVolume.read(pathNode);
    ModifierVolume.write(pathNode, {
      ...pathMod,
      modifiers: [
        {
          ...pathMod.modifiers[0]!,
          parameters: { ...pathMod.modifiers[0]!.parameters, inputs: { Path: pathAssetEncode(roomWall) } },
        },
      ],
    });
    model.root.add(pathNode);

    const scriptNode = modifierGeneratorNodeCreate(MODIFIER_STACK_SOLID_SCRIPT_KIND);
    const scriptMod = ModifierVolume.read(scriptNode);
    ModifierVolume.write(scriptNode, {
      ...scriptMod,
      modifiers: [
        {
          ...scriptMod.modifiers[0]!,
          parameters: {
            ...scriptMod.modifiers[0]!.parameters,
            script: { ...solidScriptDocumentCreate(baseboard.lines), editMode: true },
            inputs: {},
          },
        },
      ],
    });
    model.root.add(scriptNode);
    world.updateMatrixWorld(true);

    const compiled = modifierStackCompile(model.getBrushes(), model.root);
    const bounds = new THREE.Box3();
    for (const instance of compiled.instances) bounds.union(instance.getModelSpaceBounds());
    expect(bounds.max.x).toBeGreaterThan(5.9);
    expect(bounds.min.x).toBeGreaterThanOrEqual(-0.05);
    expect(modifierStackPaths(scriptNode)).toEqual([]);

    const run = solidScriptProgramRun(solidScriptDocumentCreate(baseboard.lines));
    expect(run.error).toBeNull();
    expect(solidScriptInputsList(solidScriptDocumentCreate(baseboard.lines).blocks)[0]?.follows).toBe('Room Wall');
  });
});
