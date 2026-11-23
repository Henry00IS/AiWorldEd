import { Widget } from '@/editor/widgets/widget.js';
import { WidgetScreenElements } from '@/editor/widgets/screen_button/widget_screen_elements.js';
import type { EditorViewportPickContext } from '@/editor/window/editor_viewport_pick_context.js';
import type { ModifierStackPath } from '@/modifier/stack/widgets/modifier_stack_path_record.js';
import { pathAssetPointInsert, pathAssetPointsRemove } from '@/path/model/path_asset_edit.js';
import {
  pathEditSelect,
  pathEditSelected,
  pathEditSelectionChange,
  type PathEditSelection,
  type PathEditSelectMode,
} from '@/path/edit/path_edit_selection.js';
import { TransformModalAxis, transformModalAxisToggle } from '@/transform/modal/transform_modal_axis.js';
import type { GeneratorEditHost } from './generator_edit_host.js';
import {
  GeneratorShiftWatch,
  generatorAxisIndex,
  generatorAxisUnit,
  generatorAxisKey,
  generatorSelectMode,
  generatorShiftHeld,
} from './generator_drag_keys.js';
import {
  generatorPathAxisPoint,
  generatorPathPlanePoint,
  generatorPathScript,
  generatorPathWorld,
} from './generator_path_geometry.js';
import {
  generatorPathDraw,
  generatorPathElementCreate,
  generatorPathHit,
  generatorPathPicked,
  type GeneratorPathTarget,
} from './generator_path_draw.js';
import {
  generatorPathBox,
  generatorPathBoxed,
  generatorPathDragged,
  generatorPathMarqueeShow,
  type GeneratorPathGrab,
} from './generator_path_grab.js';

/** Pointer travel in pixels below which a press and release is a still click. */
const GENERATOR_PATH_STILL_PX = 2;

/** What a press decides at once; the rest of a grab follows from the pointer. */
type GeneratorPathPress = Omit<GeneratorPathGrab, 'mode' | 'x' | 'y' | 'moved' | 'axis'>;

/**
 * The paths of the object being edited, picked and moved as in the curve
 * editor. Clicking a point or the line of a stretch selects it, Shift adds to
 * the selection and Ctrl toggles, and a drag on empty space box-selects points.
 * Dragging a selected point moves every selected point together, and dragging a
 * handle of a shown stretch bends it, on the grid plane facing the camera; X, Y
 * or Z locks the drag to that world axis and Shift turns grid snapping the
 * other way. Each drag is one undo step. A still Ctrl click on empty space adds
 * a point after the last selected one, Delete removes the selected points, and
 * Escape takes back a drag or clears the selection.
 */
export class GeneratorPathWidget extends Widget {
  /** Point and handle dots by pane and key. */
  private readonly dots = new WidgetScreenElements((doc) => generatorPathElementCreate(doc, false));
  /** Line pieces by pane and key. */
  private readonly lines = new WidgetScreenElements((doc) => generatorPathElementCreate(doc, true));
  /** Press in progress, or null. */
  private grab: GeneratorPathGrab | null = null;
  /** Box-select rectangle, once shown. */
  private marquee: HTMLElement | null = null;
  /** Turns snapping over at once when Shift changes during a drag. */
  private readonly shift = new GeneratorShiftWatch(() => {
    if (this.grab?.moved) this.dragApply(this.grab);
  });

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
   * Starts a left press: on a point, handle or line it selects and grabs, and
   * on empty space it starts a box select or, with Ctrl, a point to add.
   *
   * @param button Mouse button index.
   */
  override onMouseDown(button: number): void {
    const editor = this.editor;
    const host = this.host();
    if (button !== 0 || !editor || !host || this.grab) return;
    const [x, y] = [editor.lastPointerClientX, editor.lastPointerClientY];
    const mode = generatorSelectMode(editor);
    const hit = generatorPathHit(host, x, y);
    const press = hit ? this.hitPress(hit, mode) : this.emptyPress(host, x, y, mode);
    if (!press) return;
    this.grab = { ...press, mode, x, y, moved: false, axis: TransformModalAxis.None };
    this.shift.start(editor, press.pane.pickElement.ownerDocument.defaultView);
    this.latchWantsActiveFromGizmoState(true);
  }

  /** Moves what is grabbed, or stretches the box select, with the pointer. */
  override onGlobalMouseDrag(): void {
    const grab = this.grab;
    const editor = this.editor;
    if (!grab || !editor) return;
    const { lastPointerClientX: x, lastPointerClientY: y } = editor;
    if (Math.hypot(x - grab.x, y - grab.y) > GENERATOR_PATH_STILL_PX) grab.moved = true;
    if (!grab.moved) return;
    if (grab.kind === 'add' || grab.kind === 'marquee')
      this.marquee = generatorPathMarqueeShow(grab.pane.pickElement.ownerDocument, generatorPathBox(grab, x, y));
    else this.dragApply(grab);
  }

