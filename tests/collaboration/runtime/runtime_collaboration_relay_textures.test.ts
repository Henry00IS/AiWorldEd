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
import { pngHeaderCreate } from '../session/texture_collaboration_fixture.js';
import { SESSION_COLLABORATION_TEXTURE_SOURCE_MESSAGE } from '@/collaboration/session/session_collaboration_room.js';
import { createTextureBrowserEntry } from '@/texture/library/texture_browser_entry.js';
import { textureSourceBlocked } from '@/texture/library/texture_source_gate.js';
import { writeContentMeshTextureId } from '@/texture/uv/content_mesh_texture.js';

let relayUp = false;

beforeAll(async () => {
  relayUp = await harnessCollaborationRelayUp();
  if (!relayUp && HARNESS_RELAY_REQUIRED) throw new Error('collaboration relay is not reachable');
  if (typeof URL.createObjectURL !== 'function') Object.assign(URL, { createObjectURL: () => 'blob:test' });
  if (typeof URL.revokeObjectURL !== 'function') Object.assign(URL, { revokeObjectURL: () => undefined });
});

afterEach(harnessRelayClose);

/**
 * Builds PNG-headed texture bytes whose last byte marks the content.
 *
 * @param mark Content marker.
 * @param size Total size in bytes.
 * @returns Bytes.
 */
function png(mark: number, size: number = 64): Uint8Array {
  const bytes = new Uint8Array(Math.max(size, 34));
  bytes.set(pngHeaderCreate(8, 8));
  bytes[bytes.length - 1] = mark;
  return bytes;
}

/**
 * Opens a texture folder on a client, as the texture browser does.
 *
 * @param client Client.
 * @param folder Folder name.
 * @param files Bytes per texture id.
 */
function folderOpen(client: HarnessCollaborationEditor, folder: string, files: Record<string, Uint8Array>): void {
  const entries = Object.entries(files).map(([id, bytes]) =>
    createTextureBrowserEntry(new File([new Uint8Array(bytes)], id, { type: 'image/png' }), id),
  );
  client.textures.replaceAll(folder, entries);
}

/**
 * Returns the content marker of a texture in a client's library.
 *
 * @param client Client.
 * @param id Texture id.
 * @returns Marker, or null when the library lacks the texture.
 */
async function markOf(client: HarnessCollaborationEditor, id: string): Promise<number | null> {
  const entry = client.textures.getEntryById(id);
  if (entry === null) return null;
  const bytes = new Uint8Array(await entry.sourceFile.arrayBuffer());
  return bytes[bytes.length - 1] ?? null;
}

/**
 * Waits until every client holds a texture with a content marker.
 *
 * @param list Clients.
 * @param id Texture id.
 * @param mark Expected marker, or null for absent.
 * @param timeout Milliseconds.
 */
async function marksUntil(
  list: readonly HarnessCollaborationEditor[],
  id: string,
  mark: number | null,
  timeout: number = 8000,
): Promise<void> {
  const marks: (number | null)[] = list.map(() => -1);
  const refresh = (): void =>
    void Promise.all(list.map((client) => markOf(client, id))).then((read) => marks.splice(0, marks.length, ...read));
  await harnessCollaborationUntil(
    () => {
      refresh();
      return marks.every((value) => value === mark);
    },
    timeout,
    `${id} = ${String(mark)}`,
  );
}

/**
 * Opens a room whose two boxes use stone.png and brick.png, the owner's folder
 * holding both.
 *
 * @param name Room name.
 * @param stone Bytes of stone.png.
 * @returns Owner and room id.
 */
function texturedRoom(name: string, stone: Uint8Array): ReturnType<typeof harnessRelayRoomBuilt> {
  return harnessRelayRoomBuilt(name, (owner) => {
    folderOpen(owner, 'first', { 'stone.png': stone, 'brick.png': png(7) });
    writeContentMeshTextureId(owner.boxAdd('Stone'), 'stone.png');
    writeContentMeshTextureId(owner.boxAdd('Brick'), 'brick.png');
  });
}

