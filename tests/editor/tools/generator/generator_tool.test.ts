import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { EditorWindow } from '@/editor/window/editor_window.js';
import { BoundsTool } from '@/editor/tools/bounds_tool.js';
import { GeneratorTool } from '@/editor/tools/generator/generator_tool.js';
import type { EditorServices } from '@/editor/window/editor_services.js';
import type { GeneratorEditHost } from '@/editor/tools/generator/generator_edit_host.js';

/** Pane rectangle; the generator at the origin projects to its center. */
const PANE = { left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100, x: 0, y: 0 };

/**
 * Builds an editor in the Bounds tool with one pane and a host whose selection
 * is the given generator.
 *
 * @param selected Generator the host reports as selected.
 * @returns Editor, host spies and the click selection spy.
 */
function setup(selected: THREE.Object3D | null) {
  const pick = document.createElement('div');
  document.body.append(pick);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this === pick) return PANE as DOMRect;
    const x = parseFloat(this.style.left);
    const y = parseFloat(this.style.top);
    return { left: x - 20, right: x + 20, top: y - 10, bottom: y + 10, width: 40, height: 20, x, y } as DOMRect;
  });
  const camera = new THREE.OrthographicCamera(-2, 2, 1, -1, 0.1, 100);
  camera.position.set(0, 0, 10);
  camera.updateMatrixWorld();
  const state = { selected };
  const host: GeneratorEditHost = {
    selectedGenerator: () => state.selected,
    panes: () => [{ camera, pickElement: pick }],
    pickGenerator: vi.fn(),
    setEditing: vi.fn(),
  };
  const applyClick = vi.fn();
  const known: Partial<EditorServices> = {
    getGeneratorEditHost: () => host,
    applyObjectClickSelectionAtClientPoint: applyClick,
    getSelectedCount: () => (state.selected ? 1 : 0),
  };
  const services = new Proxy(known, {
    get: (target, key) => (key in target ? target[key as keyof EditorServices] : () => false),
  }) as EditorServices;
  const editor = new EditorWindow();
  editor.setServices(services);
  editor.validateTools();
  editor.userSwitchToBoundsTool();
  editor.onRepaint();
  return { editor, host, applyClick, state };
}

/**
 * Presses and releases the left button the way the browser and editor do.
 *
 * @param editor Editor window.
 * @param down Press point.
 * @param up Release point.
 */
async function click(editor: EditorWindow, down: [number, number], up: [number, number]): Promise<void> {
  [editor.lastPointerClientX, editor.lastPointerClientY] = down;
  document.dispatchEvent(new MouseEvent('pointerdown', { clientX: down[0], clientY: down[1], button: 0 }));
  editor.onMouseDown(0);
  [editor.lastPointerClientX, editor.lastPointerClientY] = up;
  document.dispatchEvent(new MouseEvent('pointerup', { clientX: up[0], clientY: up[1], button: 0 }));
  editor.onGlobalMouseUp(0);
  await new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Returns the shown Edit button, or null.
 *
 * @returns Button element or null.
 */
function editButton(): HTMLElement | null {
  const buttons = [...document.querySelectorAll<HTMLElement>('[aria-label="Edit Generator"]')];
  return buttons.find((button) => !button.hidden) ?? null;
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('Generator Edit button and Generator tool', () => {
  it('shows an Edit button at the center of the selected generator', () => {
    setup(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)));
    const button = editButton();
    expect(button?.textContent).toBe('Edit');
    expect([button?.style.left, button?.style.top]).toEqual(['100px', '50px']);
    expect(button?.style.pointerEvents).toBe('none');
  });

  it('shows no button without a selected generator', () => {
    setup(null);
    expect(editButton()).toBeNull();
  });

  it('enters the Generator tool on a click that does not move, without selecting', async () => {
    const { editor, host, applyClick } = setup(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)));
    await click(editor, [100, 50], [100, 50]);
    expect(editor.activeTool).toBeInstanceOf(GeneratorTool);
    expect(host.setEditing).toHaveBeenCalledWith(true);
    expect(applyClick).not.toHaveBeenCalled();
    expect(editButton()).toBeNull();
  });

  it('stays in Bounds and selects as before when the pointer moves at all', async () => {
    const { editor, applyClick } = setup(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)));
    await click(editor, [100, 50], [101, 50]);
    expect(editor.activeTool).toBeInstanceOf(BoundsTool);
    expect(applyClick).toHaveBeenCalledWith(101, 50, false, false);
  });

  it('returns to Bounds on Escape and restores the overlays', async () => {
    const { editor, host } = setup(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)));
    await click(editor, [100, 50], [100, 50]);
    expect(editor.onKeyDown('Escape', new KeyboardEvent('keydown', { code: 'Escape' }))).toBe(true);
    expect(editor.activeTool).toBeInstanceOf(BoundsTool);
    expect(host.setEditing).toHaveBeenLastCalledWith(false);
  });

  it('picks only generators on a still click and ignores drags in the Generator tool', async () => {
    const { editor, host, applyClick } = setup(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)));
    await click(editor, [100, 50], [100, 50]);
    await click(editor, [30, 20], [35, 20]);
    expect(host.pickGenerator).not.toHaveBeenCalled();
    await click(editor, [30, 20], [30, 20]);
    expect(host.pickGenerator).toHaveBeenCalledWith(30, 20);
    expect(applyClick).not.toHaveBeenCalled();
  });

  it('returns to Bounds once the generator is no longer selected', async () => {
    const { editor, state } = setup(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)));
    await click(editor, [100, 50], [100, 50]);
    state.selected = null;
    editor.onRepaint();
    expect(editor.activeTool).toBeInstanceOf(BoundsTool);
  });
});
