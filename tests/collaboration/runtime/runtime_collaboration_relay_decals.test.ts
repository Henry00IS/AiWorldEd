import * as THREE from 'three';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  type HarnessCollaborationEditor,
  harnessCollaborationRelayUp,
  harnessCollaborationUntil,
} from './harness_collaboration_editor.js';
import {
  HARNESS_RELAY_REQUIRED,
  harnessRelayClose,
  harnessRelayConverged,
  harnessRelayJoin,
  harnessRelayRoomBuilt,
} from './harness_collaboration_relay.js';
import { pngHeaderCreate } from '../session/texture_collaboration_fixture.js';
import { decalTestServices } from '../../decal/decal_test_fixture.js';
import { DecalSceneSync } from '@/decal/scene/decal_scene_sync.js';
import { decalProjectorNodeCreate } from '@/decal/volume/decal_projector_node.js';
import { DECAL_DIRECTION_ARROW_USERDATA_KEY } from '@/decal/volume/decal_direction_arrow.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { modifierVolumeTemplateCreate } from '@/modifier/stack/modifier_volume_templates.js';
import { modifierStackParameterSet } from '@/modifier/stack/modifier_stack_operations.js';
import { CommandModifierStackSet } from '@/modifier/stack/command_modifier_stack_set.js';
import { modifierBevelRefreshScene } from '@/modifier/compile/modifier_bevel_scene_refresh.js';
import { nodeVolumeStackText } from '@/collaboration/scene/node_collaboration_volume.js';
import { CommandHierarchyDuplicate } from '@/outliner/commands/command_hierarchy_duplicate.js';
import { CommandObjectHierarchyDelete } from '@/outliner/commands/command_object_hierarchy_delete.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { createTextureBrowserEntry } from '@/texture/library/texture_browser_entry.js';

let relayUp = false;
beforeAll(async () => {
  relayUp = await harnessCollaborationRelayUp();
  if (!relayUp && HARNESS_RELAY_REQUIRED) throw new Error('collaboration relay is not reachable');
  if (typeof URL.createObjectURL !== 'function') Object.assign(URL, { createObjectURL: () => 'blob:test' });
  if (typeof URL.revokeObjectURL !== 'function') Object.assign(URL, { revokeObjectURL: () => undefined });
});
afterEach(harnessRelayClose);

/** Image the Stain decal shows, offered only by the owner's texture folder. */
const DECAL_IMAGE_ID = 'stain.png';

/**
 * Places a decal projector over the floor top.
 *
 * @param client Editor client.
 * @param name Projector name.
 * @param x Projector x.
 * @returns Projector.
 */
function decalAdd(client: HarnessCollaborationEditor, name: string, x: number): THREE.Mesh {
  const decal = decalProjectorNodeCreate('projector');
  decal.name = name;
  decal.position.set(x, 1.2, 0);
  decal.scale.set(0.8, 1, 0.8);
  client.world.add(decal);
  return decal;
}

/**
 * Builds a floor slab under a bevel volume, a textured Stain decal and a plain
 * Other decal.
 *
 * @param client Owner editor.
 */
function sceneBuild(client: HarnessCollaborationEditor): void {
  const bytes = new Uint8Array(64);
  bytes.set(pngHeaderCreate(8, 8));
  client.textures.replaceAll('decals', [
    createTextureBrowserEntry(new File([bytes], DECAL_IMAGE_ID, { type: 'image/png' }), DECAL_IMAGE_ID),
  ]);
  const model = new SolidModel('Floor');
  model.root.name = 'Floor';
  model.addBoxBrush(2, SolidOperation.Additive);
  const bevel = modifierVolumeTemplateCreate('bevel');
  bevel.name = 'Bevel';
  bevel.scale.setScalar(8);
  client.world.add(model.root, bevel);
  const stain = decalAdd(client, 'Stain', -0.5);
  decalAdd(client, 'Other', 0.5);
  parametersWrite(stain, { texture: DECAL_IMAGE_ID, layer: 2 });
  modifierBevelRefreshScene(client.world);
}

/**
 * Writes decal parameters straight into a projector's stack.
 *
 * @param decal Projector.
 * @param values Parameter values by key.
 */
function parametersWrite(decal: THREE.Object3D, values: Record<string, unknown>): void {
  const stack = ModifierVolume.read(decal);
  const entry = stack.modifiers[0];
  if (entry) entry.parameters = { ...entry.parameters, ...values };
  ModifierVolume.write(decal, stack);
}

