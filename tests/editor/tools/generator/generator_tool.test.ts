import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { EditorWindow } from '@/editor/window/editor_window.js';
import { BoundsTool } from '@/editor/tools/bounds_tool.js';
import { GeneratorTool } from '@/editor/tools/generator/generator_tool.js';
import type { EditorServices } from '@/editor/window/editor_services.js';
import type { GeneratorEditHost } from '@/editor/tools/generator/generator_edit_host.js';
import type { ModifierStackPath } from '@/modifier/stack/widgets/modifier_stack_path_record.js';
import type { PathAsset } from '@/path/model/path_asset.js';
import { pathEditSelect, pathEditSelected } from '@/path/edit/path_edit_selection.js';
import type { ModifierStackSlider } from '@/modifier/stack/widgets/modifier_stack_slider_record.js';
import type { ModifierStackDraw } from '@/modifier/stack/widgets/modifier_stack_draw_record.js';
import type { ModifierStackButton } from '@/modifier/stack/widgets/modifier_stack_button_record.js';
import type { ModifierStackAim } from '@/modifier/stack/widgets/modifier_stack_aim_record.js';
import { ThemeCss } from '@/ui/theme/theme_ui_css_variables.js';
import { managerMouseCursor } from '@/input/manager_mouse_cursor.js';

/** Pane rectangle; the generator at the origin projects to its center. */
const PANE = { left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100, x: 0, y: 0 };

