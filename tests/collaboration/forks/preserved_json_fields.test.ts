import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { solidModelModifierEncode, solidModelModifierDecode } from '@/solid/io/solid_model_modifier_codec.js';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ReplicaCollaborationScene } from '@/collaboration/sync/replica_collaboration_scene.js';
import { TrackerCollaboration } from '@/collaboration/sync/tracker_collaboration_commit.js';
import { fieldCollaborationMerge } from '@/collaboration/sync/field_collaboration_paths.js';
import { SceneSerializer } from '@/io/scene/scene_serializer.js';
import { SceneDeserializer } from '@/io/scene/scene_deserializer.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidModelCodec } from '@/solid/io/solid_model_codec.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import {
  preservedFieldsCapture,
  preservedFieldsApply,
  preservedWireApply,
} from '@/io/extensions/preserved_json_fields.js';
import type { NodeCollaborationState } from '@/collaboration/scene/node_collaboration_types.js';

/**
 * Builds an applied wire state carrying future data at all object envelope
 * levels.
 */
function fixture() {
  const world = new THREE.Group();
  const object = new THREE.Group();
  object.name = 'Original';
  world.add(object);
  const origin = new ReplicaCollaborationScene(world);
  origin.baselineInitialize();
  const state = JSON.parse(JSON.stringify(origin.snapshotStates()[0]));
  state['future:root'] = { arbitrary: [1, 'x', null] };
  state.data['future:data'] = { flags: [true, false] };
  state.data.entry['future:entry'] = { nested: { unknown: 'untouched' } };
  state.data.entry.position['future:axis'] = 'axis';
  const replicaWorld = new THREE.Group();
  const replica = new ReplicaCollaborationScene(replicaWorld);
  replica.locks.selfSet(2);
  replica.snapshotApply([state]);
  return { state: state as NodeCollaborationState, replica, world: replicaWorld, id: state.id as string };
}

/**
 * Reads a live node through the same codec used to send local edits.
 *
 * @param replica Current replica.
 * @param id Node id.
 * @returns Encoded state.
 */
function encoded(replica: ReplicaCollaborationScene, id: string) {
  const nodes = replica.applier.nodes();
  const ref = nodes.get(id);
  if (!ref) throw new Error('Missing fixture');
  return replica.codec.encode(ref, nodes.parents.get(id) ?? '', replica.keyOf(id) ?? '');
}

describe('unknown fork fields', () => {
  it('survives a real local edit and remote application, including nested unknown values', () => {
    const { state, replica, id } = fixture();
    const tracker = new TrackerCollaboration(replica, 1024 * 1024);
    const ref = replica.applier.nodes().get(id);
    if (!ref) throw new Error('Missing fixture');
    ref.object.name = 'Edited';
    const commit = tracker.commit();
    expect(commit.ops).toHaveLength(1);
    const remote = new ReplicaCollaborationScene(new THREE.Group());
    remote.snapshotApply([state]);
    remote.remoteApply(JSON.parse(JSON.stringify(commit.ops)));
    const result = encoded(remote, id) as unknown as Record<string, any>;
    expect(result['future:root']).toEqual((state as any)['future:root']);
    expect(result['data']['future:data']).toEqual((state.data as any)['future:data']);
    expect(result['data'].entry['future:entry']).toEqual((state.data as any).entry['future:entry']);
    expect(result['data'].entry.position['future:axis']).toBe('axis');
    expect(result['data'].entry.name).toBe('Edited');
  });
  it('keeps untouched fork fields when merging a concurrent known-field edit', () => {
    const { state, replica, id } = fixture();
    const incoming = JSON.parse(JSON.stringify(state));
    incoming.data.entry.name = 'Merged';
    const merged = fieldCollaborationMerge(state, incoming, ['data.entry.name']);
    replica.statesApply([merged], [], new Map(), false);
    expect(encoded(replica, id)).toMatchObject({
      'future:root': (state as any)['future:root'],
      data: {
        'future:data': (state.data as any)['future:data'],
        entry: { name: 'Merged', 'future:entry': (state.data as any).entry['future:entry'] },
      },
    });
  });
  it('survives JSON save/load and re-emits wire-level and payload extensions', () => {
    const { state, world, id } = fixture();
    const saved = new SceneSerializer().serialize(world);
    const loaded = new THREE.Group();
    new SceneDeserializer().deserialize(JSON.parse(JSON.stringify(saved)), loaded);
    const replica = new ReplicaCollaborationScene(loaded);
    replica.baselineInitialize();
    expect(encoded(replica, id)).toMatchObject({
      'future:root': (state as any)['future:root'],
      data: {
        'future:data': (state.data as any)['future:data'],
        entry: { 'future:entry': (state.data as any).entry['future:entry'] },
      },
    });
  });
  it('preserves unknown solid-model and brush fields through decode/encode', () => {
    const model = new SolidModel('Solid');
    model.addBoxBrush(1, SolidOperation.Additive);
    const data = JSON.parse(JSON.stringify(SolidModelCodec.encode(model)));
    data['fork:model'] = { version: 9 };
    data.brushes[0]['fork:brush'] = ['opaque', 7];
    const restored = SolidModelCodec.encode(SolidModelCodec.decode(data, 'Restored')) as any;
    expect(restored['fork:model']).toEqual(data['fork:model']);
    expect(restored.brushes[0]['fork:brush']).toEqual(data.brushes[0]['fork:brush']);
  });
});