/**
 * Reads one decal parameter.
 *
 * @param client Editor client.
 * @param name Projector name.
 * @param key Parameter key.
 * @returns Value.
 */
function parameter(client: HarnessCollaborationEditor, name: string, key: string): unknown {
  return ModifierVolume.read(client.object(name)).modifiers[0]?.parameters[key];
}

/**
 * Changes one decal option through the undoable inspector command.
 *
 * @param client Editor client.
 * @param name Projector name.
 * @param key Parameter key.
 * @param value New value.
 */
function optionSet(client: HarnessCollaborationEditor, name: string, key: string, value: unknown): void {
  const decal = client.object(name);
  const before = ModifierVolume.read(decal);
  const after = modifierStackParameterSet(before, before.modifiers[0]?.id ?? '', key, value);
  client.commandStack.push(new CommandModifierStackSet(decal, before, after));
  client.commit();
}

/**
 * Returns whether a node is a decal projector carrying its direction arrow.
 *
 * @param object Scene node.
 * @returns True for a complete decal projector.
 */
function isDecalWithArrow(object: THREE.Object3D): boolean {
  return (
    ModifierVolume.isDecal(object) &&
    object.children.filter((child) => child.userData[DECAL_DIRECTION_ARROW_USERDATA_KEY] === true).length === 1
  );
}

/**
 * Returns a decal's drawn triangle count after a sync pass.
 *
 * @param sync Client's decal synchronizer.
 * @param client Editor client.
 * @param name Projector name.
 * @returns Triangle count.
 */
function trianglesOf(sync: DecalSceneSync, client: HarnessCollaborationEditor, name: string): number {
  return sync.layerOf(client.solid('Floor'))?.presentationOf(client.object(name))?.triangleCount() ?? 0;
}

/**
 * Counts every frame a client sends from now on.
 *
 * @param client Connected client.
 * @returns Reads the count.
 */
function framesObserve(client: HarnessCollaborationEditor): () => number {
  const socket = client.socket;
  if (!socket) throw new Error('missing socket');
  let sent = 0;
  const original = socket.send.bind(socket);
  socket.send = (...args: Parameters<typeof socket.send>) => {
    sent++;
    return original(...args);
  };
  return () => sent;
}

/**
 * Drags a node in small steps while holding its edit lease, as the gizmo does.
 *
 * @param client Dragging client.
 * @param name Node name.
 * @param steps Frames.
 */
async function drag(client: HarnessCollaborationEditor, name: string, steps: number): Promise<void> {
  await client.editStart(name);
  const object = client.object(name);
  const start = object.position.x;
  for (let step = 1; step <= steps; step++) {
    object.position.x = start + step * 0.01;
    object.updateMatrixWorld(true);
    await new Promise((resolve) => setTimeout(resolve, 33));
  }
  await client.editEnd();
}

