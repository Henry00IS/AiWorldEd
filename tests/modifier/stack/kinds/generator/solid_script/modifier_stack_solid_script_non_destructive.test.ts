import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SolidModel } from '@/solid/model/solid_model.js';
import { markAsSolidCsgGroup } from '@/solid/model/solid_group.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { SolidModelCodec } from '@/solid/io/solid_model_codec.js';
import { SceneSerializer } from '@/io/scene/scene_serializer.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { modifierStackCompile } from '@/modifier/stack/evaluate/modifier_stack_compile.js';
import { modifierStackStatusRead } from '@/modifier/stack/evaluate/modifier_stack_status.js';
import { modifierStackEntryCreate } from '@/modifier/stack/modifier_stack_settings.js';
import { modifierStackOwnerDecode } from '@/modifier/stack/owner/modifier_stack_owner.js';
import {
  solidScriptDocumentCreate,
  solidScriptDocumentUsesWith,
  type SolidScriptLine,
} from '@/solid_script/document/solid_script_document.js';
import { MODIFIER_STACK_SOLID_SCRIPT_MODIFIER_KIND } from '@/modifier/stack/kinds/generator/solid_script/modifier_stack_solid_script_keys.js';

/** Authored brush modes, one per scene brush. */
const MODES = [SolidOperation.Additive, SolidOperation.Subtractive, SolidOperation.Intersecting] as const;

/** X offset of each scene brush, so the authored CSG result is not empty. */
const OFFSETS = [0, 0.75, 0.25] as const;

/** Scripts that write every kind of change onto the brushes they receive. */
const WRITING_SCRIPTS: readonly (readonly [string, readonly SolidScriptLine[]])[] = [
  [
    'Set Mode Subtractive on every input',
    [
      { command: 'input_objects', values: { into: 'Got' } },
      { command: 'variable', values: { name: 'Got.Modes', value: 'Subtractive' } },
      { command: 'output', values: { of: '[Got]' } },
    ],
  ],
  [
    'Set Mode per solid inside For Each',
    [
      { command: 'input_objects' },
      { command: 'for_each', values: { variable: 'Object', list: '[$Input.Objects]' } },
      { command: 'variable', values: { name: 'Object.Mode', value: 'Intersecting' } },
      { command: 'end' },
    ],
  ],
  [
    'Move By, Rotate By, Scale By and Move To on the inputs',
    [
      { command: 'input_objects', values: { into: 'Got' } },
      { command: 'variable', values: { name: 'Got.Modes', value: 'Subtractive' } },
      { command: 'move_by', values: { by: '0.5, 0.25, 0', of: '[Got]' } },
      { command: 'rotate_by', values: { by: '0, 30, 10', of: '[Got]' } },
      { command: 'scale_by', values: { by: '1, 2, 1', of: '[Got]' } },
      { command: 'move_to', values: { to: '1, 3, 0', of: '[Got]' } },
      { command: 'output', values: { of: '[Got]' } },
    ],
  ],
  [
    'Transform UVs and Texture Faces on the inputs',
    [
      { command: 'input_objects' },
      { command: 'select_objects' },
      { command: 'select_faces', values: { which: 'All', where: '', of: '', how: 'New' } },
      { command: 'transform_uvs', values: { offset: '0.5, 0.25, 0' } },
      { command: 'texture_faces', values: { texture: 'grass' } },
    ],
  ],
  [
    'Bevel Edges, Inset and Extrude on the inputs',
    [
      { command: 'input_objects' },
      { command: 'select_objects' },
      { command: 'select_faces', values: { which: 'All', where: '', of: '', how: 'New' } },
      { command: 'bevel_edges', values: { distance: '0.1' } },
      { command: 'select_faces', values: { which: 'All', where: '', of: '', how: 'New' } },
      { command: 'scale_faces', values: { factor: '0.5' } },
    ],
  ],
  [
    'Clip and a Subtractive cut through the inputs',
    [
      { command: 'input_objects', values: { into: 'Got' } },
      { command: 'variable', values: { name: 'Got(0).Mode', value: 'Subtractive' } },
      { command: 'output', values: { of: '[Got]' } },
      { command: 'select_objects' },
      { command: 'clip', values: { through: '0, 0.2, 0' } },
      { command: 'cube', values: { size: '0.2, 3, 0.2', mode: 'Subtractive' } },
    ],
  ],
  [
    'Mesh tools on the inputs',
    [
      { command: 'mesh_from_solids' },
      { command: 'input_objects' },
      { command: 'end' },
      { command: 'select_objects' },
      { command: 'select_faces', values: { which: 'All', where: '', of: '', how: 'New' } },
      { command: 'extrude_face', values: { distance: '0.5' } },
    ],
  ],
];

