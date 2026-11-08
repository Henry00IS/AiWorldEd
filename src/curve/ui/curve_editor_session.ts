import { CURVE_SECTION_CHOICES, type CurveSectionParameter } from '@/curve/model/curve_section.js';
import type { CurveSegmentSection } from '@/curve/model/curve_model.js';
import { curveMoveHandle, curveMovePoint } from '@/curve/model/curve_constrain.js';
import {
  curveDeletePoint,
  curveFlip,
  curveInsertPoint,
  curveMirror,
  curveSegmentDetailSet,
  curveSegmentFlatten,
  curveSegmentModeSet,
  curveSegmentSectionSet,
  curveSegmentPropertySet,
  curveSegmentStraighten,
} from '@/curve/model/curve_edit.js';
import { CurveHistory } from '@/curve/model/curve_history.js';
import {
  curveClone,
  curveEquals,
  type Curve,
  type CurveSegmentMode,
  type CurveVector,
} from '@/curve/model/curve_model.js';
import { curveGroupBounds, curveMovePoints, curveScalePoints } from '@/curve/model/curve_group.js';
import type { CurveEditorHandleRef, CurveEditorSelection } from './curve_editor_hit.js';
import { curveMarkerSet, curveMarkerSwitch, type CurveMarkerSide } from '@/curve/model/curve_markers.js';
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

/** How a marquee or modifier click changes the point selection. */
export type CurveEditorSelectMode = 'replace' | 'add' | 'toggle';

/** Box side a scale grip drags: -1 the low edge, 1 the high edge, 0 neither. */
export interface CurveEditorGrip {
  /** Horizontal edge. */
  x: -1 | 0 | 1;
  /** Vertical edge. */
  y: -1 | 0 | 1;
}

/** Default snap step in curve units. */
export const CURVE_EDITOR_SNAP_DEFAULT = 0.01;

/**
 * Editing state of one open curve editor: the curve, selection, snapping, local
 * undo history, and every edit operation. Holds no DOM.
 */
