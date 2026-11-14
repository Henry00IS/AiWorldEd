import { describe, expect, it, vi } from 'vitest';
import { PROJECT_AUTOSAVE_FORMAT } from '@/project/autosave/project_autosave_files.js';
import {
  ControllerProjectHistory,
  type ControllerProjectHistoryHost,
} from '@/project/history/controller_project_history.js';
import type { ProjectHistoryRoom } from '@/project/history/project_history_room.js';
import {
  projectHistoryStoreFor,
  projectHistoryStoreMemory,
  type ProjectHistoryRecord,
} from '@/project/history/core/project_history_store.js';
import { snapshotCollaborationText } from '@/collaboration/snapshot/store_collaboration_snapshot.js';
import { projectAutosaveProjectCreate } from '../autosave/project_autosave_test_utils.js';

const TIME = new Date(2026, 10, 11, 9, 30).getTime();

/**
 * Builds a level save.
 *
 * @param path Level path.
 * @param time Save time.
 * @param objects Object count.
 * @returns Record.
 */
function levelRecord(path: string, time: number, objects: number): ProjectHistoryRecord {
  const data = { version: 1, objects: Array.from({ length: objects }, (_, index) => ({ name: `O${index}` })) };
  const document = { format: PROJECT_AUTOSAVE_FORMAT, version: 1, scene: 'x', sourcePath: path, savedAt: time };
  return {
    kind: 'autosave',
    source: 'level',
    time,
    path,
    title: 'start',
    room: null,
    objectCount: objects,
    state: JSON.stringify({ ...document, objectCount: objects, data }),
    shot: null,
  };
}

/**
 * Builds a room save of one crate, in the format rooms actually write.
 *
 * @param time Save time.
 * @param objects Object count written on the record.
 * @returns Record.
 */