/**
 * Builds an editor in the Bounds tool with one pane and a host whose selection
 * is the given generator.
 *
 * @param selected Generator the host reports as selected.
 * @returns Editor, host spies, the click selection spy and the pane element.
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
  const state: {
    selected: THREE.Object3D | null;
    sliders: ModifierStackSlider[];
    paths: ModifierStackPath[];
    draws: ModifierStackDraw[];
    buttons: ModifierStackButton[];
    aims: ModifierStackAim[];
    orientation: THREE.Quaternion;
  } = { selected, sliders: [], paths: [], draws: [], buttons: [], aims: [], orientation: new THREE.Quaternion() };
  const host: GeneratorEditHost = {
    selectedEditable: () => state.selected,
    panes: () => [{ camera, pickElement: pick }],
    pickEditable: vi.fn(),
    setEditing: vi.fn(),
    sliders: () => state.sliders,
    paths: () => state.paths,
    draws: () => state.draws,
    buttons: () => state.buttons,
    press: vi.fn(),
    aims: () => state.aims,
    aim: vi.fn(),
    pathWrite: vi.fn((path: ModifierStackPath, asset: PathAsset) => {
      state.paths = state.paths.map((each) => (each.key === path.key ? { ...each, path: asset } : each));
    }),
    snapDistance: (distance, invert) => (invert ? distance : Math.round(distance * 2) / 2),
    snapAngle: (degrees, invert) => (invert ? degrees : Math.round(degrees / 15) * 15),
    axisOrientation: () => state.orientation,
    slide: vi.fn((slider: ModifierStackSlider, value: number) => {
      state.sliders = state.sliders.map((each) =>
        each.key === slider.key ? { ...each, value: Math.min(value, 1) } : each,
      );
    }),
    changeEnd: vi.fn(),
    changeCancel: vi.fn(),
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
  return { editor, host, applyClick, state, pick };
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
  pathEditSelect(null);
  managerMouseCursor.reset();
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
    expect(host.changeEnd).toHaveBeenCalledTimes(1);
    expect(host.changeCancel).not.toHaveBeenCalled();
    expect(editor.activeTool).toBeInstanceOf(GeneratorTool);
  });

  it('takes a slider drag back on Escape and stays in the Generator tool', async () => {
    const { editor, host, state } = setup(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)));
    await click(editor, [100, 50], [100, 50]);
    state.sliders = [slider()];
    editor.onRepaint();
    drag(editor, [100, 50], [124, 50]);
    expect(editor.onKeyDown('Escape', new KeyboardEvent('keydown', { code: 'Escape' }))).toBe(true);
    expect(host.changeCancel).toHaveBeenCalledTimes(1);
    expect(editor.activeTool).toBeInstanceOf(GeneratorTool);
  });

  it('types an exact value after a still click on a handle, as one undo step', async () => {
    const { editor, host, state } = setup(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)));
    await click(editor, [100, 50], [100, 50]);
    state.sliders = [{ ...slider(), value: 0.5 }];
    editor.onRepaint();
    expect(sliderHandle()?.textContent).toBe('Height 0.5');
    await click(editor, [125, 50], [125, 50]);
    const field = document.querySelector<HTMLInputElement>('input[aria-label="Height"]');
    expect(field?.value).toBe('0.5');
    expect(host.slide).not.toHaveBeenCalled();
    if (!field) return;
    field.value = '0.75';
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(host.slide).toHaveBeenCalledWith(expect.objectContaining({ key: 'a' }), 0.75);
    expect(host.changeEnd).toHaveBeenCalledTimes(1);
    expect(document.querySelector('input[aria-label="Height"]')).toBeNull();
    expect(editor.activeTool).toBeInstanceOf(GeneratorTool);
  });

  it('keeps a typed value inside Minimum and Maximum and lets Escape close the field', async () => {
    const { editor, host, state } = setup(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)));
    await click(editor, [100, 50], [100, 50]);
    state.sliders = [{ ...slider(), min: 0, max: 0.8 }];
    editor.onRepaint();
    await click(editor, [100, 50], [100, 50]);
    const field = document.querySelector<HTMLInputElement>('input[aria-label="Height"]');
    if (!field) throw new Error('no field');
    field.value = '-3';
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(host.slide).toHaveBeenLastCalledWith(expect.objectContaining({ key: 'a' }), 0);
    await click(editor, [100, 50], [100, 50]);
    const again = document.querySelector<HTMLInputElement>('input[aria-label="Height"]');
    if (!again) throw new Error('no field');
    again.value = 'abc';
    again.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(host.slide).toHaveBeenCalledTimes(1);
    again.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(document.querySelector('input[aria-label="Height"]')).toBeNull();
    expect(host.changeEnd).toHaveBeenCalledTimes(1);
  });

  it('draws a ruler line from the zero point to the handle', async () => {
    const { editor, state } = setup(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)));
    await click(editor, [100, 50], [100, 50]);
    state.sliders = [{ ...slider(), value: 1 }];
    editor.onRepaint();
    const line = [...document.querySelectorAll<HTMLElement>('[data-ruler]')].find((each) => !each.hidden);
    expect([line?.style.left, line?.style.top, line?.style.width]).toEqual(['100px', '50px', '50px']);
  });

  it('turns a dial handle about its axis and writes the angle under the pointer, snapped by the rotation step unless Shift turns it the other way', async () => {
    const { editor, host, state } = setup(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)));
    await click(editor, [100, 50], [100, 50]);
    state.sliders = [{ ...slider(), axis: new THREE.Vector3(0, 0, 1) }];
    editor.onRepaint();
    expect([sliderHandle()?.style.left, sliderHandle()?.style.top]).toEqual(['150px', '50px']);
    drag(editor, [150, 50], [101, 1]);
    expect(host.slide).toHaveBeenLastCalledWith(expect.objectContaining({ key: 'a' }), 90);
    editor.updateModifiersFromDomEvent({ shiftKey: true, ctrlKey: false, altKey: false, metaKey: false });
    [editor.lastPointerClientX, editor.lastPointerClientY] = [101, 2];
    editor.onGlobalMouseDrag(0, new THREE.Vector2(), new THREE.Vector2());
    expect(vi.mocked(host.slide).mock.lastCall?.[1]).toBeCloseTo(88.81, 1);
    editor.updateModifiersFromDomEvent({ shiftKey: false, ctrlKey: false, altKey: false, metaKey: false });
    state.sliders = [{ ...slider(), axis: new THREE.Vector3(0, 0, 1), value: 90 }];
    editor.onRepaint();
    expect([sliderHandle()?.style.left, sliderHandle()?.style.top]).toEqual(['100px', '0px']);
    editor.onGlobalMouseUp(0);
    expect(host.changeEnd).toHaveBeenCalledTimes(1);
  });

  it('drags the tip of a Widget Direction on the plane facing the camera, as one undo step', async () => {
    const { editor, host, state } = setup(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)));
    await click(editor, [100, 50], [100, 50]);
    state.aims = [aim()];
    editor.onRepaint();
    expect([aimHandle()?.style.left, aimHandle()?.style.top]).toEqual(['150px', '50px']);
    drag(editor, [150, 50], [100, 0]);
    const [moved, direction] = vi.mocked(host.aim).mock.calls.at(-1) ?? [];
    expect(moved?.key).toBe('d');
    expect(direction?.distanceTo(new THREE.Vector3(0, 1, 0))).toBeLessThan(1e-9);
    editor.onGlobalMouseUp(0);
    expect(host.changeEnd).toHaveBeenCalledTimes(1);
    drag(editor, [150, 50], [100, 0]);
    expect(editor.onKeyDown('Escape', new KeyboardEvent('keydown', { code: 'Escape' }))).toBe(true);
    expect(host.changeCancel).toHaveBeenCalledTimes(1);
  });

  it('leaves out the ruler of a handle that has none, as a Widget Point has', async () => {
    const { editor, state } = setup(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)));
    await click(editor, [100, 50], [100, 50]);
    state.sliders = [{ ...slider(), value: 1, ruler: false }];
    editor.onRepaint();
    expect(sliderHandle()).not.toBeNull();
    expect([...document.querySelectorAll<HTMLElement>('[data-ruler]')].find((each) => !each.hidden)).toBeUndefined();
  });

  it('keeps the part of a ruler that is in view when its handle or zero point is not', async () => {
    const { editor, state } = setup(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)));
    await click(editor, [100, 50], [100, 50]);
    const ruler = (): HTMLElement | undefined =>
      [...document.querySelectorAll<HTMLElement>('[data-ruler]')].find((each) => !each.hidden);
    state.sliders = [{ ...slider(), value: 10 }];
    editor.onRepaint();
    expect([ruler()?.style.left, ruler()?.style.top, ruler()?.style.width]).toEqual(['100px', '50px', '100px']);
    state.sliders = [{ ...slider(), origin: new THREE.Vector3(-10, 0, 0), value: 20 }];
    editor.onRepaint();
    expect([ruler()?.style.left, ruler()?.style.width]).toEqual(['0px', '200px']);
    state.sliders = [{ ...slider(), origin: new THREE.Vector3(-10, 5, 0), value: 20 }];
    editor.onRepaint();
    expect(ruler()).toBeUndefined();
  });

  it('shows a resize cursor along the handle and an orange dot (the Bounds hover colour) while the pointer is over it', async () => {
    const { editor, state, pick } = setup(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)));
    await click(editor, [100, 50], [100, 50]);
    state.sliders = [slider()];
    [editor.lastPointerClientX, editor.lastPointerClientY] = [102, 51];
    editor.onRepaint();
    managerMouseCursor.update();
    expect([pick?.style.cursor, sliderHandle()?.dataset['hover']]).toEqual(['ew-resize', 'true']);
    expect(sliderHandle()?.style.backgroundImage).toContain('rgb(232, 106, 23)');
    state.sliders = [{ ...slider(), direction: new THREE.Vector3(0, 1, 0) }];
    editor.onRepaint();
    managerMouseCursor.update();
    expect(pick?.style.cursor).toBe('ns-resize');
    [editor.lastPointerClientX, editor.lastPointerClientY] = [10, 10];
    editor.onRepaint();
    managerMouseCursor.update();
    expect([pick?.style.cursor, sliderHandle()?.dataset['hover']]).toEqual(['', 'false']);
  });

  it('draws a handle and its ruler in the colour the script picked', async () => {
    const { editor, state } = setup(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)));
    await click(editor, [100, 50], [100, 50]);
    state.sliders = [{ ...slider(), value: 1, color: '#3d8fd6' }];
    [editor.lastPointerClientX, editor.lastPointerClientY] = [10, 10];
    editor.onRepaint();
    const ruler = [...document.querySelectorAll<HTMLElement>('[data-ruler]')].find((each) => !each.hidden);
    expect(sliderHandle()?.style.backgroundImage).toContain('rgb(61, 143, 214)');
    expect(ruler?.style.borderTopColor).toBe('rgb(61, 143, 214)');
  });

  it('opens the typing field in the input colours of the theme', async () => {
    const { editor, state } = setup(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)));
    await click(editor, [100, 50], [100, 50]);
    state.sliders = [slider()];
    editor.onRepaint();
    await click(editor, [100, 50], [100, 50]);
    const field = document.querySelector<HTMLInputElement>('input[aria-label="Height"]');
    expect([field?.style.color, field?.style.background]).toEqual([ThemeCss.inputTextColor, ThemeCss.inputBackground]);
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

describe('Widget Button and Widget Toggle in the scene', () => {
  it('shows toggles as pressed or not, and a still click presses one without picking an object', async () => {
    const { editor, host, state } = setup(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)));
    await click(editor, [100, 50], [100, 50]);
    const toggle = { stepId: 's', kind: 'Toggle' as const, writes: 'ShowRails', color: '#3d8fd6' };
    state.buttons = [
      { ...toggle, key: 'a', label: 'Rails', on: true, at: new THREE.Vector3(1, 0, 0) },
      { ...toggle, key: 'b', label: 'Posts', on: false, at: new THREE.Vector3(-1, 0, 0) },
    ];
    editor.onRepaint();
    const shown = [...document.querySelectorAll<HTMLElement>('[data-widget-button]')].filter((each) => !each.hidden);
    expect(shown.map((each) => [each.textContent, each.getAttribute('aria-pressed')])).toEqual([
      ['Rails', 'true'],
      ['Posts', 'false'],
    ]);
    expect(shown[0]?.style.borderColor).toBe('rgb(61, 143, 214)');
    await click(editor, [50, 50], [50, 50]);
    expect(host.press).toHaveBeenCalledWith(expect.objectContaining({ key: 'b' }));
    expect(host.pickEditable).not.toHaveBeenCalled();
  });
});

describe('Debug Draw in the scene', () => {
  it('draws the lines and text of the selected object in Bounds and while editing', async () => {
    const { editor, state } = setup(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)));
    const line = { key: 'd', label: '', color: '#e0453a', at: new THREE.Vector3() };
    state.draws = [
      { ...line, segments: [[new THREE.Vector3(-1, 0, 0), new THREE.Vector3(1, 0, 0)]] },
      { ...line, key: 't', label: 'Hi', color: '', segments: [] },
    ];
    const shown = (selector: string): HTMLElement[] =>
      [...document.querySelectorAll<HTMLElement>(selector)].filter((each) => !each.hidden);
    editor.onRepaint();
    expect(shown('[data-debug-line]').map((each) => [each.style.width, each.style.borderTopColor])).toEqual([
      ['100px', 'rgb(224, 69, 58)'],
    ]);
    expect(shown('[data-debug-text]').map((each) => each.textContent)).toEqual(['Hi']);
    await click(editor, [100, 50], [100, 50]);
    expect(editor.activeTool).toBeInstanceOf(GeneratorTool);
    editor.onRepaint();
    expect(shown('[data-debug-line]')).toHaveLength(1);
    state.draws = [];
    editor.onRepaint();
    expect(shown('[data-debug-line]')).toHaveLength(0);
  });
});

describe('Generator tool paths', () => {
  /**
   * Enters the Generator tool on an object with one path from (0,0,0) to
   * (1,0,0), drawn at (100,50) and (150,50).
   *
   * @returns Setup parts.
   */
  async function pathSetup() {
    const parts = setup(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)));
    await click(parts.editor, [100, 50], [100, 50]);
    parts.state.paths = [railPath()];
    parts.editor.onRepaint();
    return parts;
  }

  it('draws each point and the line between them, and selects a point on a still click', async () => {
    const { editor, host } = await pathSetup();
    expect(pathPoints().map((each) => [each.style.left, each.style.top])).toEqual([
      ['100px', '50px'],
      ['150px', '50px'],
    ]);
    expect(document.querySelectorAll('[data-path-line]:not([hidden])').length).toBeGreaterThan(0);
    await click(editor, [150, 50], [150, 50]);
    expect(pathEditSelected()).toEqual({ stepId: 's', name: 'Rail', points: [1], segments: [] });
    editor.onRepaint();
    expect(pathPoints()[1]?.dataset['selected']).toBe('true');
    expect(host.pathWrite).not.toHaveBeenCalled();
    expect(host.pickEditable).not.toHaveBeenCalled();
  });

  it('drags a point on the plane facing the camera with grid snapping, as one undo step', async () => {
    const { editor, host, state } = await pathSetup();
    drag(editor, [150, 50], [174, 26]);
    expect(state.paths[0]?.path.points[1]).toEqual([1.5, 0.5, 0]);
    editor.onGlobalMouseUp(0);
    expect(host.changeEnd).toHaveBeenCalledTimes(1);
    expect(host.changeCancel).not.toHaveBeenCalled();
    expect(pathEditSelected()?.points).toEqual([1]);
  });

  it('takes a point drag back on Escape, and Escape then lets go of the selected point first', async () => {
    const { editor, host } = await pathSetup();
    drag(editor, [150, 50], [174, 26]);
    expect(editor.onKeyDown('Escape', new KeyboardEvent('keydown', { code: 'Escape' }))).toBe(true);
    expect(host.changeCancel).toHaveBeenCalledTimes(1);
    expect(editor.onKeyDown('Escape', new KeyboardEvent('keydown', { code: 'Escape' }))).toBe(true);
    expect(pathEditSelected()).toBeNull();
    expect(editor.activeTool).toBeInstanceOf(GeneratorTool);
  });

  it('adds a point after the selected one on a Ctrl click, snapped, and Delete removes it again', async () => {
    const { editor, host, state } = await pathSetup();
    await click(editor, [150, 50], [150, 50]);
    editor.updateModifiersFromDomEvent({ shiftKey: false, ctrlKey: true, altKey: false, metaKey: false });
    await click(editor, [151, 1], [151, 1]);
    editor.updateModifiersFromDomEvent({ shiftKey: false, ctrlKey: false, altKey: false, metaKey: false });
    expect(state.paths[0]?.path.points).toEqual([
      [0, 0, 0],
      [1, 0, 0],
      [1, 1, 0],
    ]);
    expect(pathEditSelected()?.points).toEqual([2]);
    expect(host.changeEnd).toHaveBeenCalledTimes(1);
    expect(host.pickEditable).not.toHaveBeenCalled();
    expect(editor.onKeyDown('Delete', new KeyboardEvent('keydown', { code: 'Delete' }))).toBe(true);
    expect(state.paths[0]?.path.points).toHaveLength(2);
    expect(host.changeEnd).toHaveBeenCalledTimes(2);
    expect(editor.onKeyDown('Delete', new KeyboardEvent('keydown', { code: 'Delete' }))).toBe(false);
  });
});