export class CurveEditorSession {
  selection: CurveEditorSelection = null;
  /** Selected point indices in order; the primary selection is one of them. */
  points: number[] = [];
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
    this.points = selection?.kind === 'point' ? [selection.index] : [];
    this.listener.onState();
  }

  /**
   * Changes the point selection, as a marquee or a Shift or Ctrl click does.
   * The last point added becomes the primary selection.
   *
   * @param indices Points picked.
   * @param mode Replace the selection, add to it, or toggle each point.
   */
  selectPoints(indices: readonly number[], mode: CurveEditorSelectMode): void {
    const chosen = new Set(mode === 'replace' ? [] : this.points);
    for (const index of indices) {
      if (mode === 'toggle' && chosen.has(index)) chosen.delete(index);
      else chosen.add(index);
    }
    this.points = [...chosen].filter((index) => index < this.current.points.length).sort((a, b) => a - b);
    const added = indices.filter((index) => chosen.has(index));
    const primary = added[added.length - 1] ?? this.points[this.points.length - 1];
    this.selection = primary === undefined ? null : { kind: 'point', index: primary };
    this.listener.onState();
  }

  /**
   * Returns whether a point is selected.
   *
   * @param index Point index.
   * @returns True when selected.
   */
  isPointSelected(index: number): boolean {
    return this.points.includes(index);
  }

  /** Clears the selection without notifying. */
  private clearSelection(): void {
    this.selection = null;
    this.points = [];
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

  /**
   * Moves the selected points together so the grabbed one follows the pointer,
   * snapped; the group never passes its neighbours.
   *
   * @param index Grabbed point.
   * @param wanted Wanted position of the grabbed point.
   */
  dragGroup(index: number, wanted: CurveVector): void {
    const base = this.dragBefore ?? this.current;
    const point = base.points[index];
    if (!point) return;
    const dx = this.snap(wanted.x) - point.x;
    this.preview(curveMovePoints(base, this.points, dx, this.snap(wanted.y) - point.y));
  }

  /**
   * Scales the selected points by dragging one edge or corner of their box; the
   * opposite edge stays put.
   *
   * @param grip Dragged edge or corner.
   * @param at Pointer in curve units.
   */
  dragScale(grip: CurveEditorGrip, at: CurveVector): void {
    const base = this.dragBefore ?? this.current;
    const box = curveGroupBounds(base, this.points);
    if (!box) return;
    const anchor = { x: grip.x < 0 ? box.max.x : box.min.x, y: grip.y < 0 ? box.max.y : box.min.y };
    const factor = (side: number, edge: number, from: number, to: number) =>
      side === 0 || Math.abs(edge - from) < 1e-9 ? 1 : (to - from) / (edge - from);
    const sx = factor(grip.x, grip.x < 0 ? box.min.x : box.max.x, anchor.x, this.snap(at.x));
    const sy = factor(grip.y, grip.y < 0 ? box.min.y : box.max.y, anchor.y, this.snap(at.y));
    this.preview(curveScalePoints(base, this.points, anchor, { x: sx, y: sy }));
  }

  /**
   * Drags a section marker along x, snapped; it never passes the other marker.
   *
   * @param side Marker.
   * @param x Wanted x.
   */
  dragMarker(side: CurveMarkerSide, x: number): void {
    this.preview(curveMarkerSet(this.current, side, this.snap(x)));
  }

  /**
   * Switches a marker on at its remembered place, or off while remembering it,
   * as one undo step.
   *
   * @param side Marker.
   * @param on True to switch on, false to switch off.
   */
  setMarker(side: CurveMarkerSide, on: boolean): void {
    this.apply((curve) => curveMarkerSwitch(curve, side, on));
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
    this.clearSelection();
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
    this.points = [index];
    this.apply(() => curveMovePoint(curve, index, this.snap(x), this.snap(y)));
  }

  /** Deletes the selected inner points as one undo step; the ends stay. */
  deleteSelected(): void {
    const last = this.current.points.length - 1;
    const doomed = this.points.filter((index) => index > 0 && index < last).sort((a, b) => b - a);
    if (doomed.length === 0) return;
    this.clearSelection();
    this.apply((curve) => doomed.reduce((result, index) => curveDeletePoint(result, index), curve));
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

  /**
   * Returns the segments the section toggle acts on: those joining two selected
   * points, or else the active segment.
   *
   * @returns Segment indices.
   */
  sectionTargets(): number[] {
    const joined = this.points.filter(
      (index) => this.points.includes(index + 1) && index < this.current.segments.length,
    );
    if (joined.length > 0) return joined;
    const segment = this.activeSegment();
    return segment >= 0 ? [segment] : [];
  }

  /**
   * Returns the common section type, or an empty string for mixed selections.
   *
   * @returns Shared section type.
   */
  sectionType(): CurveSegmentSection | '' {
    const types = this.sectionTargets().map((index) => this.current.segments[index]?.section ?? 'round');
    return types.length > 0 && types.every((type) => type === types[0]) ? (types[0] ?? '') : '';
  }

  /**
   * Applies a section type to all targeted segments.
   *
   * @param section New section type.
   */
  setSection(section: CurveSegmentSection): void {
    const targets = this.sectionTargets();
    if (targets.length > 0) this.apply((curve) => curveSegmentSectionSet(curve, targets, section));
  }

  /** Cycles selected segments through round, square and polygon. */
  cycleSection(): void {
    const types = CURVE_SECTION_CHOICES.map((choice) => choice.value);
    this.setSection(types[(types.indexOf(this.sectionType() || 'round') + 1) % types.length] ?? 'round');
  }

  /**
   * Applies a section setting to the segments captured when editing began.
   *
   * @param property Numeric section property.
   * @param value New value.
   * @param targets Selected segment indices.
   */
  setSectionProperty(property: CurveSectionParameter, value: number, targets = this.sectionTargets()): void {
    if (targets.length > 0) this.apply((curve) => curveSegmentPropertySet(curve, targets, property, value));
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
    this.clearSelection();
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
    this.clearSelection();
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
    this.points = this.points.filter((index) => index < curve.points.length);
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
