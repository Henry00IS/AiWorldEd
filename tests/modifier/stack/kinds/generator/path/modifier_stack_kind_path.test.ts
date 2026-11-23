import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SolidModel } from '@/solid/model/solid_model.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import {
  MODIFIER_GENERATOR_NODE_KINDS,
  modifierGeneratorNodeCreate,
} from '@/modifier/stack/modifier_generator_node.js';
import { modifierStackCompile } from '@/modifier/stack/evaluate/modifier_stack_compile.js';
import { modifierStackPaths } from '@/modifier/stack/widgets/modifier_stack_sliders.js';
import { MODIFIER_STACK_SOLID_SCRIPT_KIND } from '@/modifier/stack/kinds/generator/solid_script/modifier_stack_solid_script_keys.js';
import {
  MODIFIER_STACK_PATH_KIND,
  modifierStackPathObjectAsset,
} from '@/modifier/stack/kinds/generator/path/modifier_stack_path_object.js';
import { modifierStackKindFind } from '@/modifier/stack/modifier_stack_catalog.js';
import { ModifierStackFieldRows } from '@/modifier/stack/ui/modifier_stack_field_rows.js';
import { CommandStack } from '@/commands/command_stack.js';
import { MODIFIER_STACK_PATH_LINE_KEY } from '@/modifier/stack/kinds/generator/path/modifier_stack_path_line.js';
import {
  modifierStackScenePathNames,
  modifierStackScenePathsLink,
} from '@/modifier/stack/kinds/generator/path/modifier_stack_scene_paths.js';
import { PATH_ASSET_DEFAULT, pathAssetDecode, pathAssetEncode, type PathAsset } from '@/path/model/path_asset.js';
import { pathReferenceEncode } from '@/path/model/path_reference.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';

/** A two metre stretch along X from the Path object's centre. */
const STRETCH: PathAsset = {
  points: [
    [0, 0, 0],
    [2, 0, 0],
  ],
  segments: [{ kind: 'Straight' }],
  closed: false,
};

/**
 * Writes the inputs of a node's first step.
 *
 * @param node Generator node.
 * @param patch Parameters to merge.
 */
function stepPatch(node: THREE.Object3D, patch: Record<string, unknown>): void {
  const settings = ModifierVolume.read(node);
  const step = settings.modifiers[0]!;
  step.parameters = { ...step.parameters, ...patch };
  ModifierVolume.write(node, settings);
}

/**
 * Builds a Path object named Room Wall at x 5 and a SolidScript generator at
 * the origin sweeping a thin bar along its Wall input, linked to Room Wall.
 *
 * @returns Model, Path object, generator and a compile that returns generated
 *   bounds.
 */
function scene() {
  const model = new SolidModel('Scene Paths');
  const path = modifierGeneratorNodeCreate(MODIFIER_STACK_PATH_KIND);
  path.name = 'Room Wall';
  path.position.set(5, 0, 0);
  model.root.add(path);
  stepPatch(path, { inputs: { Path: pathAssetEncode(STRETCH) } });
  const generator = modifierGeneratorNodeCreate(MODIFIER_STACK_SOLID_SCRIPT_KIND);
  model.root.add(generator);
  const lines: SolidScriptLine[] = [
    { command: 'input', values: { name: 'Wall', type: 'Path' } },
    {
      command: 'sweep_along_path',
      values: { path: '[Wall]', profile: '[0, 0, 0], [0.1, 0, 0], [0.1, 0.1, 0], [0, 0.1, 0]', up: '0, 1, 0' },
    },
  ];
  stepPatch(generator, {
    script: { ...solidScriptDocumentCreate(lines), editMode: true },
    inputs: { Wall: pathReferenceEncode('Room Wall', PATH_ASSET_DEFAULT) },
  });
  const compile = () => {
    model.root.updateMatrixWorld(true);
    const bounds = new THREE.Box3();
    for (const instance of modifierStackCompile(model.getBrushes(), model.root).instances) {
      bounds.union(instance.getModelSpaceBounds());
    }
    return bounds;
  };
  return { model, path, generator, compile };
}

