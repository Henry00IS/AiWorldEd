import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { modifierStackKindFind } from '@/modifier/stack/modifier_stack_catalog.js';
import {
  modifierStackStairsNoseProfile,
  modifierStackStairsNosingOf,
} from '@/modifier/stack/kinds/generator/modifier_stack_stairs_nosing.js';
import { modifierStackStairsSlabProfile } from '@/modifier/stack/kinds/generator/modifier_stack_stairs_slab.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { modifierStackParameterSet } from '@/modifier/stack/modifier_stack_operations.js';
import { CommandModifierStackSet } from '@/modifier/stack/command_modifier_stack_set.js';
import { modifierGeneratorNodeCreate } from '@/modifier/stack/modifier_generator_node.js';
import { modifierBevelRefreshScene } from '@/modifier/compile/modifier_bevel_scene_refresh.js';
import { ReplicaCollaborationScene } from '@/collaboration/sync/replica_collaboration_scene.js';
import { TrackerCollaboration } from '@/collaboration/sync/tracker_collaboration_commit.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { expectStackConvex, stackFixture } from '../../modifier_stack_fixture.js';

const flight = { steps: 4, rise: 0.2, run: 0.3, length: 1.2 };

/** Nosing used by the build tests. */
const NOSING = { sizing: 'count', count: 6, nosing: 0.04, noseHeight: 0.03, noseBevel: 0.04 };

/**
 * Compiles a stairs fixture and returns its generated pieces.
 *
 * @param parameters Stairs parameters.
 * @returns Generated brushes, the captured source box left out.
 */
function pieces(parameters: Record<string, unknown>): SolidBrushInstance[] {
  return stackFixture([{ kind: 'stairs', parameters }], 2)
    .compile()
    .instances.slice(1);
}

/**
 * Returns a compiled model's vertex positions.
 *
 * @param model Compiled model.
 * @returns Vertex positions.
 */
function positions(model: SolidModel): number[] {
  return Array.from(model.getResultMesh().geometry.getAttribute('position').array);
}

/**
 * Builds a standalone stairs generator in a solid.
 *
 * @returns World, model and generator node.
 */
function staircase() {
  const world = new THREE.Group();
  const model = new SolidModel('Stairs');
  world.add(model.root);
  const node = modifierGeneratorNodeCreate('stairs');
  node.scale.set(2, 2, 3);
  model.root.add(node);
  modifierBevelRefreshScene(world);
  return { world, model, node };
}

/**
 * Sets one stairs parameter on a generator node.
 *
 * @param node Generator node.
 * @param key Parameter key.
 * @param value New value.
 * @returns Stack before and after.
 */
function parameterSet(node: THREE.Object3D, key: string, value: number) {
  const before = ModifierVolume.read(node);
  const after = modifierStackParameterSet(before, before.modifiers[0]?.id ?? '', key, value);
  return { before, after };
}

