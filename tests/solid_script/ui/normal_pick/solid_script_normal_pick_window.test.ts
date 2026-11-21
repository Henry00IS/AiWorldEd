import * as THREE from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import type { RenderSurface } from '@/viewports/shared/render_surface.js';
import { solidScriptCommands } from '@/solid_script/commands/solid_script_command_catalog.js';
import { solidScriptConfiguratorFieldBuild } from '@/solid_script/ui/solid_script_configurator_fields.js';
import { SolidScriptNormalPickWindow } from '@/solid_script/ui/normal_pick/solid_script_normal_pick_window.js';
import { SOLID_SCRIPT_NORMAL_PICK_VIEW } from '@/solid_script/ui/normal_pick/solid_script_normal_pick_view.js';
import {
  solidScriptNormalPickFaces,
  solidScriptNormalPickText,
} from '@/solid_script/ui/normal_pick/solid_script_normal_pick_model.js';

/** Frames a fake surface drew. */
let drawn = 0;

/**
 * Creates a surface that draws nothing, as tests have no WebGL.
 *
 * @param host Element it fills.
 * @returns Surface.
 */
function fakeSurface(host: HTMLElement): RenderSurface {
  const canvas = document.createElement('canvas');
  host.append(canvas);
  return {
    getRenderer: () => ({}) as THREE.WebGLRenderer,
    getCanvas: () => canvas,
    getWorkspaceElement: () => host,
    getLogicalSize: () => ({ width: 300, height: 240 }),
    resize: () => undefined,
    syncSizeFromWorkspace: () => undefined,
    renderPanes: () => {
      drawn++;
    },
    dispose: () => undefined,
  };
}

/**
 * Gives an element a fixed box on the page.
 *
 * @param element Element.
 */
function sized(element: HTMLElement): void {
  element.setPointerCapture = () => undefined;
  element.releasePointerCapture = () => undefined;
  element.hasPointerCapture = () => false;
  element.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 300, height: 240, right: 300, bottom: 240, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
}

/**
 * Opens a picker whose pick lands in a list.
 *
 * @param written Picks.
 * @returns Window root and its viewport.
 */
function open(written: string[]): { root: HTMLElement; view: HTMLElement } {
  const root = document.createElement('div');
  document.body.append(root);
  const viewOf = (): HTMLElement => document.querySelector<HTMLElement>('[data-normal-pick-view]')!;
  new SolidScriptNormalPickWindow({
    host: root,
    parent: null,
    write: (text) => written.push(text),
    surface: (host) => {
      sized(host);
      return fakeSurface(host);
    },
  }).show();
  return { root: document.querySelector<HTMLElement>('[data-solid-script-normal-pick]')!, view: viewOf() };
}

/**
 * Sends a pointer event to an element.
 *
 * @param element Target.
 * @param type Event type.
 * @param x Client x.
 * @param y Client y.
 */
function pointer(element: HTMLElement, type: string, x: number, y: number): void {
  const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 });
  Object.assign(event, { pointerId: 1, pointerType: 'mouse' });
  element.dispatchEvent(event);
}

/**
 * The face a ray from the middle of the shape outwards along a view direction
 * leaves through: the one whose plane it meets first.
 *
 * @param view Direction towards the viewer.
 * @returns Text of that face.
 */
function faceSeenFrom(view: THREE.Vector3): string {
  const unit = view.clone().normalize();
  let best = { text: '', distance: Infinity };
  for (const face of solidScriptNormalPickFaces()) {
    const center = face.loop.reduce((sum, point) => sum.add(point), new THREE.Vector3()).divideScalar(face.loop.length);
    const middle = solidScriptNormalPickFaces()
      .flatMap((entry) => entry.loop)
      .reduce((sum, point) => sum.add(point), new THREE.Vector3())
      .divideScalar(solidScriptNormalPickFaces().flatMap((entry) => entry.loop).length);
    const along = face.direction.unit.dot(unit);
    if (along <= 0) continue;
    const distance = center.clone().sub(middle).dot(face.direction.unit) / along;
    if (distance < best.distance) best = { text: solidScriptNormalPickText(face.direction), distance };
  }
  return best.text;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('Pick Normal window', () => {
  it('draws the shape over the grid, and a click on the face in the middle writes its direction', () => {
    const written: string[] = [];
    drawn = 0;
    const { root, view } = open(written);
    expect(root.getAttribute('aria-label')).toBe('Pick Normal');
    expect(drawn).toBeGreaterThan(0);
    pointer(view, 'pointermove', 150, 120);
    const seen = faceSeenFrom(SOLID_SCRIPT_NORMAL_PICK_VIEW);
    expect(root.textContent).toContain(`: ${seen}`);
    pointer(view, 'pointerdown', 150, 120);
    pointer(view, 'pointerup', 150, 120);
    expect(written).toEqual([seen]);
    expect(root.isConnected).toBe(false);
  });

  it('orbits on a drag instead of picking, and closes on Escape without writing', () => {
    const written: string[] = [];
    const { root, view } = open(written);
    pointer(view, 'pointerdown', 150, 120);
    pointer(view, 'pointermove', 230, 120);
    pointer(view, 'pointerup', 230, 120);
    expect(written).toEqual([]);
    expect(root.isConnected).toBe(true);
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(root.isConnected).toBe(false);
    expect(written).toEqual([]);
  });

  it('is offered on a direction field, and writes the picked normal into it', () => {
    const clip = solidScriptCommands.find((command) => command.id === 'clip');
    const normal = clip?.parameters.find((entry) => entry.key === 'normal');
    const opened: ((text: string) => void)[] = [];
    const field = solidScriptConfiguratorFieldBuild(normal!, '0, 1, 0', () => undefined, {
      names: [],
      extra: [],
      normal: (write) => opened.push(write),
    });
    document.body.append(field.element);
    const input = field.element.querySelector<HTMLInputElement>('input[type="text"]')!;
    input.focus();
    input.setSelectionRange(7, 7);
    input.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const rows = [...document.querySelectorAll<HTMLElement>('[role="option"]')];
    const pick = rows.find((row) => row.textContent?.startsWith('Pick Normal…'));
    expect(pick).toBeTruthy();
    pick!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(opened).toHaveLength(1);
    opened[0]!('1, 1, 0');
    expect(field.read()).toBe('1, 1, 0');
  });

  it('is not offered on a field that takes no direction', () => {
    const scale = solidScriptCommands.find((command) => command.id === 'scale_to');
    const to = scale?.parameters.find((entry) => entry.key === 'to');
    const field = solidScriptConfiguratorFieldBuild(to!, '2, 2, 2', () => undefined, {
      names: [],
      extra: [],
      normal: () => undefined,
    });
    document.body.append(field.element);
    const input = field.element.querySelector<HTMLInputElement>('input[type="text"]')!;
    input.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(
      [...document.querySelectorAll('[role="option"]')].some((row) => row.textContent?.startsWith('Pick Normal')),
    ).toBe(false);
  });
});
