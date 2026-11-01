import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PROJECT_AUTOSAVE_DELAY_MS,
  PROJECT_AUTOSAVE_HISTORY_INTERVAL_MS,
  PROJECT_AUTOSAVE_INTERVAL_MS,
  ProjectAutosave,
} from '@/project/autosave/project_autosave.js';
import { projectAutosaveParse } from '@/project/autosave/project_autosave_files.js';
import type { ProjectFileSystem } from '@/project/fs/project_file_system.js';
import { projectAutosaveCaptureOf, projectAutosaveProjectCreate } from './project_autosave_test_utils.js';

const AUTOSAVE_PATH = '.aiworlded/autosave/maps__start.autosave.json';

/**
 * Builds an autosave over a mock project with a controllable clock.
 *
 * @param fileSystem Project, or null for no project.
 * @returns Autosave, capture spy and clock.
 */
function autosaveCreate(fileSystem: ProjectFileSystem | null) {
  const clock = { now: Date.UTC(2026, 10, 1, 12) };
  const capture = vi.fn(() => projectAutosaveCaptureOf(2));
  const autosave = new ProjectAutosave({
    fileSystem: () => fileSystem,
    capture,
    now: () => clock.now,
    idle: (run) => run(),
  });
  return { autosave, capture, clock };
}

/**
 * Advances fake timers and the autosave clock together.
 *
 * @param clock Autosave clock.
 * @param milliseconds Time to pass.
 */
async function advance(clock: { now: number }, milliseconds: number): Promise<void> {
  clock.now += milliseconds;
  await vi.advanceTimersByTimeAsync(milliseconds);
}

describe('ProjectAutosave', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('does nothing without a project open', async () => {
    const { autosave, capture } = autosaveCreate(null);
    autosave.changed();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(vi.getTimerCount()).toBe(0);
    expect(capture).not.toHaveBeenCalled();
  });

  it('does nothing in a read-only project', async () => {
    const { fileSystem } = projectAutosaveProjectCreate(false);
    const { autosave, capture } = autosaveCreate(fileSystem);
    autosave.changed();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(capture).not.toHaveBeenCalled();
  });

  it('writes the scene a few seconds after changes', async () => {
    const { root, fileSystem } = projectAutosaveProjectCreate();
    const { autosave, clock } = autosaveCreate(fileSystem);
    autosave.sceneSet('maps/start.json');
    autosave.changed();
    await advance(clock, PROJECT_AUTOSAVE_DELAY_MS - 1);
    expect(await root.textAt(AUTOSAVE_PATH)).toBeNull();
    await advance(clock, 1);
    const document = projectAutosaveParse((await root.textAt(AUTOSAVE_PATH)) ?? '');
    expect(document?.sourcePath).toBe('maps/start.json');
    expect(document?.objectCount).toBe(2);
    expect(autosave.metrics().writes).toBe(1);
  });

  it('writes at most once per interval during constant changes', async () => {
    const { fileSystem } = projectAutosaveProjectCreate();
    const { autosave, capture, clock } = autosaveCreate(fileSystem);
    for (let second = 0; second < 60; second++) {
      autosave.changed();
      await advance(clock, 1000);
    }
    expect(capture.mock.calls.length).toBeLessThanOrEqual(Math.ceil(60_000 / PROJECT_AUTOSAVE_INTERVAL_MS) + 1);
    expect(capture.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it('keeps rotated copies and prunes them', async () => {
    const { root, fileSystem } = projectAutosaveProjectCreate();
    const { autosave, clock } = autosaveCreate(fileSystem);
    autosave.sceneSet('maps/start.json');
    for (let round = 0; round < 14; round++) {
      autosave.changed();
      await autosave.flush();
      clock.now += PROJECT_AUTOSAVE_HISTORY_INTERVAL_MS;
    }
    const folder = root.handleAt('.aiworlded/autosave/history/maps__start');
    const names = folder && 'children' in folder ? [...folder.children.keys()] : [];
    expect(names.length).toBe(10);
  });

  it('flushes pending changes at once and retries after a failed write', async () => {
    const { root, fileSystem } = projectAutosaveProjectCreate();
    const { autosave } = autosaveCreate(fileSystem);
    const write = vi.spyOn(fileSystem, 'fileWrite').mockRejectedValueOnce(new Error('disk full'));
    autosave.changed();
    await autosave.flush();
    expect(autosave.metrics().lastError).toBe('disk full');
    write.mockRestore();
    await autosave.flush();
    expect(await root.textAt('.aiworlded/autosave/untitled.autosave.json')).not.toBeNull();
  });

  it('drops pending changes when the scene is replaced', async () => {
    const { fileSystem } = projectAutosaveProjectCreate();
    const { autosave, capture } = autosaveCreate(fileSystem);
    autosave.changed();
    autosave.sceneSet('maps/other.json');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(capture).not.toHaveBeenCalled();
    expect(autosave.scenePath()).toBe('maps/other.json');
  });
});
