import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { getSolidGroupOperation, isSolidCsgGroup } from '@/solid/model/solid_group.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { modifierGeneratorNodeCreate, modifierGeneratorNodeKind } from '@/modifier/stack/modifier_generator_node.js';
import { modifierStackCompile } from '@/modifier/stack/evaluate/modifier_stack_compile.js';
import { modifierStackStatusRead } from '@/modifier/stack/evaluate/modifier_stack_status.js';
import { SceneSerializer } from '@/io/scene/scene_serializer.js';
import { SceneDeserializer } from '@/io/scene/scene_deserializer.js';
import { SolidModelRegistry } from '@/solid/model/solid_model_registry.js';
import {
  solidScriptDocumentCreate,
  solidScriptDocumentNormalize,
  type SolidScriptLine,
} from '@/solid_script/document/solid_script_document.js';
import { solidScriptDebugStepLimitSet } from '@/solid_script/debug/solid_script_debug_steps.js';
import { modifierStackKindFind } from '@/modifier/stack/modifier_stack_catalog.js';
import { MODIFIER_STACK_SOLID_SCRIPT_KIND } from '@/modifier/stack/kinds/generator/solid_script/modifier_stack_kind_solid_script.js';

/**
 * Builds a world with an empty solid holding one SolidScript generator node.
 *
 * @returns Fixture parts.
 */
function scriptFixture() {
  const world = new THREE.Group();
  const model = new SolidModel('Script test');
  world.add(model.root);
  const node = modifierGeneratorNodeCreate(MODIFIER_STACK_SOLID_SCRIPT_KIND);
  model.root.add(node);
  const compile = () => {
    world.updateMatrixWorld(true);
    return modifierStackCompile(model.getBrushes(), model.root);
  };
  const pieces = () => compile().instances.filter((brush) => brush.id.startsWith(`${node.uuid}#`));
  return { world, model, node, compile, pieces };
}

/**
 * Changes parameters of the node's generator.
 *
 * @param node Generator node.
 * @param patch Parameters.
 */
function scriptSet(node: THREE.Object3D, patch: Record<string, unknown>): void {
  const settings = ModifierVolume.read(node);
  const [first, ...rest] = settings.modifiers;
  if (!first) throw new Error('Expected the generator modifier');
  ModifierVolume.write(node, {
    ...settings,
    modifiers: [{ ...first, parameters: { ...first.parameters, ...patch } }, ...rest],
  });
}

/**
 * Measures brushes in world space.
 *
 * @param brushes Brushes with meshes.
 * @returns Bounds.
 */
function bounds(brushes: readonly { brush: { vertices: readonly THREE.Vector3[] } }[]): THREE.Box3 {
  return new THREE.Box3().setFromPoints(brushes.flatMap((brush) => [...brush.brush.vertices]));
}

/**
 * Expects two boxes to match within a millimetre.
 *
 * @param actual Measured box.
 * @param expected Expected box.
 */
function expectBox(actual: THREE.Box3, expected: THREE.Box3): void {
  for (const key of ['min', 'max'] as const)
    for (const axis of ['x', 'y', 'z'] as const) expect(actual[key][axis]).toBeCloseTo(expected[key][axis], 3);
}

/**
 * Creates a script of command lines.
 *
 * @param lines Lines.
 * @returns Script.
 */
function script(...lines: SolidScriptLine[]) {
  return solidScriptDocumentCreate(lines, 'Test');
}

