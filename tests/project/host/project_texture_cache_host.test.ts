import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ControllerProject } from '@/project/controller/controller_project.js';
import type { ProjectFileSystem } from '@/project/fs/project_file_system.js';
import { ProjectFileSystemHandle } from '@/project/fs/project_file_system_handle.js';
import {
  PROJECT_TEXTURE_CACHE_DELAY_MS,
  PROJECT_TEXTURE_CACHE_INTERVAL_MS,
  PROJECT_TEXTURE_CACHE_POLL_MS,
  ProjectTextureCacheHost,
} from '@/project/host/project_texture_cache_host.js';
import type { UserIdleWatch } from '@/utils/user_idle.js';
import { ProjectMockDirectoryHandle } from '../fs/project_mock_directory_handle.js';

const CACHE = 'AiWorldEd/.Local/TextureCache';

/**
 * Builds a project folder with one unused cached texture.
 *
 * @param name Folder name.
 * @returns Root and file system.
 */
function folderCreate(name: string) {
  const root = new ProjectMockDirectoryHandle(name);
  root.put(`${CACHE}/${'a'.repeat(64)}.png`, 'png');
  return { root, fileSystem: new ProjectFileSystemHandle(root.asHandle()) };
}

/**
 * Tells whether a folder still holds a cached texture.
 *
 * @param root Folder root.
 * @param letter Hash digit.
 * @returns True when the file is there.
 */
function cached(root: ProjectMockDirectoryHandle, letter = 'a'): boolean {
  return root.handleAt(`${CACHE}/${letter.repeat(64)}.png`) !== undefined;
}

/**
 * Builds a host over a switchable open project, room and idle state.
 *
 * @returns Host and switches.
 */
function hostCreate() {
  let open: ProjectFileSystem | null = null;
  const state = { room: false, idle: true, loading: false };
  const waiters: (() => void)[] = [];
  const idle: UserIdleWatch = {
    idle: () => state.idle,
    idleWait: () => (state.idle ? Promise.resolve() : new Promise<void>((resolve) => waiters.push(resolve))),
  };
  const project = { fileSystem: () => open, suspendedReason: () => null };
  const host = new ProjectTextureCacheHost({
    project: project as unknown as ControllerProject,
    live: () => [],
    idle,
    inRoom: () => state.room,
    loading: () => state.loading,
    now: () => Date.now() + 24 * 60 * 60 * 1000,
  });
  const openProject = (fileSystem: ProjectFileSystem | null) => {
    open = fileSystem;
    if (fileSystem === null) host.projectClosed();
    else host.projectOpened(fileSystem);
  };
  const idleSet = (value: boolean) => {
    state.idle = value;
    if (value) waiters.splice(0).forEach((resolve) => resolve());
  };
  return { host, state, openProject, idleSet };
}

/** Lets pending pass work run without moving the fake clock. */
async function settle(): Promise<void> {
  for (let i = 0; i < 50; i += 1) await new Promise((resolve) => setImmediate(resolve));
}

/**
 * Moves the fake clock and lets the work it started run.
 *
 * @param ms Time.
 */
async function advance(ms: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
  await settle();
}