/**
 * Wraps lines in a script that may be used both ways.
 *
 * @param lines Script lines.
 * @returns Script document.
 */
function both(lines: readonly SolidScriptLine[]) {
  return solidScriptDocumentUsesWith(solidScriptDocumentCreate([...lines], 'Non-destructive'), {
    generator: true,
    modifier: true,
  });
}

/**
 * A SolidScript modifier stack entry running the given lines.
 *
 * @param lines Script lines.
 * @returns Stack entry.
 */
function scriptEntry(lines: readonly SolidScriptLine[]) {
  const entry = modifierStackEntryCreate(MODIFIER_STACK_SOLID_SCRIPT_MODIFIER_KIND, []);
  entry.parameters['script'] = both(lines);
  return entry;
}

/**
 * Builds a world with one Additive CSG group holding an Additive, a Subtractive
 * and an Intersecting box that overlap, all textured.
 *
 * @returns World, model, group and the three scene brushes.
 */
function sceneFixture() {
  const world = new THREE.Group();
  const model = new SolidModel('Non-destructive');
  world.add(model.root);
  const group = new THREE.Group();
  markAsSolidCsgGroup(group, SolidOperation.Additive);
  model.root.add(group);
  const sources = MODES.map((operation, index) => sceneBrush(model, group, operation, index));
  model.syncBrushOrderFromScene();
  world.updateMatrixWorld(true);
  return { world, model, group, sources };
}

/**
 * Adds one textured box to the group, moved along X by its offset.
 *
 * @param model Solid model.
 * @param group CSG group.
 * @param operation Authored CSG mode.
 * @param index Offset index.
 * @returns Scene brush.
 */
function sceneBrush(
  model: SolidModel,
  group: THREE.Group,
  operation: SolidOperation,
  index: number,
): SolidBrushInstance {
  const source = model.addBoxBrush(1, operation);
  source.position.set(OFFSETS[index] ?? 0, 0, 0);
  if (source.mesh) group.add(source.mesh);
  source.pushTransformToMesh();
  for (const face of source.brush.faces) source.setFaceTextureId(face.surfaceIndex, 'Brick');
  return source;
}

/**
 * Everything authored about one scene brush that a modifier could touch.
 *
 * @param brush Scene brush.
 * @returns Plain snapshot.
 */
function brushSnapshot(brush: SolidBrushInstance) {
  return {
    id: brush.id,
    name: brush.name,
    operation: brush.operation,
    visible: brush.visible,
    position: brush.position.toArray(),
    rotation: brush.rotation.toArray(),
    scale: brush.scale.toArray(),
    vertices: brush.brush.vertices.map((vertex) => vertex.toArray()),
    planes: brush.brush.planes.map((plane) => [...plane.normal.toArray(), plane.offset]),
    faces: brush.brush.faces.length,
    surfaces: JSON.stringify(brush.serializeFaceSurfaces()),
    defaultSurface: JSON.stringify(brush.serializeDefaultSurface()),
    mesh: brush.mesh ? meshSnapshot(brush.mesh) : null,
  };
}

/**
 * Pose, visibility and parent of a scene brush's own mesh.
 *
 * @param mesh Brush mesh.
 * @returns Plain snapshot.
 */
function meshSnapshot(mesh: THREE.Object3D) {
  return {
    uuid: mesh.uuid,
    parent: mesh.parent?.uuid ?? null,
    position: mesh.position.toArray(),
    quaternion: mesh.quaternion.toArray(),
    scale: mesh.scale.toArray(),
    visible: mesh.visible,
  };
}

/**
 * Everything authored in the scene: every brush, the saved solid model and the
 * saved scene file.
 *
 * @param world Scene world.
 * @param model Solid model.
 * @returns Snapshot text.
 */
function sceneSnapshot(world: THREE.Group, model: SolidModel): string {
  return JSON.stringify({
    brushes: model.getBrushes().map(brushSnapshot),
    solid: SolidModelCodec.encode(model),
    scene: new SceneSerializer().serialize(world),
  });
}

