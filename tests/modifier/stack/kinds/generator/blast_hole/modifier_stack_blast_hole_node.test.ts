import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import {
  MODIFIER_GENERATOR_NODE_KINDS,
  modifierGeneratorNodeCreate,
} from '@/modifier/stack/modifier_generator_node.js';
import { modifierGeneratorOperationCommand } from '@/modifier/stack/modifier_generator_operation.js';
import { modifierStackCompile } from '@/modifier/stack/evaluate/modifier_stack_compile.js';
import { modifierStackKindFind } from '@/modifier/stack/modifier_stack_catalog.js';
import { modifierStackPatch } from '@/modifier/stack/modifier_stack_operations.js';
import { CommandModifierStackSet } from '@/modifier/stack/command_modifier_stack_set.js';
import { modifierStackEntryCreate } from '@/modifier/stack/modifier_stack_settings.js';
import { SceneSerializer } from '@/io/scene/scene_serializer.js';
import { SceneDeserializer } from '@/io/scene/scene_deserializer.js';
import { SolidBrushValidator } from '@/solid/brush/solid_brush_validator.js';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import type { ModifierStackActionTarget } from '@/modifier/stack/modifier_stack_types.js';
import { physicsShatterLastRunOf } from '@/modifier/stack/kinds/shatter/physics_shatter_last_run.js';
import { physicsShatterBrushVolume } from '@/modifier/stack/kinds/shatter/fracture/physics_shatter_geometry.js';
import { blastHoleWallFace } from '@/modifier/stack/kinds/generator/blast_hole/modifier_stack_blast_hole_wall_texture.js';
import {
  BLAST_HOLE_MIN_ANGLE,
  BLAST_HOLE_MIN_EDGE,
  BLAST_HOLE_MIN_THICKNESS,
} from '@/modifier/stack/kinds/generator/blast_hole/modifier_stack_blast_hole_quality.js';
import { blastHoleBrushQuality } from './blast_hole_quality_fixture.js';

/**
 * Builds a 6 x 4 m wall with a Blast Hole node through it.
 *
 * @param patch Blast Hole parameters.
 * @param subtract Whether the node subtracts.
 * @param depth Wall and node depth.
 * @returns Fixture parts.
 */
function holeFixture(patch: Record<string, unknown> = {}, subtract = true, depth = 0.5) {
  const world = new THREE.Group();
  const model = new SolidModel('Blast hole');
  world.add(model.root);
  const wall = model.addBoxBrush(1, SolidOperation.Additive, null, false);
  wall.mesh?.scale.set(6, 4, depth);
  wall.brush.faces.forEach((face) =>
    wall.setFaceSurface(face.surfaceIndex, { ...wall.getFaceSurface(face.surfaceIndex), textureId: 'brick_red' }),
  );
  const node = modifierGeneratorNodeCreate('blastHole');
  node.scale.z = depth;
  model.root.add(node);
  if (subtract) modifierGeneratorOperationCommand(node, SolidOperation.Subtractive)?.execute();
  holeSet(node, patch);
  const compile = () => {
    world.updateMatrixWorld(true);
    return modifierStackCompile(model.getBrushes(), model.root);
  };
  const pieces = () => compile().instances.filter((brush) => brush.id.startsWith(`${node.uuid}#`));
  return { world, model, wall, node, compile, pieces };
}

/**
 * Patches the Blast Hole step.
 *
 * @param node Node.
 * @param patch Parameters.
 */
function holeSet(node: THREE.Object3D, patch: Record<string, unknown>): void {
  const settings = ModifierVolume.read(node);
  const [first, ...rest] = settings.modifiers;
  ModifierVolume.write(node, {
    ...settings,
    modifiers: [{ ...first!, parameters: { ...first!.parameters, ...patch } }, ...rest],
  });
}

/**
 * Adds a Physics Shatter step to the node's own stack.
 *
 * @param node Node.
 * @param parameters Shatter parameters.
 * @returns Shatter step id.
 */
function holeShatter(node: THREE.Object3D, parameters: Record<string, unknown>): string {
  const settings = ModifierVolume.read(node);
  const entry = modifierStackEntryCreate('physicsShatter', settings.modifiers);
  entry.parameters = { ...entry.parameters, ...parameters };
  ModifierVolume.write(node, { ...settings, modifiers: [...settings.modifiers, entry] });
  return entry.id;
}

/**
 * Sums the volume of brushes.
 *
 * @param brushes Brushes.
 * @returns Volume.
 */
function holeVolume(brushes: readonly SolidBrushInstance[]): number {
  return brushes.reduce((sum, brush) => sum + physicsShatterBrushVolume(brush.getModelSpaceBrush()), 0);
}