describe('Generator tool path selection and drags', () => {
  /**
   * Enters the Generator tool on an object with one path from (0,0,0) to
   * (1,0,0), drawn at (100,50) and (150,50).
   *
   * @returns Setup parts.
   */
  async function pathSetup() {
    const parts = setup(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)));
    await click(parts.editor, [100, 50], [100, 50]);
    parts.state.paths = [railPath()];
    parts.editor.onRepaint();
    return parts;
  }

  /**
   * Holds or releases Shift and Ctrl as the editor reads them.
   *
   * @param editor Editor window.
   * @param keys Keys held.
   */
  function hold(editor: EditorWindow, keys: { shift?: boolean; ctrl?: boolean }): void {
    editor.updateModifiersFromDomEvent({
      shiftKey: keys.shift === true,
      ctrlKey: keys.ctrl === true,
      altKey: false,
      metaKey: false,
    });
  }

  it('selects a stretch by clicking its line; Shift adds and Ctrl toggles points, as in the curve editor', async () => {
    const { editor } = await pathSetup();
    await click(editor, [125, 50], [125, 50]);
    expect(pathEditSelected()).toEqual({ stepId: 's', name: 'Rail', points: [], segments: [0] });
    editor.onRepaint();
    expect(document.querySelector('[data-path-line][data-selected="true"]:not([hidden])')).not.toBeNull();
    await click(editor, [100, 50], [100, 50]);
    expect(pathEditSelected()).toMatchObject({ points: [0], segments: [] });
    hold(editor, { shift: true });
    await click(editor, [150, 50], [150, 50]);
    expect(pathEditSelected()?.points).toEqual([0, 1]);
    hold(editor, { ctrl: true });
    await click(editor, [100, 50], [100, 50]);
    hold(editor, {});
    expect(pathEditSelected()?.points).toEqual([1]);
  });

  it('box-selects the points inside a drag on empty space', async () => {
    const { editor, host } = await pathSetup();
    drag(editor, [90, 40], [160, 60]);
    editor.onRepaint();
    expect(document.querySelector('[data-path-marquee]:not([hidden])')).not.toBeNull();
    editor.onGlobalMouseUp(0);
    expect(pathEditSelected()).toMatchObject({ points: [0, 1], segments: [] });
    expect(host.pathWrite).not.toHaveBeenCalled();
  });

  it('drags every selected point together, as one undo step', async () => {
    const { editor, host, state } = await pathSetup();
    await click(editor, [100, 50], [100, 50]);
    hold(editor, { shift: true });
    await click(editor, [150, 50], [150, 50]);
    hold(editor, {});
    drag(editor, [150, 50], [174, 26]);
    expect(state.paths[0]?.path.points).toEqual([
      [0.5, 0.5, 0],
      [1.5, 0.5, 0],
    ]);
    editor.onGlobalMouseUp(0);
    expect(host.changeEnd).toHaveBeenCalledTimes(1);
  });

  it('locks a point drag to the axis of X, Y or Z, and the same key again frees it', async () => {
    const { editor, state } = await pathSetup();
    drag(editor, [150, 50], [174, 26]);
    const key = (code: string): boolean => editor.onKeyDown(code, new KeyboardEvent('keydown', { code }));
    expect(key('KeyX')).toBe(true);
    expect(state.paths[0]?.path.points[1]).toEqual([1.5, 0, 0]);
    expect(key('KeyX')).toBe(true);
    expect(state.paths[0]?.path.points[1]).toEqual([1.5, 0.5, 0]);
    expect(key('KeyY')).toBe(true);
    expect(state.paths[0]?.path.points[1]).toEqual([1, 0.5, 0]);
    editor.onGlobalMouseUp(0);
    expect(key('KeyX')).toBe(false);
  });

  it('turns grid snapping the other way while Shift is held in a point or slider drag', async () => {
    const { editor, host, state } = await pathSetup();
    [editor.lastPointerClientX, editor.lastPointerClientY] = [150, 50];
    editor.onMouseDown(0);
    hold(editor, { shift: true });
    [editor.lastPointerClientX, editor.lastPointerClientY] = [174, 26];
    editor.onGlobalMouseDrag(0, new THREE.Vector2(), new THREE.Vector2());
    expect(state.paths[0]?.path.points[1]).toEqual([1.48, 0.48, 0]);
    editor.onGlobalMouseUp(0);
    state.paths = [];
    state.sliders = [slider()];
    editor.onRepaint();
    drag(editor, [100, 50], [137, 50]);
    expect(vi.mocked(host.slide).mock.lastCall?.[1]).toBeCloseTo(0.74);
    hold(editor, {});
  });

  it('turns grid snapping over at once when Shift goes down or up mid-drag, without a pointer move', async () => {
    const { editor, host, state } = await pathSetup();
    drag(editor, [150, 50], [174, 26]);
    expect(state.paths[0]?.path.points[1]).toEqual([1.5, 0.5, 0]);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift', shiftKey: true }));
    expect(state.paths[0]?.path.points[1]).toEqual([1.48, 0.48, 0]);
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Shift', shiftKey: false }));
    expect(state.paths[0]?.path.points[1]).toEqual([1.5, 0.5, 0]);
    editor.onGlobalMouseUp(0);
    state.paths = [];
    state.sliders = [slider()];
    editor.onRepaint();
    drag(editor, [100, 50], [137, 50]);
    expect(vi.mocked(host.slide).mock.lastCall?.[1]).toBe(0.5);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift', shiftKey: true }));
    expect(vi.mocked(host.slide).mock.lastCall?.[1]).toBeCloseTo(0.74);
    editor.onGlobalMouseUp(0);
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Shift', shiftKey: false }));
    expect(vi.mocked(host.slide).mock.lastCall?.[1]).toBeCloseTo(0.74);
  });

  it('locks to the axes of the transform space, as the transform gizmo does', async () => {
    const { editor, state } = await pathSetup();
    state.orientation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
    drag(editor, [150, 50], [174, 26]);
    editor.onKeyDown('KeyX', new KeyboardEvent('keydown', { code: 'KeyX' }));
    const point = state.paths[0]?.path.points[1] ?? [];
    expect(point.map((value) => Number(value.toFixed(6)))).toEqual([1, 0.5, 0]);
    editor.onGlobalMouseUp(0);
  });
});

