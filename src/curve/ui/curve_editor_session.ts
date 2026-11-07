import { curveMoveHandle, curveMovePoint } from '@/curve/model/curve_constrain.js';
import {
  curveDeletePoint,
  curveFlip,
  curveInsertPoint,
  curveMirror,
  curveSegmentDetailSet,
  curveSegmentFlatten,
  curveSegmentModeSet,
  curveSegmentStraighten,
} from '@/curve/model/curve_edit.js';
import { CurveHistory } from '@/curve/model/curve_history.js';
import { curveClone, curveEquals, type Curve, type CurveSegmentMode } from '@/curve/model/curve_model.js';
import type { CurveEditorHandleRef, CurveEditorSelection } from './curve_editor_hit.js';
import { gridSnapInvertedByShift } from '@/transform/snap/grid_snap_shift_precision.js';

/** Who hears about curve edits. */
export interface CurveEditorListener {
  /** A drag step changed the curve; not yet final. */
  onPreview: (curve: Curve) => void;
  /** The curve changed for good: a drag ended or a tool ran. */
  onCommit: (curve: Curve) => void;
  /** Selection, history or snapping changed; refresh controls. */
  onState: () => void;
}

/** Default snap step in curve units. */
export const CURVE_EDITOR_SNAP_DEFAULT = 0.05;

/**
 * Editing state of one open curve editor: the curve, selection, snapping, local
 * undo history, and every edit operation. Holds no DOM.
 */
export class CurveEditorSession {
  selection: CurveEditorSelection = null;
  snapOn = true;
  /** True while Shift is held, which inverts the snap setting. */
  shiftHeld = false;
  snapStep = CURVE_EDITOR_SNAP_DEFAULT;
  private current: Curve;
  private dragBefore: Curve | null = null;
  private readonly history = new CurveHistory();

  /**
   * Starts a session.
   *
   * @param curve Curve to edit.
   * @param listener Change listener.
   */
  constructor(
    curve: Curve,
    private readonly listener: CurveEditorListener,
  ) {
    this.current = curveClone(curve);
  }

  /**
   * Returns the curve being edited.
   *
   * @returns Curve.
   */
  get curve(): Curve {
    return this.current;
  }

  /**
   * Returns whether snapping applies now: the Snap setting, inverted while
   * Shift is held.
   *
   * @returns True when values snap.
   */
  snapActive(): boolean {
    return gridSnapInvertedByShift(this.snapOn, this.shiftHeld);
  }

  /**
   * Snaps a value to the grid when snapping is on.
   *
   * @param value Value in curve units.
   * @returns Snapped value.
   */
  snap(value: number): number {
    if (!this.snapActive() || this.snapStep <= 0) return value;
    return Math.round(value / this.snapStep) * this.snapStep;
  }

  /**
   * Selects a point or segment.
   *
   * @param selection New selection.
   */
  select(selection: CurveEditorSelection): void {
    this.selection = selection;
    this.listener.onState();
  }

  /**
   * Returns the segment the segment tools act on: the selected segment, or the
   * one leaving the selected point (entering it for the last point).
   *
   * @returns Segment index, or -1 without a selection.
   */
  activeSegment(): number {
    if (!this.selection) return -1;
    if (this.selection.kind === 'segment') return this.selection.index;
    return Math.min(this.selection.index, this.current.segments.length - 1);
  }

  /** Starts a drag; the curve before it becomes one undo step. */
  dragStart(): void {
    this.dragBefore = curveClone(this.current);
  }

  /**
   * Drags a point to a curve position, snapped.
   *
   * @param index Point index.
   * @param x Wanted x.
   * @param y Wanted y.
   */
  dragPoint(index: number, x: number, y: number): void {
    this.preview(curveMovePoint(this.current, index, this.snap(x), this.snap(y)));
  }

  /**
   * Drags a handle to a curve position, snapped.
   *
   * @param handle Handle.
   * @param x Wanted x.
   * @param y Wanted y.
   */
  dragHandle(handle: CurveEditorHandleRef, x: number, y: number): void {
    this.preview(curveMoveHandle(this.current, handle.index, handle.side, this.snap(x), this.snap(y)));
  }

  /** Ends a drag and commits when the curve changed. */
  dragEnd(): void {
    const before = this.dragBefore;
    this.dragBefore = null;
    if (!before || curveEquals(before, this.current)) return;
    this.history.record(before);
    this.listener.onCommit(this.current);
    this.listener.onState();
  }

