import * as THREE from 'three';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  harnessCollaborationRelayUp,
  harnessCollaborationUntil,
  type HarnessCollaborationEditor,
} from './harness_collaboration_editor.js';
import {
  HARNESS_RELAY_REQUIRED,
  harnessRelayClient,
  harnessRelayClose,
  harnessRelayConverged,
  harnessRelayJoin,
  harnessRelayRoomBuilt,
} from './harness_collaboration_relay.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { getFaceTextureMaps, setFaceTextureMaps } from '@/texture/uv/face_texture_storage.js';

let relayUp = false;

beforeAll(async () => {
  relayUp = await harnessCollaborationRelayUp();
  if (!relayUp && HARNESS_RELAY_REQUIRED) throw new Error('collaboration relay is not reachable');
});

afterEach(harnessRelayClose);

/**
 * Fills a room scene with four boxes and a solid model.
 *
 * @param owner Owner client.
 */
function sceneBuild(owner: HarnessCollaborationEditor): void {
  ['Alpha', 'Beta', 'Gamma', 'Delta'].forEach((name, index) => {
    owner.boxAdd(name).position.set(index * 2, 0, 0);
  });
  owner.solidAdd('Solid');
}

/**
 * Creates a room with the shared scene and joins two members.
 *
 * @param name Room name.
 * @returns Owner and both members.
 */
async function roomOfThree(name: string): Promise<HarnessCollaborationEditor[]> {
  const { owner, room } = await harnessRelayRoomBuilt(name, sceneBuild);
  const first = await harnessRelayJoin(room, `${name} first`);
  const second = await harnessRelayJoin(room, `${name} second`);
  return [owner, first, second];
}

/**
 * Applies transform, rename, material, visibility and create edits on Alpha.
 *
 * @param client Member holding Alpha.
 */
function editsTransformAndProperties(client: HarnessCollaborationEditor): void {
  const alpha = client.mesh('Alpha');
  alpha.position.set(1, 2, 3);
  alpha.rotation.set(0, Math.PI / 3, 0);
  alpha.scale.set(2, 1, 1);
  (alpha.material as THREE.MeshStandardMaterial).color.setHex(0x22aa44);
  alpha.visible = false;
  alpha.name = 'Alpha renamed';
  client.boxAdd('Created by owner').position.set(0, 5, 0);
}

/**
 * Applies vertex, face texture, group and duplicate edits on Beta.
 *
 * @param client Member holding Beta.
 */
function editsGeometryAndHierarchy(client: HarnessCollaborationEditor): void {
  const beta = client.mesh('Beta');
  const edited = new THREE.BufferGeometry().copy(beta.geometry);
  edited.getAttribute('position').setY(0, edited.getAttribute('position').getY(0) + 0.5);
  beta.geometry = edited;
  const maps = getFaceTextureMaps(beta);
  const first = maps[0];
  if (first === undefined) throw new Error('box without face maps');
  first.mapping.uv.u.w = 0.25;
  setFaceTextureMaps(beta, maps);
  client.groupAdd('Folder').add(beta);
  client.boxAdd('Beta copy').position.copy(beta.position);
}

/**
 * Applies solid brush, mesh CSG style replacement and delete edits.
 *
 * @param client Member holding the solid model, Gamma and Delta.
 */
function editsSolidAndDelete(client: HarnessCollaborationEditor): void {
  const model = client.solid('Solid');
  const [additive, subtractive] = model.getBrushes();
  if (additive?.mesh == null || subtractive === undefined) throw new Error('missing brushes');
  additive.mesh.position.y += 1.5;
  model.setBrushOperation(subtractive.id, SolidOperation.Intersecting);
  model.addBoxBrush(1, SolidOperation.Additive);
  client.world.remove(client.object('Gamma'));
  client.world.remove(client.object('Delta'));
  client.boxAdd('Gamma minus Delta').position.set(4, 0, 0);
}

/**
 * Returns the comparable concrete scene values a member shows.
 *
 * @param client Member.
 * @returns Values.
 */
function sceneValues(client: HarnessCollaborationEditor): Record<string, unknown> & { brushes: unknown[][] } {
  const alpha = client.mesh('Alpha renamed');
  const beta = client.mesh('Beta');
  const model = client.solid('Solid');
  return {
    alpha: [alpha.position.toArray(), alpha.scale.toArray(), alpha.visible],
    color: (alpha.material as THREE.MeshStandardMaterial).color.getHex(),
    vertexY: beta.geometry.getAttribute('position').getY(0),
    uv: getFaceTextureMaps(beta)[0]?.mapping.uv.u.w,
    parent: beta.parent?.name,
    created: ['Created by owner', 'Beta copy', 'Gamma minus Delta'].map((name) => client.find(name) !== undefined),
    deleted: ['Gamma', 'Delta'].map((name) => client.find(name) === undefined),
    brushes: model.getBrushes().map((brush) => [brush.operation, brush.mesh?.position.y]),
    order: client.world.children.map((child) => child.name),
  };
}

/**
 * Integration tests against the real relay: several members in several rooms
 * edit at the same time and every room converges independently.
 */
