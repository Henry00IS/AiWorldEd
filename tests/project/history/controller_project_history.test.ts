import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { PROJECT_AUTOSAVE_FORMAT } from '@/project/autosave/project_autosave_files.js';
import type { ProjectFileSystem } from '@/project/fs/project_file_system.js';
import {
  ControllerProjectHistory,
  projectHistoryCopyPath,
  type ControllerProjectHistoryHost,
} from '@/project/history/controller_project_history.js';
import type { ProjectHistoryRoom } from '@/project/history/project_history_room.js';
import {
  projectHistoryAutosaveRecord,
  projectHistorySnapshotRecord,
} from '@/project/history/store/project_history_recorder.js';
import { projectHistoryLevelStore, projectHistoryStoreMemory } from '@/project/history/store/project_history_trees.js';
import { PROJECT_HISTORY_HERE } from '@/project/history/tree/project_history_tree_layout.js';
import { TextureLibrary } from '@/texture/library/texture_library.js';
import { projectAutosaveProjectCreate } from '../autosave/project_autosave_test_utils.js';

/**
 * Builds the record of a saved level state.
 *
 * @param sourcePath Level path.
 * @param time Save time.
 * @param objects Object count.
 * @returns Record.
 */
function recordOf(sourcePath: string, time: number, objects: number) {
  const data = { version: 1, objects: Array.from({ length: objects }, (_, index) => ({ name: `O${index}` })) };
  const document = {
    format: PROJECT_AUTOSAVE_FORMAT,
    version: 1,
    scene: 'x',
    sourcePath,
    savedAt: time,
    objectCount: objects,
    data,
  };
  return { state: JSON.stringify(document), objectCount: objects, time, shot: null };
}

/**
 * Builds the Level History over a mock project with one level tree: a snapshot
 * and a session that grew from it.
 *
 * @param overrides Host overrides.
 * @returns Controller, host, project and node ids.
 */
async function historyCreate(overrides: Partial<ControllerProjectHistoryHost> = {}) {
  const { root, fileSystem } = projectAutosaveProjectCreate();
  const store = await projectHistoryLevelStore(fileSystem, 'maps/start.aiworld');
  const snapshot = await projectHistorySnapshotRecord(store, recordOf('maps/start.aiworld', 1_000, 2), 'Gate');
  const session = await projectHistoryAutosaveRecord(store, recordOf('maps/start.aiworld', 2_000, 3));
  const host: ControllerProjectHistoryHost = {
    container: document.createElement('div'),
    fileSystem: () => fileSystem,
    levelPath: () => 'maps/start.aiworld',
    autosave: { flush: vi.fn(async () => undefined), pending: () => false, snapshot: vi.fn(async () => null) },
    restore: vi.fn(async () => true),
    open: vi.fn(async () => undefined),
    levelFile: vi.fn(async () => new Blob(['level'])),
    serialize: vi.fn(() => ({ version: 1, objects: [] }) as never),
    textureLibrary: () => new TextureLibrary(),
    room: () => null,
    inRoom: () => false,
    status: vi.fn(),
    ...overrides,
  };
  const history = new ControllerProjectHistory(host);
  const [tree] = await history.trees();
  if (tree === undefined) throw new Error('no tree');
  return { history, host, root, fileSystem, store, snapshot, session, tree };
}