describe('SolidScript generator', () => {
  it('starts with a script and builds its difference as a CSG group of an additive and a subtractive piece', () => {
    const fixture = scriptFixture();
    expect(modifierGeneratorNodeKind(fixture.node)).toBe(MODIFIER_STACK_SOLID_SCRIPT_KIND);
    const pieces = fixture.pieces();
    expect(pieces.map((piece) => piece.operation)).toEqual([SolidOperation.Additive, SolidOperation.Subtractive]);
    const group = pieces[0]?.mesh?.parent;
    expect(group && isSolidCsgGroup(group) && getSolidGroupOperation(group)).toBe(SolidOperation.Additive);
    expect(pieces[1]?.mesh?.parent).toBe(group);
  });

  it('places script metres at the bottom centre of the box, Z up, without scaling', () => {
    const fixture = scriptFixture();
    const box = new THREE.Box3().setFromObject(fixture.node);
    scriptSet(fixture.node, { script: script({ command: 'cube', values: { size: '[1, 2, 3]' } }) });
    const expected = new THREE.Box3(
      new THREE.Vector3(box.getCenter(new THREE.Vector3()).x, box.min.y, box.getCenter(new THREE.Vector3()).z - 2),
      new THREE.Vector3(box.getCenter(new THREE.Vector3()).x + 1, box.min.y + 3, box.getCenter(new THREE.Vector3()).z),
    );
    expectBox(bounds(fixture.pieces()), expected);
  });

  it('stretches the result to fill the box, or fits it without distortion', () => {
    const fixture = scriptFixture();
    fixture.node.scale.set(4, 2, 6);
    const box = new THREE.Box3().setFromObject(fixture.node);
    scriptSet(fixture.node, { script: script({ command: 'cube' }), placement: 'stretch' });
    expectBox(bounds(fixture.pieces()), box);
    scriptSet(fixture.node, { placement: 'fit' });
    const fitted = bounds(fixture.pieces()).getSize(new THREE.Vector3());
    expect(fitted.toArray().map((value) => Number(value.toFixed(4)))).toEqual([2, 2, 2]);
  });

  it('reports script errors with their line and builds nothing', () => {
    const fixture = scriptFixture();
    scriptSet(fixture.node, { script: script({ command: 'cube' }, { command: 'sphere', values: { r: '1 +' } }) });
    expect(fixture.pieces()).toHaveLength(0);
    expect(modifierStackStatusRead(fixture.node)?.steps[0]?.error).toMatch(/^Line 2: /);
  });

  it('builds only the first steps while the debugger holds the script at a step', () => {
    const fixture = scriptFixture();
    scriptSet(fixture.node, { script: script({ command: 'cube' }, { command: 'sphere' }, { command: 'cylinder' }) });
    const stepId = ModifierVolume.read(fixture.node).modifiers[0]?.id ?? '';
    expect(fixture.pieces()).toHaveLength(3);
    solidScriptDebugStepLimitSet(fixture.node, stepId, 1);
    expect(fixture.pieces()).toHaveLength(1);
    solidScriptDebugStepLimitSet(fixture.node, stepId, null);
    expect(fixture.pieces()).toHaveLength(3);
  });

  it('shows the script as the first inspector entry, which stores nothing itself', () => {
    const kind = modifierStackKindFind(MODIFIER_STACK_SOLID_SCRIPT_KIND);
    expect(kind?.fields[0]).toMatchObject({ key: 'scriptFile', label: 'Script', type: 'widget' });
    expect(kind?.fields.some((field) => field.type === 'action')).toBe(false);
    expect(kind?.normalizeParameters({})).not.toHaveProperty('scriptFile');
  });

  it('keeps the script when the level is saved and loaded', () => {
    const fixture = scriptFixture();
    const stored = script(
      { command: 'translate', values: { v: '[1, 0, 0]' } },
      { command: 'cube' },
      { command: 'end' },
    );
    scriptSet(fixture.node, { script: stored });
    const loaded = new THREE.Group();
    new SceneDeserializer().deserialize(new SceneSerializer().serialize(fixture.world) as never, loaded);
    const [model] = [...SolidModelRegistry.collectUnder(loaded)];
    const node = model?.root.children.find((child) => ModifierVolume.isGenerator(child));
    if (!node) throw new Error('Expected the loaded generator');
    expect(solidScriptDocumentNormalize(ModifierVolume.read(node).modifiers[0]?.parameters['script'])).toEqual(stored);
  });
});