describe('stairs nosing', () => {
  it('is off by default and stays out of saved parameters', () => {
    const stairs = modifierStackKindFind('stairs');
    if (!stairs) throw new Error('Missing stairs');
    const parameters = stairs.normalizeParameters(stairs.createParameters());
    for (const key of ['nosing', 'noseHeight', 'noseBevel', 'noseEdge']) expect(key in parameters).toBe(false);
    const extra = stairs.fields.filter((field) => ['noseHeight', 'noseBevel', 'noseEdge'].includes(field.key));
    expect(extra.map((field) => field.label)).toEqual(['Nose Height', 'Nose Bevel', 'Edge Chamfer']);
    for (const field of extra) {
      expect(field.visible?.(parameters)).toBe(false);
      expect(field.visible?.({ ...parameters, nosing: 0.03 })).toBe(true);
    }
    expect(stairs.normalizeParameters({ ...parameters, nosing: 0.03 })['nosing']).toBe(0.03);
  });

  it('builds exactly the plain flight while off', () => {
    for (const fill of ['slab', 'solid', 'floating']) {
      const plain = pieces({ sizing: 'count', count: 6, fill });
      const zero = pieces({ ...NOSING, fill, nosing: 0 });
      expect(zero).toHaveLength(6);
      expect(zero.map((piece) => piece.brush.vertices.map((v) => v.toArray()))).toEqual(
        plain.map((piece) => piece.brush.vertices.map((v) => v.toArray())),
      );
    }
  });

  it('profiles a nose with its front on the step line and the chamfer into the riser', () => {
    const nosing = { depth: 0.04, height: 0.03, bevel: 0.02, edge: 0 };
    const nose = modifierStackStairsNoseProfile(1, flight, nosing, 0);
    expect(nose.map((point) => [point.x, point.y].map((value) => Number(value.toFixed(6))))).toEqual([
      [0.3, 0.37],
      [0.34, 0.35],
      [0.34, 0.4],
      [0.3, 0.4],
    ]);
    expect(modifierStackStairsNoseProfile(1, flight, { ...nosing, height: 0 }, 0)).toHaveLength(3);
    expect(modifierStackStairsNoseProfile(1, flight, { ...nosing, depth: 0 }, 0)).toHaveLength(0);
  });

  it('clamps the nose to the run, the rise and a floating tread', () => {
    const big = { nosing: 5, noseHeight: 5, noseBevel: 5 };
    expect(modifierStackStairsNosingOf(big, flight, flight.rise)).toEqual({
      depth: 0.15,
      height: 0.2,
      bevel: 0,
      edge: 0,
    });
    expect(modifierStackStairsNosingOf({ ...big, noseEdge: 5 }, flight, flight.rise).edge).toBeCloseTo(0.15);
    const thin = modifierStackStairsNosingOf({ nosing: 0.05, noseHeight: 0.03, noseBevel: 0.05 }, flight, 0.05);
    expect(thin.height + thin.bevel).toBeCloseTo(0.05);
  });

  it('rakes the whole riser when the bevel reaches the step height', () => {
    const nosing = modifierStackStairsNosingOf(
      { nosing: 0.1, noseHeight: 0.01, noseBevel: 1, noseEdge: 0.005 },
      flight,
      flight.rise,
    );
    expect(nosing.height + nosing.bevel).toBeCloseTo(flight.rise);
    const nose = modifierStackStairsNoseProfile(2, flight, nosing, 0);
    expect(nose).toHaveLength(5);
    const root = nose[1];
    expect(root?.x).toBeCloseTo(2 * flight.run + 0.1);
    expect(root?.y).toBeCloseTo(2 * flight.rise);
    const edge = nose.slice(3).map((point) => [point.x - 2 * flight.run, point.y - 3 * flight.rise]);
    expect(edge.map(([x, y]) => [Number(x?.toFixed(6)), Number(y?.toFixed(6))])).toEqual([
      [0.005, 0],
      [0, -0.005],
    ]);
    const built = pieces({
      ...NOSING,
      nosing: 0.1,
      noseHeight: 0.01,
      noseBevel: 1,
      noseEdge: 0.005,
      texture: 'riser',
      capTextures: true,
      textureTop: 'tread',
      textureBottom: 'under',
    });
    expect(built).toHaveLength(12);
    built.forEach(expectStackConvex);
    const raked = built.flatMap((piece, index) =>
      index % 2 === 1
        ? piece.brush.faces
            .filter((_, face) => {
              const normal = piece.brush.planes[face]?.normal;
              return normal !== undefined && normal.y < -1e-6;
            })
            .map((face) => piece.getSurfaceTextureId(face.surfaceIndex))
        : [],
    );
    expect(raked).toEqual(Array(6).fill('riser'));
  });

  it('recesses the slab risers and keeps the waist square to the pitch from their roots', () => {
    const plain = modifierStackStairsSlabProfile(2, flight, 0.1, 0);
    const recessed = modifierStackStairsSlabProfile(2, flight, 0.1, 0, 0.05);
    expect(recessed.map((point) => [point.x - 0.05, point.y].map((value) => value.toFixed(6)))).toEqual(
      plain.map((point) => [point.x, point.y].map((value) => value.toFixed(6))),
    );
    const last = modifierStackStairsSlabProfile(3, flight, 0.1, 0, 0.05);
    expect(Math.max(...last.map((point) => point.x))).toBeCloseTo(flight.length);
  });

  it.each(['slab', 'solid', 'floating'])('adds one convex nose per step inside the volume (%s)', (fill) => {
    for (const direction of ['+x', '-x', '+z', '-z']) {
      const built = pieces({ ...NOSING, fill, direction, landing: 0.5, thickness: 0.08 });
      expect(built).toHaveLength(12);
      built.forEach(expectStackConvex);
      const bounds = new THREE.Box3(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1)).expandByScalar(1e-6);
      for (const piece of built)
        for (const vertex of piece.brush.vertices) expect(bounds.containsPoint(vertex)).toBe(true);
    }
  });

  it('gives the nose top the tread texture and its front and bevel the riser texture', () => {
    const built = pieces({
      ...NOSING,
      texture: 'riser',
      capTextures: true,
      textureTop: 'tread',
      textureSide: 'wall',
      textureBottom: 'under',
    });
    const nose = built[1];
    if (!nose) throw new Error('Missing nose');
    const looks = nose.brush.faces.map((face, index) => ({
      normal: nose.brush.planes[index]?.normal ?? new THREE.Vector3(),
      texture: nose.getSurfaceTextureId(face.surfaceIndex),
    }));
    const bevel = looks.filter((look) => look.normal.y < -1e-6);
    expect(bevel).toHaveLength(1);
    expect(bevel[0]?.normal.z).toBeLessThan(0);
    expect(bevel[0]?.texture).toBe('riser');
    expect(looks.filter((look) => look.normal.y > 0.999).map((look) => look.texture)).toEqual(['tread']);
    const slab = built.flatMap((piece, index) =>
      index % 2 === 0
        ? piece.brush.faces.filter((_, face) => {
            const normal = piece.brush.planes[face]?.normal;
            return normal !== undefined && normal.y < -1e-6 && normal.z > 1e-6;
          })
        : [],
    );
    expect(slab.length).toBeGreaterThan(0);
  });

  it('rebuilds a nosing edit through undo and redo', () => {
    const { model, node } = staircase();
    const plain = positions(model);
    const { before, after } = parameterSet(node, 'nosing', 0.04);
    const command = new CommandModifierStackSet(node, before, after);
    command.execute();
    const nosed = positions(model);
    expect(nosed).not.toEqual(plain);
    for (const step of ['undo', 'redo', 'undo', 'redo'] as const) {
      if (step === 'undo') command.undo();
      else command.execute();
      expect(positions(model)).toEqual(step === 'undo' ? plain : nosed);
    }
  });

  it('syncs a nosing edit to a collaborator, who rebuilds the same flight', () => {
    const owner = new ReplicaCollaborationScene(new THREE.Group());
    owner.locks.selfSet(1);
    const { model, node } = staircase();
    owner.world.add(model.root);
    modifierBevelRefreshScene(owner.world);
    owner.baselineInitialize();
    const remote = new ReplicaCollaborationScene(new THREE.Group());
    remote.locks.selfSet(2);
    remote.snapshotApply(JSON.parse(JSON.stringify(owner.snapshotStates())));
    const object = remote.applier.nodes().get(model.root.uuid)?.object;
    const remoteModel = object ? SolidModel.fromObject(object) : null;
    if (!remoteModel) throw new Error('Missing remote solid');
    const tracker = new TrackerCollaboration(owner, 1 << 24);
    const plain = positions(remoteModel);
    let stack = ModifierVolume.read(node);
    const step = stack.modifiers[0]?.id ?? '';
    for (const [key, value] of [
      ['nosing', 0.04],
      ['noseBevel', 0.05],
    ] as const)
      stack = modifierStackParameterSet(stack, step, key, value);
    ModifierVolume.write(node, stack);
    modifierBevelRefreshScene(owner.world);
    remote.remoteApply(JSON.parse(JSON.stringify(tracker.commit().ops)));
    const remoteNode = remote.applier.nodes().get(node.uuid)?.object;
    if (!remoteNode) throw new Error('Missing remote stairs');
    expect(ModifierVolume.read(remoteNode).modifiers[0]?.parameters['noseBevel']).toBe(0.05);
    expect(positions(remoteModel)).not.toEqual(plain);
    expect(positions(remoteModel)).toEqual(positions(model));
  });
});
