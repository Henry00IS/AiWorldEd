import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ControllerProjectHistory,
  type ControllerProjectHistoryHost,
  type ProjectHistoryRoom,
} from '@/project/history/controller_project_history.js';
import type { ProjectFileSystem } from '@/project/fs/project_file_system.js';
import { projectAutosaveProjectCreate } from '../autosave/project_autosave_test_utils.js';
import {
  PROJECT_HISTORY_TIME,
  projectHistoryCopyWrite,
  projectHistoryLatestWrite,
  projectHistoryRoomWrite,
} from './project_history_files_fixture.js';

/**
 * Builds a history controller over a project without any room.
 *
 * @param fileSystem Project folder.
 * @param overrides Host overrides.
 * @returns Controller and host.
 */
function controllerCreate(fileSystem: ProjectFileSystem | null, overrides: Partial<ControllerProjectHistoryHost> = {}) {
  const host: ControllerProjectHistoryHost = {
    container: document.body,
    fileSystem: () => fileSystem,
    level: () => 'maps__start',
    keep: vi.fn(async () => 'kept'),
    restore: vi.fn(async () => undefined),
    room: () => null,
    inRoom: () => false,
    confirm: vi.fn(async () => true),
    status: vi.fn(),
    ...overrides,
  };
  return { controller: new ControllerProjectHistory(host), host };
}

/**
 * Builds an owned room with one snapshot kept only in memory.
 *
 * @returns Room.
 */
function roomCreate(): ProjectHistoryRoom {
  const meta = {
    id: 'm1',
    savedAt: PROJECT_HISTORY_TIME + 5000,
    count: 9,
    reason: 'manual' as const,
    stored: 'memory' as const,
    locked: false,
  };
  return { list: vi.fn(async () => [meta]), take: vi.fn(async () => meta), restore: vi.fn(async () => undefined) };
}

/**
 * Opens the dialog and clicks Restore on the first row of a kind.
 *
 * @param controller History controller.
 * @param kind Row kind label start.
 * @returns Resolves once the restore flow ended.
 */
async function restoreFromDialog(controller: ControllerProjectHistory, kind: string): Promise<void> {
  const opened = controller.open();
  await vi.waitFor(() => expect(document.querySelectorAll('[data-history-entry]').length).toBeGreaterThan(0));
  const row = [...document.querySelectorAll<HTMLElement>('[data-history-entry]')].find((element) =>
    element.textContent?.includes(kind),
  );
  [...(row?.querySelectorAll('button') ?? [])].find((button) => button.textContent === 'Restore\u2026')?.click();
  await opened;
}

afterEach(() => document.body.replaceChildren());

describe('ControllerProjectHistory outside a room', () => {
  it('is available with a writable project and no room', () => {
    const { fileSystem } = projectAutosaveProjectCreate();
    expect(controllerCreate(fileSystem).controller.available()).toBe(true);
    expect(controllerCreate(null).controller.available()).toBe(false);
    expect(controllerCreate(projectAutosaveProjectCreate(false).fileSystem).controller.available()).toBe(false);
  });

  it('lists the autosave copies of the level, not only room snapshots', async () => {
    const { fileSystem } = projectAutosaveProjectCreate();
    await projectHistoryLatestWrite(fileSystem, PROJECT_HISTORY_TIME);
    await projectHistoryCopyWrite(fileSystem, PROJECT_HISTORY_TIME - 60_000);
    await projectHistoryCopyWrite(fileSystem, PROJECT_HISTORY_TIME - 120_000, 'snapshot', true);
    const entries = await controllerCreate(fileSystem).controller.entries();
    expect(entries.map((entry) => entry.kind).sort()).toEqual(['autosave', 'latest', 'snapshot']);
    expect(entries.find((entry) => entry.kind === 'snapshot')?.locked).toBe(true);
  });

  it('is not available to room members, whose project is the owner one and read-only', () => {
    const { controller } = controllerCreate(null, { inRoom: () => true });
    expect(controller.available()).toBe(false);
  });

  it('asks, keeps the level as it is, then restores the autosave', async () => {
    const { fileSystem } = projectAutosaveProjectCreate();
    await projectHistoryCopyWrite(fileSystem, PROJECT_HISTORY_TIME - 60_000);
    const { controller, host } = controllerCreate(fileSystem);
    await restoreFromDialog(controller, 'Autosave');
    const message = vi.mocked(host.confirm).mock.calls[0]?.[1] ?? '';
    expect(message).toContain('Replace the open level with the Autosave of maps/start');
    expect(message).toContain('3 objects');
    expect(message).toContain('Before Restore');
    expect(host.keep).toHaveBeenCalledWith('restore', false);
    expect(vi.mocked(host.restore).mock.calls[0]?.[0].objectCount).toBe(3);
  });

  it('changes nothing when the restore is declined', async () => {
    const { fileSystem } = projectAutosaveProjectCreate();
    await projectHistoryCopyWrite(fileSystem, PROJECT_HISTORY_TIME - 60_000);
    const { controller, host } = controllerCreate(fileSystem, { confirm: vi.fn(async () => false) });
    await restoreFromDialog(controller, 'Autosave');
    expect(host.keep).not.toHaveBeenCalled();
    expect(host.restore).not.toHaveBeenCalled();
  });

  it('takes a locked level snapshot outside a room', async () => {
    const { fileSystem } = projectAutosaveProjectCreate();
    const { controller, host } = controllerCreate(fileSystem);
    const opened = controller.open();
    await vi.waitFor(() => expect(document.querySelector('[data-project-history]')).not.toBeNull());
    [...document.querySelectorAll('button')].find((button) => button.textContent === 'Take Snapshot')?.click();
    await vi.waitFor(() => expect(host.keep).toHaveBeenCalledWith('snapshot', true));
    [...document.querySelectorAll('button')].find((button) => button.textContent === 'Close')?.click();
    await opened;
  });
});