/**
 * Returns how many streams the owner is sending to a member.
 *
 * @param owner Owner client.
 * @param member Member client.
 * @returns Active streams.
 */
function streamsTo(owner: HarnessCollaborationEditor, member: HarnessCollaborationEditor): number {
  const streams = (owner.runtime.session as unknown as { streams: { sender: { activeCountFor(to: number): number } } })
    .streams;
  return streams.sender.activeCountFor(member.runtime.user());
}

describe.sequential('texture re-sync after the owner switches folders', () => {
  it('replaces same-name textures with new content on every member and keeps unchanged ones', async ({ skip }) => {
    if (!relayUp) skip();
    const { owner, room } = await texturedRoom('Texture switch', png(1));
    const members = [await harnessRelayJoin(room, 'Bob'), await harnessRelayJoin(room, 'Carol')];
    await marksUntil(members, 'stone.png', 1);
    await marksUntil(members, 'brick.png', 7);
    const bricks = members.map((member) => member.textures.getEntryById('brick.png'));
    folderOpen(owner, 'second', { 'stone.png': png(2), 'brick.png': png(7) });
    await marksUntil(members, 'stone.png', 2);
    expect(members.map((member) => member.textures.getEntryById('brick.png'))).toEqual(bricks);
    await harnessRelayConverged([owner, ...members]);
  });

  it('falls back to the checker for removed textures and brings late joiners the current folder', async ({ skip }) => {
    if (!relayUp) skip();
    const { owner, room } = await texturedRoom('Texture removed', png(1));
    const bob = await harnessRelayJoin(room, 'Bob');
    await marksUntil([bob], 'stone.png', 1);
    folderOpen(owner, 'second', { 'brick.png': png(9) });
    await marksUntil([bob], 'stone.png', null);
    await marksUntil([bob], 'brick.png', 9);
    const late = await harnessRelayJoin(room, 'Late');
    await marksUntil([late], 'brick.png', 9);
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(await markOf(late, 'stone.png')).toBeNull();
    await harnessRelayConverged([owner, bob, late]);
  });

  it('never applies old bytes still in flight and settles on the last of rapid switches', async ({ skip }) => {
    if (!relayUp) skip();
    const { owner, room } = await texturedRoom('Texture in flight', png(1, 6 * 1024 * 1024));
    const bob = harnessRelayClient('Bob');
    const joining = bob.runtime.join(room, '');
    await harnessCollaborationUntil(() => streamsTo(owner, bob) > 0, 8000, 'large texture in flight');
    folderOpen(owner, 'second', { 'stone.png': png(2, 3 * 1024 * 1024), 'brick.png': png(7) });
    folderOpen(owner, 'third', { 'stone.png': png(3), 'brick.png': png(8) });
    await joining;
    await harnessCollaborationUntil(() => bob.runtime.state === 'room', 15000, 'Bob synced');
    await marksUntil([bob], 'stone.png', 3, 15000);
    await marksUntil([bob], 'brick.png', 8, 15000);
    await new Promise((resolve) => setTimeout(resolve, 2500));
    expect(await markOf(bob, 'stone.png')).toBe(3);
    expect(await markOf(bob, 'brick.png')).toBe(8);
    await harnessRelayConverged([owner, bob]);
  }, 40000);

  it('keeps members from opening their own folder and keeps textures after the owner leaves', async ({ skip }) => {
    if (!relayUp) skip();
    const { owner, room } = await texturedRoom('Texture source', png(4));
    const bob = await harnessRelayJoin(room, 'Bob');
    await marksUntil([bob], 'stone.png', 4);
    expect(textureSourceBlocked()).toBe(SESSION_COLLABORATION_TEXTURE_SOURCE_MESSAGE);
    await owner.runtime.leave();
    await harnessCollaborationUntil(() => bob.runtime.state !== 'room', 5000, 'room closed');
    expect(textureSourceBlocked()).toBeNull();
    expect(await markOf(bob, 'stone.png')).toBe(4);
  });
});
