import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { PLAYER_SYSTEM_SPAWN_SET_STATUS, PlayerSystem, type PlayerSystemHost } from '@/player/player_system.js';
import type { ManagerInput } from '@/input/manager_input.js';
import type { Viewport3D } from '@/viewports/core/viewport_3d.js';
import {
  playerCharacterLoadModelFromArrayBuffer,
  playerCharacterResetModelLoader,
} from '@/player/character/player_character_model_loader.js';

/** Perspective pane stub with its toolbar and the figurine button put on it. */
interface PaneStub {
  viewport: Viewport3D;
  buttons: HTMLElement[];
}

/**
 * Builds a perspective pane stub inside a document at a client rect.
 *
 * @param ownerDocument Document that hosts the pane.
 * @param rect Client rect of the pane content.
 * @param world World group shared by all panes.
 * @returns Pane stub.
 */
function paneStub(ownerDocument: Document, rect: DOMRect, world: THREE.Group): PaneStub {
  const camera = new THREE.PerspectiveCamera(60, rect.width / rect.height, 0.1, 1000);
  camera.position.set(0, 5, 5);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  const content = ownerDocument.createElement('div');
  content.getBoundingClientRect = () => rect;
  const toolbarElement = ownerDocument.createElement('div');
  const buttons: HTMLElement[] = [];
  const toolbar = {
    getElement: () => toolbarElement,
    insertControlAfterTitle: (button: HTMLElement) => buttons.push(button),
  };
  const viewport = {
    getCamera: () => camera,
    getContentElement: () => content,
    getWorldGroup: () => world,
    getViewportToolbar: () => toolbar,
  };
  return { viewport: viewport as unknown as Viewport3D, buttons };
}

/**
 * Opens a second browsing context that stands in for a detached window.
 *
 * @returns Window of the detached context.
 */
function detachedWindow(): Window & typeof globalThis {
  const frame = document.createElement('iframe');
  document.body.appendChild(frame);
  const frameWindow = frame.contentWindow;
  if (frameWindow === null) throw new Error('iframe without window');
  return frameWindow as Window & typeof globalThis;
}

/**
 * Builds the player system over a main pane and a detached pane.
 *
 * @param popup Detached window.
 * @param shown Collected status messages.
 * @returns Detached pane stub.
 */
function systemWithDetachedPane(popup: Window, shown: string[]): PaneStub {
  const world = new THREE.Group();
  const helpers = new THREE.Group();
  const main = paneStub(document, new DOMRect(0, 0, 100, 100), world);
  const detached = paneStub(popup.document, new DOMRect(400, 300, 200, 200), world);
  const host: PlayerSystemHost = {
    worldRoot: world,
    inputManager: {} as ManagerInput,
    getEditorWindow: () => null,
    getPerspectiveViewports: () => [main.viewport, detached.viewport],
    getInteractiveViewports: () => [],
    showStatusMessage: (message) => shown.push(message),
    helperAdd: (object) => helpers.add(object),
    helperRemove: (object) => helpers.remove(object),
  };
  new PlayerSystem(host);
  return detached;
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

/** The figurine can be dropped into the perspective panes of detached windows. */
describe('PlayerSystem detached figurine placement', () => {
  it('places the spawn when the figurine is dragged into a detached perspective pane', () => {
    const popup = detachedWindow();
    const shown: string[] = [];
    const detached = systemWithDetachedPane(popup, shown);
    const button = detached.buttons[0];
    if (button === undefined) throw new Error('detached pane has no figurine button');
    expect(button.ownerDocument).toBe(popup.document);
    const init = { bubbles: true, button: 0, view: popup, clientX: 500, clientY: 400 };
    button.dispatchEvent(new popup.MouseEvent('pointerdown', init));
    popup.dispatchEvent(new popup.MouseEvent('pointermove', init));
    popup.dispatchEvent(new popup.MouseEvent('pointerup', init));
    expect(shown).toContain(PLAYER_SYSTEM_SPAWN_SET_STATUS);
  });

  it('ignores a drop outside every pane of the window that owns the drag', () => {
    const popup = detachedWindow();
    const shown: string[] = [];
    const detached = systemWithDetachedPane(popup, shown);
    const init = { bubbles: true, button: 0, view: popup, clientX: 50, clientY: 50 };
    detached.buttons[0]?.dispatchEvent(new popup.MouseEvent('pointerdown', init));
    popup.dispatchEvent(new popup.MouseEvent('pointerup', init));
    expect(shown).not.toContain(PLAYER_SYSTEM_SPAWN_SET_STATUS);
  });
});