describe('ControllerProjectHistory', () => {
  it('shows the open level first, with its saved states', async () => {
    const { history, tree, snapshot, session } = await historyCreate();
    expect(tree).toMatchObject({ id: 'level/maps__start', label: 'maps/start.aiworld', current: true, pending: false });
    expect(tree.index.nodes.map((node) => node.id)).toEqual([snapshot.id, session.id]);
    expect(history.available()).toBe(true);
  });

  it('restores straight away: saves pending work, loads the state and moves the marker', async () => {
    const { history, host, store, tree, snapshot } = await historyCreate();
    const result = await history.restore(tree, tree.index.nodes[0]!);
    expect(host.autosave.flush).toHaveBeenCalled();
    expect(vi.mocked(host.restore).mock.calls[0]?.[0].objectCount).toBe(2);
    expect(result.select).toBe(PROJECT_HISTORY_HERE);
    const index = await store.index();
    expect(index.marker).toBe(snapshot.id);
    expect(index.nodes).toHaveLength(2);
  });

  it('lists nothing for room members and restores no level state while in a room', async () => {
    const member = await historyCreate();
    member.host.inRoom = () => true;
    expect(await member.history.trees()).toEqual([]);
    expect(member.history.available()).toBe(false);
    expect((await member.history.restore(member.tree, member.tree.index.nodes[0]!)).message).toContain(
      'Leave the room',
    );
    expect(member.host.restore).not.toHaveBeenCalled();
  });

  it('names a state, which locks it, and clears the name again', async () => {
    const { history, store, tree, session } = await historyCreate();
    const node = tree.index.nodes[1]!;
    expect((await history.rename(tree, node, '  Keep Interior ')).message).toContain('Keep Interior');
    expect((await store.index()).nodes.find((entry) => entry.id === session.id)?.name).toBe('Keep Interior');
    await history.rename(tree, node, '');
    const cleared = (await store.index()).nodes.find((entry) => entry.id === session.id);
    expect(cleared).toMatchObject({ name: '', kind: 'session' });
  });

  it('keeps a note', async () => {
    const { history, store, tree, session } = await historyCreate();
    await history.note(tree, tree.index.nodes[1]!, 'Before the boss room');
    expect((await store.index()).nodes.find((entry) => entry.id === session.id)?.note).toBe('Before the boss room');
  });

  it('deletes a state and its files; the states that grew from it attach to its parent', async () => {
    const { history, root, store, tree, snapshot, session } = await historyCreate();
    const result = await history.remove(tree, tree.index.nodes[0]!);
    const index = await store.index();
    expect(index.nodes.map((node) => [node.id, node.parent])).toEqual([[session.id, null]]);
    expect(root.handleAt(`AiWorldEd/.Local/History/Levels/maps__start/${snapshot.id}.json`)).toBeUndefined();
    expect(result.select).toBe(PROJECT_HISTORY_HERE);
  });

  it('writes a state out as a new level file beside the level and opens it', async () => {
    const { history, host, root, tree } = await historyCreate();
    root.put('maps/start Copy.aiworld', 'taken');
    const result = await history.copy(tree, tree.index.nodes[0]!);
    expect(result.message).toContain('maps/start Copy 2.aiworld');
    expect(await root.textAt('maps/start Copy 2.aiworld')).toBe('level');
    expect(host.open).toHaveBeenCalledWith('maps/start Copy 2.aiworld', 5);
  });

  it('takes a named snapshot of the open level', async () => {
    const node = { id: 'n', name: 'Gate And Towers' };
    const { history, host, tree } = await historyCreate();
    vi.mocked(host.autosave.snapshot).mockResolvedValue(node as never);
    expect(await history.take(tree, 'Gate And Towers')).toMatchObject({ select: 'n' });
    expect(host.autosave.snapshot).toHaveBeenCalledWith('Gate And Towers');
  });

  it('shows the owned room first and restores and copies its states through the room', async () => {
    const store = projectHistoryStoreMemory('Castle Jam');
    const node = await projectHistorySnapshotRecord(
      store,
      { state: '{}', objectCount: 1, time: 5, shot: null },
      'Start',
    );
    const world = { world: new THREE.Group(), dispose: vi.fn() };
    const room: ProjectHistoryRoom = {
      name: 'Castle Jam',
      store: async () => store,
      pending: () => true,
      snapshot: vi.fn(async () => null),
      restore: vi.fn(async () => undefined),
      world: vi.fn(async () => world),
    };
    const { history, root } = await historyCreate({ room: () => room, inRoom: () => true });
    const [tree] = await history.trees();
    expect(tree).toMatchObject({ id: 'room/Castle Jam', current: true, pending: true });
    await history.restore(tree!, node);
    expect(room.restore).toHaveBeenCalledWith(node.id);
    expect((await history.copy(tree!, node)).message).toBe('Saved a copy as Castle Jam Copy.aiworld.');
    expect(world.dispose).toHaveBeenCalled();
    expect(await root.textAt('Castle Jam Copy.aiworld')).toBe('level');
  });

  it('names copies of untitled levels and rooms in the project root', async () => {
    const { fileSystem, tree } = await historyCreate();
    const untitled = { ...tree, label: 'Untitled Level' };
    expect(await projectHistoryCopyPath(fileSystem as ProjectFileSystem, untitled)).toBe('Untitled Level Copy.aiworld');
  });
});
