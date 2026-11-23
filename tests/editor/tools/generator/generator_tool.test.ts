import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { EditorWindow } from '@/editor/window/editor_window.js';
import { BoundsTool } from '@/editor/tools/bounds_tool.js';
import { GeneratorTool } from '@/editor/tools/generator/generator_tool.js';
import type { EditorServices } from '@/editor/window/editor_services.js';
import type { GeneratorEditHost } from '@/editor/tools/generator/generator_edit_host.js';
import type { ModifierStackSlider } from '@/modifier/stack/widgets/modifier_stack_sliders.js';

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
  const state: { selected: THREE.Object3D | null; sliders: ModifierStackSlider[] } = { selected, sliders: [] };
  const host: GeneratorEditHost = {
    selectedEditable: () => state.selected,
    panes: () => [{ camera, pickElement: pick }],
    pickEditable: vi.fn(),
    setEditing: vi.fn(),
    sliders: () => state.sliders,
    snapDistance: (distance) => Math.round(distance * 2) / 2,
    slide: vi.fn((slider: ModifierStackSlider, value: number) => {
      state.sliders = state.sliders.map((each) =>
        each.key === slider.key ? { ...each, value: Math.min(value, 1) } : each,
      );
    }),
    slideEnd: vi.fn(),
    slideCancel: vi.fn(),
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
  const buttons = [...document.querySelectorAll<HTMLElement>('[aria-label="Edit Widgets"]')];
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

  it('stays in Bounds when the pointer moves away and comes back before the release', async () => {
    const { editor } = setup(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)));
    [editor.lastPointerClientX, editor.lastPointerClientY] = [100, 50];
    document.dispatchEvent(new MouseEvent('pointerdown', { clientX: 100, clientY: 50, button: 0 }));
    editor.onMouseDown(0);
    document.dispatchEvent(new MouseEvent('pointermove', { clientX: 104, clientY: 50 }));
    document.dispatchEvent(new MouseEvent('pointermove', { clientX: 100, clientY: 50 }));
    document.dispatchEvent(new MouseEvent('pointerup', { clientX: 100, clientY: 50, button: 0 }));
    editor.onGlobalMouseUp(0);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(editor.activeTool).toBeInstanceOf(BoundsTool);
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
    expect(host.pickEditable).not.toHaveBeenCalled();
    await click(editor, [30, 20], [30, 20]);
    expect(host.pickEditable).toHaveBeenCalledWith(30, 20);
    expect(applyClick).not.toHaveBeenCalled();
  });

  it('returns to Bounds once the generator is no longer selected', async () => {
    const { editor, state } = setup(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)));
    await click(editor, [100, 50], [100, 50]);
    state.selected = null;
    editor.onRepaint();
    expect(editor.activeTool).toBeInstanceOf(BoundsTool);
  });

  it('drags a slider with grid snapping, then keeps the value the script allowed in one undo step', async () => {
    const { editor, host, state } = setup(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)));
    await click(editor, [100, 50], [100, 50]);
    state.sliders = [slider()];
    editor.onRepaint();
    expect(sliderHandle()?.style.left).toBe('100px');
    drag(editor, [100, 50], [174, 50]);
    expect(host.slide).toHaveBeenCalledWith(expect.objectContaining({ key: 'a' }), 1.5);
    editor.onRepaint();
    expect(sliderHandle()?.style.left).toBe('150px');
    editor.onGlobalMouseUp(0);
    expect(host.slide).toHaveBeenLastCalledWith(expect.objectContaining({ value: 1 }), 1);
    expect(host.slideEnd).toHaveBeenCalledTimes(1);
    expect(host.slideCancel).not.toHaveBeenCalled();
    expect(editor.activeTool).toBeInstanceOf(GeneratorTool);
  });

  it('takes a slider drag back on Escape and stays in the Generator tool', async () => {
    const { editor, host, state } = setup(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)));
    await click(editor, [100, 50], [100, 50]);
    state.sliders = [slider()];
    editor.onRepaint();
    drag(editor, [100, 50], [124, 50]);
    expect(editor.onKeyDown('Escape', new KeyboardEvent('keydown', { code: 'Escape' }))).toBe(true);
    expect(host.slideCancel).toHaveBeenCalledTimes(1);
    expect(editor.activeTool).toBeInstanceOf(GeneratorTool);
  });

  it('never grabs a slider that writes nothing', async () => {
    const { editor, host, state } = setup(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)));
    await click(editor, [100, 50], [100, 50]);
    state.sliders = [{ ...slider(), writes: '' }];
    editor.onRepaint();
    drag(editor, [100, 50], [174, 50]);
    expect(host.slide).not.toHaveBeenCalled();
  });
});

/**
 * Returns a slider along X at the origin, at value 0, writing Height.
 *
 * @returns Slider.
 */
function slider(): ModifierStackSlider {
  return {
    stepId: 's',
    key: 'a',
    label: 'Height',
    value: 0,
    writes: 'Height',
    origin: new THREE.Vector3(),
    direction: new THREE.Vector3(1, 0, 0),
    min: null,
    max: null,
  };
}

/**
 * Returns the shown slider handle, or null.
 *
 * @returns Handle element or null.
 */
function sliderHandle(): HTMLElement | null {
  return [...document.querySelectorAll<HTMLElement>('[role="slider"]')].find((each) => !each.hidden) ?? null;
}

/**
 * Presses the left button and drags the pointer, without releasing.
 *
 * @param editor Editor window.
 * @param from Press point.
 * @param to Pointer point after the drag.
 */
function drag(editor: EditorWindow, from: [number, number], to: [number, number]): void {
  [editor.lastPointerClientX, editor.lastPointerClientY] = from;
  editor.onMouseDown(0);
  [editor.lastPointerClientX, editor.lastPointerClientY] = to;
  editor.onGlobalMouseDrag(0, new THREE.Vector2(), new THREE.Vector2());
}
