import { describe, expect, it, vi } from 'vitest';
import { ProjectHistoryFolderMemory } from '@/project/history/core/project_history_folder.js';
import {
  PROJECT_HISTORY_INDEX_FILE,
  ProjectHistoryStore,
  projectHistoryStateFile,
  projectHistoryThumbnailFile,
  type ProjectHistoryRecord,
} from '@/project/history/core/project_history_store.js';

const DAY = 86_400_000;
const START = new Date(2026, 10, 1, 9, 0).getTime();

/**
 * Builds a level save.
 *
 * @param time Save time.
 * @param fields Fields to set.
 * @returns Record.
 */
function record(time: number, fields: Partial<ProjectHistoryRecord> = {}): ProjectHistoryRecord {
  return {
    kind: 'snapshot',
    source: 'level',
    time,
    path: 'maps/keep.aiworld',
    title: 'keep',
    room: null,
    objectCount: 2,
    state: `{"time":${time}}`,
    shot: { blob: new Blob(['webp']) },
    ...fields,
  };
}

describe('project history store', () => {
  it('writes each save into the folder of its day and reads it back', async () => {
    const folder = new ProjectHistoryFolderMemory();
    const store = new ProjectHistoryStore(folder);
    const entry = await store.add(record(START));
    expect(projectHistoryStateFile(entry)).toBe(`2026-11-01/${entry.id}.json`);
    expect(await (await store.stateRead(entry))?.text()).toBe(`{"time":${START}}`);
    expect(await (await store.thumbnailRead(entry))?.text()).toBe('webp');
    const again = new ProjectHistoryStore(folder);
    expect(await again.entries()).toEqual([entry]);
  });

  it('deletes the files of dropped saves and an emptied day folder', async () => {
    const folder = new ProjectHistoryFolderMemory();
    const store = new ProjectHistoryStore(folder);
    const old = await store.add(record(START));
    const kept = await store.add(record(START + 20 * DAY));
    expect((await store.entries()).map((entry) => entry.id)).toEqual([kept.id]);
    expect(await folder.read(projectHistoryStateFile(old))).toBeNull();
    expect(await folder.read(projectHistoryThumbnailFile(old))).toBeNull();
    expect(await folder.read(projectHistoryStateFile(kept))).not.toBeNull();
  });

  it('keeps a starred save past the retention and saves the star', async () => {
    const folder = new ProjectHistoryFolderMemory();
    const store = new ProjectHistoryStore(folder);
    const autosave = await store.add(record(START, { kind: 'autosave' }));
    expect((await store.star(autosave.id, true))?.kind).toBe('snapshot');
    for (let index = 1; index <= 6; index++) await store.add(record(START + index * 60_000, { kind: 'autosave' }));
    await store.add(record(START + 400 * DAY, { path: 'maps/other.aiworld' }));
    const reread = await new ProjectHistoryStore(folder).entries();
    const day = reread.filter((entry) => entry.day === '2026-11-01');
    expect(day.filter((entry) => entry.kind === 'snapshot').map((entry) => entry.id)).toEqual([autosave.id]);
    expect(day.filter((entry) => entry.kind === 'autosave')).toHaveLength(4);
    expect(reread[0]).toMatchObject({ starred: true, kind: 'snapshot' });
    expect(await folder.read(projectHistoryStateFile(autosave))).not.toBeNull();
  });

  it('removes a save and its files', async () => {
    const folder = new ProjectHistoryFolderMemory();
    const store = new ProjectHistoryStore(folder);
    const entry = await store.add(record(START));
    expect(await store.remove(entry.id)).toBe(true);
    expect(await store.entries()).toEqual([]);
    expect(await folder.read(projectHistoryStateFile(entry))).toBeNull();
    expect(await store.remove(entry.id)).toBe(false);
  });

  it('tells its listeners after every change has been written, until they stop listening', async () => {
    const store = new ProjectHistoryStore(new ProjectHistoryFolderMemory());
    const seen: number[] = [];
    const listener = vi.fn(async () => seen.push((await store.entries()).length));
    const stop = store.listen(listener);
    const entry = await store.add(record(START));
    await store.star(entry.id, true);
    await store.add(record(START + 20 * DAY, { path: 'maps/other.aiworld' }));
    await store.remove(entry.id);
    await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(4));
    expect(seen[0]).toBe(1);
    stop();
    await store.add(record(START + 21 * DAY));
    expect(listener).toHaveBeenCalledTimes(4);
  });

  it('reads an unknown index as empty', async () => {
    const folder = new ProjectHistoryFolderMemory();
    await folder.write(PROJECT_HISTORY_INDEX_FILE, '{"format":"other","entries":[{}]}');
    expect(await new ProjectHistoryStore(folder).entries()).toEqual([]);
  });
});
