import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandStack } from '@/commands/command_stack.js';
import { SceneDeserializer } from '@/io/scene/scene_deserializer.js';
import { SceneSerializer } from '@/io/scene/scene_serializer.js';
import type { SceneJSON } from '@/io/scene/io_types.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { ProjectAutosave, PROJECT_AUTOSAVE_DELAY_MS } from '@/project/autosave/project_autosave.js';
import { projectAutosaveParse } from '@/project/autosave/project_autosave_files.js';
import type { ProjectFileSystem } from '@/project/fs/project_file_system.js';
import { projectHistoryStoreFor } from '@/project/history/core/project_history_store.js';
import { solidScriptDocumentNormalize } from '@/solid_script/document/solid_script_document.js';
import { solidScriptEditorCurrentGet } from '@/solid_script/ui/solid_script_editor_open.js';
import {
  chip,
  doubleClick,
  editorFixture,
  find,
  press,
  tool,
} from '../../solid_script/ui/solid_script_editor_fixture.js';
import { projectAutosaveProjectCreate } from './project_autosave_test_utils.js';

/**
 * Wires autosave to a command stack the way the project editor host does.
 *
 * @param commandStack Level undo stack.
 * @param world Scene to capture.
 * @param fileSystem Writable project.
 * @returns Autosave that already treats the current scene as saved.
 */
function autosaveFor(commandStack: CommandStack, world: THREE.Group, fileSystem: ProjectFileSystem): ProjectAutosave {
  const serializer = new SceneSerializer();
  const autosave = new ProjectAutosave({
    fileSystem: () => fileSystem,
    capture: () => ({ data: serializer.serialize(world) }),
    idle: (run) => run(),
    revision: () => commandStack.getHistoryRevision(),
    state: () => commandStack.historyState(),
  });
  commandStack.onStackChanged(() => autosave.changed());
  autosave.sceneSet('maps/start.json');
  commandStack.markSavedPoint();
  autosave.savedMarkSet();
  return autosave;
}

/** Inserts a Hull block under the first line and confirms the configurator. */
function insertHull(): void {
  chip(0).focus();
  doubleClick(find('.solid-script-editor-palette-item[data-command="hull"]'));
  tool('OK').click();
}

/** Presses undo in the script editor's line list. */
function scriptUndo(): void {
  press(find('[data-solid-script-editor] .solid-script-editor-lines'), 'z', { ctrlKey: true });
}

/**
 * Reads the newest saved scene from the project's Level History.
 *
 * @param fileSystem Project.
 * @returns Scene data.
 */
async function savedScene(fileSystem: ProjectFileSystem): Promise<SceneJSON> {
  const entries = (await projectHistoryStoreFor(fileSystem).entries()).sort((left, right) => left.time - right.time);
  const entry = entries.at(-1);
  if (!entry) throw new Error('Expected an autosave');
  const text = (await (await projectHistoryStoreFor(fileSystem).stateRead(entry))?.text()) ?? '';
  const document = projectAutosaveParse(text);
  if (!document) throw new Error('Expected a valid autosave');
  return document.data;
}

/**
 * Returns the command names of the first SolidScript generator in a scene.
 *
 * @param data Saved scene.
 * @returns Command names, in order.
 */
function scriptCommands(data: SceneJSON): string[] {
  const object = data.objects.find((entry) => entry.modifierStack);
  const document = object?.modifierStack?.modifiers[0]?.parameters['script'];
  return solidScriptDocumentNormalize(document).blocks.map((block) => block.command);
}

/**
 * Reloads a saved scene and returns the script commands of its generator.
 *
 * @param data Saved scene.
 * @returns Command names, in order.
 */
function reopenedCommands(data: SceneJSON): string[] {
  const world = new THREE.Group();
  new SceneDeserializer().deserialize(data, world);
  const nodes: THREE.Object3D[] = [];
  world.traverse((object) => {
    if (ModifierVolume.isGenerator(object)) nodes.push(object);
  });
  const document = ModifierVolume.read(nodes[0] ?? new THREE.Object3D()).modifiers[0]?.parameters['script'];
  return solidScriptDocumentNormalize(document).blocks.map((block) => block.command);
}

describe('ProjectAutosave with SolidScript edits', () => {
  beforeEach(() => vi.useFakeTimers());

  afterEach(() => {
    solidScriptEditorCurrentGet()?.close();
    vi.useRealTimers();
  });

  it('marks the level dirty and autosaves the new script lines', async () => {
    const { world, commandStack, commands } = editorFixture([{ command: 'cube' }, { command: 'sphere' }]);
    const { fileSystem } = projectAutosaveProjectCreate();
    const autosave = autosaveFor(commandStack, world, fileSystem);
    insertHull();
    expect(commands()).toEqual(['cube', 'hull', 'end', 'sphere']);
    expect(commandStack.isAtSavedPoint()).toBe(false);
    expect(commandStack.peekUndo()).toBeNull();
    await vi.advanceTimersByTimeAsync(PROJECT_AUTOSAVE_DELAY_MS - 1);
    expect(autosave.metrics().writes).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    await vi.waitFor(() => expect(autosave.metrics().writes).toBe(1));
    expect(scriptCommands(await savedScene(fileSystem))).toEqual(['cube', 'hull', 'end', 'sphere']);
    autosave.dispose();
  });

  it('keeps the saved script after the editor window is closed without an OK', async () => {
    const { world, commandStack, commands } = editorFixture([{ command: 'cube' }, { command: 'sphere' }]);
    const { fileSystem } = projectAutosaveProjectCreate();
    const autosave = autosaveFor(commandStack, world, fileSystem);
    insertHull();
    solidScriptEditorCurrentGet()?.close();
    expect(document.querySelector('[data-solid-script-editor]')).toBeNull();
    expect(commands()).toEqual(['cube', 'hull', 'end', 'sphere']);
    await autosave.flush();
    expect(scriptCommands(await savedScene(fileSystem))).toEqual(['cube', 'hull', 'end', 'sphere']);
    autosave.dispose();
  });

  it('autosaves the script after undo', async () => {
    const { world, commandStack, commands } = editorFixture([{ command: 'cube' }, { command: 'sphere' }]);
    const { fileSystem } = projectAutosaveProjectCreate();
    const autosave = autosaveFor(commandStack, world, fileSystem);
    insertHull();
    await autosave.flush();
    scriptUndo();
    expect(commands()).toEqual(['cube', 'sphere']);
    await autosave.flush();
    expect(scriptCommands(await savedScene(fileSystem))).toEqual(['cube', 'sphere']);
    autosave.dispose();
  });

  it('reloads the new script when the saved level is reopened', async () => {
    const { world, commandStack } = editorFixture([{ command: 'cube' }, { command: 'sphere' }]);
    const { fileSystem } = projectAutosaveProjectCreate();
    const autosave = autosaveFor(commandStack, world, fileSystem);
    insertHull();
    await autosave.flush();
    expect(reopenedCommands(await savedScene(fileSystem))).toEqual(['cube', 'hull', 'end', 'sphere']);
    autosave.dispose();
  });
});
