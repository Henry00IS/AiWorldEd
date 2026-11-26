import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { modifierGeneratorNodeCreate } from '@/modifier/stack/modifier_generator_node.js';
import { modifierStackCompile } from '@/modifier/stack/evaluate/modifier_stack_compile.js';
import { modifierStackEntryCreate } from '@/modifier/stack/modifier_stack_settings.js';
import { modifierStackOwnerDecode } from '@/modifier/stack/owner/modifier_stack_owner.js';
import {
  MODIFIER_STACK_SOLID_SCRIPT_KIND,
  MODIFIER_STACK_SOLID_SCRIPT_MODIFIER_KIND,
} from '@/modifier/stack/kinds/generator/solid_script/modifier_stack_solid_script_keys.js';
import { MODIFIER_STACK_PATH_KIND } from '@/modifier/stack/kinds/generator/path/modifier_stack_path_object.js';
import { MODIFIER_STACK_PATH_LINE_KEY } from '@/modifier/stack/kinds/generator/path/modifier_stack_path_line.js';
import { PATH_ASSET_DEFAULT, pathAssetEncode, type PathAsset } from '@/path/model/path_asset.js';
import { pathReferenceEncode } from '@/path/model/path_reference.js';
import {
  solidScriptDocumentCreate,
  solidScriptDocumentUsesWith,
  type SolidScriptLine,
} from '@/solid_script/document/solid_script_document.js';

/** A bent three point path, so every write has something to change. */
const WALL: PathAsset = {
  points: [
    [0, 0, 0],
    [2, 0, 0],
    [2, 0, 2],
  ],
  segments: [{ kind: 'Straight' }, { kind: 'Smooth' }],
  closed: false,
};

/**
 * Lines that write to the Wall path every way a script can, then build along
 * it.
 */
const PATH_WRITES: SolidScriptLine[] = [
  { command: 'input', values: { name: 'Wall', type: 'Path' } },
  { command: 'move_by', values: { by: '0, 3, 0', of: '[Wall]' } },
  { command: 'rotate_by', values: { by: '0, 45, 0', of: '[Wall]' } },
  { command: 'set_handles', values: { path: '[Wall]', left: '1, 2, 0', right: '3, 2, 0', into: 'Bent' } },
  { command: 'set_tilt', values: { path: '[Bent]', tilt: '30', into: 'Bent' } },
  { command: 'set_path_closed', values: { path: '[Bent]', closed: 'Yes', into: 'Bent' } },
  { command: 'variable', values: { name: '$persistent.Runs', value: '[=[$persistent.Runs] + 1]' } },
  {
    command: 'sweep_along_path',
    values: { path: '[Wall]', profile: '[0, 0, 0], [0.1, 0, 0], [0.1, 0.1, 0], [0, 0.1, 0]', up: '0, 1, 0' },
  },
];

/**
 * Lines that write to the received brushes every way a script can: Data, moves
 * and UVs.
 */
const BRUSH_WRITES: SolidScriptLine[] = [
  { command: 'input_objects', values: { into: 'B' } },
  { command: 'variable', values: { name: 'B(0).Data.Mark', value: '7' } },
  { command: 'move_by', values: { by: '1, 2, 3', of: '[B]' } },
  { command: 'scale_by', values: { by: '2, 1, 1', of: '[B]' } },
  { command: 'project_box_uvs', values: { size: '3', of: '[B]' } },
  { command: 'transform_uvs', values: { offset: '0.5, 0.25, 0', rotate: '30', of: '[B]' } },
  { command: 'output', values: { of: '[B]' } },
];

/**
 * Writes parameters into a node's first step.
 *
 * @param node Generator node.
 * @param patch Parameters to merge.
 */
function stepPatch(node: THREE.Object3D, patch: Record<string, unknown>): void {
  const settings = ModifierVolume.read(node);
  settings.modifiers[0]!.parameters = { ...settings.modifiers[0]!.parameters, ...patch };
  ModifierVolume.write(node, settings);
}

/**
 * Everything stored on a node and below it, as text, so any change shows.
 *
 * @param node Node.
 * @returns Text.
 */
function stored(node: THREE.Object3D): string {
  const parts: unknown[] = [];
  node.traverse((each) => {
    if (each.userData[MODIFIER_STACK_PATH_LINE_KEY] === true) return;
    parts.push([
      each.name,
      each.position.toArray(),
      each.quaternion.toArray(),
      each.scale.toArray(),
      each.visible,
      JSON.stringify(each.userData),
    ]);
  });
  return JSON.stringify(parts);
}

