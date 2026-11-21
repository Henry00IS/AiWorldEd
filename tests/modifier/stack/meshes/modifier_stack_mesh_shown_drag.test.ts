import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { modifierStackCompile } from '@/modifier/stack/evaluate/modifier_stack_compile.js';
import { modifierStackMeshesShown } from '@/modifier/stack/meshes/modifier_stack_meshes.js';
import { modifierStackEntryCreate } from '@/modifier/stack/modifier_stack_settings.js';
import { modifierGeneratorNodeCreate } from '@/modifier/stack/modifier_generator_node.js';
import { modifierStackBakeMeshesCreate } from '@/modifier/stack/bake/modifier_stack_bake_meshes.js';
import { buildExportScene } from '@/io/scene/builder_export_scene.js';
import {
  solidScriptDocumentCreate,
  solidScriptDocumentUsesWith,
  type SolidScriptLine,
} from '@/solid_script/document/solid_script_document.js';
import {
  MODIFIER_STACK_SOLID_SCRIPT_KIND,
  MODIFIER_STACK_SOLID_SCRIPT_MODIFIER_KIND,
} from '@/modifier/stack/kinds/generator/solid_script/modifier_stack_solid_script_keys.js';

/**
 * Dragging a modifier volume must not carry its Mesh From Brushes output along
 * and then snap it back when the script runs again: the mesh is built from
 * brushes that stay put, so it stays put too. Generator output, which is built
 * in the generator's box, keeps following the generator.
 */

/** Largest drift, in metres, still counted as standing still. */
const STILL = 1e-6;

/** One move of a drag: changes the pose of the dragged object. */
type DragStep = (object: THREE.Object3D, index: number) => void;

/**
 * Builds a script that may be used both ways.
 *
 * @param lines Script lines.
 * @returns Script document.
 */
function both(lines: SolidScriptLine[]) {
  return solidScriptDocumentUsesWith(solidScriptDocumentCreate(lines, 'Drag'), { generator: true, modifier: true });
}

/**
 * Builds the reported script: Mesh From Brushes around Input Brushes into a
 * variable, then Output of it, with optional lines in between.
 *
 * @param inner Brush line inside Mesh From Brushes.
 * @param between Lines run on the mesh before it is output.
 * @returns Script document.
 */
function meshScript(inner: SolidScriptLine, between: SolidScriptLine[] = []) {
  return both([
    { command: 'mesh_brushes', values: { into: 'Mesh' } },
    inner,
    { command: 'end' },
    ...between,
    { command: 'output', values: { of: '[Mesh]' } },
  ]);
}

/**
 * Builds a solid of three boxes in a row with a modifier volume around them.
 *
 * @param script Modifier script.
 * @returns Fixture parts and a compile that reruns the scripts.
 */
function volumeFixture(script: unknown) {
  const world = new THREE.Group();
  const model = new SolidModel('Drag volume');
  world.add(model.root);
  for (const index of [0, 1, 2])
    model.addBoxBrush(1, SolidOperation.Additive, null, false).mesh?.position.set(index * 2, 0, 0);
  const entry = modifierStackEntryCreate(MODIFIER_STACK_SOLID_SCRIPT_MODIFIER_KIND, []);
  entry.parameters['script'] = script;
  const volume = ModifierVolume.create({ modifiers: [entry] });
  volume.position.set(2, 0, 0);
  volume.scale.setScalar(16);
  world.add(volume);
  return fixtureFinish(world, model, volume);
}

/**
 * Builds an empty solid with a SolidScript generator that outputs a mesh.
 *
 * @returns Fixture parts and a compile that reruns the scripts.
 */
function generatorFixture() {
  const world = new THREE.Group();
  const model = new SolidModel('Drag generator');
  world.add(model.root);
  const node = modifierGeneratorNodeCreate(MODIFIER_STACK_SOLID_SCRIPT_KIND);
  const settings = ModifierVolume.read(node);
  const [first, ...rest] = settings.modifiers;
  if (!first) throw new Error('Expected a modifier');
  const parameters = { ...first.parameters, script: meshScript({ command: 'cube' }) };
  ModifierVolume.write(node, { ...settings, modifiers: [{ ...first, parameters }, ...rest] });
  model.root.add(node);
  return fixtureFinish(world, model, node);
}

/**
 * Compiles a fixture once and returns its parts.
 *
 * @param world World group.
 * @param model Solid.
 * @param node Volume or generator node.
 * @returns Fixture parts and a compile that reruns the scripts.
 */
