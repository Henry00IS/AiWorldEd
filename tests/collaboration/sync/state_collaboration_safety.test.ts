import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SceneSerializer } from '@/io/scene/scene_serializer.js';
import { SceneDeserializer } from '@/io/scene/scene_deserializer.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { ReplicaCollaborationScene } from '@/collaboration/sync/replica_collaboration_scene.js';
import { stateCollaborationParse } from '@/collaboration/sync/state_collaboration_parse.js';
import { stateCollaborationSafe, stateNumbersSafe } from '@/collaboration/sync/state_collaboration_safety.js';
import { orderKeysInitial } from '@/collaboration/scene/key_collaboration_order.js';
import type { NodeCollaborationState } from '@/collaboration/scene/node_collaboration_types.js';

/**
 * Encodes a buffer mesh, a sphere and a solid model with one brush as relayed
 * node states.
 *
 * @returns States keyed by kind: mesh, sphere and brush.
 */
function statesBuild(): Record<'mesh' | 'sphere' | 'brush', NodeCollaborationState> {
  const world = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BufferGeometry().copy(new THREE.BoxGeometry(1, 1, 1)));
  mesh.name = 'Mesh';
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6));
  sphere.name = 'Sphere';
  const model = new SolidModel('Solid');
  model.addBoxBrush(2, SolidOperation.Additive);
  world.add(mesh, sphere, model.root);
  const loaded = new THREE.Group();
  new SceneDeserializer().deserialize(new SceneSerializer().serialize(world), loaded);
  const replica = new ReplicaCollaborationScene(loaded);
  const nodes = replica.applier.nodes();
  const encode = (match: (state: NodeCollaborationState) => boolean): NodeCollaborationState => {
    const states = nodes.refs.map((ref) =>
      replica.codec.encode(ref, nodes.parents.get(ref.id) ?? '', orderKeysInitial(1)[0] ?? ''),
    );
    return JSON.parse(JSON.stringify(states.find((state) => state !== null && match(state)))) as NodeCollaborationState;
  };
  return {
    mesh: encode((state) => JSON.stringify(state.data).includes('"Mesh"')),
    sphere: encode((state) => JSON.stringify(state.data).includes('"Sphere"')),
    brush: encode((state) => state.kind === 'brush'),
  };
}

/**
 * Returns a deep copy of a state after a mutation of its payload.
 *
 * @param state Source state.
 * @param mutate Payload mutation.
 * @returns Mutated copy.
 */
function mutated(state: NodeCollaborationState, mutate: (data: Record<string, any>) => void): NodeCollaborationState {
  const copy = JSON.parse(JSON.stringify(state)) as NodeCollaborationState;
  mutate(copy.data as unknown as Record<string, any>);
  return copy;
}

/** Hostile payloads a member could relay to every other member. */
describe('state_collaboration_safety', () => {
  const states = statesBuild();

  it('accepts real editor states', () => {
    Object.values(states).forEach((state) => {
      expect(stateCollaborationSafe(state)).toBe(true);
      expect(stateCollaborationParse(state)).not.toBeNull();
    });
  });

  it('rejects huge and non-finite numbers anywhere in the payload', () => {
    expect(stateNumbersSafe({ a: [1, { b: 1e300 }] })).toBe(false);
    expect(stateNumbersSafe({ a: [Number.NaN] })).toBe(false);
    expect(stateNumbersSafe({ a: [-Infinity] })).toBe(false);
    expect(stateCollaborationSafe(mutated(states.mesh, (data) => (data['entry'].position.x = 1e300)))).toBe(false);
  });

  it('caps primitive segment counts', () => {
    const huge = mutated(states.sphere, (data) => (data['entry'].geometryParams.widthSegments = 100000));
    expect(stateCollaborationParse(huge)).toBeNull();
    const fractional = mutated(states.sphere, (data) => (data['entry'].geometryParams.heightSegments = 2.5));
    expect(stateCollaborationSafe(fractional)).toBe(false);
  });

  it('rejects mesh indices and arrays that do not match the vertices', () => {
    const index = mutated(states.mesh, (data) => (data['entry'].geometryData.index[0] = 99999));
    const uv = mutated(states.mesh, (data) => data['entry'].geometryData.uv.pop());
    const position = mutated(states.mesh, (data) => data['entry'].geometryData.position.push(1));
    const faces = mutated(states.mesh, (data) => (data['entry'].faceTextureMaps[0].triangleIndices[0] = 5000));
    [index, uv, position, faces].forEach((state) => expect(stateCollaborationSafe(state)).toBe(false));
  });

  it('accepts the literal primitive UVs and rejects malformed ones', () => {
    const literal = mutated(states.sphere, (data) => (data['uv'] = [0, 0, 1, 1]));
    expect(stateCollaborationSafe(literal)).toBe(true);
    const odd = mutated(literal, (data) => data['uv'].pop());
    const text = mutated(literal, (data) => (data['uv'][0] = 'x'));
    const shape = mutated(states.sphere, (data) => (data['uv'] = { 0: 1 }));
    const huge = mutated(literal, (data) => (data['uv'][0] = 1e300));
    [odd, text, shape, huge].forEach((state) => expect(stateCollaborationSafe(state)).toBe(false));
  });

  it('rejects mesh documents and material groups that do not match the vertices', () => {
    const document = (faces: number[][], extra: Record<string, unknown> = {}) =>
      mutated(
        states.mesh,
        (data) => (data['entry'].meshDocument = { position: [0, 0, 0, 1, 0, 0, 0, 1, 0], faces, ...extra }),
      );
    expect(stateCollaborationSafe(document([[0, 1, 2]]))).toBe(true);
    const vertex = document([[0, 1, 99999]]);
    const loop = document([[0, 1]]);
    const uv = document([[0, 1, 2]], { uv: [0, 0] });
    const surface = document([[0, 1, 2]], { surfaces: [{ textureId: 1, uv: {} }] });
    const group = mutated(
      states.mesh,
      (data) => (data['entry'].geometryData.groups = [{ start: 0, count: 99999, materialIndex: 0 }]),
    );
    const text = mutated(states.mesh, (data) => (data['entry'].contentTextureId = 7));
    [vertex, loop, uv, surface, group, text].forEach((state) => expect(stateCollaborationSafe(state)).toBe(false));
  });

  it('rejects brush topology that would loop or read out of range', () => {
    const run = mutated(states.brush, (data) => (data['brush'].faces[0].edgeCount = 1e8));
    const twin = mutated(states.brush, (data) => (data['brush'].wingEdges[0].twinIndex = -1));
    const vertex = mutated(states.brush, (data) => (data['brush'].wingEdges[0].vertexIndex = 4096));
    const vertices = mutated(states.brush, (data) => (data['brush'].vertices = new Array(4097 * 3).fill(0)));
    [run, twin, vertex, vertices].forEach((state) => expect(stateCollaborationSafe(state)).toBe(false));
  });
});