describe('decal projectors over the relay', { timeout: 60000 }, () => {
  it('shows a late joiner every decal with its arrow, settings, image and drawn mesh', async ({ skip }) => {
    if (!relayUp) skip();
    const { owner, room } = await harnessRelayRoomBuilt('decal late join', sceneBuild);
    const peer = await harnessRelayJoin(room, 'Decal peer');
    await harnessRelayConverged([owner, peer]);
    for (const name of ['Stain', 'Other']) {
      expect(isDecalWithArrow(peer.object(name))).toBe(true);
      expect(nodeVolumeStackText(ModifierVolume.read(peer.object(name)))).toBe(
        nodeVolumeStackText(ModifierVolume.read(owner.object(name))),
      );
    }
    await harnessCollaborationUntil(() => peer.textures.getEntryById(DECAL_IMAGE_ID) !== null, 8000, 'image arrived');
    const [ownerSync, peerSync] = [new DecalSceneSync(decalTestServices()), new DecalSceneSync(decalTestServices())];
    ownerSync.sync(owner.world);
    expect(peerSync.sync(peer.world).rebuiltDecals).toBe(2);
    expect(trianglesOf(peerSync, peer, 'Stain')).toBeGreaterThan(0);
    expect(trianglesOf(peerSync, peer, 'Stain')).toBe(trianglesOf(ownerSync, owner, 'Stain'));
  });

  it('syncs every panel option both ways, undoes across peers and recuts only the edited decal', async ({ skip }) => {
    if (!relayUp) skip();
    const { owner, room } = await harnessRelayRoomBuilt('decal options', sceneBuild);
    const peer = await harnessRelayJoin(room, 'Decal options peer');
    await harnessRelayConverged([owner, peer]);
    const peerSync = new DecalSceneSync(decalTestServices());
    peerSync.sync(peer.world);
    const options: [string, unknown][] = [
      ['mode', 'surfaceMesh'],
      ['texture', ''],
      ['opacity', 0.4],
      ['layer', 7],
      ['facingLimit', 60],
      ['firstHitOnly', true],
      ['liftDistance', 0.01],
      ['unfoldSticker', true],
    ];
    for (const [key, value] of options) {
      optionSet(owner, 'Stain', key, value);
      await harnessCollaborationUntil(() => parameter(peer, 'Stain', key) === value, 5000, `${key} synced`);
      const report = peerSync.sync(peer.world);
      expect(report.rebuiltDecals, key).toBeLessThanOrEqual(1);
    }
    expect(
      peerSync.layerOf(peer.solid('Floor'))?.presentationOf(peer.object('Stain'))?.triangleCount(),
    ).toBeGreaterThan(0);
    owner.commandStack.undo();
    owner.commit();
    await harnessCollaborationUntil(() => parameter(peer, 'Stain', 'unfoldSticker') === false, 5000, 'undo synced');
    await peer.select('Other');
    optionSet(peer, 'Other', 'opacity', 0.25);
    await harnessCollaborationUntil(() => parameter(owner, 'Other', 'opacity') === 0.25, 5000, 'peer edit synced');
    await peer.deselect();
    await harnessRelayConverged([owner, peer]);
  });

  it('syncs create, duplicate, move and delete, and remote decal drags never rebuild solids', async ({ skip }) => {
    if (!relayUp) skip();
    const { owner, room } = await harnessRelayRoomBuilt('decal lifecycle', sceneBuild);
    const peer = await harnessRelayJoin(room, 'Decal lifecycle peer');
    await harnessRelayConverged([owner, peer]);
    decalAdd(owner, 'Fresh', 0);
    owner.commit();
    await harnessCollaborationUntil(() => peer.find('Fresh') !== undefined, 5000, 'create synced');
    expect(isDecalWithArrow(peer.object('Fresh'))).toBe(true);
    const duplicate = new CommandHierarchyDuplicate([owner.object('Stain')], new THREE.Vector3());
    owner.commandStack.push(duplicate);
    owner.commit();
    const copyName = duplicate.getClones()[0]?.name ?? '';
    await harnessCollaborationUntil(() => peer.find(copyName) !== undefined, 5000, 'duplicate synced');
    expect(isDecalWithArrow(peer.object(copyName))).toBe(true);
    expect(parameter(peer, copyName, 'texture')).toBe(DECAL_IMAGE_ID);
    const rebuild = vi.spyOn(peer.solid('Floor'), 'rebuild');
    await drag(owner, 'Stain', 12);
    await harnessCollaborationUntil(
      () => Math.abs(peer.object('Stain').position.x - owner.object('Stain').position.x) < 1e-6,
      5000,
      'move synced',
    );
    expect(rebuild).not.toHaveBeenCalled();
    owner.commandStack.push(new CommandObjectHierarchyDelete([owner.object('Fresh')]));
    owner.commit();
    await harnessCollaborationUntil(() => peer.find('Fresh') === undefined, 5000, 'delete synced');
    await harnessRelayConverged([owner, peer]);
  });

  it('sends no more frames while dragging a decal than while dragging another volume', async ({ skip }) => {
    if (!relayUp) skip();
    const { owner, room } = await harnessRelayRoomBuilt('decal drag traffic', sceneBuild);
    const peer = await harnessRelayJoin(room, 'Decal traffic peer');
    await harnessRelayConverged([owner, peer]);
    const sent = framesObserve(owner);
    const counts: Record<string, number> = {};
    for (const name of ['Bevel', 'Stain']) {
      const before = sent();
      await drag(owner, name, 20);
      counts[name] = sent() - before;
    }
    console.info('frames sent per 20-step drag', JSON.stringify(counts));
    expect(counts['Stain']).toBeLessThanOrEqual((counts['Bevel'] ?? 0) + 2);
    await harnessRelayConverged([owner, peer]);
  });
});
