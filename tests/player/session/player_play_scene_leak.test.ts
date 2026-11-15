import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { PLAYER_SYSTEM_SPAWN_SET_STATUS, PlayerSystem, type PlayerSystemHost } from '@/player/player_system.js';
import type { ManagerInput } from '@/input/manager_input.js';
import type { Viewport3D } from '@/viewports/core/viewport_3d.js';
import type { EditorWindow } from '@/editor/window/editor_window.js';
import type { Tool } from '@/editor/tools/tool.js';
import { SceneSerializer } from '@/io/scene/scene_serializer.js';
import { SceneDeserializer } from '@/io/scene/scene_deserializer.js';
import { getOutlinerContentChildren } from '@/outliner/ui/outliner_tree_hierarchy.js';
import {
  playerCharacterLoadModelFromArrayBuffer,
  playerCharacterResetModelLoader,
} from '@/player/character/player_character_model_loader.js';

/** How many times the tests enter and leave play mode. */
const PLAY_ROUNDS = 4;

/**
 * Editor around the player system: the level, the overlay layer, and the active
 * tool.
 */
interface Editor {
  world: THREE.Group;
  helpers: THREE.Group;
  system: PlayerSystem;
  shown: string[];
  activeTool: () => Tool | null;
  button: HTMLElement;
}

/**
 * Builds the player system over one perspective pane, with a floor in the level
 * and the overlay layer the editor gives it for its own objects.
 *
 * @returns Editor stub.
 */
function editorBuild(): Editor {
  const world = new THREE.Group();
  const floor = new THREE.Mesh(new THREE.BoxGeometry(20, 1, 20), new THREE.MeshStandardMaterial());
  floor.name = 'Floor';
  floor.position.set(0, -0.5, 0);
  world.add(floor);
  world.updateMatrixWorld(true);
  const helpers = new THREE.Group();
  const shown: string[] = [];
  const rect = new DOMRect(0, 0, 100, 100);
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
  camera.position.set(0, 5, 5);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  const content = document.createElement('div');
  content.getBoundingClientRect = () => rect;
  document.body.appendChild(content);
  const buttons: HTMLElement[] = [];
  const toolbarElement = document.createElement('div');
  const viewport = {
    getCamera: () => camera,
    getContentElement: () => content,
    getWorldGroup: () => world,
    getViewportToolbar: () => ({
      getElement: () => toolbarElement,
      insertControlAfterTitle: (button: HTMLElement) => buttons.push(button),
    }),
    setFlyingCameraEnabled: () => undefined,
    syncFlyingCameraOrientation: () => undefined,
    setOverlayRender: () => undefined,
  } as unknown as Viewport3D;
  let tool: Tool | null = null;
  const editorWindow = {
    get activeTool(): Tool | null {
      return tool;
    },
    useTool: (next: Tool) => {
      tool = next;
      next.onActivate();
    },
  } as unknown as EditorWindow;
  const host: PlayerSystemHost = {
    worldRoot: world,
    inputManager: { isKeyDown: () => false } as unknown as ManagerInput,
    getEditorWindow: () => editorWindow,
    getPerspectiveViewports: () => [viewport],
    getInteractiveViewports: () => [],
    showStatusMessage: (message) => shown.push(message),
    helperAdd: (object) => helpers.add(object),
    helperRemove: (object) => helpers.remove(object),
  };
  const system = new PlayerSystem(host);
  const button = buttons[0];
  if (button === undefined) throw new Error('pane has no figurine button');
  return { world, helpers, system, shown, activeTool: () => tool, button };
}

/**
 * Drags the figurine from its button onto the floor to set the play spawn,
 * checking that the drag ghost stays out of the level while it is dragged.
 *
 * @param editor Editor stub.
 */
function spawnPlace(editor: Editor): void {
  const init = { bubbles: true, button: 0, clientX: 50, clientY: 50 };
  editor.button.dispatchEvent(new MouseEvent('pointerdown', init));
  window.dispatchEvent(new MouseEvent('pointermove', init));
  expect(levelNames(editor.world)).toEqual({ children: ['Floor'], outliner: ['Floor'] });
  expect(savedNames(editor.world)).toEqual(['Floor']);
  window.dispatchEvent(new MouseEvent('pointerup', init));
  expect(editor.shown).toContain(PLAYER_SYSTEM_SPAWN_SET_STATUS);
}

