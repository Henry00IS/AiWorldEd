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
import { projectHistoryIndexParse, type ProjectHistoryIndex } from '@/project/history/tree/project_history_tree.js';
import {
  PROJECT_HISTORY_SESSION_IDLE_MS,
  PROJECT_HISTORY_UNNAMED_KEEP,
} from '@/project/history/tree/project_history_tree_edit.js';
import { textureEmbeddedAdd } from '@/texture/embedded/texture_embedded_library.js';
import { TextureLibrary } from '@/texture/library/texture_library.js';
import { sha256HexSync } from '@/utils/utils_sha256.js';
import { pngHeaderCreate } from '../../collaboration/session/texture_collaboration_fixture.js';
import type { ProjectMockDirectoryHandle } from '../fs/project_mock_directory_handle.js';
import { projectAutosaveCaptureOf, projectAutosaveProjectCreate } from './project_autosave_test_utils.js';

const TREE = 'AiWorldEd/.Local/History/Levels/maps__start';

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
  const capture = vi.fn(() => projectAutosaveCaptureOf(2));
  const autosave = new ProjectAutosave({
    fileSystem: () => fileSystem,
    capture,
    now: () => clock.now,
    idle: (run) => run(),
    revision: () => edits.revision,
    state: () => edits.state,
  });
  return { autosave, capture, clock, edits };
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
 * Reads a level tree index from the mock folder.
 *
 * @param root Project root.
 * @param tree Tree folder.
 * @returns Index, or null.
 */
async function indexAt(root: ProjectMockDirectoryHandle, tree = TREE): Promise<ProjectHistoryIndex | null> {
  return projectHistoryIndexParse((await root.textAt(`${tree}/index.json`)) ?? '');
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

  it('writes the scene into its level tree a few seconds after changes', async () => {
    const { root, fileSystem } = projectAutosaveProjectCreate();
    const { autosave, clock, edits } = autosaveCreate(fileSystem);
    autosave.sceneSet('maps/start.json');
    edit(edits, autosave);
    await advance(clock, PROJECT_AUTOSAVE_DELAY_MS - 1);
    expect(await indexAt(root)).toBeNull();
    await advance(clock, 1);
    await vi.waitFor(async () => expect((await indexAt(root))?.nodes.length).toBe(1));
    const index = await indexAt(root);
    const document = projectAutosaveParse((await root.textAt(`${TREE}/${index?.marker}.json`)) ?? '');
    expect(document?.sourcePath).toBe('maps/start.json');
    expect(document?.objectCount).toBe(2);
    expect(index?.label).toBe('maps/start.json');
    expect(autosave.metrics().writes).toBe(1);
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
      capture: () => ({ data, objectCount: 1 }),
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

  it('replaces the state of one editing session until the editor was idle for 30 minutes', async () => {
    const { root, fileSystem } = projectAutosaveProjectCreate();
    const { autosave, clock, edits } = autosaveCreate(fileSystem);
    autosave.sceneSet('maps/start.json');
    for (let round = 0; round < 5; round++) {
      edit(edits, autosave);
      await autosave.flush();
      clock.now += 60_000;
    }
    expect((await indexAt(root))?.nodes.map((node) => node.autosaves)).toEqual([5]);
    clock.now += PROJECT_HISTORY_SESSION_IDLE_MS;
    edit(edits, autosave);
    await autosave.flush();
    const index = await indexAt(root);
    expect(index?.nodes.length).toBe(2);
    expect(index?.nodes[1]?.parent).toBe(index?.nodes[0]?.id);
    expect(root.handleAt(`${TREE}/${index?.nodes[0]?.id}.json`)).toBeDefined();
  });

  it('keeps the newest 20 unnamed sessions and removes the files of older ones', async () => {
    const { root, fileSystem } = projectAutosaveProjectCreate();
    const { autosave, clock, edits } = autosaveCreate(fileSystem);
    autosave.sceneSet('maps/start.json');
    for (let round = 0; round < PROJECT_HISTORY_UNNAMED_KEEP + 4; round++) {
      edit(edits, autosave);
      await autosave.flush();
      clock.now += PROJECT_HISTORY_SESSION_IDLE_MS + 1;
    }
    const index = await indexAt(root);
    expect(index?.nodes.length).toBe(PROJECT_HISTORY_UNNAMED_KEEP);
    const folder = root.handleAt(TREE);
    const names = folder && 'children' in folder ? [...folder.children.keys()] : [];
    expect(names.filter((name) => name.endsWith('.json') && name !== 'index.json').length).toBe(
      PROJECT_HISTORY_UNNAMED_KEEP,
    );
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

  it('starts a new session after a scene was loaded from its file', async () => {
    const { root, fileSystem } = projectAutosaveProjectCreate();
    const { autosave, edits } = autosaveCreate(fileSystem);
    autosave.sceneSet('maps/start.json');
    edit(edits, autosave);
    await autosave.flush();
    autosave.sceneSet('maps/start.json');
    edit(edits, autosave);
    await autosave.flush();
    expect((await indexAt(root))?.nodes.length).toBe(2);
  });

  it('flushes pending changes at once and retries after a failed write', async () => {
    const { root, fileSystem } = projectAutosaveProjectCreate();
    const { autosave, edits } = autosaveCreate(fileSystem);
    await projectEditorFolderPrepare(fileSystem);
    const write = vi.spyOn(fileSystem, 'fileWrite').mockRejectedValueOnce(new Error('disk full'));
    edit(edits, autosave);
    await autosave.flush();
    expect(autosave.metrics().lastError).toBe('disk full');
    write.mockRestore();
    await autosave.flush();
    expect(await indexAt(root, 'AiWorldEd/.Local/History/Levels/untitled')).not.toBeNull();
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

  it('keeps a named snapshot right away, and the next autosave grows a new session from it', async () => {
    const { root, fileSystem } = projectAutosaveProjectCreate();
    const { autosave, clock, edits } = autosaveCreate(fileSystem);
    autosave.sceneSet('maps/start.json');
    const snapshot = await autosave.snapshot('Gate And Towers');
    expect(snapshot?.name).toBe('Gate And Towers');
    for (let step = 0; step < 30; step += 1) {
      clock.now += PROJECT_HISTORY_SESSION_IDLE_MS + 1;
      edit(edits, autosave);
      await autosave.flush();
    }
    const index = await indexAt(root);
    expect(index?.nodes.find((node) => node.id === snapshot?.id)?.name).toBe('Gate And Towers');
    expect(index?.nodes.find((node) => node.parent === snapshot?.id)).toBeDefined();
    expect(root.handleAt(`${TREE}/${snapshot?.id}.json`)).toBeDefined();
  });

  it('keeps nothing without a writable project', async () => {
    const { fileSystem } = projectAutosaveProjectCreate(false);
    expect(await autosaveCreate(fileSystem).autosave.snapshot('A')).toBeNull();
    expect(await autosaveCreate(null).autosave.snapshot('B')).toBeNull();
  });
});