/**
 * Asserts Henry's CSG bounds on brushes.
 *
 * @param brushes Brushes.
 */
function expectSound(brushes: readonly SolidBrushInstance[]): void {
  for (const brush of brushes) {
    expect(SolidBrushValidator.validateGenerated(brush.brush).valid).toBe(true);
    const quality = blastHoleBrushQuality(brush.getModelSpaceBrush());
    expect(quality.thickness).toBeGreaterThanOrEqual(BLAST_HOLE_MIN_THICKNESS - 1e-6);
    expect(quality.minEdge).toBeGreaterThanOrEqual(BLAST_HOLE_MIN_EDGE - 1e-6);
    expect(quality.minAngle).toBeGreaterThanOrEqual(BLAST_HOLE_MIN_ANGLE - 1e-6);
  }
}

describe('blast hole node', () => {
  it('is a generator node kind with a 3 x 3 x 0.5 m box', () => {
    expect(MODIFIER_GENERATOR_NODE_KINDS).toContain('blastHole');
    const node = modifierGeneratorNodeCreate('blastHole');
    expect(ModifierVolume.isGenerator(node)).toBe(true);
    expect(node.scale.toArray()).toEqual([3, 3, 0.5]);
  });

  it('builds the same pieces for the same seed', () => {
    const geometry = (brushes: SolidBrushInstance[]) => brushes.map((brush) => brush.getModelSpaceBrush().vertices);
    expect(geometry(holeFixture({ seed: 5 }).pieces())).toEqual(geometry(holeFixture({ seed: 5 }).pieces()));
    expect(geometry(holeFixture({ seed: 5 }).pieces())).not.toEqual(geometry(holeFixture({ seed: 6 }).pieces()));
  });

  it('cuts a jagged prism through the whole depth, its pieces filling the outline', () => {
    const pieces = holeFixture({ seed: 2 }).pieces();
    expect(pieces.length).toBeGreaterThan(3);
    expect(new Set(pieces.map((p) => p.operation))).toEqual(new Set([SolidOperation.Subtractive]));
    for (const piece of pieces) {
      const bounds = piece.getModelSpaceBrush().computeLocalBounds();
      expect(bounds.min.z).toBeCloseTo(-0.25, 9);
      expect(bounds.max.z).toBeCloseTo(0.25, 9);
    }
    expectSound(pieces);
  });

  it('shows Fill Back only in Subtract mode, and fills back only there', () => {
    const kind = modifierStackKindFind('blastHole')!;
    const fill = kind.fields.find((field) => field.key === 'fillBack')!;
    expect(fill.visible?.({ operation: 'subtract' })).toBe(true);
    expect(fill.visible?.({ operation: 'add' })).toBe(false);
    expect(fill.visible?.({ operation: 'intersect' })).toBe(false);
    const added = holeFixture({ fillBack: true }, false).pieces();
    expect(new Set(added.map((p) => p.operation))).toEqual(new Set([SolidOperation.Additive]));
    expect(added.length).toBe(holeFixture({}, false).pieces().length);
  });

  it('with Fill Back cuts the hole, then adds the same shape back right after it', () => {
    const plain = holeFixture({ seed: 4 }).pieces();
    const fixture = holeFixture({ seed: 4, fillBack: true });
    const pieces = fixture.pieces();
    expect(pieces.length).toBe(plain.length * 2);
    const cut = pieces.slice(0, plain.length);
    const fill = pieces.slice(plain.length);
    expect(cut.every((p) => p.operation === SolidOperation.Subtractive)).toBe(true);
    expect(fill.every((p) => p.operation === SolidOperation.Additive)).toBe(true);
    expect(new Set(pieces.map((p) => p.id)).size).toBe(pieces.length);
    fill.forEach((piece, index) =>
      expect(piece.getModelSpaceBrush().vertices).toEqual(cut[index]!.getModelSpaceBrush().vertices),
    );
    const order = fixture.compile().instances.map((brush) => brush.id);
    expect(order.indexOf(fixture.wall.id)).toBeLessThan(order.indexOf(cut[0]!.id));
    expect(order.indexOf(cut.at(-1)!.id)).toBeLessThan(order.indexOf(fill[0]!.id));
    expect(holeVolume(fill)).toBeCloseTo(holeVolume(cut), 9);
  });

  it('shatters only the filled-back part with a Physics Shatter step, the cut stays', () => {
    const fixture = holeFixture({ seed: 4, fillBack: true });
    const plain = holeFixture({ seed: 4, fillBack: true }).pieces();
    const cut = plain.filter((p) => p.operation === SolidOperation.Subtractive);
    const fill = plain.filter((p) => p.operation === SolidOperation.Additive);
    const stepId = holeShatter(fixture.node, { crackSize: 0.3, duration: 1 });
    const pieces = fixture.pieces().filter((p) => p.visible);
    const run = physicsShatterLastRunOf(fixture.node.uuid, stepId);
    const suffix = (id: string) => id.slice(id.indexOf('#'));
    expect(run?.inputBrushIds.map(suffix)).toEqual(fill.map((p) => suffix(p.id)));
    const kept = pieces.filter((p) => p.operation === SolidOperation.Subtractive);
    expect(kept.map((p) => suffix(p.id))).toEqual(cut.map((p) => suffix(p.id)));
    const shards = pieces.filter((p) => p.operation === SolidOperation.Additive);
    expect(shards.length).toBeGreaterThan(fill.length);
    expect(Math.abs(holeVolume(shards) / holeVolume(fill) - 1)).toBeLessThan(1e-3);
  });

  // Each fill brick is one cell of the shatter brick grid. The fracture's carve
  // can still split a cell along a neighbour it only touches; that is the
  // fracture core's to fix, so the count of pieces is not pinned here.
  it('knocks out whole bricks that stay one brick each through Physics Shatter', () => {
    // Physics Shatter runs bricks along the longer of X and Z, so the wall is
    // thinner than a brick is long, as with real brick walls.
    const bricks = { style: 'bricks', seed: 9, brickLength: 0.4, brickHeight: 0.2, jut: 0.5, fillBack: true };
    const plain = holeFixture(bricks, true, 0.3).pieces();
    const fill = plain.filter((p) => p.operation === SolidOperation.Additive);
    expect(fill.length).toBeGreaterThan(10);
    expectSound(plain);
    const fixture = holeFixture(bricks, true, 0.3);
    const stepId = holeShatter(fixture.node, { material: 'brick', brickLength: 0.4, brickHeight: 0.2, mortarGap: 0 });
    fixture.pieces();
    const run = physicsShatterLastRunOf(fixture.node.uuid, stepId);
    const pieces = run?.fracture.pieces ?? [];
    expect(pieces.every((piece) => piece.isBrick && piece.cellIndex === 0)).toBe(true);
    expect(new Set(pieces.map((piece) => piece.sourceBrushId)).size).toBe(fill.length);
  });

  it('saves, reloads and undoes its settings', () => {
    const fixture = holeFixture({ style: 'bricks', seed: 11, bond: 'third', fillBack: true });
    const saved = ModifierVolume.read(fixture.node);
    const world = new THREE.Group();
    new SceneDeserializer().deserialize(new SceneSerializer().serialize(fixture.world), world);
    const nodes: THREE.Object3D[] = [];
    world.traverse((object) => {
      if (ModifierVolume.isGenerator(object)) nodes.push(object);
    });
    expect(nodes).toHaveLength(1);
    expect(ModifierVolume.read(nodes[0]!)).toEqual(saved);
    const before = fixture.pieces().map((p) => p.id);
    const step = saved.modifiers[0]!;
    const command = new CommandModifierStackSet(
      fixture.node,
      saved,
      modifierStackPatch(saved, step.id, { parameters: { ...step.parameters, seed: 12, fillBack: false } }),
    );
    command.execute();
    expect(fixture.pieces().length).toBeLessThan(before.length);
    command.undo();
    expect(ModifierVolume.read(fixture.node)).toEqual(saved);
    expect(fixture.pieces().map((p) => p.id)).toEqual(before);
  }, 30_000);

  it('picks the texture of the wall it sits in, as one undoable edit', () => {
    const fixture = holeFixture({ fillBack: true });
    fixture.world.updateMatrixWorld(true);
    expect(blastHoleWallFace(fixture.node)?.brushId).toBe(fixture.wall.id);
    const kind = modifierStackKindFind('blastHole')!;
    const action = kind.fields.find((field) => field.key === 'useWallTexture');
    const before = ModifierVolume.read(fixture.node);
    const statuses: string[] = [];
    const pushed: { undo(): void }[] = [];
    const target: ModifierStackActionTarget = {
      volume: fixture.node,
      stepId: before.modifiers[0]!.id,
      commandStack: {
        push: (command: { execute(): void; undo(): void }) => (command.execute(), pushed.push(command)),
      } as never,
      status: (text) => statuses.push(text),
    };
    void action?.action?.(target);
    const wallTexture = fixture.wall.getFaceSurface(0).textureId;
    expect(ModifierVolume.read(fixture.node).modifiers[0]!.parameters['texture']).toBe(wallTexture);
    expect(pushed).toHaveLength(1);
    pushed[0]!.undo();
    expect(ModifierVolume.read(fixture.node)).toEqual(before);
  });
});
