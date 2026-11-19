import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { NotificationGlobal } from '@/audio/notification/notification_global.js';
import { markAsSolidCsgGroup, setSolidGroupOperation } from '@/solid/model/solid_group.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { isSolidCsgGroup } from '@/solid/model/solid_group.js';
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
import { CommandModifierVolumeBake } from '@/modifier/stack/bake/command_modifier_volume_bake.js';
import { MODIFIER_STACK_SOLID_SCRIPT_KIND } from '@/modifier/stack/kinds/generator/solid_script/modifier_stack_solid_script_keys.js';

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
  it('starts with a script and builds an additive cube and a subtractive sphere, unwrapped', () => {
    const fixture = scriptFixture();
    expect(modifierGeneratorNodeKind(fixture.node)).toBe(MODIFIER_STACK_SOLID_SCRIPT_KIND);
    const pieces = fixture.pieces();
    expect(pieces.map((piece) => piece.operation)).toEqual([SolidOperation.Additive, SolidOperation.Subtractive]);
    const group = pieces[0]?.mesh?.parent;
    expect(Boolean(group && isSolidCsgGroup(group))).toBe(false);
  });

  it('puts the script origin at the centre of the box, so shapes are centered there without a Translate', () => {
    const fixture = scriptFixture();
    const box = new THREE.Box3().setFromObject(fixture.node);
    const centre = box.getCenter(new THREE.Vector3());
    scriptSet(fixture.node, { script: script({ command: 'cube', values: { size: '1, 2, 3' } }) });
    const half = new THREE.Vector3(0.5, 1, 1.5);
    expectBox(bounds(fixture.pieces()), new THREE.Box3(centre.clone().sub(half), centre.clone().add(half)));
    scriptSet(fixture.node, {
      script: script({ command: 'cube', values: { size: '1, 2, 3', anchor: 'Center, Bottom, Center' } }),
    });
    const standing = new THREE.Box3(
      new THREE.Vector3(centre.x - 0.5, centre.y, centre.z - 1.5),
      new THREE.Vector3(centre.x + 0.5, centre.y + 2, centre.z + 1.5),
    );
    expectBox(bounds(fixture.pieces()), standing);
  });

  it('keeps script metres unscaled in the editor axes, with a corner-placed cube growing from the box centre', () => {
    const fixture = scriptFixture();
    const centre = new THREE.Box3().setFromObject(fixture.node).getCenter(new THREE.Vector3());
    scriptSet(fixture.node, {
      script: script({ command: 'cube', values: { size: '1, 2, 3', anchor: 'Left, Bottom, Back' } }),
    });
    const expected = new THREE.Box3(
      new THREE.Vector3(centre.x, centre.y, centre.z),
      new THREE.Vector3(centre.x + 1, centre.y + 2, centre.z + 3),
    );
    expectBox(bounds(fixture.pieces()), expected);
  });

  it('builds silently: rebuilding a script with CSG groups plays no operation sound', () => {
    const flipped = vi.spyOn(NotificationGlobal, 'onSolidCsgOperationFlipped');
    const fixture = scriptFixture();
    scriptSet(fixture.node, {
      script: script(
        { command: 'cube', values: { size: '2, 2, 2' } },
        { command: 'sphere', values: { mode: 'Intersecting' } },
        { command: 'cube', values: { mode: 'Subtractive' } },
      ),
    });
    expect(fixture.pieces().length).toBeGreaterThan(0);
    fixture.compile();
    expect(flipped).not.toHaveBeenCalled();
    flipped.mockRestore();
  });

  it('only sounds when an existing group really changes its operation, not when a new group is marked', () => {
    const flipped = vi.spyOn(NotificationGlobal, 'onSolidCsgOperationFlipped');
    const group = new THREE.Group();
    markAsSolidCsgGroup(group, SolidOperation.Subtractive);
    expect(flipped).not.toHaveBeenCalled();
    setSolidGroupOperation(group, SolidOperation.Subtractive);
    expect(flipped).not.toHaveBeenCalled();
    setSolidGroupOperation(group, SolidOperation.Additive);
    expect(flipped).toHaveBeenCalledTimes(1);
    flipped.mockRestore();
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
    scriptSet(fixture.node, { script: script({ command: 'cube' }, { command: 'sphere', values: { r: '[=1 +]' } }) });
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
      { command: 'transform', values: { move: '1, 0, 0' } },
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

  it('textures every face of the brushes inside a Texture block, and the rest with the main texture', () => {
    const fixture = scriptFixture();
    scriptSet(fixture.node, {
      script: script(
        { command: 'texture', values: { texture: 'brick' } },
        { command: 'cube' },
        { command: 'end' },
        { command: 'transform', values: { move: '3, 0, 0' } },
        { command: 'cube' },
        { command: 'end' },
      ),
    });
    const textures = fixture
      .pieces()
      .map((piece) => [...new Set(piece.brush.faces.map((_, index) => piece.getSurfaceTextureId(index)))]);
    expect(textures[0]).toEqual(['brick']);
    expect(textures[1]).not.toContain('brick');
  });

  it('keeps the main texture for the brushes inside a Texture block left empty', () => {
    const fixture = scriptFixture();
    scriptSet(fixture.node, {
      script: script(
        { command: 'texture', values: { texture: '' } },
        { command: 'cube' },
        { command: 'end' },
        { command: 'transform', values: { move: '3, 0, 0' } },
        { command: 'cube' },
        { command: 'end' },
      ),
    });
    const textures = fixture
      .pieces()
      .map((piece) => [...new Set(piece.brush.faces.map((_, index) => piece.getSurfaceTextureId(index)))]);
    expect(textures).toHaveLength(2);
    expect(textures[0]).toEqual(textures[1]);
  });

  it('textures brushes with the texture a texture Input picked, and the top faces with Texture Faces', () => {
    const fixture = scriptFixture();
    scriptSet(fixture.node, {
      script: script(
        { command: 'input', values: { name: 'wall', type: 'Texture', default: 'brick' } },
        { command: 'input', values: { name: 'top', type: 'Texture', default: 'grass' } },
        { command: 'texture', values: { texture: '[wall]' } },
        { command: 'cube' },
        { command: 'end' },
        { command: 'select_brushes' },
        { command: 'select_faces', values: { which: 'Up' } },
        { command: 'texture_faces', values: { texture: '[top]' } },
      ),
    });
    const [piece] = fixture.pieces();
    const textures = new Set(piece?.brush.faces.map((_, index) => piece.getSurfaceTextureId(index)));
    expect([...textures].sort()).toEqual(['brick', 'grass']);
  });

  it('refuses a script made only for modifiers with a friendly message', () => {
    const fixture = scriptFixture();
    scriptSet(fixture.node, {
      script: { ...script({ command: 'cube' }), uses: { generator: false, modifier: true } },
    });
    expect(fixture.pieces()).toHaveLength(0);
    expect(modifierStackStatusRead(fixture.node)?.steps[0]?.error).toContain('Turn on Generator under Can Be Used As');
  });

  it('runs When Baked before a bake, so the brushes are baked with the inputs it sets, and undo keeps the old ones', () => {
    const fixture = scriptFixture();
    scriptSet(fixture.node, {
      script: script(
        { command: 'input', values: { name: 'count', type: 'Count', default: '2' } },
        { command: 'when_baked' },
        { command: 'set_input', values: { name: 'count', value: '5' } },
        { command: 'end' },
        { command: 'repeat', values: { variable: 'i', from: '1', to: '[count]' } },
        { command: 'transform', values: { move: '[=[i] * 2], 0, 0' } },
        { command: 'cube' },
        { command: 'end' },
        { command: 'end' },
      ),
    });
    expect(fixture.pieces()).toHaveLength(2);
    fixture.world.updateMatrixWorld(true);
    const bake = new CommandModifierVolumeBake(fixture.node);
    bake.execute();
    expect(fixture.model.getBrushes()).toHaveLength(5);
    bake.undo();
    expect(fixture.model.getBrushes()).toHaveLength(0);
    expect(ModifierVolume.read(fixture.node).modifiers[0]?.parameters['inputs'] ?? {}).toEqual({});
    expect(fixture.pieces()).toHaveLength(2);
  });

  it('textures the faces Texture Faces picked and leaves the others on the main texture', () => {
    const fixture = scriptFixture();
    scriptSet(fixture.node, {
      script: script(
        { command: 'cube' },
        { command: 'select_brushes' },
        { command: 'select_faces', values: { which: 'Up' } },
        { command: 'texture_faces', values: { texture: 'grass' } },
      ),
    });
    const [piece] = fixture.pieces();
    const textures = piece?.brush.faces.map((face) => piece.getSurfaceTextureId(face.surfaceIndex)) ?? [];
    expect(textures.filter((id) => id === 'grass')).toHaveLength(1);
    expect(textures).toHaveLength(6);
  });
});