/**
 * Corners and face surfaces of a brush, as text.
 *
 * @param brush Brush.
 * @returns Text.
 */
function brushStored(brush: SolidBrushInstance): string {
  return JSON.stringify([
    brush.brush.vertices.map((vertex) => vertex.toArray()),
    brush.brush.faces.map((face, index) => [brush.brush.getFaceVertexIndices(face), brush.getFaceSurface(index)]),
    [brush.position.toArray(), brush.rotation.toArray(), brush.scale.toArray(), brush.operation, brush.visible],
  ]);
}

/**
 * A Path object named Room Wall and a script that follows it and writes to it.
 *
 * @returns Model, Path object, script node and a compile.
 */
function pathScene() {
  const model = new SolidModel('Untouched Paths');
  const path = modifierGeneratorNodeCreate(MODIFIER_STACK_PATH_KIND);
  path.name = 'Room Wall';
  path.position.set(5, 0, 1);
  model.root.add(path);
  stepPatch(path, { inputs: { Path: pathAssetEncode(WALL) } });
  const script = modifierGeneratorNodeCreate(MODIFIER_STACK_SOLID_SCRIPT_KIND);
  model.root.add(script);
  stepPatch(script, {
    script: { ...solidScriptDocumentCreate(PATH_WRITES), editMode: true },
    inputs: { Wall: pathReferenceEncode('Room Wall', PATH_ASSET_DEFAULT), '$persistent.Runs': '1' },
  });
  const compile = () => {
    model.root.updateMatrixWorld(true);
    return modifierStackCompile(model.getBrushes(), model.root);
  };
  return { model, path, script, compile };
}

/**
 * A box brush with a SolidScript modifier running the lines.
 *
 * @param lines Script lines.
 * @returns Model, the box and a compile.
 */
function brushScene(lines: SolidScriptLine[]) {
  const model = new SolidModel('Untouched Brushes');
  const source = model.addBoxBrush(1, SolidOperation.Additive);
  const entry = modifierStackEntryCreate(MODIFIER_STACK_SOLID_SCRIPT_MODIFIER_KIND, []);
  entry.parameters['script'] = solidScriptDocumentUsesWith(solidScriptDocumentCreate(lines, 'Both'), {
    generator: true,
    modifier: true,
  });
  modifierStackOwnerDecode(source.mesh as THREE.Mesh, { modifiers: [entry] });
  const compile = () => {
    model.root.updateMatrixWorld(true);
    return modifierStackCompile(model.getBrushes(), model.root);
  };
  return { model, source, compile };
}

describe('SolidScript leaves the scene as it was', () => {
  it('writes to a copy of a followed Path object, never the Path object itself', () => {
    const { path, script, compile } = pathScene();
    const before = stored(path);
    const inputsBefore = JSON.stringify(ModifierVolume.read(script).modifiers[0]!.parameters['inputs']);
    for (let run = 0; run < 3; run += 1) {
      script.position.x = run;
      expect(compile().instances.length).toBeGreaterThan(0);
      expect(stored(path)).toBe(before);
    }
    expect(JSON.stringify(ModifierVolume.read(script).modifiers[0]!.parameters['inputs'])).toBe(inputsBefore);
  });

  it('leaves the Path object as it was when the script is deleted or turned off', () => {
    const { model, path, script, compile } = pathScene();
    const before = stored(path);
    compile();
    stepPatch(script, { enabled: false });
    compile();
    model.root.remove(script);
    compile();
    expect(stored(path)).toBe(before);
  });

  it('never changes an input brush, its UVs or its Data, and gives it back unchanged once deleted', () => {
    const { model, source, compile } = brushScene(BRUSH_WRITES);
    const before = brushStored(source);
    const shown = compile().instances.filter((each) => each.visible);
    expect(shown.some((each) => brushStored(each) !== before)).toBe(true);
    compile();
    expect(brushStored(source)).toBe(before);
    modifierStackOwnerDecode(source.mesh as THREE.Mesh, { modifiers: [] });
    const after = compile().instances.filter((each) => each.id === source.id && each.visible);
    expect(after.map(brushStored)).toEqual([before]);
    expect(model.getBrushes()).toContain(source);
  });
});