function fixtureFinish(world: THREE.Group, model: SolidModel, node: THREE.Object3D) {
  const compile = () => {
    world.updateMatrixWorld(true);
    modifierStackCompile(model.getBrushes(), model.root);
  };
  compile();
  return { world, model, node, compile };
}

/**
 * Returns the world box of the mesh a node shows, as a frame would draw it.
 *
 * @param world World group.
 * @param node Volume or generator node.
 * @returns World box.
 */
function shownWorldBox(world: THREE.Group, node: THREE.Object3D): THREE.Box3 {
  world.updateMatrixWorld(true);
  const shown = modifierStackMeshesShown(node);
  expect(shown).toHaveLength(1);
  return new THREE.Box3().setFromObject(shown[0]!, true);
}

/**
 * Returns how far two boxes are apart: the largest corner distance.
 *
 * @param a First box.
 * @param b Second box.
 * @returns Distance in metres.
 */
function boxDrift(a: THREE.Box3, b: THREE.Box3): number {
  return Math.max(a.min.distanceTo(b.min), a.max.distanceTo(b.max));
}

/**
 * Drags a node over several steps, drawing a frame after every move and
 * rerunning the scripts after every second move, like a drag where the rerun
 * falls behind. Records the mesh's world box at every frame.
 *
 * @param fixture Fixture to drag.
 * @param step Move of each step.
 * @param steps Number of moves.
 * @returns World boxes before and after each move and rerun.
 */
function dragRecorded(fixture: ReturnType<typeof fixtureFinish>, step: DragStep, steps = 6) {
  const frames = [{ box: shownWorldBox(fixture.world, fixture.node), rerun: true }];
  for (let index = 0; index < steps; index += 1) {
    step(fixture.node, index);
    frames.push({ box: shownWorldBox(fixture.world, fixture.node), rerun: false });
    if (index % 2 === 0) continue;
    fixture.compile();
    frames.push({ box: shownWorldBox(fixture.world, fixture.node), rerun: true });
  }
  return frames;
}

/**
 * Expects every recorded frame to show the mesh where it started.
 *
 * @param frames Recorded frames.
 */
function expectNeverMoved(frames: ReturnType<typeof dragRecorded>): void {
  const start = frames[0]!.box;
  for (const frame of frames) expect(boxDrift(frame.box, start)).toBeLessThan(STILL);
}

/** Moves down a quarter metre each step. */
const MOVE_DOWN: DragStep = (object) => {
  object.position.y -= 0.25;
};

/** Moves sideways and turns around two axes each step. */
const MOVE_AND_TURN: DragStep = (object, index) => {
  object.position.x += 0.2 * (index % 2 === 0 ? 1 : -0.5);
  object.rotation.y += THREE.MathUtils.degToRad(17);
  object.rotation.x += THREE.MathUtils.degToRad(5);
};

/** Stretches the box unevenly each step. */
const STRETCH: DragStep = (object, index) => {
  object.scale.set(16 + index, 16 - index * 0.5, 16 + index * 0.25);
  object.position.z += 0.1;
};

/** Turns a stretched box each step, which needs a sheared local pose. */
const TURN_STRETCHED: DragStep = (object, index) => {
  object.scale.set(18, 11, 14);
  object.rotation.set(THREE.MathUtils.degToRad(9 * index), THREE.MathUtils.degToRad(23 * (index + 1)), 0);
  object.position.y -= 0.15;
};

