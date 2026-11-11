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
      store: async () => memory,
      restore: vi.fn(async () => undefined),
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
      store: async () => projectHistoryStoreMemory(),
      restore: vi.fn(),
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

  it('is unavailable to room members and without a writable project', async () => {
    expect((await historyCreate({ inRoom: () => true })).history.available()).toBe(false);
    expect((await historyCreate({ fileSystem: () => null })).history.available()).toBe(false);
  });
});
