import type * as THREE from 'three';
import { widgetScreenProject } from '@/editor/widgets/screen_button/widget_screen_elements.js';
import type { EditorViewportPickContext } from '@/editor/window/editor_viewport_pick_context.js';
import type { ModifierStackPath } from '@/modifier/stack/widgets/modifier_stack_path_record.js';
import type { PathAsset } from '@/path/model/path_asset.js';
import { pathAssetHandleSet, type PathAssetHandle } from '@/path/model/path_asset_edit.js';
import type { PathEditSelectMode } from '@/path/edit/path_edit_selection.js';
import type { TransformModalAxis } from '@/transform/modal/transform_modal_axis.js';
import { ThemeCss } from '@/ui/theme/theme_ui_css_variables.js';
import { generatorPathScript, generatorPathWorld } from './generator_path_geometry.js';

/** A client rectangle. */
export interface GeneratorPathBox {
  /** Left edge. */
  left: number;
  /** Top edge. */
  top: number;
  /** Right edge. */
  right: number;
  /** Bottom edge. */
  bottom: number;
}

/**
 * A press in the Generator tool's path editing: a drag of the selected points
 * or of a handle, a box select, a Ctrl press that adds a point when it stays
 * still, or a click that only changes the selection.
 */
export interface GeneratorPathGrab {
  /** What the press does. */
  kind: 'points' | 'handle' | 'add' | 'marquee' | 'still';
  /** Path pressed on, as it was at the press; null for a box select. */
  path: ModifierStackPath | null;
  /** Point grabbed, the stretch of a handle, or the point a new one follows. */
  point: number;
  /** Handle grabbed, or null. */
  handle: PathAssetHandle | null;
  /** Points a point drag moves. */
  points: readonly number[];
  /** World point the drag runs through. */
  anchor: THREE.Vector3;
  /** Pane of the press. */
  pane: EditorViewportPickContext;
  /** How a box select changes the selection. */
  mode: PathEditSelectMode;
  /** True when a still release picks only the pressed point. */
  collapse: boolean;
  /** Client point of the press. */
  x: number;
  /** Client point of the press. */
  y: number;
  /** True once the pointer left the press point. */
  moved: boolean;
  /** Axis lock of a drag. */
  axis: TransformModalAxis;
}

/**
 * Returns a path after a drag moved the grabbed point to a world point: every
 * selected point moves by as much, or the grabbed handle goes there.
 *
 * @param grab Point or handle drag.
 * @param world World point the grabbed point or handle moves to.
 * @returns Moved path, or null for a press without a path.
 */
export function generatorPathDragged(grab: GeneratorPathGrab, world: THREE.Vector3): PathAsset | null {
  const path = grab.path;
  if (!path) return null;
  if (grab.handle) return pathAssetHandleSet(path.path, grab.point, grab.handle, generatorPathScript(path, world));
  const delta = world.clone().sub(grab.anchor);
  const points = path.path.points.map((each, index) =>
    grab.points.includes(index) ? generatorPathScript(path, generatorPathWorld(path, each).add(delta)) : each,
  );
  return { ...path.path, points };
}

/**
 * Finds the points drawn inside a client rectangle in a pane, of the first path
 * that has any, the paths taken in the order given.
 *
 * @param paths Path inputs, the preferred one first.
 * @param pane Pane.
 * @param box Client rectangle.
 * @returns Path and point indices, or null when none is inside.
 */
export function generatorPathBoxed(
  paths: readonly ModifierStackPath[],
  pane: EditorViewportPickContext,
  box: GeneratorPathBox,
): { path: ModifierStackPath; points: number[] } | null {
  for (const path of paths) {
    const points = path.path.points.flatMap((each, index) => {
      const screen = widgetScreenProject(generatorPathWorld(path, each), pane);
      const inside = screen.x >= box.left && screen.x <= box.right && screen.y >= box.top && screen.y <= box.bottom;
      return screen.visible && inside ? [index] : [];
    });
    if (points.length > 0) return { path, points };
  }
  return null;
}

/**
 * Returns the client rectangle between a press and the pointer.
 *
 * @param grab Press.
 * @param x Pointer client X.
 * @param y Pointer client Y.
 * @returns Rectangle.
 */
export function generatorPathBox(grab: GeneratorPathGrab, x: number, y: number): GeneratorPathBox {
  return {
    left: Math.min(grab.x, x),
    top: Math.min(grab.y, y),
    right: Math.max(grab.x, x),
    bottom: Math.max(grab.y, y),
  };
}

/**
 * Shows the box-select rectangle in a document, creating it on first use.
 *
 * @param doc Document of the pane.
 * @param box Client rectangle.
 * @returns Rectangle element.
 */
export function generatorPathMarqueeShow(doc: Document, box: GeneratorPathBox): HTMLElement {
  let element = doc.querySelector<HTMLElement>('[data-path-marquee]');
  if (!element) {
    element = doc.createElement('div');
    element.dataset['pathMarquee'] = 'true';
    Object.assign(element.style, GENERATOR_PATH_MARQUEE_STYLE);
    doc.body.append(element);
  }
  element.hidden = false;
  Object.assign(element.style, { left: `${box.left}px`, top: `${box.top}px` });
  Object.assign(element.style, { width: `${box.right - box.left}px`, height: `${box.bottom - box.top}px` });
  return element;
}

/** Inline style of the box-select rectangle. */
const GENERATOR_PATH_MARQUEE_STYLE: Partial<CSSStyleDeclaration> = {
  position: 'fixed',
  border: `1px dashed ${ThemeCss.accentColor}`,
  boxSizing: 'border-box',
  pointerEvents: 'none',
  zIndex: '6',
};