  /**
   * Ends a press: a drag becomes one undo step, a box select selects the points
   * inside it, and a still click does what clicking there does.
   *
   * @param button Mouse button index.
   */
  override onGlobalMouseUp(button: number): void {
    const grab = this.grab;
    const host = this.host();
    const editor = this.editor;
    if (button !== 0 || !grab || !host || !editor) return;
    this.grabStop();
    if (!grab.moved) this.click(host, grab);
    else if (grab.kind === 'points' || grab.kind === 'handle') host.changeEnd();
    else if (grab.kind !== 'still') this.boxSelect(host, grab, editor.lastPointerClientX, editor.lastPointerClientY);
  }

  /**
   * Handles X, Y and Z, which lock a drag to that world axis or free it again,
   * Escape, which takes back a press or else clears the selection, and Delete,
   * which removes the selected points.
   *
   * @param keyCode Key code.
   * @returns True when the key was used.
   */
  override onKeyDown(keyCode: string): boolean {
    const host = this.host();
    const axis = generatorAxisKey(keyCode);
    if (axis) return this.axisLock(axis);
    if (keyCode === 'Escape') return this.escape(host);
    return (keyCode === 'Delete' || keyCode === 'Backspace') && host !== null && this.pointsRemove(host);
  }

  /** Takes back a drag and hides the paths when the tool is left. */
  override onDeactivate(): void {
    this.escape(this.host());
    pathEditSelect(null);
    this.dots.hideOthers(new Set());
    this.lines.hideOthers(new Set());
    super.onDeactivate();
  }

  /**
   * Selects what a press hit and returns what the press grabs: the selected
   * points from a selected point, a handle, or nothing to drag.
   *
   * @param hit Point, handle or line pressed.
   * @param mode How the press changes the selection.
   * @returns Press.
   */
  private hitPress(hit: GeneratorPathTarget, mode: PathEditSelectMode): GeneratorPathPress {
    const base = { ...hit, kind: 'still' as const, points: [], collapse: false };
    if (hit.kind === 'handle') return { ...base, kind: 'handle' };
    if (hit.kind === 'segment') {
      this.select(hit.path, { points: [], segments: [hit.point] }, mode);
      return base;
    }
    const current = pathEditSelected();
    const kept = mode === 'replace' && current && this.holds(current, hit.path, hit.point) ? current : null;
    const next = kept ?? this.select(hit.path, { points: [hit.point], segments: [] }, mode);
    return next.points.includes(hit.point) ? { ...base, kind: 'points', points: next.points, collapse: !!kept } : base;
  }

  /**
   * Returns what a press on empty space does: a Ctrl press adds a point when it
   * stays still, and any other press starts a box select. Without a path to
   * edit, the press only clears the selection.
   *
   * @param host Edit host.
   * @param x Press client X.
   * @param y Press client Y.
   * @param mode How the press changes the selection.
   * @returns Press, or null.
   */
  private emptyPress(
    host: GeneratorEditHost,
    x: number,
    y: number,
    mode: PathEditSelectMode,
  ): GeneratorPathPress | null {
    const pane = host.panes().find((each) => generatorPathPaneHas(each, x, y));
    const path = generatorPathPicked(host)?.path ?? host.paths()[0];
    if (!pane || !path) {
      if (pathEditSelected()) pathEditSelect(null);
      return null;
    }
    const selected = generatorPathPicked(host)?.selection.points ?? [];
    const point = selected.length > 0 ? Math.max(...selected) : path.path.points.length - 1;
    const anchor = generatorPathWorld(path, path.path.points[point] ?? [0, 0, 0]);
    const kind = mode === 'toggle' ? ('add' as const) : ('marquee' as const);
    return { kind, path, point, handle: null, points: [], anchor, pane, collapse: false };
  }

  /**
   * Moves the grabbed points or handle to the pointer: on the grid plane
   * through the grabbed one, or along the locked world axis.
   *
   * @param grab Point or handle drag.
   */
  private dragApply(grab: GeneratorPathGrab): void {
    const host = this.host();
    const editor = this.editor;
    if (!host || !editor || !grab.path || (grab.kind !== 'points' && grab.kind !== 'handle')) return;
    const { lastPointerClientX: x, lastPointerClientY: y } = editor;
    const snap = (value: number): number => host.snapDistance(value, generatorShiftHeld(editor));
    const axis = generatorAxisIndex(grab.axis);
    const world =
      axis === null
        ? generatorPathPlanePoint(grab.pane, x, y, grab.anchor, snap)
        : generatorPathAxisPoint(grab.pane, x, y, grab.anchor, generatorAxisUnit(axis, host.axisOrientation()), snap);
    const moved = world ? generatorPathDragged(grab, world) : null;
    if (moved) host.pathWrite(grab.path, moved);
  }

