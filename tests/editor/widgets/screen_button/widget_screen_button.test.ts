import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
  WidgetScreenButton,
  type WidgetScreenButtonFrame,
} from '@/editor/widgets/screen_button/widget_screen_button.js';

/** Test button set with fixed anchors that records clicked keys. */
class WidgetScreenButtonProbe extends WidgetScreenButton {
  /** Keys clicked so far. */
  readonly clicks: string[] = [];

  /**
   * Creates the probe.
   *
   * @param frame Frame returned every render.
   */
  constructor(private readonly frame: WidgetScreenButtonFrame) {
    super();
  }

  /**
   * Returns the fixed frame.
   *
   * @returns Frame.
   */
  protected override frameRead(): WidgetScreenButtonFrame {
    return this.frame;
  }

  /**
   * Records a click.
   *
   * @param key Clicked key.
   */
  protected override clicked(key: string): void {
    this.clicks.push(key);
  }
}

/**
 * Builds a probe over one 200 by 100 pane with buttons at the given points.
 *
 * @param points World points of the buttons, keyed by name.
 * @returns Probe after one render.
 */
function setup(points: Record<string, THREE.Vector3>): WidgetScreenButtonProbe {
  const pick = document.createElement('div');
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this === pick) return { left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100 } as DOMRect;
    const x = parseFloat(this.style.left);
    const y = parseFloat(this.style.top);
    return { left: x - 10, right: x + 10, top: y - 5, bottom: y + 5 } as DOMRect;
  });
  const camera = new THREE.OrthographicCamera(-2, 2, 1, -1, 0.1, 100);
  camera.position.set(0, 0, 10);
  camera.updateMatrixWorld();
  const anchors = Object.entries(points).map(([key, position]) => ({ key, label: key, title: key, position }));
  const probe = new WidgetScreenButtonProbe({ panes: [{ camera, pickElement: pick }], anchors });
  probe.onRender();
  return probe;
}

/**
 * Presses and releases the left button at client points.
 *
 * @param down Press point.
 * @param up Release point.
 */
async function click(down: [number, number], up: [number, number]): Promise<void> {
  document.dispatchEvent(new MouseEvent('pointerdown', { clientX: down[0], clientY: down[1], button: 0 }));
  document.dispatchEvent(new MouseEvent('pointerup', { clientX: up[0], clientY: up[1], button: 0 }));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('WidgetScreenButton', () => {
  it('reports the key of the button a still click lands on', async () => {
    const probe = setup({ Left: new THREE.Vector3(-1, 0, 0), Right: new THREE.Vector3(1, 0, 0) });
    await click([150, 50], [150, 50]);
    await click([50, 50], [50, 50]);
    expect(probe.clicks).toEqual(['Right', 'Left']);
  });

  it('ignores a release that moved or a press beside the buttons', async () => {
    const probe = setup({ Center: new THREE.Vector3(0, 0, 0) });
    await click([100, 50], [100, 51]);
    await click([20, 20], [20, 20]);
    expect(probe.clicks).toEqual([]);
  });

  it('hides a button whose point is outside the pane', () => {
    setup({ Far: new THREE.Vector3(5, 0, 0) });
    expect(document.querySelector<HTMLElement>('[aria-label="Far"]')?.hidden).toBe(true);
  });

  it('stops watching the document and removes its buttons when hidden, then watches again when shown', async () => {
    const added = vi.spyOn(document, 'addEventListener');
    const removed = vi.spyOn(document, 'removeEventListener');
    const probe = setup({ Center: new THREE.Vector3(0, 0, 0) });
    const listeners = added.mock.calls.map(([type, listener]) => [type, listener]);
    expect(listeners.map(([type]) => type)).toEqual(['pointerdown', 'pointermove', 'pointerup']);
    probe.hide();
    expect(removed.mock.calls.map(([type, listener]) => [type, listener])).toEqual(listeners);
    expect(document.querySelector('[aria-label="Center"]')).toBeNull();
    await click([100, 50], [100, 50]);
    expect(probe.clicks).toEqual([]);
    probe.onRender();
    await click([100, 50], [100, 50]);
    expect(probe.clicks).toEqual(['Center']);
  });

  it('stacks buttons that share one point into a tight list, each still clickable', async () => {
    const at = new THREE.Vector3(0, 0, 0);
    const probe = setup({ Shape: at, Place: at.clone(), Aim: at.clone() });
    const tops = ['Shape', 'Place', 'Aim'].map((key) =>
      parseFloat(document.querySelector<HTMLElement>(`[aria-label="${key}"]`)?.style.top ?? ''),
    );
    expect(tops[1]! - tops[0]!).toBe(tops[2]! - tops[1]!);
    expect(tops[1]! - tops[0]!).toBeGreaterThan(10);
    expect(tops[1]! - tops[0]!).toBeLessThan(30);
    await click([100, tops[2]!], [100, tops[2]!]);
    expect(probe.clicks).toEqual(['Aim']);
  });
});
