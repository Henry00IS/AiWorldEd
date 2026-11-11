import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PROJECT_AUTOSAVE_DELAY_MS,
  PROJECT_AUTOSAVE_INTERVAL_MS,
  ProjectAutosave,
} from '@/project/autosave/project_autosave.js';
import { projectAutosaveParse } from '@/project/autosave/project_autosave_files.js';
import { projectEditorFolderPrepare } from '@/project/fs/project_editor_folder.js';
import type { ProjectFileSystem } from '@/project/fs/project_file_system.js';
import type { SceneJSON } from '@/io/scene/io_types.js';
import {
  PROJECT_HISTORY_SNAPSHOT_EVERY_MS,
  type ProjectHistoryEntry,
} from '@/project/history/core/project_history_entry.js';
import { projectHistoryStoreFor } from '@/project/history/core/project_history_store.js';
import { textureEmbeddedAdd } from '@/texture/embedded/texture_embedded_library.js';
import { TextureLibrary } from '@/texture/library/texture_library.js';
import { sha256HexSync } from '@/utils/utils_sha256.js';
import { pngHeaderCreate } from '../../collaboration/session/texture_collaboration_fixture.js';
import { projectAutosaveCaptureOf, projectAutosaveProjectCreate } from './project_autosave_test_utils.js';

/**
 * Builds an autosave over a mock project with a controllable clock, edit
 * counter and edit identity.
 *
 * @param fileSystem Project, or null for no project.
 * @returns Autosave, capture spy, clock and edit state.
 */