  /**
   * Finishes a still click: a Ctrl click on empty space adds a point, a click
   * on empty space clears the selection, and a click on a point of a larger
   * selection selects only that point.
   *
   * @param host Edit host.
   * @param grab Still press.
   */
  private click(host: GeneratorEditHost, grab: GeneratorPathGrab): void {
    if (grab.kind === 'add') this.pointAdd(host, grab);
    else if (grab.kind === 'marquee' && grab.mode === 'replace') pathEditSelect(null);
    else if (grab.collapse && grab.path) this.select(grab.path, { points: [grab.point], segments: [] }, 'replace');
  }

  /**
   * Selects the points inside a box select, of the selected path first; a Ctrl
   * box select toggles them.
   *
   * @param host Edit host.
   * @param grab Box select.
   * @param x Release client X.
   * @param y Release client Y.
   */
  private boxSelect(host: GeneratorEditHost, grab: GeneratorPathGrab, x: number, y: number): void {
    const mode = grab.kind === 'add' ? 'toggle' : grab.mode;
    const preferred = generatorPathPicked(host)?.path;
    const paths = preferred ? [preferred, ...host.paths().filter((each) => each !== preferred)] : host.paths();
    const boxed = generatorPathBoxed(paths, grab.pane, generatorPathBox(grab, x, y));
    if (boxed) this.select(boxed.path, { points: boxed.points, segments: [] }, mode);
    else if (mode === 'replace') pathEditSelect(null);
  }

  /**
   * Locks a drag to a world axis, or frees it when the same axis is locked, and
   * moves the drag at once.
   *
   * @param axis Axis of the key pressed.
   * @returns True during a point or handle press.
   */
  private axisLock(axis: TransformModalAxis.X | TransformModalAxis.Y | TransformModalAxis.Z): boolean {
    const grab = this.grab;
    if (!grab || (grab.kind !== 'points' && grab.kind !== 'handle')) return false;
    grab.axis = transformModalAxisToggle(grab.axis, axis);
    if (grab.moved) this.dragApply(grab);
    return true;
  }

  /**
   * Takes back a press, or else clears the selection.
   *
   * @param host Edit host, or null.
   * @returns True when there was a press or a selection.
   */
  private escape(host: GeneratorEditHost | null): boolean {
    const grab = this.grab;
    if (grab) {
      if (grab.moved && (grab.kind === 'points' || grab.kind === 'handle')) host?.changeCancel();
      this.grabStop();
      return true;
    }
    if (!pathEditSelected()) return false;
    pathEditSelect(null);
    return true;
  }

  /**
   * Adds a point after the grabbed one at the grid point under a still Ctrl
   * click, as one undo step, and selects it.
   *
   * @param host Edit host.
   * @param grab Still Ctrl press.
   */
  private pointAdd(host: GeneratorEditHost, grab: GeneratorPathGrab): void {
    const editor = this.editor;
    const path = grab.path;
    if (!editor || !path) return;
    const snap = (value: number): number => host.snapDistance(value, generatorShiftHeld(editor));
    const world = generatorPathPlanePoint(grab.pane, grab.x, grab.y, grab.anchor, snap);
    if (!world) return;
    host.pathWrite(path, pathAssetPointInsert(path.path, grab.point, generatorPathScript(path, world)));
    host.changeEnd();
    pathEditSelect({ stepId: path.stepId, name: path.name, points: [grab.point + 1], segments: [] });
  }

  /**
   * Removes the selected points as one undo step; the point after them is
   * selected.
   *
   * @param host Edit host.
   * @returns True when points were removed.
   */
  private pointsRemove(host: GeneratorEditHost): boolean {
    const picked = generatorPathPicked(host);
    const points = picked?.selection.points ?? [];
    const removed = picked && points.length > 0 ? pathAssetPointsRemove(picked.path.path, points) : null;
    if (!picked || !removed) return false;
    host.pathWrite(picked.path, removed);
    host.changeEnd();
    const point = Math.min(points[0]!, removed.points.length - 1);
    pathEditSelect({ stepId: picked.path.stepId, name: picked.path.name, points: [point], segments: [] });
    return true;
  }

  /**
   * Changes the selection and returns it.
   *
   * @param path Path clicked or boxed.
   * @param picked Points and stretches clicked or boxed.
   * @param mode How the selection changes.
   * @returns New selection.
   */
  private select(
    path: ModifierStackPath,
    picked: { points: readonly number[]; segments: readonly number[] },
    mode: PathEditSelectMode,
  ): PathEditSelection {
    const next = pathEditSelectionChange(pathEditSelected(), path, picked, mode);
    pathEditSelect(next);
    return next;
  }

  /**
   * Returns whether a selection holds a point of a path.
   *
   * @param selection Selection.
   * @param path Path.
   * @param point Point index.
   * @returns True when the point is selected.
   */
  private holds(selection: PathEditSelection, path: ModifierStackPath, point: number): boolean {
    return selection.stepId === path.stepId && selection.name === path.name && selection.points.includes(point);
  }

  /** Forgets the press, hides the box select and gives the pointer back. */
  private grabStop(): void {
    this.grab = null;
    this.shift.stop();
    if (this.marquee) this.marquee.hidden = true;
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
