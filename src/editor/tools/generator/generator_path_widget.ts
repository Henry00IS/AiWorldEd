import type * as THREE from 'three';
import { Widget } from '@/editor/widgets/widget.js';
import { WidgetScreenElements } from '@/editor/widgets/screen_button/widget_screen_elements.js';
import type { EditorViewportPickContext } from '@/editor/window/editor_viewport_pick_context.js';
import type { ModifierStackPath } from '@/modifier/stack/widgets/modifier_stack_path_record.js';
import {
  pathAssetHandleSet,
  pathAssetPointInsert,
  pathAssetPointMove,
  pathAssetPointRemove,
  type PathAssetHandle,
} from '@/path/model/path_asset_edit.js';
import { pathEditSelect, pathEditSelected } from '@/path/edit/path_edit_selection.js';
import type { GeneratorEditHost } from './generator_edit_host.js';
import { generatorPathPlanePoint, generatorPathScript, generatorPathWorld } from './generator_path_geometry.js';
import {
  generatorPathDraw,
  generatorPathElementCreate,
  generatorPathHit,
  generatorPathPicked,
} from './generator_path_draw.js';

/** Pointer travel in pixels below which a press and release is a still click. */
const GENERATOR_PATH_STILL_PX = 2;

/** A press on a point or handle, or a Ctrl press that adds a point. */
interface GeneratorPathGrab {
  /** Path pressed on. */
  path: ModifierStackPath;
  /** Point pressed, the stretch of a handle, or the point a new one follows. */
  point: number;
  /** Handle pressed, or null for a point. */
  handle: PathAssetHandle | null;
  /** True for a Ctrl press that adds a point. */
  add: boolean;
  /** World point the drag plane runs through. */
  anchor: THREE.Vector3;
  /** Pane of the press. */
  pane: EditorViewportPickContext;
  /** Client point of the press. */
  x: number;
  /** Client point of the press. */
  y: number;
  /** True once the pointer left the press point. */
  moved: boolean;
}

/**
 * The paths of the object being edited. Every point is drawn on the line of its
 * path. A still click picks a point, whose position and stretch settings the
 * inspector then shows; dragging a point, or a handle of the picked point's
 * stretch, moves it on the grid plane facing the camera with grid snapping, as
 * one undo step. Ctrl+Click adds a point after the picked one, Delete removes
 * the picked point, and Escape takes back a drag or lets go of the point.
 */
export class GeneratorPathWidget extends Widget {
  /** Point and handle dots by pane and key. */
  private readonly dots = new WidgetScreenElements((doc) => generatorPathElementCreate(doc, false));
  /** Line pieces by pane and key. */
  private readonly lines = new WidgetScreenElements((doc) => generatorPathElementCreate(doc, true));
  /** Press in progress, or null. */
  private grab: GeneratorPathGrab | null = null;

  /** Draws every path of this frame and hides the rest. */
  override onRender(): void {
    const host = this.host();
    const shown = new Set<HTMLElement>();
    for (const pane of host?.panes() ?? [])
      for (const path of host?.paths() ?? []) generatorPathDraw(this.dots, this.lines, pane, path, shown);
    this.dots.hideOthers(shown);
    this.lines.hideOthers(shown);
  }

  /**
   * Grabs a point or handle under a left press, or starts adding a point on a
   * Ctrl press; a press elsewhere lets go of the picked point.
   *
   * @param button Mouse button index.
   */
  override onMouseDown(button: number): void {
    const editor = this.editor;
    const host = this.host();
    if (button !== 0 || !editor || !host || this.grab) return;
    const [x, y] = [editor.lastPointerClientX, editor.lastPointerClientY];
    const hit = generatorPathHit(host, x, y);
    const add = !hit && editor.getLatchedModifierFlags()?.ctrlKey === true ? this.addTarget(host, x, y) : null;
    const grab = hit ?? add;
    if (!grab) {
      if (pathEditSelected()) pathEditSelect(null);
      return;
    }
    this.grab = { ...grab, x, y, moved: false };
    if (!grab.add && grab.handle === null)
      pathEditSelect({ stepId: grab.path.stepId, name: grab.path.name, point: grab.point });
    this.latchWantsActiveFromGizmoState(true);
  }

  /** Moves the grabbed point or handle to the grid point under the pointer. */
  override onGlobalMouseDrag(): void {
    const grab = this.grab;
    const host = this.host();
    if (!grab || !host || !this.editor) return;
    const { lastPointerClientX: x, lastPointerClientY: y } = this.editor;
    if (Math.hypot(x - grab.x, y - grab.y) > GENERATOR_PATH_STILL_PX) grab.moved = true;
    if (grab.add || !grab.moved) return;
    const world = generatorPathPlanePoint(grab.pane, x, y, grab.anchor, (value) => host.snapDistance(value));
    if (!world) return;
    const point = generatorPathScript(grab.path, world);
    const start = grab.path.path;
    host.pathWrite(
      grab.path,
      grab.handle
        ? pathAssetHandleSet(start, grab.point, grab.handle, point)
        : pathAssetPointMove(start, grab.point, point),
    );
  }

