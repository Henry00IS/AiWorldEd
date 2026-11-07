import { curveHandlePosition, type CurveVector } from '@/curve/model/curve_model.js';
import { curveEditorHitTest, type CurveEditorHandleRef, type CurveEditorHit } from './curve_editor_hit.js';
import type { CurveEditorSession } from './curve_editor_session.js';
import type { CurveEditorView } from './curve_editor_view.js';
import type { CurveMarkerSide } from '@/curve/model/curve_markers.js';
import { curveEditorGripHit, curveEditorMarqueePick, type CurveEditorMarquee } from './curve_editor_group.js';
import type { CurveEditorGrip, CurveEditorSelectMode } from './curve_editor_session.js';

/** What a pointer drag is moving. */
type CurveEditorDrag =
  | { kind: 'point'; index: number; grab: CurveVector }
  | { kind: 'handle'; handle: CurveEditorHandleRef; grab: CurveVector }
  | { kind: 'marker'; side: CurveMarkerSide; grab: number }
  | { kind: 'group'; index: number; grab: CurveVector }
  | { kind: 'scale'; grip: CurveEditorGrip }
  | { kind: 'marquee'; marquee: CurveEditorMarquee; mode: CurveEditorSelectMode }
  | { kind: 'pan'; last: CurveVector };

/** Drags that edit the curve. */
type CurveEditorEditDrag = Exclude<CurveEditorDrag, { kind: 'pan' } | { kind: 'marquee' }>;

/** Zoom factor per wheel notch. */
const CURVE_EDITOR_WHEEL_ZOOM = 1.15;

/**
 * Mouse handling of the curve canvas: select, drag points and handles,
 * marquee-select (Shift adds, Ctrl toggles), move or scale several points,
 * double-click to insert, wheel to zoom, middle or right drag (or Alt) to pan.
 */
export class CurveEditorInteraction {
  /** Part under the pointer, for hover highlighting. */
  hover: CurveEditorHit = null;
  /** Curve position under the pointer, or null outside the canvas. */
  cursor: CurveVector | null = null;
  private drag: CurveEditorDrag | null = null;
  /** Last pointer event, replayed when Shift changes mid-drag. */
  private last: MouseEvent | null = null;

