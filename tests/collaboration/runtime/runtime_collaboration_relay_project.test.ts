import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  harnessCollaborationRelayUp,
  harnessCollaborationUntil,
  type HarnessCollaborationEditor,
} from './harness_collaboration_editor.js';
import {
  HARNESS_RELAY_REQUIRED,
  harnessRelayClose,
  harnessRelayJoin,
  harnessRelayRoomBuilt,
} from './harness_collaboration_relay.js';
import { pngHeaderCreate } from '../session/texture_collaboration_fixture.js';
import { ProjectMockDirectoryHandle } from '../../project/fs/project_mock_directory_handle.js';
import { ControllerProject } from '@/project/controller/controller_project.js';
import { ProjectFileSystemHandle } from '@/project/fs/project_file_system_handle.js';
import { StoreProjectHandle } from '@/project/fs/store_project_handle.js';
import { writeContentMeshTextureId } from '@/texture/uv/content_mesh_texture.js';

let relayUp = false;
const controllers: ControllerProject[] = [];

beforeAll(async () => {
  relayUp = await harnessCollaborationRelayUp();
  if (!relayUp && HARNESS_RELAY_REQUIRED) throw new Error('collaboration relay is not reachable');
  if (typeof URL.createObjectURL !== 'function') Object.assign(URL, { createObjectURL: () => 'blob:test' });
  if (typeof URL.revokeObjectURL !== 'function') Object.assign(URL, { revokeObjectURL: () => undefined });
});

afterEach(() => {
  controllers.splice(0).forEach((controller) => controller.dispose());
  harnessRelayClose();
});

/** Store that remembers nothing. */
class RelayProjectStore extends StoreProjectHandle {
  /** Ignores the handle. */
  override async save(): Promise<void> {}

  /**
   * Remembers nothing.
   *
   * @returns Null.
   */
  override async load(): Promise<FileSystemDirectoryHandle | null> {
    return null;
  }

  /** Forgets nothing. */
  override async clear(): Promise<void> {}
}

/**
 * Builds PNG-headed bytes whose last byte marks the content.
 *
 * @param mark Content marker.
 * @returns Bytes.
 */
function png(mark: number): Uint8Array {
  const bytes = new Uint8Array(64);
  bytes.set(pngHeaderCreate(8, 8));
  bytes[bytes.length - 1] = mark;
  return bytes;
}

/**
 * Opens a mock project folder on the owner, polled for disk changes like a
 * browser without FileSystemObserver.
 *
 * @param owner Owner client.
 * @param root Mock project folder.
 * @returns Controller.
 */
async function projectOpen(owner: HarnessCollaborationEditor, root: ProjectMockDirectoryHandle): Promise<void> {
  const picker = {
    pick: async () => ({
      fileSystem: new ProjectFileSystemHandle(root.asHandle()),
      handle: root.asHandle(),
      notice: null,
    }),
  };
  const controller = new ControllerProject({
    library: owner.textures,
    picker,
    store: new RelayProjectStore(null),
    desktop: null,
    gate: () => null,
  });
  controllers.push(controller);
  expect(await controller.open()).toBe(true);
}

/**
 * Returns the content marker of a texture in a client's library.
 *
 * @param client Client.
 * @param id Texture id.
 * @returns Marker, or null when absent.
 */
async function markOf(client: HarnessCollaborationEditor, id: string): Promise<number | null> {
  const entry = client.textures.getEntryById(id);
  if (entry === null) return null;
  const bytes = new Uint8Array(await entry.sourceFile.arrayBuffer());
  return bytes[bytes.length - 1] ?? null;
}

/**
 * Waits until every member holds a texture with a marker.
 *
 * @param members Members.
 * @param id Texture id.
 * @param mark Expected marker, or null for absent.
 * @param timeout Milliseconds.
 */
async function marksUntil(
  members: readonly HarnessCollaborationEditor[],
  id: string,
  mark: number | null,
  timeout: number = 20000,
): Promise<void> {
  let marks: (number | null)[] = members.map(() => -1);
  const refresh = (): void =>
    void Promise.all(members.map((member) => markOf(member, id))).then((read) => (marks = read));
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
 * Opens a room whose owner has a project folder with one texture used by a box,
 * and joins two members.
 *
 * @param name Room name.
 * @returns Owner, members and project folder.
 */
async function projectRoom(name: string) {
  const root = new ProjectMockDirectoryHandle('game');
  root.put('textures/used.png', png(1));
  root.put('textures/spare.png', png(2));
  const { owner, room } = await harnessRelayRoomBuilt(name, (client) => {
    writeContentMeshTextureId(client.boxAdd('Used'), 'textures/used.png');
  });
  await projectOpen(owner, root);
  const members = [await harnessRelayJoin(room, 'Bob'), await harnessRelayJoin(room, 'Carol')];
  return { owner, members, root };
}

describe.sequential('owner project folder as the room texture source', () => {
  it('gives members every project texture, used or not', async ({ skip }) => {
    if (!relayUp) skip();
    const { members } = await projectRoom('Project index');
    await marksUntil(members, 'textures/used.png', 1);
    await marksUntil(members, 'textures/spare.png', 2);
  }, 60000);

  it('networks files added, changed, renamed and removed on disk', async ({ skip }) => {
    if (!relayUp) skip();
    const { members, root } = await projectRoom('Project live');
    await marksUntil(members, 'textures/spare.png', 2);
    root.put('textures/pasted.png', png(3));
    await marksUntil(members, 'textures/pasted.png', 3);
    root.put('textures/used.png', png(4));
    await marksUntil(members, 'textures/used.png', 4);
    root.move('textures/pasted.png', 'textures/renamed.png');
    await marksUntil(members, 'textures/renamed.png', 3);
    await marksUntil(members, 'textures/pasted.png', null);
    root.delete('textures/spare.png');
    await marksUntil(members, 'textures/spare.png', null);
  }, 120000);

  it('networks a bulk add of 500 files to every member', async ({ skip }) => {
    if (!relayUp) skip();
    const { owner, members, root } = await projectRoom('Project bulk');
    await marksUntil(members, 'textures/spare.png', 2);
    const started = performance.now();
    for (let index = 0; index < 500; index += 1)
      root.put(`bulk/${String(index).padStart(3, '0')}.png`, png(index % 250));
    await harnessCollaborationUntil(() => owner.textures.getEntryCount() >= 503, 20000, '500 files on the owner');
    await harnessCollaborationUntil(
      () => members.every((member) => member.textures.getEntryCount() >= 503),
      120000,
      '500 files on every member',
    );
    const elapsed = Math.round(performance.now() - started);
    await marksUntil(members, 'bulk/499.png', 499 % 250);
    await import('node:fs').then((fs) =>
      fs.writeFileSync('/tmp/aiworlded-project-bulk.txt', `${elapsed} ms for 500 files to 2 members\n`),
    );
    expect(elapsed).toBeLessThan(120000);
  }, 180000);
});