/**
 * Just the saved solid model brushes of the scene file.
 *
 * @param world Scene world.
 * @returns Saved brushes text.
 */
function savedBrushes(world: THREE.Group): string {
  const json = new SceneSerializer().serialize(world);
  return JSON.stringify(json.objects.map((object) => object.solidModel?.brushes ?? null));
}

/**
 * Rebuilds the model through the editor's compile pipeline and returns a
 * rounded signature of the result triangles.
 *
 * @param world Scene world.
 * @param model Solid model.
 * @returns Result geometry signature.
 */
function resultSignature(world: THREE.Group, model: SolidModel): string {
  world.updateMatrixWorld(true);
  model.rebuild(true);
  const position = model.getResultMesh().geometry.getAttribute('position');
  const corners: string[] = [];
  for (let index = 0; index < position.count; index++) {
    const x = Math.round(position.getX(index) * 1e4);
    const y = Math.round(position.getY(index) * 1e4);
    const z = Math.round(position.getZ(index) * 1e4);
    corners.push(`${x},${y},${z}`);
  }
  return corners.sort().join(';');
}

/**
 * Compiles the stack once and returns the visible brushes it hands the CSG.
 *
 * @param world Scene world.
 * @param model Solid model.
 * @returns Visible compile brushes.
 */
function compiled(world: THREE.Group, model: SolidModel): SolidBrushInstance[] {
  world.updateMatrixWorld(true);
  const instances = modifierStackCompile(model.getBrushes(), model.root).instances;
  return instances.filter((brush) => brush.constructor.name !== 'ModifierStackHiddenBrush');
}

/**
 * Error the modifier step reported on its owner, or empty.
 *
 * @param owner Object that holds the stack.
 * @returns Error text.
 */
function stepError(owner: THREE.Object3D): string {
  return modifierStackStatusRead(owner)?.steps?.[0]?.error ?? '';
}

describe('SolidScript modifiers never change the scene solids', () => {
  it.each(WRITING_SCRIPTS)('%s on a group leaves every scene solid untouched', (_, lines) => {
    const fixture = sceneFixture();
    const before = resultSignature(fixture.world, fixture.model);
    modifierStackOwnerDecode(fixture.group, { modifiers: [scriptEntry(lines)] });
    const authored = sceneSnapshot(fixture.world, fixture.model);
    const modified = resultSignature(fixture.world, fixture.model);
    expect(stepError(fixture.group)).toBe('');
    expect(modified).not.toBe(before);
    expect(sceneSnapshot(fixture.world, fixture.model)).toBe(authored);
    modifierStackOwnerDecode(fixture.group, undefined);
    expect(resultSignature(fixture.world, fixture.model)).toBe(before);
    expect(fixture.sources.map((source) => source.operation)).toEqual([...MODES]);
  });

  it.each(WRITING_SCRIPTS)('%s on one solid leaves that solid untouched', (_, lines) => {
    const fixture = sceneFixture();
    const host = fixture.sources[0]!;
    const before = resultSignature(fixture.world, fixture.model);
    const authored = brushSnapshot(host);
    modifierStackOwnerDecode(host.mesh!, { modifiers: [scriptEntry(lines)] });
    expect(resultSignature(fixture.world, fixture.model)).not.toBe(before);
    expect(stepError(host.mesh!)).toBe('');
    expect(brushSnapshot(host)).toEqual(authored);
    modifierStackOwnerDecode(host.mesh!, undefined);
    expect(resultSignature(fixture.world, fixture.model)).toBe(before);
  });

  it('hands the CSG new solids for a changed Mode, never the scene solid objects', () => {
    const fixture = sceneFixture();
    modifierStackOwnerDecode(fixture.group, { modifiers: [scriptEntry(WRITING_SCRIPTS[0]![1])] });
    const shown = compiled(fixture.world, fixture.model);
    expect(shown).toHaveLength(3);
    for (const [index, source] of fixture.sources.entries()) {
      const output = shown.find((brush) => brush.id === source.id);
      expect(output?.operation).toBe(SolidOperation.Subtractive);
      if (MODES[index] !== SolidOperation.Subtractive) expect(output).not.toBe(source);
      expect(output?.brush === source.brush && output !== source).toBe(false);
      expect(source.operation).toBe(MODES[index]);
    }
  });

  it('does not build up changes over many re-evaluations', () => {
    const fixture = sceneFixture();
    const lines = WRITING_SCRIPTS[2]![1];
    modifierStackOwnerDecode(fixture.group, { modifiers: [scriptEntry(lines)] });
    const authored = sceneSnapshot(fixture.world, fixture.model);
    const first = resultSignature(fixture.world, fixture.model);
    for (let round = 0; round < 12; round++) {
      fixture.sources[round % 3]!.pushTransformToMesh();
      fixture.model.markDirty();
      expect(resultSignature(fixture.world, fixture.model)).toBe(first);
      expect(compiled(fixture.world, fixture.model).map((brush) => brush.operation)).toEqual(
        new Array(3).fill(SolidOperation.Subtractive),
      );
    }
    expect(sceneSnapshot(fixture.world, fixture.model)).toBe(authored);
  });

  it('saves the authored solids, not the modified ones, while the modifier is on', () => {
    const fixture = sceneFixture();
    const saved = savedBrushes(fixture.world);
    modifierStackOwnerDecode(fixture.group, { modifiers: [scriptEntry(WRITING_SCRIPTS[2]![1])] });
    resultSignature(fixture.world, fixture.model);
    expect(savedBrushes(fixture.world)).toBe(saved);
    const brushes = SolidModelCodec.encode(fixture.model).brushes;
    expect(brushes.map((brush) => brush.operation)).toEqual([...MODES]);
  });

  it('restores the solids exactly when the modifier is turned off and on again', () => {
    const fixture = sceneFixture();
    const before = resultSignature(fixture.world, fixture.model);
    const entry = scriptEntry(WRITING_SCRIPTS[0]![1]);
    modifierStackOwnerDecode(fixture.group, { modifiers: [entry] });
    const on = resultSignature(fixture.world, fixture.model);
    modifierStackOwnerDecode(fixture.group, { modifiers: [{ ...entry, enabled: false }] });
    expect(resultSignature(fixture.world, fixture.model)).toBe(before);
    modifierStackOwnerDecode(fixture.group, { modifiers: [entry] });
    expect(resultSignature(fixture.world, fixture.model)).toBe(on);
    expect(fixture.sources.map((source) => source.operation)).toEqual([...MODES]);
  });
});

