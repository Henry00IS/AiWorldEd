import { describe, expect, it, vi } from 'vitest';
import { ControllerAreaLayout } from '@/layout/area/controller_area_layout.js';
import { AreaSplitterOverlay } from '@/layout/area/area_splitter_overlay.js';
import { createSinglePerspectiveLayout, DEFAULT_AREA_IDS } from '@/layout/area/area_layout_presets.js';
import type { AreaSplitDirection } from '@/layout/area/area_split_direction.js';

/**
 * Creates a split controller with two panes above or beside a spanning pane.
 *
 * @param layer Pane host.
 * @param direction Spanning pane split axis.
 * @returns Live controller.
 */
function createController(layer: HTMLElement, direction: AreaSplitDirection): ControllerAreaLayout {
  const controller = new ControllerAreaLayout(layer, createSinglePerspectiveLayout());
  const original = DEFAULT_AREA_IDS.perspective;
  controller.splitArea(original, direction, 0.4);
  controller.splitArea(original, direction === 'vertical' ? 'horizontal' : 'vertical', 0.3);
  return controller;
}

/**
 * Dispatches a primary pointer event through DOM event listeners.
 *
 * @param target Event target.
 * @param type Pointer event name.
 * @param coordinate Normalized coordinate along both axes.
 * @param bounds Pane layer bounds.
 */
function dispatchPointer(target: EventTarget, type: string, coordinate: number, bounds: DOMRect): void {
  target.dispatchEvent(
    new MouseEvent(type, {
      bubbles: true,
      button: 0,
      clientX: bounds.left + bounds.width * coordinate,
      clientY: bounds.top + bounds.height * coordinate,
    }),
  );
}

/**
 * Asserts the spanning pane starts at the expected divider position.
 *
 * @param controller Layout controller.
 * @param direction Split axis.
 * @param coordinate Expected divider position.
 */
function expectDivider(controller: ControllerAreaLayout, direction: AreaSplitDirection, coordinate: number): void {
  const placements = controller.getPlacements();
  const spanning = placements.find((item) =>
    direction === 'vertical' ? item.rect.width === 1 : item.rect.height === 1,
  );
  expect(spanning).toBeDefined();
  expect(direction === 'vertical' ? spanning?.rect.y : spanning?.rect.x).toBeCloseTo(coordinate);
  expect(placements).toHaveLength(3);
}

/**
 * Exercises multiple moves while each move rebuilds the dragged DOM target.
 *
 * @param direction Split axis.
 * @param segment Which of the two border segments to drag.
 */
function exerciseDrag(direction: AreaSplitDirection, segment: number): void {
  const layer = document.createElement('div');
  const bounds = new DOMRect(20, 40, 1000, 800);
  vi.spyOn(layer, 'getBoundingClientRect').mockReturnValue(bounds);
  const controller = createController(layer, direction);
  const overlay = new AreaSplitterOverlay(layer, controller);
  controller.setOnLayoutChanged((placements) => overlay.rebuild(placements));
  overlay.rebuild(controller.getPlacements());
  try {
    dragSegment(layer, overlay, controller, direction, segment, bounds);
  } finally {
    overlay.dispose();
  }
  expect(layer.querySelector('.editor-area-splitter-host')).toBeNull();
}

/**
 * Drags a hit target and verifies geometry, callback, and listener cleanup.
 *
 * @param layer Pane layer.
 * @param overlay Splitter overlay.
 * @param controller Layout controller.
 * @param direction Split axis.
 * @param segment Border segment index.
 * @param bounds Pane layer bounds.
 */
function dragSegment(
  layer: HTMLElement,
  overlay: AreaSplitterOverlay,
  controller: ControllerAreaLayout,
  direction: AreaSplitDirection,
  segment: number,
  bounds: DOMRect,
): void {
  const cursor = direction === 'vertical' ? 'row-resize' : 'col-resize';
  const targets = [...layer.querySelectorAll<HTMLElement>('.editor-area-splitter')].filter(
    (target) => target.style.cursor === cursor,
  );
  expect(targets).toHaveLength(2);
  const target = targets[segment];
  if (!target) throw new Error('Missing resize target');
  const complete = vi.fn();
  overlay.setOnResized(complete);
  dispatchPointer(target, 'pointerdown', 0.4, bounds);
  for (const coordinate of [0.6, 0.3]) {
    dispatchPointer(window, 'pointermove', coordinate, bounds);
    expectDivider(controller, direction, coordinate);
  }
  dispatchPointer(window, 'pointerup', 0.3, bounds);
  expect(complete).toHaveBeenCalledOnce();
  dispatchPointer(window, 'pointermove', 0.8, bounds);
  expectDivider(controller, direction, 0.3);
}

describe.each<AreaSplitDirection>(['vertical', 'horizontal'])('splitter DOM interaction (%s)', (direction) => {
  it.each([0, 1])('drags junction segment %s through overlay rebuilds', (segment) => {
    exerciseDrag(direction, segment);
  });
});
