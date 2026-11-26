import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ReplicaCollaborationScene } from '@/collaboration/sync/replica_collaboration_scene.js';
import { TrackerCollaboration } from '@/collaboration/sync/tracker_collaboration_commit.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { modifierGeneratorNodeCreate } from '@/modifier/stack/modifier_generator_node.js';
import { modifierStackParametersCommit } from '@/modifier/stack/modifier_stack_parameters_commit.js';
import {
  MODIFIER_STACK_SOLID_SCRIPT_KIND,
  MODIFIER_STACK_SOLID_SCRIPT_PERSISTENT_KEY,
} from '@/modifier/stack/kinds/generator/solid_script/modifier_stack_solid_script_keys.js';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';

/**
 * Builds an owner and a joiner already synced to an empty world.
 *
 * @returns Owner, joiner and the owner's tracker.
 */
function pair() {
  const owner = new ReplicaCollaborationScene(new THREE.Group());
  owner.locks.selfSet(1);
  owner.baselineInitialize();
  const joiner = new ReplicaCollaborationScene(new THREE.Group());
  joiner.locks.selfSet(2);
  joiner.snapshotApply(JSON.parse(JSON.stringify(owner.snapshotStates())));
  const tracker = new TrackerCollaboration(owner, 1 << 22);
  return { owner, joiner, tracker };
}

/**
 * Returns the joiner's copy of an object.
 *
 * @param replica Replica.
 * @param uuid Node id.
 * @returns Object.
 */
function replicaObject(replica: ReplicaCollaborationScene, uuid: string): THREE.Object3D {
  replica.applier.invalidate();
  const object = replica.applier.nodes().get(uuid)?.object;
  if (!object) throw new Error(`missing ${uuid}`);
  return object;
}

/**
 * Sends the owner's latest edits to the joiner.
 *
 * @param joiner Joiner.
 * @param tracker Owner tracker.
 */
function sync(joiner: ReplicaCollaborationScene, tracker: TrackerCollaboration): void {
  joiner.remoteApply(JSON.parse(JSON.stringify(tracker.commit().ops)));
}

/**
 * Reads the persistent record stored on a Solid Script generator.
 *
 * @param node Generator node.
 * @returns Stored record.
 */
function persistentOf(node: THREE.Object3D): unknown {
  return ModifierVolume.read(node).modifiers[0]?.parameters[MODIFIER_STACK_SOLID_SCRIPT_PERSISTENT_KEY];
}

describe('collaboration of Solid Script persistent values', () => {
  it('shares a structured persistent record with a joiner', () => {
    const { owner, joiner, tracker } = pair();
    const node = modifierGeneratorNodeCreate(MODIFIER_STACK_SOLID_SCRIPT_KIND);
    node.name = 'Script';
    owner.world.add(node);
    sync(joiner, tracker);
    const stepId = ModifierVolume.read(node).modifiers[0]?.id ?? '';
    const script = solidScriptDocumentCreate([
      { command: 'echo', values: { value: '[$Persistent.Count]' } },
      { command: 'cube', values: {} },
    ]);
    const persistent = {
      count: 4,
      note: 'He said "hello"\nand then goodbye',
      prices: { kind: 'dictionary', entries: [{ name: 'Wood', value: 5 }] },
      turn: { kind: 'rotation', degrees: [0, 90, 0] },
    };
    modifierStackParametersCommit(node, stepId, { script, persistent }, null);
    sync(joiner, tracker);
    expect(persistentOf(replicaObject(joiner, node.uuid))).toEqual(persistent);
  });
});
