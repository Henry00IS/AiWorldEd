import { afterEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CommandStack } from '@/commands/command_stack.js';
import { SolidModel, SOLID_TRIANGLE_SOURCES_USERDATA_KEY } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { ControllerTextureAssignment } from '@/texture/controller/controller_texture_assignment.js';
import { ControllerTextureDrop, type TextureDropViewport } from '@/texture/drop/controller_texture_drop.js';
import { TEXTURE_BROWSER_DRAG_TYPE } from '@/texture/ui/browser/texture_browser_drag.js';
import type { TextureBrowserEntry } from '@/texture/library/texture_browser_entry.js';
import type { ManagerSelection } from '@/selection/object/manager_selection.js';
import type { ControllerFaceExtrusion } from '@/tools/face/controller_face_extrusion.js';

const TEXTURE_ID = 'folder/bricks.png';
const VIEW_SIZE = 600;

/** Everything one drop test works with. */
interface DropScene {
  model: SolidModel;
  brush: SolidBrushInstance;
  stack: CommandStack;
  element: HTMLElement;
  gated: THREE.Object3D[];
  statuses: string[];
  controller: ControllerTextureDrop;
  refuse: { value: boolean };
}

/**
 * Dropping a texture from the browser onto a viewport paints only the brush
 * face under the cursor, whatever the selection mode, as one undoable edit that
 * goes through the collaboration edit gate.
 */
describe('texture drop onto a face', () => {
  const scenes: DropScene[] = [];
  afterEach(() => {
    scenes.splice(0).forEach((scene) => scene.controller.dispose());
    document.body.innerHTML = '';
  });

  it('paints only the face under the cursor without face mode or a selection', () => {
    const scene = sceneBuild(scenes);
    const before = surfaceTextures(scene.brush);
    const event = textureDrop(scene.element, TEXTURE_ID);
    expect(event.defaultPrevented).toBe(true);
    const after = surfaceTextures(scene.brush);
    const changed = after.map((id, index) => (id === before[index] ? -1 : index)).filter((index) => index >= 0);
    expect(changed).toEqual([topSurfaceIndex(scene.model, scene.brush)]);
    expect(after[changed[0]!]).toBe(TEXTURE_ID);
  });

  it('is one undoable edit', () => {
    const scene = sceneBuild(scenes);
    const before = surfaceTextures(scene.brush);
    textureDrop(scene.element, TEXTURE_ID);
    expect(scene.stack.canUndo()).toBe(true);
    scene.stack.undo();
    expect(surfaceTextures(scene.brush)).toEqual(before);
    scene.stack.redo();
    expect(surfaceTextures(scene.brush)).toContain(TEXTURE_ID);
  });

  it('asks the collaboration edit gate for the painted brush first', () => {
    const scene = sceneBuild(scenes);
    textureDrop(scene.element, TEXTURE_ID);
    expect(scene.gated).toEqual([scene.brush.mesh]);
  });

  it('changes nothing when the edit gate refuses', () => {
    const scene = sceneBuild(scenes);
    scene.refuse.value = true;
    const before = surfaceTextures(scene.brush);
    textureDrop(scene.element, TEXTURE_ID);
    expect(surfaceTextures(scene.brush)).toEqual(before);
    expect(scene.stack.canUndo()).toBe(false);
  });

  it('reports a drop that misses every brush face', () => {
    const scene = sceneBuild(scenes);
    const before = surfaceTextures(scene.brush);
    textureDrop(scene.element, TEXTURE_ID, 5, 5);
    expect(surfaceTextures(scene.brush)).toEqual(before);
    expect(scene.statuses.at(-1)).toMatch(/face/i);
  });

  it('accepts texture drags over a viewport and ignores other drags', () => {
    const scene = sceneBuild(scenes);
    expect(dragEvent(scene.element, 'dragover', [TEXTURE_BROWSER_DRAG_TYPE], '').defaultPrevented).toBe(true);
    expect(dragEvent(scene.element, 'dragover', ['text/plain'], '').defaultPrevented).toBe(false);
  });
});

/**
 * Builds a box brush, a viewport looking straight down at it and the drop
 * controller.
 *
 * @param scenes Scenes to dispose after the test.
 * @returns Drop scene.
 */