describe('collaboration relay concurrency', { timeout: 30000 }, () => {
  it('converges after three members edit every mutation category at the same time', async ({ skip }) => {
    if (!relayUp) skip();
    const [owner, first, second] = await roomOfThree('Concurrent');
    if (owner === undefined || first === undefined || second === undefined) throw new Error('missing members');
    await Promise.all([owner.select('Alpha'), first.select('Beta'), second.select('Solid', 'Gamma', 'Delta')]);
    editsTransformAndProperties(owner);
    editsGeometryAndHierarchy(first);
    editsSolidAndDelete(second);
    [owner, first, second].forEach((each) => each.commit());
    await harnessRelayConverged([owner, first, second]);
    const expected = sceneValues(owner);
    expect(sceneValues(first)).toEqual(expected);
    expect(sceneValues(second)).toEqual(expected);
    expect(expected).toMatchObject({ parent: 'Folder', uv: 0.25, color: 0x22aa44 });
    expect(expected.brushes.map((brush) => brush[0])).toContain(SolidOperation.Intersecting);
  });

  it('converges when members keep editing their own objects in rapid rounds', async ({ skip }) => {
    if (!relayUp) skip();
    const members = await roomOfThree('Rounds');
    const targets = ['Alpha', 'Beta', 'Gamma'];
    await Promise.all(members.map((member, index) => member.select(targets[index] ?? '')));
    for (let round = 1; round <= 10; round++) {
      members.forEach((member, index) => {
        member.object(targets[index] ?? '').position.set(round, index, -round);
        member.commit();
      });
    }
    await harnessRelayConverged(members);
    members.forEach((member) => {
      targets.forEach((target, index) => {
        expect(member.object(target).position.toArray()).toEqual([10, index, -10]);
      });
    });
  });

  it('hands a contested object from one of four members to the next on release', async ({ skip }) => {
    if (!relayUp) skip();
    const members = await roomOfThree('Contest');
    const late = await harnessRelayJoin(members[0]?.runtime.room?.id ?? '', 'Contest late');
    const all = [...members, late];
    all.forEach((member) => expect(member.selectTry('Alpha')).toBe(true));
    const granted = await Promise.all(all.map((member) => member.editTry('Alpha')));
    await harnessCollaborationUntil(() => all.every((member) => member.holderOf('Alpha') !== null), 3000, 'race');
    const winners = all.filter((_, index) => granted[index] === true);
    expect(winners).toHaveLength(1);
    expect(new Set(all.map((member) => member.holderOf('Alpha'))).size).toBe(1);
    const [winner] = winners;
    const loser = all.find((member) => member !== winner);
    if (winner === undefined || loser === undefined) throw new Error('missing contestants');
    loser.object('Alpha').name = 'Stolen';
    loser.commit();
    expect(loser.find('Stolen')).toBeUndefined();
    await winner.deselect();
    loser.selection.clearSelection();
    await loser.select('Alpha');
    loser.object('Alpha').name = 'Handed over';
    loser.commit();
    await harnessCollaborationUntil(() => all.every((member) => member.find('Handed over') !== undefined), 3000);
    await harnessRelayConverged(all);
  });

  it('keeps two busy rooms isolated while both edit concurrently', async ({ skip }) => {
    if (!relayUp) skip();
    const [roomOne, roomTwo] = await Promise.all([roomOfThree('Busy one'), roomOfThree('Busy two')]);
    if (roomOne === undefined || roomTwo === undefined) throw new Error('missing rooms');
    await Promise.all([roomOne[1]?.select('Alpha'), roomTwo[1]?.select('Alpha')]);
    // The lock reaches the third member one relay hop later (noticeable on the remote dev relay).
    await harnessCollaborationUntil(() => roomOne[2]?.holderOf('Alpha') != null, 3000, 'lock seen by member three');
    expect(roomOne[2]?.holderOf('Alpha')).not.toBeNull();
    roomOne[1]?.object('Alpha').position.set(7, 0, 0);
    roomTwo[1]?.object('Alpha').position.set(-7, 0, 0);
    roomOne[2]?.boxAdd('Only in one');
    roomTwo[2]?.boxAdd('Only in two');
    [...roomOne, ...roomTwo].forEach((member) => member.commit());
    await Promise.all([harnessRelayConverged(roomOne), harnessRelayConverged(roomTwo)]);
    roomOne.forEach((member) => {
      expect(member.object('Alpha').position.x).toBe(7);
      expect(member.find('Only in two')).toBeUndefined();
    });
    roomTwo.forEach((member) => {
      expect(member.object('Alpha').position.x).toBe(-7);
      expect(member.find('Only in one')).toBeUndefined();
    });
    expect(roomOne[0]?.fingerprint()).not.toBe(roomTwo[0]?.fingerprint());
    const rooms = await harnessRelayClient('Busy lobby').runtime.rooms();
    const ids = [roomOne[0]?.runtime.room?.id, roomTwo[0]?.runtime.room?.id];
    expect(ids.map((id) => rooms.find((room) => room.id === id)?.users)).toEqual([3, 3]);
  });
});