  /**
   * Binds the canvas.
   *
   * @param canvas Editor canvas.
   * @param view View.
   * @param session Editing session.
   * @param redraw Requests a redraw.
   */
  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly view: CurveEditorView,
    private readonly session: CurveEditorSession,
    private readonly redraw: () => void,
  ) {
    canvas.addEventListener('pointerdown', (event) => this.pointerDown(event));
    canvas.addEventListener('pointermove', (event) => this.pointerMove(event));
    canvas.addEventListener('pointerup', (event) => this.pointerUp(event));
    canvas.addEventListener('pointercancel', (event) => this.pointerUp(event));
    canvas.addEventListener('pointerleave', () => this.pointerLeave());
    canvas.addEventListener('dblclick', (event) => this.doubleClick(event));
    canvas.addEventListener('wheel', (event) => this.wheel(event), { passive: false });
    canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  }

  /**
   * Returns the marquee being dragged, for drawing.
   *
   * @returns Marquee, or null.
   */
  get marquee(): CurveEditorMarquee | null {
    return this.drag?.kind === 'marquee' ? this.drag.marquee : null;
  }

  /**
   * Returns the pointer position in canvas pixels.
   *
   * @param event Mouse event.
   * @returns Canvas position.
   */
  private local(event: MouseEvent): CurveVector {
    const rect = this.canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  /**
   * Starts a selection, drag or pan.
   *
   * @param event Pointer event.
   */
  private pointerDown(event: PointerEvent): void {
    this.session.shiftHeld = event.shiftKey;
    this.last = event;
    const screen = this.local(event);
    this.canvas.setPointerCapture?.(event.pointerId);
    if (event.button === 2 && this.markerRemove(screen)) return;
    if (event.button === 1 || event.button === 2 || event.altKey) {
      this.drag = { kind: 'pan', last: screen };
      return;
    }
    if (event.button !== 0) return;
    const grip = curveEditorGripHit(this.session.curve, this.view, this.session.points, screen);
    if (grip) {
      this.drag = { kind: 'scale', grip };
      this.session.dragStart();
    } else this.dragBegin(curveEditorHitTest(this.session.curve, this.view, this.session.selection, screen), event);
    this.redraw();
  }

  /**
   * Selects what was hit and starts dragging points, handles or markers, or
   * starts a marquee on empty space.
   *
   * @param hit Hit under the pointer.
   * @param event Pointer event.
   */
  private dragBegin(hit: CurveEditorHit, event: PointerEvent): void {
    const screen = this.local(event);
    const at = this.view.toCurve(screen);
    if (hit?.kind === 'marker') {
      this.drag = { kind: 'marker', side: hit.side, grab: (this.session.curve.markers?.[hit.side] ?? at.x) - at.x };
      return this.session.dragStart();
    }
    if (hit?.kind === 'point') return this.pointBegin(hit.index, event, at);
    if (!hit) {
      const mode = curveEditorSelectMode(event);
      return void (this.drag = { kind: 'marquee', marquee: { from: screen, to: screen }, mode });
    }
    if (hit.kind !== 'handle') return this.session.select({ kind: 'segment', index: hit.index });
    const point = this.session.curve.points[hit.index];
    const tip = point ? curveHandlePosition(point, hit.side) : at;
    this.drag = {
      kind: 'handle',
      handle: { index: hit.index, side: hit.side },
      grab: { x: tip.x - at.x, y: tip.y - at.y },
    };
    this.session.dragStart();
  }

  /**
   * Selects a clicked point (Shift adds, Ctrl toggles, a click on a point of a
   * multi-selection keeps it) and drags it, or the whole selection with it.
   *
   * @param index Point index.
   * @param event Pointer event.
   * @param at Pointer in curve units.
   */
  private pointBegin(index: number, event: PointerEvent, at: CurveVector): void {
    const mode = curveEditorSelectMode(event);
    const keep = mode === 'replace' && this.session.points.length > 1 && this.session.isPointSelected(index);
    if (mode !== 'replace') this.session.selectPoints([index], mode);
    else if (!keep) this.session.select({ kind: 'point', index });
    else this.session.selectPoints([index], 'add');
    const point = this.session.curve.points[index];
    if (!point || !this.session.isPointSelected(index)) return;
    const grab = { x: point.x - at.x, y: point.y - at.y };
    this.drag = this.session.points.length > 1 ? { kind: 'group', index, grab } : { kind: 'point', index, grab };
    this.session.dragStart();
  }

  /**
   * Drags, pans, or updates the hover.
   *
   * @param event Pointer event.
   */
  private pointerMove(event: PointerEvent): void {
    this.session.shiftHeld = event.shiftKey;
    this.last = event;
    const screen = this.local(event);
    const at = this.view.toCurve(screen);
    this.cursor = at;
    const drag = this.drag;
    if (!drag) this.hover = curveEditorHitTest(this.session.curve, this.view, this.session.selection, screen);
    else if (drag.kind === 'pan') {
      this.view.pan(screen.x - drag.last.x, screen.y - drag.last.y);
      drag.last = screen;
    } else if (drag.kind === 'marquee') drag.marquee.to = screen;
    else this.dragTo(drag, at);
    this.redraw();
  }

  /**
   * Moves what a drag holds to a curve position.
   *
   * @param drag Curve-editing drag.
   * @param at Pointer in curve units.
   */
  private dragTo(drag: CurveEditorEditDrag, at: CurveVector): void {
    if (drag.kind === 'point') this.session.dragPoint(drag.index, at.x + drag.grab.x, at.y + drag.grab.y);
    else if (drag.kind === 'handle') this.session.dragHandle(drag.handle, at.x + drag.grab.x, at.y + drag.grab.y);
    else if (drag.kind === 'group')
      this.session.dragGroup(drag.index, { x: at.x + drag.grab.x, y: at.y + drag.grab.y });
    else if (drag.kind === 'scale') this.session.dragScale(drag.grip, at);
    else this.session.dragMarker(drag.side, at.x + drag.grab);
  }

  /**
   * Removes the marker under a right click.
   *
   * @param screen Pointer in pixels.
   * @returns True when a marker was removed.
   */
  private markerRemove(screen: CurveVector): boolean {
    const hit = curveEditorHitTest(this.session.curve, this.view, this.session.selection, screen);
    if (hit?.kind !== 'marker') return false;
    this.session.setMarker(hit.side, false);
    this.redraw();
    return true;
  }

  /**
   * Ends a drag.
   *
   * @param event Pointer event.
   */
  private pointerUp(event: PointerEvent): void {
    this.canvas.releasePointerCapture?.(event.pointerId);
    const drag = this.drag;
    this.drag = null;
    if (drag?.kind === 'marquee')
      this.session.selectPoints(curveEditorMarqueePick(this.session.curve, this.view, drag.marquee), drag.mode);
    else if (drag && drag.kind !== 'pan') this.session.dragEnd();
    this.redraw();
  }

  /**
   * Follows Shift pressed or released mid-drag: the drag is replayed at the
   * last pointer position with snapping inverted or restored.
   *
   * @param held True while Shift is held.
   */
  shiftChanged(held: boolean): void {
    if (this.session.shiftHeld === held) return;
    this.session.shiftHeld = held;
    const drag = this.drag;
    if (drag && drag.kind !== 'pan' && drag.kind !== 'marquee' && this.last)
      this.dragTo(drag, this.view.toCurve(this.local(this.last)));
    this.redraw();
  }

  /** Clears the hover when the pointer leaves. */
  private pointerLeave(): void {
    this.hover = null;
    this.cursor = null;
    this.redraw();
  }

  /**
   * Inserts a point where the user double-clicked.
   *
   * @param event Mouse event.
   */
  private doubleClick(event: MouseEvent): void {
    const screen = this.local(event);
    if (curveEditorHitTest(this.session.curve, this.view, this.session.selection, screen)?.kind === 'point') return;
    const at = this.view.toCurve(screen);
    this.session.insertAt(at.x, at.y);
    this.redraw();
  }

  /**
   * Zooms around the pointer.
   *
   * @param event Wheel event.
   */
  private wheel(event: WheelEvent): void {
    event.preventDefault();
    const factor = event.deltaY < 0 ? CURVE_EDITOR_WHEEL_ZOOM : 1 / CURVE_EDITOR_WHEEL_ZOOM;
    this.view.zoomAt(this.local(event), factor);
    this.redraw();
  }
}

/**
 * Returns how a click changes the point selection: Ctrl (or Cmd) toggles, Shift
 * adds, otherwise it replaces.
 *
 * @param event Pointer event.
 * @returns Selection mode.
 */
function curveEditorSelectMode(event: MouseEvent): CurveEditorSelectMode {
  if (event.ctrlKey || event.metaKey) return 'toggle';
  return event.shiftKey ? 'add' : 'replace';
}
