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

  it('stars, unstars and deletes a save', async () => {
    const { history, store } = await historyCreate();
    const [entry] = await history.entries();
    expect((await history.star(entry!, true)).message).toBe('Starred. This save is never deleted.');
    expect((await store.entries())[0]?.starred).toBe(true);
    expect((await history.star(entry!, false)).message).toBe('Unstarred. This save is deleted after 14 days.');
    await history.remove(entry!);
    expect(await store.entries()).toHaveLength(1);
  });

  it('rolls the owned room back for a save of that room, and lists the room kept in memory', async () => {
    const memory = projectHistoryStoreMemory();
    const saved = await memory.add({
      ...levelRecord('', TIME, 1),
      source: 'room',
      path: null,
      title: null,
      room: 'Castle Jam',
    });
    const room: ProjectHistoryRoom = {
      name: 'Castle Jam',
      owner: true,
      store: async () => memory,
      restore: vi.fn(async () => undefined),
      snapshot: vi.fn(async () => undefined),
    };
    const { history } = await historyCreate({ room: () => room, inRoom: () => true, fileSystem: () => null });
    const entries = await history.entries();
    expect(entries.map((entry) => entry.id)).toEqual([saved.id]);
    await history.restore(entries[0]!);
    expect(room.restore).toHaveBeenCalledWith(saved.id);
  });

  it('restores a room save only while hosting that room, and level saves only outside a room', async () => {
    const room: ProjectHistoryRoom = {
      name: 'Other',
      owner: true,
      store: async () => projectHistoryStoreMemory(),
      restore: vi.fn(),
      snapshot: vi.fn(),
    };
    const { history, store } = await historyCreate({ room: () => room, inRoom: () => true });
    const roomSave = await store.add({ ...levelRecord('', TIME, 1), source: 'room', path: null, room: 'Castle Jam' });
    const entries = await history.entries();
    const listed = entries.find((entry) => entry.id === roomSave.id)!;
    expect((await history.restore(listed)).message).toContain('Host that room to restore it');
    expect(room.restore).not.toHaveBeenCalled();
    const level = entries.find((entry) => entry.source === 'level')!;
    expect((await history.restore(level)).message).toBe('Leave the room to restore a level save.');
  });

  it('shows a member their own saves of the room, but only the owner restores the room', async () => {
    const memory = projectHistoryStoreMemory();
    const saved = await memory.add({
      ...levelRecord('', TIME, 4),
      kind: 'snapshot',
      source: 'room',
      path: null,
      title: null,
      room: 'Castle Jam',
    });
    const room: ProjectHistoryRoom = {
      name: 'Castle Jam',
      owner: false,
      store: async () => memory,
      restore: vi.fn(async () => undefined),
      snapshot: vi.fn(async () => undefined),
    };
    const { history } = await historyCreate({ room: () => room, inRoom: () => true, fileSystem: () => null });
    expect(history.available()).toBe(true);
    const entries = await history.entries();
    expect(entries.map((entry) => entry.id)).toEqual([saved.id]);
    expect((await history.restore(entries[0]!)).message).toBe('Only the room owner can restore a save of the room.');
    expect(room.restore).not.toHaveBeenCalled();
  });

  it('is unavailable outside a room without a writable project, and in a room it has not joined', async () => {
    expect((await historyCreate({ inRoom: () => true })).history.available()).toBe(false);
    expect((await historyCreate({ fileSystem: () => null })).history.available()).toBe(false);
  });
});
