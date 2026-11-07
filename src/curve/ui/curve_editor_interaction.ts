import { curveHandlePosition, type CurveVector } from '@/curve/model/curve_model.js';
import { curveEditorHitTest, type CurveEditorHandleRef, type CurveEditorHit } from './curve_editor_hit.js';
import type { CurveEditorSession } from './curve_editor_session.js';
import type { CurveEditorView } from './curve_editor_view.js';

/** What a pointer drag is moving. */
type CurveEditorDrag =
  | { kind: 'point'; index: number; grab: CurveVector }
  | { kind: 'handle'; handle: CurveEditorHandleRef; grab: CurveVector }
  | { kind: 'pan'; last: CurveVector };

/** Zoom factor per wheel notch. */
const CURVE_EDITOR_WHEEL_ZOOM = 1.15;

/**
 * Mouse handling of the curve canvas: select, drag points and handles,
 * double-click to insert, wheel to zoom, middle or right drag (or Alt) to pan.
 */
export class CurveEditorInteraction {
  /** Part under the pointer, for hover highlighting. */
  hover: CurveEditorHit = null;
  /** Curve position under the pointer, or null outside the canvas. */
  cursor: CurveVector | null = null;
  private drag: CurveEditorDrag | null = null;

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
    const screen = this.local(event);
    this.canvas.setPointerCapture?.(event.pointerId);
    if (event.button === 1 || event.button === 2 || event.altKey) {
      this.drag = { kind: 'pan', last: screen };
      return;
    }
    if (event.button !== 0) return;
    const hit = curveEditorHitTest(this.session.curve, this.view, this.session.selection, screen);
    this.dragBegin(hit, screen);
    this.redraw();
  }

  /**
   * Selects what was hit and starts dragging points and handles.
   *
   * @param hit Hit under the pointer.
   * @param screen Pointer in pixels.
   */
  private dragBegin(hit: CurveEditorHit, screen: CurveVector): void {
    if (hit?.kind !== 'handle') this.session.select(hit ? { kind: hit.kind, index: hit.index } : null);
    const at = this.view.toCurve(screen);
    if (hit?.kind === 'point') {
      const point = this.session.curve.points[hit.index];
      const grab = point ? { x: point.x - at.x, y: point.y - at.y } : { x: 0, y: 0 };
      this.drag = { kind: 'point', index: hit.index, grab };
    } else if (hit?.kind === 'handle') {
      const point = this.session.curve.points[hit.index];
      const tip = point ? curveHandlePosition(point, hit.side) : at;
      this.drag = {
        kind: 'handle',
        handle: { index: hit.index, side: hit.side },
        grab: { x: tip.x - at.x, y: tip.y - at.y },
      };
    } else return;
    this.session.dragStart();
  }

  /**
   * Drags, pans, or updates the hover.
   *
   * @param event Pointer event.
   */
  private pointerMove(event: PointerEvent): void {
    const screen = this.local(event);
    const at = this.view.toCurve(screen);
    this.cursor = at;
    const drag = this.drag;
    if (!drag) this.hover = curveEditorHitTest(this.session.curve, this.view, this.session.selection, screen);
    else if (drag.kind === 'pan') {
      this.view.pan(screen.x - drag.last.x, screen.y - drag.last.y);
      drag.last = screen;
    } else if (drag.kind === 'point') this.session.dragPoint(drag.index, at.x + drag.grab.x, at.y + drag.grab.y);
    else this.session.dragHandle(drag.handle, at.x + drag.grab.x, at.y + drag.grab.y);
    this.redraw();
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
    if (drag && drag.kind !== 'pan') this.session.dragEnd();
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
