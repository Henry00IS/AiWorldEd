import { describe, expect, it } from 'vitest';
import { SceneFileRecent } from '@/io/scene_file/recent/scene_file_recent.js';
import { SceneFileRecentFakeStorage, sceneFileRecentFakeHandle } from './scene_file_recent_fakes.js';

/**
 * Lists the names of the reachable Recent files.
 *
 * @param recent Recent list.
 * @returns File names, newest first.
 */
function names(recent: SceneFileRecent): string[] {
  return recent.accessible().map((item) => item.entry.handle.name);
}

describe('SceneFileRecent', () => {
  it('remembers opened files newest first and stores them', async () => {
    const storage = new SceneFileRecentFakeStorage();
    const recent = new SceneFileRecent(storage, () => 50);
    await recent.start();
    await recent.remember(sceneFileRecentFakeHandle('a.aiworld'));
    await recent.remember(sceneFileRecentFakeHandle('b.aiworld'));

    expect(names(recent)).toEqual(['b.aiworld', 'a.aiworld']);
    expect(storage.saved.map((entry) => entry.handle.name)).toEqual(['b.aiworld', 'a.aiworld']);
  });

  it('lists files that are readable or reachable after one prompt, and hides denied ones', async () => {
    const readable = sceneFileRecentFakeHandle('readable.aiworld', 'granted');
    const prompt = sceneFileRecentFakeHandle('prompt.aiworld', 'prompt');
    const denied = sceneFileRecentFakeHandle('denied.aiworld', 'denied');
    const storage = new SceneFileRecentFakeStorage([
      { handle: readable, usedAt: 3 },
      { handle: prompt, usedAt: 2 },
      { handle: denied, usedAt: 1 },
    ]);
    const recent = new SceneFileRecent(storage);
    await recent.start();

    expect(recent.accessible().map((item) => [item.entry.handle.name, item.access])).toEqual([
      ['readable.aiworld', 'granted'],
      ['prompt.aiworld', 'prompt'],
    ]);
    expect(storage.saved).toHaveLength(3);
    expect(prompt.requests).toBe(0);
  });

  it('drops files that were deleted, from the list and from storage', async () => {
    const kept = sceneFileRecentFakeHandle('kept.aiworld');
    const deleted = sceneFileRecentFakeHandle('deleted.aiworld');
    const storage = new SceneFileRecentFakeStorage([
      { handle: kept, usedAt: 2 },
      { handle: deleted, usedAt: 1 },
    ]);
    const recent = new SceneFileRecent(storage);
    await recent.start();
    deleted.exists = false;
    await recent.refresh();

    expect(names(recent)).toEqual(['kept.aiworld']);
    expect(storage.saved.map((entry) => entry.handle.name)).toEqual(['kept.aiworld']);
  });

  it('reports nothing reachable when every file lost access, so the menu can hide', async () => {
    const handle = sceneFileRecentFakeHandle('level.aiworld');
    const recent = new SceneFileRecent(new SceneFileRecentFakeStorage([{ handle, usedAt: 1 }]));
    await recent.start();
    handle.permission = 'denied';
    await recent.refresh();

    expect(recent.accessible()).toEqual([]);
  });

  it('asks for access only when needed and reports a refusal', async () => {
    const granted = sceneFileRecentFakeHandle('granted.aiworld', 'granted');
    const asked = sceneFileRecentFakeHandle('asked.aiworld', 'prompt');
    const refused = sceneFileRecentFakeHandle('refused.aiworld', 'prompt');
    refused.answer = 'denied';
    const recent = new SceneFileRecent(new SceneFileRecentFakeStorage());
    const item = (handle: typeof granted) => ({ entry: { handle, usedAt: 1 }, access: 'prompt' as const });

    expect(await recent.access(item(granted))).toBe(granted);
    expect(await recent.access(item(asked))).toBe(asked);
    expect(await recent.access(item(refused))).toBeNull();
    expect([granted.requests, asked.requests, refused.requests]).toEqual([0, 1, 1]);
  });

  it('forgets one file and clears the whole list', async () => {
    const first = sceneFileRecentFakeHandle('first.aiworld');
    const second = sceneFileRecentFakeHandle('second.aiworld');
    const storage = new SceneFileRecentFakeStorage();
    const recent = new SceneFileRecent(storage);
    await recent.remember(first);
    await recent.remember(second);
    await recent.forget(first);
    expect(names(recent)).toEqual(['second.aiworld']);
    await recent.clear();

    expect(recent.accessible()).toEqual([]);
    expect(storage.saved).toEqual([]);
  });
});
