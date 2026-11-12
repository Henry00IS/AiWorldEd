import { describe, expect, it } from 'vitest';
import {
  SCENE_FILE_RECENT_LIMIT,
  sceneFileRecentListAdd,
  sceneFileRecentListParse,
  type SceneFileRecentEntry,
} from '@/io/scene_file/recent/scene_file_recent_list.js';
import { sceneFileRecentFakeHandle } from './scene_file_recent_fakes.js';

describe('sceneFileRecentListAdd', () => {
  it('puts a new file on top and moves a file used again up instead of listing it twice', async () => {
    const first = sceneFileRecentFakeHandle('first.aiworld');
    const second = sceneFileRecentFakeHandle('second.aiworld');
    let list = await sceneFileRecentListAdd([], first, 1);
    list = await sceneFileRecentListAdd(list, second, 2);
    list = await sceneFileRecentListAdd(list, first, 3);

    expect(list.map((entry) => entry.handle.name)).toEqual(['first.aiworld', 'second.aiworld']);
    expect(list[0]!.usedAt).toBe(3);
  });

  it('keeps two different files with the same name apart', async () => {
    const here = sceneFileRecentFakeHandle('level.aiworld');
    const there = sceneFileRecentFakeHandle('level.aiworld');
    const list = await sceneFileRecentListAdd(await sceneFileRecentListAdd([], here, 1), there, 2);

    expect(list.map((entry) => entry.handle)).toEqual([there, here]);
  });

  it('drops the oldest file beyond the limit', async () => {
    let list: SceneFileRecentEntry[] = [];
    const count = SCENE_FILE_RECENT_LIMIT + 2;
    for (let index = 0; index < count; index += 1)
      list = await sceneFileRecentListAdd(list, sceneFileRecentFakeHandle(`level${index}.aiworld`), index);

    expect(list).toHaveLength(SCENE_FILE_RECENT_LIMIT);
    expect(list[0]!.handle.name).toBe(`level${count - 1}.aiworld`);
    expect(list.map((entry) => entry.handle.name)).not.toContain('level0.aiworld');
    expect(list.map((entry) => entry.handle.name)).not.toContain('level1.aiworld');
  });
});

describe('sceneFileRecentListParse', () => {
  it('keeps only file entries with a time, newest first', () => {
    const older = { handle: sceneFileRecentFakeHandle('older.aiworld'), usedAt: 1 };
    const newer = { handle: sceneFileRecentFakeHandle('newer.aiworld'), usedAt: 2 };
    const folder = { handle: { kind: 'directory', name: 'x', getFile: () => null }, usedAt: 3 };

    const parsed = sceneFileRecentListParse([older, null, 'text', { usedAt: 4 }, folder, newer]);

    expect(parsed).toEqual([newer, older]);
    expect(sceneFileRecentListParse(null)).toEqual([]);
  });
});
