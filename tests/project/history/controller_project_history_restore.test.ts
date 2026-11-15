import { afterEach, describe, expect, it, vi } from 'vitest';
import { CommandStack } from '@/commands/command_stack.js';
import type { UndoCommand } from '@/commands/command_undo.js';
import { ProjectAutosave } from '@/project/autosave/project_autosave.js';
import {
  PROJECT_HISTORY_AUTOSAVE_KEEP,
  type ProjectHistoryEntry,
} from '@/project/history/core/project_history_entry.js';
import { projectHistoryStoreFor } from '@/project/history/core/project_history_store.js';
import { ControllerProjectEditor } from '@/project/host/controller_project_editor.js';
import {
  ProjectHostMemoryStorage,
  projectHostControllerCreate,
  projectHostFakeCreate,
  projectHostFolderCreate,
} from '../host/project_host_test_utils.js';

const PATH = 'maps/start.json';

/**
 * Builds a no-op undo command.
 *
 * @returns Command.
 */
function commandOf(): UndoCommand {
  return { execute() {}, undo() {} };
}

/**
 * Builds an editor whose autosave follows the undo stack, like the running
 * editor, and whose scene load clears that stack then marks it saved.
 *
 * @param clock Optional autosave clock.
 * @returns Fixture.
 */
async function restoreFixture(clock?: { now: number }) {
  const fake = projectHostFakeCreate();
  const { picker } = projectHostFolderCreate();
  const { project } = projectHostControllerCreate(fake.library, picker);
  await project.open();
  const stack = new CommandStack(64);
  const autosave = new ProjectAutosave({
    fileSystem: () => project.fileSystem(),
    capture: () => ({ data: { version: 1, objects: [{ name: 'Live' }] } as never }),
    idle: (run) => run(),
    revision: () => stack.getHistoryRevision(),
    state: () => stack.peekUndo(),
    ...(clock === undefined ? {} : { now: () => clock.now }),
  });
  const editor = new ControllerProjectEditor(fake.host, {
    project,
    autosave,
    storage: new ProjectHostMemoryStorage(),
  });
  editor.start();
  stack.onStackChanged(() => fake.historyFire());
  fake.host.sceneLoad.mockImplementation(() => {
    editor.sceneLoaded();
    stack.clear();
    stack.markSavedPoint();
    return true;
  });
  const store = projectHistoryStoreFor(project.fileSystem()!);
  return { ...fake, project, stack, autosave, editor, store };
}

/**
 * Writes an edit of the open level into the Level History.
 *
 * @param stack Undo stack.
 * @param autosave Autosave.
 */
async function editFlush(stack: CommandStack, autosave: ProjectAutosave): Promise<void> {
  stack.push(commandOf());
  await autosave.flush();
}

/**
 * Autosaves of a level, oldest first.
 *
 * @param store History store.
 * @param path Level path.
 * @returns Autosaves.
 */
async function autosavesOf(
  store: ReturnType<typeof projectHistoryStoreFor>,
  path: string,
): Promise<ProjectHistoryEntry[]> {
  return (await store.entries())
    .filter((entry) => entry.kind === 'autosave' && entry.path === path)
    .sort((left, right) => left.time - right.time);
}

/**
 * Adds several autosaves of the level, as if the user had been editing.
 *
 * @param fixture Restore fixture.
 * @param count How many to write.
 * @returns The saves, oldest first.
 */
async function autosavesSeed(
  fixture: Awaited<ReturnType<typeof restoreFixture>>,
  count: number,
): Promise<ProjectHistoryEntry[]> {
  fixture.autosave.sceneSet(PATH);
  for (let round = 0; round < count; round++) await editFlush(fixture.stack, fixture.autosave);
  const listed = await fixture.editor.history.entries();
  return listed
    .filter((entry) => entry.kind === 'autosave' && entry.path === PATH)
    .sort((left, right) => left.time - right.time);
}