/**
 * Returns a path input from (0,0,0) to (1,0,0) placed at the world origin.
 *
 * @returns Path input.
 */
function railPath(): ModifierStackPath {
  return {
    stepId: 's',
    key: 's:Rail',
    name: 'Rail',
    label: 'Rail',
    path: {
      points: [
        [0, 0, 0],
        [1, 0, 0],
      ],
      segments: [{ kind: 'Straight' }],
      closed: false,
    },
    frame: new THREE.Matrix4(),
  };
}

/**
 * Returns the shown path points.
 *
 * @returns Point elements.
 */
function pathPoints(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('[data-path-point-handle]')].filter((each) => !each.hidden);
}

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
    target: 'input',
    color: '',
    component: null,
    ruler: true,
    axis: null,
    origin: new THREE.Vector3(),
    direction: new THREE.Vector3(1, 0, 0),
    min: null,
    max: null,
  };
}

/**
 * Returns a Widget Direction at the origin pointing along X, writing Facing.
 *
 * @returns Arrow.
 */
function aim(): ModifierStackAim {
  return {
    stepId: 's',
    key: 'd',
    label: 'Facing',
    writes: 'Facing',
    color: '',
    origin: new THREE.Vector3(),
    direction: new THREE.Vector3(1, 0, 0),
    toScript: new THREE.Matrix3(),
  };
}

/**
 * Returns the shown Widget Direction handle, or null.
 *
 * @returns Handle element or null.
 */
function aimHandle(): HTMLElement | null {
  return [...document.querySelectorAll<HTMLElement>('[data-aim-handle]')].find((each) => !each.hidden) ?? null;
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