  /**
   * Ends a press: a drag becomes one undo step, and a still Ctrl click adds a
   * point.
   *
   * @param button Mouse button index.
   */
  override onGlobalMouseUp(button: number): void {
    const grab = this.grab;
    const host = this.host();
    if (button !== 0 || !grab || !host) return;
    this.grabStop();
    if (grab.add && !grab.moved) this.pointAdd(host, grab);
    else if (grab.moved && !grab.add) host.changeEnd();
  }

  /**
   * Handles Escape, which takes back a drag or else lets go of the picked
   * point, and Delete, which removes the picked point.
   *
   * @param keyCode Key code.
   * @returns True when the key was used.
   */
  override onKeyDown(keyCode: string): boolean {
    const host = this.host();
    if (keyCode === 'Escape' && this.grab) {
      if (this.grab.moved && !this.grab.add) host?.changeCancel();
      this.grabStop();
      return true;
    }
    if (keyCode === 'Escape' && pathEditSelected()) {
      pathEditSelect(null);
      return true;
    }
    return (keyCode === 'Delete' || keyCode === 'Backspace') && host !== null && this.pointRemove(host);
  }

  /** Takes back a drag and hides the paths when the tool is left. */
  override onDeactivate(): void {
    if (this.grab?.moved && !this.grab.add) this.host()?.changeCancel();
    this.grabStop();
    pathEditSelect(null);
    this.dots.hideOthers(new Set());
    this.lines.hideOthers(new Set());
    super.onDeactivate();
  }

  /**
   * Returns where a Ctrl press adds a point: after the picked point, or after
   * the last point of the first path.
   *
   * @param host Edit host.
   * @param x Press client X.
   * @param y Press client Y.
   * @returns Press target, or null without a path or a pane under the pointer.
   */
  private addTarget(
    host: GeneratorEditHost,
    x: number,
    y: number,
  ): Omit<GeneratorPathGrab, 'x' | 'y' | 'moved'> | null {
    const picked = generatorPathPicked(host);
    const path = picked?.path ?? host.paths()[0];
    const pane = host.panes().find((each) => generatorPathPaneHas(each, x, y));
    if (!path || !pane) return null;
    const point = picked?.point ?? path.path.points.length - 1;
    const anchor = generatorPathAnchor(path, point);
    return { path, point, handle: null, add: true, anchor, pane };
  }

  /**
   * Adds a point after the grabbed one at the grid point under a still Ctrl
   * click, as one undo step, and picks it.
   *
   * @param host Edit host.
   * @param grab Still Ctrl press.
   */
  private pointAdd(host: GeneratorEditHost, grab: GeneratorPathGrab): void {
    const world = generatorPathPlanePoint(grab.pane, grab.x, grab.y, grab.anchor, (value) => host.snapDistance(value));
    if (!world) return;
    host.pathWrite(grab.path, pathAssetPointInsert(grab.path.path, grab.point, generatorPathScript(grab.path, world)));
    host.changeEnd();
    pathEditSelect({ stepId: grab.path.stepId, name: grab.path.name, point: grab.point + 1 });
  }

  /**
   * Removes the picked point as one undo step; the next point is picked.
   *
   * @param host Edit host.
   * @returns True when a point was removed.
   */
  private pointRemove(host: GeneratorEditHost): boolean {
    const picked = generatorPathPicked(host);
    const removed = picked ? pathAssetPointRemove(picked.path.path, picked.point) : null;
    if (!picked || !removed) return false;
    host.pathWrite(picked.path, removed);
    host.changeEnd();
    const point = Math.min(picked.point, removed.points.length - 1);
    pathEditSelect({ stepId: picked.path.stepId, name: picked.path.name, point });
    return true;
  }

  /** Forgets the press and gives the pointer back. */
  private grabStop(): void {
    this.grab = null;
    this.clearWantsActiveLatch();
  }

  /**
   * Returns the edit host.
   *
   * @returns Host, or null outside the layout.
   */
  private host(): GeneratorEditHost | null {
    return this.editor?.getServices()?.getGeneratorEditHost?.() ?? null;
  }
}

/**
 * Returns the world point of a path point.
 *
 * @param path Path input.
 * @param point Point index.
 * @returns World point.
 */
function generatorPathAnchor(path: ModifierStackPath, point: number): THREE.Vector3 {
  return generatorPathWorld(path, path.path.points[point] ?? [0, 0, 0]);
}

/**
 * Returns whether a client point is over a pane.
 *
 * @param pane Pane.
 * @param x Client X.
 * @param y Client Y.
 * @returns True inside the pane.
 */
function generatorPathPaneHas(pane: EditorViewportPickContext, x: number, y: number): boolean {
  const rect = pane.pickElement.getBoundingClientRect();
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}