  /**
   * Moves a point to exact coordinates typed by the user, as one undo step.
   *
   * @param index Point index.
   * @param x Wanted x.
   * @param y Wanted y.
   */
  movePointTo(index: number, x: number, y: number): void {
    this.apply((curve) => curveMovePoint(curve, index, x, y));
  }

  /**
   * Adopts a curve changed elsewhere, such as by a collaborator, without an
   * undo step or a commit.
   *
   * @param curve New curve.
   */
  adopt(curve: Curve): void {
    if (this.dragBefore || curveEquals(curve, this.current)) return;
    this.current = curveClone(curve);
    this.selection = null;
    this.listener.onState();
  }

  /**
   * Inserts a point at a curve position and selects it.
   *
   * @param x Wanted x.
   * @param y Wanted y.
   */
  insertAt(x: number, y: number): void {
    const { curve, index } = curveInsertPoint(this.current, this.snap(x));
    if (index < 0) return;
    this.selection = { kind: 'point', index };
    this.apply(() => curveMovePoint(curve, index, this.snap(x), this.snap(y)));
  }

  /** Deletes the selected inner point. */
  deleteSelected(): void {
    const selection = this.selection;
    if (selection?.kind !== 'point') return;
    const last = this.current.points.length - 1;
    if (selection.index <= 0 || selection.index >= last) return;
    this.selection = null;
    this.apply((curve) => curveDeletePoint(curve, selection.index));
  }

  /**
   * Sets the active segment's mode.
   *
   * @param mode Segment mode.
   */
  setMode(mode: CurveSegmentMode): void {
    const segment = this.activeSegment();
    if (segment >= 0) this.apply((curve) => curveSegmentModeSet(curve, segment, mode));
  }

  /**
   * Sets the active segment's detail.
   *
   * @param detail Straight pieces.
   */
  setDetail(detail: number): void {
    this.setDetailAt(this.activeSegment(), detail);
  }

  /**
   * Sets one segment's detail, such as the segment that was selected when the
   * user started typing.
   *
   * @param segment Segment index; out-of-range indices are ignored.
   * @param detail Straight pieces.
   */
  setDetailAt(segment: number, detail: number): void {
    if (segment >= 0 && segment < this.current.segments.length)
      this.apply((curve) => curveSegmentDetailSet(curve, segment, detail));
  }

  /** Straightens the active segment. */
  straighten(): void {
    const segment = this.activeSegment();
    if (segment >= 0) this.apply((curve) => curveSegmentStraighten(curve, segment));
  }

  /** Levels the active segment. */
  flatten(): void {
    const segment = this.activeSegment();
    if (segment >= 0) this.apply((curve) => curveSegmentFlatten(curve, segment));
  }

  /** Mirrors the curve left to right. */
  mirror(): void {
    this.selection = null;
    this.apply(curveMirror);
  }

  /** Flips the curve upside down. */
  flip(): void {
    this.apply(curveFlip);
  }

  /**
   * Replaces the whole curve, as a preset or a loaded file does.
   *
   * @param curve New curve.
   */
  replace(curve: Curve): void {
    this.selection = null;
    this.apply(() => curveClone(curve));
  }

  /** Steps back in the local history. */
  undo(): void {
    const previous = this.history.undo(this.current);
    if (previous) this.restore(previous);
  }

  /** Steps forward in the local history. */
  redo(): void {
    const next = this.history.redo(this.current);
    if (next) this.restore(next);
  }

  /**
   * Returns whether undo and redo are possible.
   *
   * @returns Undo and redo availability.
   */
  historyState(): { undo: boolean; redo: boolean } {
    return { undo: this.history.canUndo(), redo: this.history.canRedo() };
  }

  /**
   * Runs one edit as an undo step and commits it.
   *
   * @param change Returns the edited curve.
   */
  private apply(change: (curve: Curve) => Curve): void {
    const next = change(this.current);
    if (curveEquals(next, this.current)) return this.listener.onState();
    this.history.record(this.current);
    this.current = next;
    this.listener.onCommit(this.current);
    this.listener.onState();
  }

  /**
   * Shows an undo or redo result.
   *
   * @param curve Restored curve.
   */
  private restore(curve: Curve): void {
    this.current = curve;
    if (this.selection?.kind === 'point' && this.selection.index >= curve.points.length) this.selection = null;
    if (this.selection?.kind === 'segment' && this.selection.index >= curve.segments.length) this.selection = null;
    this.listener.onCommit(this.current);
    this.listener.onState();
  }

  /**
   * Shows a drag step.
   *
   * @param curve Dragged curve.
   */
  private preview(curve: Curve): void {
    if (curveEquals(curve, this.current)) return;
    this.current = curve;
    this.listener.onPreview(this.current);
  }
}