/** Ordinary saves stay unchanged, and persistence metadata cannot overwrite ids. */
it('does not add empty persistence envelopes or interpret reserved prototype keys', () => {
  const world = new THREE.Group();
  world.add(new THREE.Group());
  const replica = new ReplicaCollaborationScene(world);
  replica.baselineInitialize();
  expect(JSON.stringify(new SceneSerializer().serialize(world))).not.toContain('aiworlded:wire');
  const owner = {};
  const input = JSON.parse('{"constructor":{},"__proto__":{},"prototype":{},"future:value":7}');
  expect(() => preservedFieldsCapture(owner, 'entry', input)).not.toThrow();
  expect(preservedFieldsApply(owner, 'entry', { name: 'safe' })).toEqual({ name: 'safe', 'future:value': 7 });
  const state = replica.snapshotStates()[0]!;
  preservedFieldsCapture(owner, 'entry', {
    'aiworlded:wire': { id: 'bad', kind: 'bad', data: { entry: { name: 'bad' }, 'future:data': 4 } },
  });
  expect(preservedWireApply(owner, state)).toMatchObject({
    id: state.id,
    kind: state.kind,
    data: { entry: { name: '' }, 'future:data': 4 },
  });
});

/** A future modifier implementation must not replay its stale retained values. */
it('gives editor-written scalar, array, modifierStack and nested keys precedence over retained data', () => {
  const owner = {};
  preservedFieldsCapture(owner, 'entry', {
    modifierStack: { amount: 1, 'fork:extra': 9 },
    modifierNodes: [{ amount: 1 }],
    name: 'old',
    'fork:primitive': { bad: 1 },
  });
  expect(
    preservedFieldsApply(owner, 'entry', {
      modifierStack: { amount: 5 },
      modifierNodes: [{ amount: 7 }],
      name: 'new',
      'fork:primitive': 3,
    }),
  ).toEqual({
    modifierStack: { amount: 5, 'fork:extra': 9 },
    modifierNodes: [{ amount: 7 }],
    name: 'new',
    'fork:primitive': 3,
  });
});

/**
 * Newly supported stack data is known and must not be replayed as retained
 * fields.
 */
it('does not resurrect an omitted known modifierStack or old modifier options', () => {
  const owner = {};
  preservedFieldsCapture(owner, 'entry', {
    modifierStack: ModifierVolume.read(ModifierVolume.create({})),
    modifierBevel: { distance: 1, options: { widthMode: 'offset' } },
  });
  expect(preservedFieldsApply(owner, 'entry', { name: 'ordinary mesh' })).toEqual({ name: 'ordinary mesh' });
});

/**
 * Modifier hierarchy operands preserve fork extensions without overwriting
 * authored settings.
 */
it('round trips modifier nodes with current settings winning retained data', () => {
  const saved = JSON.parse(JSON.stringify(solidModelModifierEncode(ModifierVolume.create({}))));
  saved['fork:operand'] = { opaque: 7 };
  saved.settings['fork:settings'] = { opaque: 9 };
  const node = solidModelModifierDecode(saved);
  ModifierVolume.write(node, { ...ModifierVolume.read(node), enabled: false, grouping: 'brush', modifiers: [] });
  const result = solidModelModifierEncode(node);
  expect(result).toMatchObject({
    'fork:operand': { opaque: 7 },
    settings: { enabled: false, grouping: 'brush', modifiers: [], 'fork:settings': { opaque: 9 } },
  });
});

/** Volume snapshots must retain primitive identity as well as exact geometry. */
it('keeps modifier geometryType and geometryParams stable through snapshot loading', () => {
  const world = new THREE.Group();
  world.add(ModifierVolume.create({}));
  const saved = new SceneSerializer().serialize(world);
  const loaded = new THREE.Group();
  new SceneDeserializer({ exactReplica: true }).deserialize(JSON.parse(JSON.stringify(saved)), loaded);
  const result = new SceneSerializer().serialize(loaded);
  expect(result.objects[0]?.geometryType).toBe(saved.objects[0]?.geometryType);
  expect(result.objects[0]?.geometryParams).toEqual(saved.objects[0]?.geometryParams);
});