function autosaveCreate(fileSystem: ProjectFileSystem | null) {
  const clock = { now: Date.UTC(2026, 10, 1, 12) };
  const edits = { revision: 0, state: {} as object };
  const file = { name: null as string | null };
  const capture = vi.fn(() => projectAutosaveCaptureOf(2));
  const autosave = new ProjectAutosave({
    fileSystem: () => fileSystem,
    capture,
    title: () => file.name,
    now: () => clock.now,
    idle: (run) => run(),
    revision: () => edits.revision,
    state: () => edits.state,
  });
  return { autosave, capture, clock, edits, file };
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

/**
 * Reads the saves of the project.
 *
 * @param fileSystem Project.
 * @returns Saves, oldest first.
 */
async function savesOf(fileSystem: ProjectFileSystem): Promise<ProjectHistoryEntry[]> {
  return (await projectHistoryStoreFor(fileSystem).entries()).sort((a, b) => a.time - b.time);
}

/**
 * Makes an edit: a new revision and a new edit identity.
 *
 * @param edits Edit state.
 * @param autosave Autosave told about it.
 */
function edit(edits: { revision: number; state: object }, autosave: ProjectAutosave): void {
  edits.revision += 1;
  edits.state = {};
  autosave.changed();
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

  it('writes an autosave of the scene a few seconds after changes', async () => {
    const { fileSystem } = projectAutosaveProjectCreate();
    const { autosave, clock, edits } = autosaveCreate(fileSystem);
    autosave.sceneSet('maps/start.json');
    edit(edits, autosave);
    await advance(clock, PROJECT_AUTOSAVE_DELAY_MS - 1);
    expect(await savesOf(fileSystem)).toEqual([]);
    await advance(clock, 1);
    await vi.waitFor(async () => expect(await savesOf(fileSystem)).toHaveLength(1));
    const [entry] = await savesOf(fileSystem);
    expect(entry).toMatchObject({ kind: 'autosave', source: 'level', path: 'maps/start.json', objectCount: 2 });
    const document = projectAutosaveParse(
      (await (await projectHistoryStoreFor(fileSystem).stateRead(entry!))?.text()) ?? '',
    );
    expect(document?.sourcePath).toBe('maps/start.json');
    expect(document?.objectCount).toBe(2);
    expect(autosave.metrics().writes).toBe(1);
  });

  it('names a save after the file Ctrl+S saves to, else the project file', async () => {
    const { fileSystem } = projectAutosaveProjectCreate();
    const { autosave, edits, file } = autosaveCreate(fileSystem);
    edit(edits, autosave);
    await autosave.flush();
    autosave.sceneSet('maps/start.json');
    edit(edits, autosave);
    await autosave.flush();
    file.name = 'Castle Gate.aiworld';
    edit(edits, autosave);
    await autosave.flush();
    expect((await savesOf(fileSystem)).map((entry) => entry.title)).toEqual([null, 'start', 'Castle Gate']);
  });

  it('copies the embedded textures the scene uses into the texture cache', async () => {
    const { root, fileSystem } = projectAutosaveProjectCreate();
    const png = pngHeaderCreate(8, 8);
    const id = `embedded:${sha256HexSync(png)}.png`;
    const library = new TextureLibrary();
    textureEmbeddedAdd(library, [{ id, name: 'crate', blob: new Blob([new Uint8Array(png)], { type: 'image/png' }) }]);
    const data = { ...projectAutosaveCaptureOf(1).data, objects: [{ textureId: id }] } as unknown as SceneJSON;
    const autosave = new ProjectAutosave({
      fileSystem: () => fileSystem,
      capture: () => ({ data }),
      library: () => library,
      idle: (run) => run(),
    });
    autosave.changed();
    await vi.advanceTimersByTimeAsync(PROJECT_AUTOSAVE_DELAY_MS);
    await vi.waitFor(() => expect(autosave.metrics().writes).toBe(1));
    expect(root.handleAt(`AiWorldEd/.Local/TextureCache/${sha256HexSync(png)}.png`)).toBeDefined();
  });

  it('writes at most once per interval during constant changes', async () => {
    const { fileSystem } = projectAutosaveProjectCreate();
    const { autosave, capture, clock, edits } = autosaveCreate(fileSystem);
    for (let second = 0; second < 60; second++) {
      edit(edits, autosave);
      await advance(clock, 1000);
    }
    expect(capture.mock.calls.length).toBeLessThanOrEqual(Math.ceil(60_000 / PROJECT_AUTOSAVE_INTERVAL_MS) + 1);
    expect(capture.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it('makes a snapshot every 30 minutes, but only when something changed', async () => {
    const { fileSystem } = projectAutosaveProjectCreate();
    const { autosave, clock, edits } = autosaveCreate(fileSystem);
    autosave.sceneSet('maps/start.json');
    edit(edits, autosave);
    await autosave.flush();
    clock.now += PROJECT_HISTORY_SNAPSHOT_EVERY_MS - 1;
    edit(edits, autosave);
    await autosave.flush();
    clock.now += 1;
    edit(edits, autosave);
    await autosave.flush();
    clock.now += 3 * PROJECT_HISTORY_SNAPSHOT_EVERY_MS;
    autosave.changed();
    await autosave.flush();
    clock.now += 1;
    edit(edits, autosave);
    await autosave.flush();
    expect((await savesOf(fileSystem)).map((entry) => entry.kind)).toEqual([
      'autosave',
      'autosave',
      'snapshot',
      'snapshot',
    ]);
  });

  it('keeps an idle tab from making any save', async () => {
    const { fileSystem } = projectAutosaveProjectCreate();
    const { autosave, capture, clock } = autosaveCreate(fileSystem);
    autosave.sceneSet('maps/start.json');
    await advance(clock, 4 * PROJECT_HISTORY_SNAPSHOT_EVERY_MS);
    expect(capture).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps the newest four autosaves of a level', async () => {
    const { fileSystem } = projectAutosaveProjectCreate();
    const { autosave, clock, edits } = autosaveCreate(fileSystem);
    autosave.sceneSet('maps/start.json');
    for (let round = 0; round < 7; round++) {
      edit(edits, autosave);
      await autosave.flush();
      clock.now += 60_000;
    }
    const saves = await savesOf(fileSystem);
    expect(saves.map((entry) => entry.kind)).toEqual(['autosave', 'autosave', 'autosave', 'autosave']);
  });

  it('does not write again when nothing changed or an undo returned to the saved edit', async () => {
    const { fileSystem } = projectAutosaveProjectCreate();
    const { autosave, capture, edits } = autosaveCreate(fileSystem);
    edit(edits, autosave);
    await autosave.flush();
    autosave.changed();
    await autosave.flush();
    const saved = edits.state;
    edit(edits, autosave);
    edits.revision += 1;
    edits.state = saved;
    await autosave.flush();
    expect(capture).toHaveBeenCalledTimes(1);
    expect(autosave.metrics().skipped).toBe(2);
  });

  it('does not write a state that was just loaded from the history', async () => {
    const { fileSystem } = projectAutosaveProjectCreate();
    const { autosave, capture, edits } = autosaveCreate(fileSystem);
    autosave.sceneSet('maps/start.json');
    edits.revision += 1;
    autosave.savedMarkSet();
    autosave.changed();
    await autosave.flush();
    expect(capture).not.toHaveBeenCalled();
  });

  it('flushes pending changes at once and retries after a failed write', async () => {
    const { fileSystem } = projectAutosaveProjectCreate();
    const { autosave, edits } = autosaveCreate(fileSystem);
    await projectEditorFolderPrepare(fileSystem);
    const write = vi.spyOn(fileSystem, 'fileWrite').mockRejectedValueOnce(new Error('disk full'));
    edit(edits, autosave);
    await autosave.flush();
    expect(autosave.metrics().lastError).toBe('disk full');
    write.mockRestore();
    await autosave.flush();
    expect(await savesOf(fileSystem)).toHaveLength(1);
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

  it('makes a snapshot right away when a level opens or is saved, and restarts the 30 minutes', async () => {
    const { fileSystem } = projectAutosaveProjectCreate();
    const { autosave, clock, edits } = autosaveCreate(fileSystem);
    autosave.sceneSet('maps/start.json');
    expect((await autosave.snapshot())?.kind).toBe('snapshot');
    clock.now += PROJECT_HISTORY_SNAPSHOT_EVERY_MS - 1;
    edit(edits, autosave);
    expect(autosave.pending()).toBe(true);
    expect((await autosave.snapshot())?.kind).toBe('snapshot');
    expect(autosave.pending()).toBe(false);
    clock.now += PROJECT_HISTORY_SNAPSHOT_EVERY_MS - 1;
    edit(edits, autosave);
    await autosave.flush();
    expect((await savesOf(fileSystem)).map((entry) => entry.kind)).toEqual(['snapshot', 'snapshot', 'autosave']);
  });

  it('keeps nothing without a writable project', async () => {
    const { fileSystem } = projectAutosaveProjectCreate(false);
    expect(await autosaveCreate(fileSystem).autosave.snapshot()).toBeNull();
    expect(await autosaveCreate(null).autosave.snapshot()).toBeNull();
  });
});