function roomRecord(time: number, objects: number): ProjectHistoryRecord {
  const entry = {
    uuid: 'crate',
    name: 'Crate',
    type: 'mesh' as const,
    position: { x: 1, y: 2, z: 3 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    visible: true,
    parentId: null,
    geometryType: 'box' as const,
    geometryParams: { width: 1, height: 1, depth: 1 },
    materialColor: 0x888888,
  };
  const state = {
    id: 'crate',
    kind: 'entry' as const,
    parent: '',
    key: 'a',
    data: { entry, locked: false, solid: null },
  };
  return {
    kind: 'snapshot',
    source: 'room',
    time,
    path: null,
    title: null,
    room: 'Castle Jam',
    objectCount: objects,
    state: snapshotCollaborationText('Castle Jam', time, [state]),
    shot: null,
  };
}

/**
 * Builds a room handle for the Level History.
 *
 * @param name Room name.
 * @param store Store the room's saves go to.
 * @returns Room.
 */
function historyRoom(name: string, store: ReturnType<typeof projectHistoryStoreMemory>): ProjectHistoryRoom {
  return {
    name,
    store: async () => store,
    snapshot: vi.fn(async () => undefined),
  };
}

/**
 * Builds the Level History over a mock project with two level saves.
 *
 * @param overrides Host overrides.
 * @returns Controller, host, project and saves.
 */
async function historyCreate(overrides: Partial<ControllerProjectHistoryHost> = {}) {
  const { fileSystem } = projectAutosaveProjectCreate();
  const store = projectHistoryStoreFor(fileSystem);
  const first = await store.add(levelRecord('maps/start.aiworld', TIME, 2));
  const second = await store.add(levelRecord('maps/other.aiworld', TIME + 60_000, 3));
  const host: ControllerProjectHistoryHost = {
    container: document.createElement('div'),
    fileSystem: () => fileSystem,
    autosave: { flush: vi.fn(async () => undefined) },
    restore: vi.fn(async () => true),
    room: () => null,
    inRoom: () => false,
    ...overrides,
  };
  return { history: new ControllerProjectHistory(host), host, fileSystem, store, first, second };
}

describe('ControllerProjectHistory', () => {
  it('lists every save of the project, whatever level is open', async () => {
    const { history, first, second } = await historyCreate();
    expect((await history.entries()).map((entry) => entry.id)).toEqual([first.id, second.id]);
    expect(history.available()).toBe(true);
  });

  it('saves pending changes, then loads a level save', async () => {
    const { history, host } = await historyCreate();
    const [entry] = await history.entries();
    const result = await history.restore(entry!);
    expect(host.autosave.flush).toHaveBeenCalled();
    expect(vi.mocked(host.restore).mock.calls[0]?.[0].objectCount).toBe(2);
    expect(result.message).toMatch(/^Restored start from /);
  });

  it('frees the picture of a deleted save, and tells the dialog about changes to any listed store', async () => {
    const urls = ['blob:first', 'blob:second'];
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => urls.shift()), revokeObjectURL: vi.fn() });
    const { history, store } = await historyCreate();
    const pictured = await store.add({
      ...levelRecord('maps/shot.aiworld', TIME + 90_000, 1),
      shot: { blob: new Blob(['webp']) },
    });
    const changed = vi.fn();
    const stop = history.watch(changed);
    const entry = (await history.entries()).find((item) => item.id === pictured.id);
    expect(await history.thumbnail(entry!)).toBe('blob:first');
    await history.remove(entry!);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:first');
    await vi.waitFor(() => expect(changed).toHaveBeenCalledTimes(1));
    stop();
    await store.add(levelRecord('maps/third.aiworld', TIME + 120_000, 1));
    expect(changed).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it('still loads the picture of a save listed before the saves were read again', async () => {
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:shot'), revokeObjectURL: vi.fn() });
    const { history, store } = await historyCreate();
    const pictured = await store.add({
      ...levelRecord('maps/shot.aiworld', TIME + 90_000, 1),
      shot: { blob: new Blob(['webp']) },
    });
    const earlier = (await history.entries()).find((item) => item.id === pictured.id)!;
    await history.entries();
    expect(await history.thumbnail(earlier)).toBe('blob:shot');
    vi.unstubAllGlobals();
  });

  it('stars, unstars and deletes a save', async () => {
    const { history, store } = await historyCreate();
    const [entry] = await history.entries();
    expect((await history.star(entry!, true)).message).toBe('Starred. This save is never deleted.');
    expect((await store.entries())[0]?.starred).toBe(true);
    expect((await history.star(entry!, false)).message).toBe('Unstarred. This save is deleted after 14 days.');
    await history.remove(entry!);
    expect(await store.entries()).toHaveLength(1);
  });

  it('lists the room kept in memory while in that room', async () => {
    const memory = projectHistoryStoreMemory();
    const saved = await memory.add(roomRecord(TIME, 1));
    const room = historyRoom('Castle Jam', memory);
    const { history } = await historyCreate({ room: () => room, inRoom: () => true, fileSystem: () => null });
    const entries = await history.entries();
    expect(entries.map((entry) => entry.id)).toEqual([saved.id]);
    expect(entries[0]?.source).toBe('room');
  });

  it('loads a room save into the editor outside a room, from the project store', async () => {
    const { history, host, store } = await historyCreate();
    const saved = await store.add(roomRecord(TIME + 90_000, 1));
    const entry = (await history.entries()).find((item) => item.id === saved.id);
    const result = await history.restore(entry!);
    expect(host.autosave.flush).toHaveBeenCalled();
    const document = vi.mocked(host.restore).mock.calls[0]?.[0];
    expect(document?.sourcePath).toBeNull();
    expect(document?.data.objects.map((object) => object.name)).toEqual(['Crate']);
    expect(result.message).toMatch(/^Restored Collaborative Room from /);
  });

  it('refuses every save while in a room, including a save of that room', async () => {
    const memory = projectHistoryStoreMemory();
    const saved = await memory.add(roomRecord(TIME, 1));
    const room = historyRoom('Castle Jam', memory);
    const { history, host, first } = await historyCreate({ room: () => room, inRoom: () => true });
    const roomEntry = (await history.entries()).find((entry) => entry.id === saved.id)!;
    expect((await history.restore(roomEntry)).message).toBe('Leave the room to load a save.');
    expect((await history.restore(first)).message).toBe('Leave the room to load a save.');
    expect(host.autosave.flush).not.toHaveBeenCalled();
    expect(host.restore).not.toHaveBeenCalled();
  });

  it('is unavailable outside a room without a writable project, and in a room it has not joined', async () => {
    expect((await historyCreate({ inRoom: () => true })).history.available()).toBe(false);
    expect((await historyCreate({ fileSystem: () => null })).history.available()).toBe(false);
  });
});