function sceneBuild(scenes: DropScene[]): DropScene {
  const world = new THREE.Group();
  const model = new SolidModel('Drop');
  const brush = model.addBoxBrush(2, SolidOperation.Additive);
  world.add(model.root);
  world.updateMatrixWorld(true);
  const stack = new CommandStack(32);
  const element = viewportElement();
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
  camera.position.set(0, 6, 0);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  const viewport: TextureDropViewport = { getContentElement: () => element, getCamera: () => camera };
  const assignment = new ControllerTextureAssignment(
    null as unknown as ManagerSelection,
    null as unknown as ControllerFaceExtrusion,
    stack,
  );
  const gated: THREE.Object3D[] = [];
  const statuses: string[] = [];
  const refuse = { value: false };
  const controller = new ControllerTextureDrop(document, {
    world,
    viewports: () => [viewport],
    entry: (id) => ({ id, displayName: 'Bricks' }) as TextureBrowserEntry,
    assignment,
    gate: (object, apply) => {
      gated.push(object);
      if (!refuse.value) apply();
    },
    status: (message) => statuses.push(message),
  });
  const scene = { model, brush, stack, element, gated, statuses, controller, refuse };
  scenes.push(scene);
  return scene;
}

/**
 * Creates a square viewport content element at the page origin.
 *
 * @returns Element.
 */
function viewportElement(): HTMLElement {
  const element = document.createElement('div');
  Object.defineProperty(element, 'getBoundingClientRect', {
    value: () => ({ left: 0, top: 0, right: VIEW_SIZE, bottom: VIEW_SIZE, width: VIEW_SIZE, height: VIEW_SIZE }),
  });
  document.body.appendChild(element);
  return element;
}

/**
 * Drops a browser texture on an element.
 *
 * @param element Drop target.
 * @param textureId Dragged texture id.
 * @param clientX Pointer x; the viewport center by default.
 * @param clientY Pointer y; the viewport center by default.
 * @returns The dispatched event.
 */
function textureDrop(element: HTMLElement, textureId: string, clientX = VIEW_SIZE / 2, clientY = VIEW_SIZE / 2): Event {
  return dragEvent(element, 'drop', [TEXTURE_BROWSER_DRAG_TYPE], textureId, clientX, clientY);
}

/**
 * Dispatches a cancelable drag event with drag data.
 *
 * @param element Event target.
 * @param type Event type.
 * @param types Drag data types.
 * @param data Data returned for the texture type.
 * @param clientX Pointer x.
 * @param clientY Pointer y.
 * @returns The dispatched event.
 */
function dragEvent(
  element: HTMLElement,
  type: string,
  types: string[],
  data: string,
  clientX = VIEW_SIZE / 2,
  clientY = VIEW_SIZE / 2,
): Event {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY });
  const getData = (format: string) => (format === TEXTURE_BROWSER_DRAG_TYPE ? data : '');
  Object.defineProperty(event, 'dataTransfer', { value: { types, getData, dropEffect: 'none' } });
  element.dispatchEvent(event);
  return event;
}

/**
 * Lists the texture of every brush surface.
 *
 * @param brush Brush.
 * @returns Texture ids by surface index.
 */
function surfaceTextures(brush: SolidBrushInstance): string[] {
  return Array.from({ length: 6 }, (_, index) => brush.getSurfaceTextureId(index));
}

/**
 * Finds the brush surface that faces up in the result mesh.
 *
 * @param model Solid model.
 * @param brush Brush.
 * @returns Surface index.
 */
function topSurfaceIndex(model: SolidModel, brush: SolidBrushInstance): number {
  const mesh = model.getResultMesh();
  const sources = mesh.userData[SOLID_TRIANGLE_SOURCES_USERDATA_KEY] as Array<{
    brushId: string;
    surfaceIndex: number;
  }>;
  const geometry = mesh.geometry.toNonIndexed();
  const position = geometry.getAttribute('position');
  const triangle = new THREE.Triangle();
  const normal = new THREE.Vector3();
  for (let index = 0; index < sources.length; index++) {
    triangle.setFromAttributeAndIndices(position, index * 3, index * 3 + 1, index * 3 + 2).getNormal(normal);
    if (normal.y > 0.99 && sources[index]?.brushId === brush.id) return sources[index]!.surfaceIndex;
  }
  return -1;
}