/**
 * Enters play mode with Space.
 *
 * @param editor Editor stub.
 */
function playEnter(editor: Editor): void {
  const consumed = editor.system.tryHandleGlobalKeyDown(new KeyboardEvent('keydown', { code: 'Space', key: ' ' }));
  expect(consumed).toBe(true);
  expect(editor.system.getIsPlaying()).toBe(true);
}

/**
 * Leaves play mode with Escape.
 *
 * @param editor Editor stub.
 */
function playExit(editor: Editor): void {
  const tool = editor.activeTool();
  tool?.onKeyDown('Escape');
  tool?.onDeactivate();
  expect(editor.system.getIsPlaying()).toBe(false);
}

/**
 * Lists the names of the level's objects in a saved level.
 *
 * @param world Level root.
 * @returns Saved object names.
 */
function savedNames(world: THREE.Group): string[] {
  return new SceneSerializer().serialize(world).objects.map((entry) => entry.name);
}

/**
 * Lists the names of the level root's children, all of them and those the
 * outliner shows.
 *
 * @param world Level root.
 * @returns Child names.
 */
function levelNames(world: THREE.Group): { children: string[]; outliner: string[] } {
  return {
    children: world.children.map((child) => child.name),
    outliner: getOutlinerContentChildren(world).map((child) => child.name),
  };
}

beforeAll(async () => {
  playerCharacterResetModelLoader();
  await playerCharacterLoadModelFromArrayBuffer(
    readFileSync(resolve(process.cwd(), 'src/player/assets/character.glb')),
  );
});

afterEach(() => {
  document.body.replaceChildren();
});

/**
 * The player's own character (spawn figurine and play avatar) never becomes
 * part of the level.
 */
describe('player character stays out of the level', () => {
  it('keeps the spawn figurine out of the level, its outliner, and its save', () => {
    const editor = editorBuild();
    spawnPlace(editor);
    expect(levelNames(editor.world)).toEqual({ children: ['Floor'], outliner: ['Floor'] });
    expect(savedNames(editor.world)).toEqual(['Floor']);
    expect(editor.helpers.children.length).toBeGreaterThan(0);
    editor.system.dispose();
  });

  it(`adds nothing to the level or its save across ${PLAY_ROUNDS} play sessions, saving while playing`, () => {
    const editor = editorBuild();
    spawnPlace(editor);
    for (let round = 0; round < PLAY_ROUNDS; round++) {
      playEnter(editor);
      expect(levelNames(editor.world)).toEqual({ children: ['Floor'], outliner: ['Floor'] });
      expect(savedNames(editor.world)).toEqual(['Floor']);
      playExit(editor);
      expect(levelNames(editor.world)).toEqual({ children: ['Floor'], outliner: ['Floor'] });
      expect(savedNames(editor.world)).toEqual(['Floor']);
    }
    editor.system.dispose();
  });

  it(`does not grow the level when it is saved and opened again ${PLAY_ROUNDS} times`, () => {
    const editor = editorBuild();
    spawnPlace(editor);
    const deserializer = new SceneDeserializer();
    for (let round = 0; round < PLAY_ROUNDS; round++) {
      playEnter(editor);
      const saved = new SceneSerializer().serialize(editor.world);
      playExit(editor);
      deserializer.deserialize(saved, editor.world);
      expect(levelNames(editor.world)).toEqual({ children: ['Floor'], outliner: ['Floor'] });
    }
    expect(savedNames(editor.world)).toEqual(['Floor']);
    editor.system.dispose();
  });

  it('keeps the spawn figurine when a level is opened', () => {
    const editor = editorBuild();
    spawnPlace(editor);
    const figurines = editor.helpers.children.length;
    expect(figurines).toBeGreaterThan(0);
    new SceneDeserializer().deserialize(new SceneSerializer().serialize(editor.world), editor.world);
    expect(editor.helpers.children.length).toBe(figurines);
    playEnter(editor);
    playExit(editor);
    expect(editor.helpers.children.length).toBe(figurines);
    editor.system.dispose();
  });
});