describe('SolidScript volume modifiers never change the scene solids', () => {
  /**
   * Adds a SolidScript modifier volume around the scene brushes.
   *
   * @param world Scene world.
   * @param lines Script lines.
   * @returns Volume mesh.
   */
  function volumeAdd(world: THREE.Group, lines: readonly SolidScriptLine[]): THREE.Mesh {
    const volume = ModifierVolume.create({ modifiers: [scriptEntry(lines)] });
    volume.scale.setScalar(8);
    world.add(volume);
    world.updateMatrixWorld(true);
    return volume;
  }

  it.each(WRITING_SCRIPTS)('%s: moving the volume off the solids restores them exactly', (_, lines) => {
    const fixture = sceneFixture();
    const before = resultSignature(fixture.world, fixture.model);
    const authored = sceneSnapshot(fixture.world, fixture.model);
    const volume = volumeAdd(fixture.world, lines);
    const modified = resultSignature(fixture.world, fixture.model);
    expect(stepError(volume)).toBe('');
    expect(modified).not.toBe(before);
    volume.position.set(100, 0, 0);
    expect(resultSignature(fixture.world, fixture.model)).toBe(before);
    volume.position.set(0, 0, 0);
    expect(resultSignature(fixture.world, fixture.model)).toBe(modified);
    fixture.world.remove(volume);
    expect(resultSignature(fixture.world, fixture.model)).toBe(before);
    expect(sceneSnapshot(fixture.world, fixture.model)).toBe(authored);
  });

  it('keeps every authored Mode while the volume sets them all Subtractive', () => {
    const fixture = sceneFixture();
    volumeAdd(fixture.world, WRITING_SCRIPTS[0]![1]);
    const saved = savedBrushes(fixture.world);
    const shown = compiled(fixture.world, fixture.model);
    expect(fixture.sources.map((source) => shown.find((brush) => brush.id === source.id)?.operation)).toEqual(
      new Array(3).fill(SolidOperation.Subtractive),
    );
    expect(fixture.sources.map((source) => source.operation)).toEqual([...MODES]);
    resultSignature(fixture.world, fixture.model);
    expect(savedBrushes(fixture.world)).toBe(saved);
  });
});