describe('Modifier volume mesh output while the volume is dragged', () => {
  it('keeps a Mesh From Brushes output still while the volume moves down, before and after each rerun', () => {
    expectNeverMoved(dragRecorded(volumeFixture(meshScript({ command: 'input_brushes' })), MOVE_DOWN));
  });

  it('shows the mesh in the same place after the drag is undone', () => {
    const fixture = volumeFixture(meshScript({ command: 'input_brushes' }));
    const start = shownWorldBox(fixture.world, fixture.node);
    const pose = fixture.node.matrix.clone();
    dragRecorded(fixture, MOVE_AND_TURN);
    pose.decompose(fixture.node.position, fixture.node.quaternion, fixture.node.scale);
    fixture.compile();
    expect(boxDrift(shownWorldBox(fixture.world, fixture.node), start)).toBeLessThan(STILL);
  });

  it('keeps it still while a turned volume moves and turns', () => {
    const fixture = volumeFixture(meshScript({ command: 'input_brushes' }));
    fixture.node.rotation.set(0, THREE.MathUtils.degToRad(-30), 0);
    fixture.compile();
    expectNeverMoved(dragRecorded(fixture, MOVE_AND_TURN));
  });

  it('keeps it still while the volume is stretched unevenly', () => {
    const fixture = volumeFixture(meshScript({ command: 'input_brushes' }));
    fixture.node.rotation.set(0, THREE.MathUtils.degToRad(40), 0);
    fixture.compile();
    expectNeverMoved(dragRecorded(fixture, STRETCH));
  });

  it('keeps it still while a stretched volume turns', () => {
    expectNeverMoved(dragRecorded(volumeFixture(meshScript({ command: 'input_brushes' })), TURN_STRETCHED));
  });

  it('keeps it still when the volume sits in a moved and turned parent that is dragged', () => {
    const fixture = volumeFixture(meshScript({ command: 'input_brushes' }));
    const parent = new THREE.Group();
    parent.position.set(-1, 0.5, 0);
    parent.rotation.set(0, THREE.MathUtils.degToRad(25), 0);
    fixture.world.add(parent);
    parent.attach(fixture.node);
    fixture.compile();
    const frames = dragRecorded({ ...fixture, node: fixture.node }, () => {
      parent.position.y -= 0.3;
    });
    expectNeverMoved(frames);
  });

  it('moves the mesh with the solid, like the brushes it was built from', () => {
    const fixture = volumeFixture(meshScript({ command: 'input_brushes' }));
    const before = shownWorldBox(fixture.world, fixture.node);
    const offset = new THREE.Vector3(1.5, -2, 0.75);
    fixture.model.root.position.add(offset);
    const after = shownWorldBox(fixture.world, fixture.node);
    expect(boxDrift(after, before.clone().translate(offset))).toBeLessThan(STILL);
  });

  it('exports and bakes the mesh where it is drawn mid-drag', () => {
    const fixture = volumeFixture(meshScript({ command: 'input_brushes' }));
    const start = shownWorldBox(fixture.world, fixture.node);
    const name = modifierStackMeshesShown(fixture.node)[0]!.name;
    fixture.node.position.y -= 0.75;
    fixture.node.rotation.y += 0.4;
    const exported = buildExportScene(fixture.world);
    exported.updateMatrixWorld(true);
    const mesh = exported.children.find((child) => child instanceof THREE.Mesh && child.name === name);
    expect(mesh).toBeDefined();
    expect(boxDrift(new THREE.Box3().setFromObject(mesh!, true), start)).toBeLessThan(STILL);
    const baked = modifierStackBakeMeshesCreate(fixture.node, fixture.world);
    expect(baked).toHaveLength(1);
    fixture.world.add(baked[0]!.mesh);
    fixture.world.updateMatrixWorld(true);
    expect(boxDrift(new THREE.Box3().setFromObject(baked[0]!.mesh, true), start)).toBeLessThan(STILL);
  });

  it('lets a script that reads the box position move the mesh only when it runs again', () => {
    const script = meshScript({ command: 'input_brushes' }, [
      { command: 'move_by', values: { by: '[$Box.Position]', of: '[Mesh]' } },
    ]);
    const fixture = volumeFixture(script);
    const frames = dragRecorded(fixture, MOVE_DOWN, 4);
    const reruns = frames.filter((frame) => frame.rerun);
    expect(boxDrift(reruns[0]!.box, reruns.at(-1)!.box)).toBeGreaterThan(0.1);
    for (let index = 1; index < frames.length; index += 1)
      if (!frames[index]!.rerun) expect(boxDrift(frames[index]!.box, frames[index - 1]!.box)).toBeLessThan(STILL);
    const fresh = volumeFixture(script);
    fresh.node.position.copy(fixture.node.position);
    fresh.compile();
    expect(boxDrift(reruns.at(-1)!.box, shownWorldBox(fresh.world, fresh.node))).toBeLessThan(STILL);
  });

  it('carries a generator mesh with the generator at once, and the rerun leaves it there', () => {
    const fixture = generatorFixture();
    const start = shownWorldBox(fixture.world, fixture.node);
    const frames = dragRecorded(fixture, MOVE_DOWN);
    let moves = 0;
    for (const frame of frames.slice(1)) {
      if (!frame.rerun) moves += 1;
      const expected = start.clone().translate(new THREE.Vector3(0, -0.25 * moves, 0));
      expect(boxDrift(frame.box, expected)).toBeLessThan(STILL);
    }
  });

  it('carries a generator mesh along a turn and stretch without a jump at the rerun', () => {
    const fixture = generatorFixture();
    const frames = dragRecorded(fixture, MOVE_AND_TURN);
    for (let index = 1; index < frames.length; index += 1)
      if (frames[index]!.rerun) expect(boxDrift(frames[index]!.box, frames[index - 1]!.box)).toBeLessThan(STILL);
  });
});
