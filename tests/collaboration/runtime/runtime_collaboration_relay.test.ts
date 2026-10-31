import * as THREE from 'three';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { harnessCollaborationRelayUp, harnessCollaborationUntil } from './harness_collaboration_editor.js';
import {
  HARNESS_RELAY_REQUIRED,
  harnessRelayClient,
  harnessRelayClose,
  harnessRelayConverged,
  harnessRelayJoin,
  harnessRelayRoom,
} from './harness_collaboration_relay.js';
import { getFaceTextureMaps, setFaceTextureMaps } from '@/texture/uv/face_texture_storage.js';

let relayUp = false;

beforeAll(async () => {
  relayUp = await harnessCollaborationRelayUp();
  if (!relayUp && HARNESS_RELAY_REQUIRED) throw new Error('collaboration relay is not reachable');
});

afterEach(harnessRelayClose);

/**
 * Integration tests against the real local relay (`bun run test:collab`): every
 * mutation category converges across members. Skipped when the relay is down
 * unless AIWORLDED_COLLAB_REQUIRED=1.
 */
describe('collaboration relay convergence', { timeout: 20000 }, () => {
  it('syncs the owner scene to a joiner', async ({ skip }) => {
    if (!relayUp) skip();
    const { owner, room } = await harnessRelayRoom('Snapshot');
    const joiner = await harnessRelayJoin(room, 'Joiner');
    expect(joiner.find('Seed')).toBeDefined();
    await harnessRelayConverged([owner, joiner]);
  });

  it('streams a transform live and converges on the final value', async ({ skip }) => {
    if (!relayUp) skip();
    const { owner, room } = await harnessRelayRoom('Transform');
    const joiner = await harnessRelayJoin(room, 'Joiner');
    await joiner.select('Seed');
    const target = new THREE.Vector3(3, -2, 5);
    joiner.object('Seed').position.copy(target);
    await harnessCollaborationUntil(() => owner.object('Seed').position.equals(target), 3000, 'live pose');
    joiner.object('Seed').rotation.set(0, Math.PI / 4, 0);
    joiner.object('Seed').scale.setScalar(2);
    joiner.commit();
    await harnessRelayConverged([owner, joiner]);
    expect(owner.object('Seed').scale.x).toBeCloseTo(joiner.object('Seed').scale.x);
  });

  it('syncs created and deleted objects', async ({ skip }) => {
    if (!relayUp) skip();
    const { owner, room } = await harnessRelayRoom('Create');
    const joiner = await harnessRelayJoin(room, 'Joiner');
    joiner.boxAdd('Made').position.set(4, 0, 0);
    joiner.commit();
    await harnessCollaborationUntil(() => owner.find('Made') !== undefined, 3000, 'created');
    joiner.world.remove(joiner.object('Made'));
    joiner.commit();
    await harnessCollaborationUntil(() => owner.find('Made') === undefined, 3000, 'deleted');
    await harnessRelayConverged([owner, joiner]);
  });

  it('syncs duplicate, group and reparent', async ({ skip }) => {
    if (!relayUp) skip();
    const { owner, room } = await harnessRelayRoom('Group');
    const joiner = await harnessRelayJoin(room, 'Joiner');
    await owner.select('Seed');
    const folder = owner.groupAdd('Folder');
    folder.add(owner.object('Seed'));
    owner.boxAdd('Seed copy').position.copy(owner.object('Seed').position);
    owner.commit();
    await harnessCollaborationUntil(() => joiner.find('Seed')?.parent?.name === 'Folder', 3000, 'reparent');
    expect(joiner.find('Seed copy')).toBeDefined();
    await harnessRelayConverged([owner, joiner]);
  });

  it('syncs a rename made under a lock', async ({ skip }) => {
    if (!relayUp) skip();
    const { owner, room } = await harnessRelayRoom('Rename');
    const joiner = await harnessRelayJoin(room, 'Joiner');
    await joiner.select('Seed');
    joiner.object('Seed').name = 'Renamed';
    joiner.commit();
    await harnessCollaborationUntil(() => owner.find('Renamed') !== undefined, 3000, 'rename');
    await harnessRelayConverged([owner, joiner]);
  });

  it('syncs material properties and visibility', async ({ skip }) => {
    if (!relayUp) skip();
    const { owner, room } = await harnessRelayRoom('Property');
    const joiner = await harnessRelayJoin(room, 'Joiner');
    await owner.select('Seed');
    (owner.mesh('Seed').material as THREE.MeshStandardMaterial).color.setHex(0x3366cc);
    owner.object('Seed').visible = false;
    owner.commit();
    await harnessCollaborationUntil(() => joiner.object('Seed').visible === false, 3000, 'visibility');
    await harnessRelayConverged([owner, joiner]);
    const material = joiner.mesh('Seed').material;
    const first = Array.isArray(material) ? material[0] : material;
    expect((first as THREE.MeshStandardMaterial).color.getHex()).toBe(0x3366cc);
  });

  it('syncs edit-mode vertex changes', async ({ skip }) => {
    if (!relayUp) skip();
    const { owner, room } = await harnessRelayRoom('Geometry');
    const joiner = await harnessRelayJoin(room, 'Joiner');
    await joiner.select('Seed');
    const mesh = joiner.mesh('Seed');
    const edited = new THREE.BufferGeometry().copy(mesh.geometry);
    const position = edited.getAttribute('position');
    position.setX(0, position.getX(0) + 0.75);
    mesh.geometry = edited;
    joiner.commit();
    const moved = (): number => owner.mesh('Seed').geometry.getAttribute('position').getX(0);
    await harnessCollaborationUntil(() => Math.abs(moved() - position.getX(0)) < 1e-5, 3000, 'vertex');
    await harnessRelayConverged([owner, joiner]);
  });

  it('syncs face texture assignments', async ({ skip }) => {
    if (!relayUp) skip();
    const { owner, room } = await harnessRelayRoom('Texture');
    const joiner = await harnessRelayJoin(room, 'Joiner');
    await joiner.select('Seed');
    const maps = getFaceTextureMaps(joiner.mesh('Seed'));
    const first = maps[0];
    if (first === undefined) throw new Error('box without face maps');
    first.mapping.uv.u.w = 0.5;
    setFaceTextureMaps(joiner.mesh('Seed'), maps);
    joiner.commit();
    const offset = (): number | undefined => getFaceTextureMaps(owner.mesh('Seed'))[0]?.mapping.uv.u.w;
    await harnessCollaborationUntil(() => offset() === 0.5, 3000, 'uv offset');
    await harnessRelayConverged([owner, joiner]);
  });

  it('brings a late joiner up to date after edits', async ({ skip }) => {
    if (!relayUp) skip();
    const { owner, room } = await harnessRelayRoom('Late');
    const early = await harnessRelayJoin(room, 'Early');
    early.boxAdd('Early box').position.set(-3, 1, 0);
    early.commit();
    await harnessCollaborationUntil(() => owner.find('Early box') !== undefined, 3000, 'early box');
    const late = await harnessRelayJoin(room, 'Late');
    expect(late.find('Early box')).toBeDefined();
    await harnessRelayConverged([owner, early, late]);
  });

  it('isolates rooms from each other', async ({ skip }) => {
    if (!relayUp) skip();
    const first = await harnessRelayRoom('Isolation A', 'Alpha');
    const second = await harnessRelayRoom('Isolation B', 'Beta');
    const firstJoiner = await harnessRelayJoin(first.room, 'Joiner A');
    const secondJoiner = await harnessRelayJoin(second.room, 'Joiner B');
    const before = secondJoiner.fingerprint();
    firstJoiner.boxAdd('Only A');
    firstJoiner.commit();
    await harnessCollaborationUntil(() => first.owner.find('Only A') !== undefined, 3000, 'room A edit');
    expect(second.owner.find('Only A')).toBeUndefined();
    expect(secondJoiner.find('Alpha')).toBeUndefined();
    expect(secondJoiner.fingerprint()).toBe(before);
    const lobby = harnessRelayClient('Lobby');
    const rooms = await lobby.runtime.rooms();
    const counts = [first.room, second.room].map((id) => rooms.find((room) => room.id === id)?.users);
    expect(counts).toEqual([2, 2]);
  });
});