describe('ProjectTextureCacheHost', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }));
  afterEach(() => vi.useRealTimers());

  it('deletes unused cached textures 5 minutes after a project opened', async () => {
    const { root, fileSystem } = folderCreate('game');
    const { openProject } = hostCreate();
    openProject(fileSystem);
    await advance(PROJECT_TEXTURE_CACHE_DELAY_MS - 1);
    expect(cached(root)).toBe(true);
    await advance(1);
    await vi.waitFor(() => expect(cached(root)).toBe(false));
  });

  it('runs again an hour after a pass ended, counting from its end', async () => {
    const { root, fileSystem } = folderCreate('game');
    const { openProject, idleSet } = hostCreate();
    openProject(fileSystem);
    idleSet(false);
    await advance(PROJECT_TEXTURE_CACHE_DELAY_MS + 30 * 60 * 1000);
    expect(cached(root)).toBe(true);
    idleSet(true);
    await vi.waitFor(() => expect(cached(root)).toBe(false));
    root.put(`${CACHE}/${'b'.repeat(64)}.png`, 'png');
    await advance(PROJECT_TEXTURE_CACHE_INTERVAL_MS - 1000);
    expect(cached(root, 'b')).toBe(true);
    await advance(1000);
    await vi.waitFor(() => expect(cached(root, 'b')).toBe(false));
  });

  it('cancels the countdown on entering a room and starts it again on leaving', async () => {
    const { root, fileSystem } = folderCreate('game');
    const { openProject, state } = hostCreate();
    openProject(fileSystem);
    await advance(PROJECT_TEXTURE_CACHE_DELAY_MS - PROJECT_TEXTURE_CACHE_POLL_MS * 2);
    state.room = true;
    await advance(PROJECT_TEXTURE_CACHE_DELAY_MS * 3);
    expect(cached(root)).toBe(true);
    state.room = false;
    await advance(PROJECT_TEXTURE_CACHE_POLL_MS);
    await advance(PROJECT_TEXTURE_CACHE_DELAY_MS - PROJECT_TEXTURE_CACHE_POLL_MS);
    expect(cached(root)).toBe(true);
    await advance(PROJECT_TEXTURE_CACHE_POLL_MS);
    await vi.waitFor(() => expect(cached(root)).toBe(false));
  });

  it('cancels a pass waiting for idle on entering a room, deleting nothing', async () => {
    const { root, fileSystem } = folderCreate('game');
    const { host, openProject, state, idleSet } = hostCreate();
    openProject(fileSystem);
    idleSet(false);
    await advance(PROJECT_TEXTURE_CACHE_DELAY_MS);
    expect(host.passRunning()).toBe(true);
    state.room = true;
    await advance(PROJECT_TEXTURE_CACHE_POLL_MS);
    expect(host.passRunning()).toBe(false);
    idleSet(true);
    await advance(PROJECT_TEXTURE_CACHE_INTERVAL_MS);
    expect(cached(root)).toBe(true);
  });

  it('waits while a level loads and while the user is busy', async () => {
    const { root, fileSystem } = folderCreate('game');
    const { openProject, state, idleSet } = hostCreate();
    state.loading = true;
    openProject(fileSystem);
    await advance(PROJECT_TEXTURE_CACHE_DELAY_MS + PROJECT_TEXTURE_CACHE_POLL_MS * 4);
    expect(cached(root)).toBe(true);
    idleSet(false);
    state.loading = false;
    await advance(PROJECT_TEXTURE_CACHE_POLL_MS * 4);
    expect(cached(root)).toBe(true);
    idleSet(true);
    await vi.waitFor(() => expect(cached(root)).toBe(false));
  });

  it('cleans another folder with the same name, and stops when the project closes', async () => {
    const first = folderCreate('game');
    const second = folderCreate('game');
    const { openProject } = hostCreate();
    openProject(first.fileSystem);
    await advance(PROJECT_TEXTURE_CACHE_DELAY_MS);
    await vi.waitFor(() => expect(cached(first.root)).toBe(false));
    openProject(second.fileSystem);
    await advance(PROJECT_TEXTURE_CACHE_DELAY_MS);
    await vi.waitFor(() => expect(cached(second.root)).toBe(false));
    first.root.put(`${CACHE}/${'a'.repeat(64)}.png`, 'png');
    openProject(first.fileSystem);
    openProject(null);
    await advance(PROJECT_TEXTURE_CACHE_INTERVAL_MS);
    expect(cached(first.root)).toBe(true);
  });

  it('never touches a read-only folder', async () => {
    const { root, fileSystem } = folderCreate('game');
    const readOnly = Object.create(fileSystem, { writable: { value: false } }) as ProjectFileSystem;
    const { openProject } = hostCreate();
    openProject(readOnly);
    await advance(PROJECT_TEXTURE_CACHE_INTERVAL_MS);
    expect(cached(root)).toBe(true);
  });
});