describe('ControllerProjectHistory locking', () => {
  it('locks from the dialog, keeps a stale second Lock click harmless, then unlocks', async () => {
    const { fileSystem } = projectAutosaveProjectCreate();
    const path = await projectHistoryCopyWrite(fileSystem, PROJECT_HISTORY_TIME);
    const { controller } = controllerCreate(fileSystem);
    const opened = controller.open();
    const lockButton = () => document.querySelector<HTMLButtonElement>('[data-history-lock]');
    await vi.waitFor(() => expect(lockButton()).not.toBeNull());
    const stale = lockButton();
    stale?.click();
    stale?.click();
    await vi.waitFor(() => expect(lockButton()?.dataset['historyLock']).toBe('true'));
    expect((await controller.entries())[0]?.path).toBe(path.replace('.json', '.locked.json'));
    lockButton()?.click();
    await vi.waitFor(() => expect(lockButton()?.dataset['historyLock']).toBe('false'));
    expect((await controller.entries())[0]?.path).toBe(path);
    [...document.querySelectorAll('button')].find((button) => button.textContent === 'Close')?.click();
    await opened;
  });
});

describe('ControllerProjectHistory in a room', () => {
  it('lists memory-only room snapshots for the owner and restores them through the room', async () => {
    const { fileSystem } = projectAutosaveProjectCreate();
    await projectHistoryRoomWrite(fileSystem, PROJECT_HISTORY_TIME);
    const room = roomCreate();
    const { controller } = controllerCreate(fileSystem, { room: () => room, inRoom: () => true });
    const entries = await controller.entries();
    expect(entries.map((entry) => entry.id)).toContain('memory:m1');
    await restoreFromDialog(controller, 'Room Snapshot');
    expect(room.restore).toHaveBeenCalledWith('m1', expect.stringContaining('the Room Snapshot from'));
  });

  it('blocks level restores in a room and room restores outside one', async () => {
    const { fileSystem } = projectAutosaveProjectCreate();
    await projectHistoryCopyWrite(fileSystem, PROJECT_HISTORY_TIME);
    await projectHistoryRoomWrite(fileSystem, PROJECT_HISTORY_TIME - 1000);
    const room = roomCreate();
    const owner = controllerCreate(fileSystem, { room: () => room, inRoom: () => true }).controller;
    const offline = controllerCreate(fileSystem).controller;
    const [copy, snapshot] = await offline.entries();
    expect(owner.restoreBlocked(copy!)).toContain('Leave the room');
    expect(owner.restoreBlocked(snapshot!)).toBeNull();
    expect(offline.restoreBlocked(snapshot!)).toContain('own a room');
    expect(offline.restoreBlocked(copy!)).toBeNull();
  });
});