describe('Level History restore and autosave', () => {
  afterEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  it('does not write an autosave when a save is restored, until the user edits', async () => {
    const fixture = await restoreFixture();
    const seeded = await autosavesSeed(fixture, 3);
    expect(seeded).toHaveLength(3);
    expect((await fixture.editor.history.restore(seeded[0]!)).message).toMatch(/^Restored /);
    expect(fixture.host.sceneLoad).toHaveBeenLastCalledWith(expect.any(Blob), expect.any(String), null);
    expect(fixture.stack.isAtSavedPoint()).toBe(true);
    expect(fixture.autosave.scenePath()).toBe(PATH);
    await fixture.autosave.flush();
    expect(await autosavesOf(fixture.store, PATH)).toHaveLength(3);
    expect((await fixture.store.entries()).filter((entry) => entry.kind === 'autosave')).toHaveLength(3);
    expect((await fixture.editor.history.restore(seeded[1]!)).message).toMatch(/^Restored /);
    await fixture.autosave.flush();
    expect(await autosavesOf(fixture.store, PATH)).toHaveLength(3);
    await editFlush(fixture.stack, fixture.autosave);
    expect(await autosavesOf(fixture.store, PATH)).toHaveLength(4);
    fixture.editor.dispose();
  });

  it('never keeps more than the retention limit of autosaves after restoring again and again', async () => {
    const fixture = await restoreFixture();
    const seeded = await autosavesSeed(fixture, PROJECT_HISTORY_AUTOSAVE_KEEP);
    expect(PROJECT_HISTORY_AUTOSAVE_KEEP).toBe(4);
    expect(seeded).toHaveLength(PROJECT_HISTORY_AUTOSAVE_KEEP);
    for (const entry of [...seeded].reverse()) {
      await fixture.editor.history.restore(entry);
      await fixture.autosave.flush();
    }
    const autosaves = (await fixture.store.entries()).filter((entry) => entry.kind === 'autosave');
    expect(autosaves).toHaveLength(PROJECT_HISTORY_AUTOSAVE_KEEP);
    expect(autosaves.every((entry) => entry.path === PATH)).toBe(true);
    fixture.editor.dispose();
  });

  it('still saves pending edits once before a restore, then stops until the next edit', async () => {
    const fixture = await restoreFixture();
    const seeded = await autosavesSeed(fixture, PROJECT_HISTORY_AUTOSAVE_KEEP);
    fixture.stack.push(commandOf());
    await fixture.editor.history.restore(seeded[0]!);
    expect(await autosavesOf(fixture.store, PATH)).toHaveLength(PROJECT_HISTORY_AUTOSAVE_KEEP);
    await fixture.autosave.flush();
    expect(await autosavesOf(fixture.store, PATH)).toHaveLength(PROJECT_HISTORY_AUTOSAVE_KEEP);
    fixture.editor.dispose();
  });

  it('does not write an autosave a few seconds after restore when the load later notifies again', async () => {
    const clock = { now: Date.UTC(2026, 10, 15, 12) };
    const fixture = await restoreFixture(clock);
    const seeded = await autosavesSeed(fixture, 3);
    expect((await fixture.editor.history.restore(seeded[0]!)).message).toMatch(/^Restored /);
    expect(fixture.stack.isAtSavedPoint()).toBe(true);
    expect(fixture.autosave.scenePath()).toBe(PATH);
    vi.useFakeTimers();
    fixture.editor.sceneLoaded();
    fixture.historyFire();
    clock.now += 30_000;
    await vi.advanceTimersByTimeAsync(30_000);
    const autosaves = (await fixture.store.entries()).filter((entry) => entry.kind === 'autosave');
    expect(fixture.autosave.scenePath()).toBe(PATH);
    expect(autosaves).toHaveLength(3);
    expect(autosaves.every((entry) => entry.path === PATH)).toBe(true);
    fixture.editor.dispose();
  });
});