describe('Path objects', () => {
  it('is offered as a generator node that builds nothing and records its path for editing', () => {
    expect(MODIFIER_GENERATOR_NODE_KINDS).toContain(MODIFIER_STACK_PATH_KIND);
    const { path, compile } = scene();
    path.position.set(0, 0, 50);
    stepPatch(path, { inputs: { Path: pathAssetEncode(STRETCH) } });
    compile();
    const [record, ...rest] = modifierStackPaths(path);
    expect(rest).toEqual([]);
    expect([record?.name, record?.label, record?.path]).toEqual(['Path', 'Room Wall', STRETCH]);
    const end = new THREE.Vector3(2, 0, 0).applyMatrix4(record!.frame);
    expect(end.toArray().map((value) => Math.round(value * 1e6) / 1e6)).toEqual([2, 0, 50]);
  });

  it('shows its path as a line that is never picked', () => {
    const { path, compile } = scene();
    compile();
    const lines = path.children.filter((child) => child.userData[MODIFIER_STACK_PATH_LINE_KEY] === true);
    expect(lines).toHaveLength(1);
    const hits: THREE.Intersection[] = [];
    lines[0]!.raycast(new THREE.Raycaster(), hits);
    expect(hits).toEqual([]);
  });

  it('lists the scene Paths by name for the pickers', () => {
    const { model } = scene();
    expect(modifierStackScenePathNames(model.root)).toEqual(['Room Wall']);
  });

  it('lets a script Path input follow a scene Path, in script coordinates', () => {
    const { model, generator } = scene();
    model.root.updateMatrixWorld(true);
    const linked = modifierStackScenePathsLink(
      generator,
      { Wall: pathReferenceEncode('Room Wall', PATH_ASSET_DEFAULT), Height: '2' },
      new THREE.Matrix4().makeTranslation(1, 0, 0),
    );
    expect(linked.missing).toEqual([]);
    expect(linked.inputs['Height']).toBe('2');
    expect(pathAssetDecode(linked.inputs['Wall']!)?.points).toEqual([
      [4, 0, 0],
      [6, 0, 0],
    ]);
  });

  it('falls back to the stored shape when no scene Path has the name', () => {
    const { generator } = scene();
    const linked = modifierStackScenePathsLink(
      generator,
      { Wall: pathReferenceEncode('Hall', STRETCH) },
      new THREE.Matrix4(),
    );
    expect(linked.missing).toEqual(['Hall']);
    expect(pathAssetDecode(linked.inputs['Wall']!)).toEqual(STRETCH);
  });

  it('rebuilds a linked script when the scene Path moves or changes, and does not edit it from the script', () => {
    const { path, generator, compile } = scene();
    expect(compile().max.x).toBeCloseTo(7, 4);
    path.position.x = 9;
    expect(compile().max.x).toBeCloseTo(11, 4);
    stepPatch(path, {
      inputs: {
        Path: pathAssetEncode({
          ...STRETCH,
          points: [
            [0, 0, 0],
            [4, 0, 0],
          ],
        }),
      },
    });
    expect(compile().max.x).toBeCloseTo(13, 4);
    expect(modifierStackPaths(generator)).toEqual([]);
  });

  it('rebuilds a linked script when only the script moves', () => {
    const { generator, compile } = scene();
    expect(compile().max.x).toBeCloseTo(7, 4);
    generator.position.x = 3;
    expect(compile().max.x).toBeCloseTo(7, 4);
  });

  it('edits its path in the inspector as one undo step, without a Follows choice', () => {
    const node = modifierGeneratorNodeCreate(MODIFIER_STACK_PATH_KIND);
    new THREE.Group().add(node);
    stepPatch(node, {
      inputs: {
        Path: pathAssetEncode({
          ...STRETCH,
          points: [
            [0, 0, 0],
            [2, 0, 0],
            [2, 0, 2],
          ],
          segments: [{ kind: 'Straight' }, { kind: 'Straight' }],
        }),
      },
    });
    const kind = modifierStackKindFind(MODIFIER_STACK_PATH_KIND)!;
    const step = ModifierVolume.read(node).modifiers[0]!;
    const commandStack = new CommandStack(10);
    const parameters = () => kind.normalizeParameters(ModifierVolume.read(node).modifiers[0]?.parameters ?? {});
    const rows = new ModifierStackFieldRows(
      kind.fields,
      () => undefined,
      () => [],
      {},
      (status) => ({
        volume: node,
        stepId: step.id,
        commandStack,
        status,
        refresh: () => rows.update(parameters()),
      }),
    );
    rows.update(parameters());
    expect(rows.getElement().querySelector('[data-path-follows]')).toBeNull();
    expect(kind.summary(parameters())).toContain('3');
    const closed = rows.getElement().querySelector<HTMLInputElement>('input[aria-label="Closed"]')!;
    closed.checked = true;
    closed.dispatchEvent(new Event('change'));
    expect(modifierStackPathObjectAsset(parameters()).closed).toBe(true);
    commandStack.undo();
    expect(modifierStackPathObjectAsset(parameters()).closed).toBe(false);
  });

  it('takes a path an assistant writes as text, and keeps the stored one for text that is no path', () => {
    const kind = modifierStackKindFind(MODIFIER_STACK_PATH_KIND)!;
    const stored = kind.normalizeParameters({ path: pathAssetEncode(STRETCH) });
    expect(modifierStackPathObjectAsset(stored)).toEqual(STRETCH);
    expect(modifierStackPathObjectAsset(kind.normalizeParameters({ ...stored, path: 'nope' }))).toEqual(STRETCH);
    expect(stored).not.toHaveProperty('path');
  });
});
