import { describe, expect, it } from 'vitest';
import { curveFromPolyline, type Curve } from '@/curve/model/curve_model.js';
import { CurveEditorSession } from '@/curve/ui/curve_editor_session.js';
import { CurveHistoryFake } from './curve_history_fake.js';

/**
 * Creates a session that records what it reports.
 *
 * @returns Session, the reported previews and commits, and the history the
 *   commits enter.
 */
function session() {
  const previews: Curve[] = [];
  const commits: Curve[] = [];
  const curve = curveFromPolyline([
    [0, 0.2],
    [0.5, 0.6],
    [1, 0.2],
  ]);
  const history = new CurveHistoryFake(curve, (next) => editor.adopt(next));
  const editor = new CurveEditorSession(curve, {
    onPreview: (next) => previews.push(next),
    onCommit: (next) => {
      commits.push(next);
      history.commit(next);
    },
    onState: () => undefined,
  });
  return { editor, previews, commits, history };
}

describe('curve editor session', () => {
  it('previews every drag step and commits the drag once as one undo step', () => {
    const { editor, previews, commits, history } = session();
    editor.snapOn = false;
    editor.dragStart();
    editor.dragPoint(1, 0.4, 0.7);
    editor.dragPoint(1, 0.45, 0.8);
    editor.dragEnd();
    expect(previews).toHaveLength(2);
    expect(commits).toHaveLength(1);
    expect(editor.curve.points[1]?.y).toBeCloseTo(0.8);
    history.undo();
    expect(editor.curve.points[1]?.y).toBeCloseTo(0.6);
    history.redo();
    expect(editor.curve.points[1]?.y).toBeCloseTo(0.8);
  });

  it('snaps drags to the grid step', () => {
    const { editor } = session();
    editor.snapStep = 0.25;
    editor.dragStart();
    editor.dragPoint(1, 0.31, 0.62);
    editor.dragEnd();
    expect(editor.curve.points[1]?.x).toBeCloseTo(0.25);
    expect(editor.curve.points[1]?.y).toBeCloseTo(0.5);
  });

  it('inserts a point where double-clicked and selects it, but never deletes the ends', () => {
    const { editor } = session();
    editor.snapOn = false;
    editor.insertAt(0.25, 0.9);
    expect(editor.curve.points).toHaveLength(4);
    expect(editor.selection).toEqual({ kind: 'point', index: 1 });
    expect(editor.curve.points[1]?.y).toBeCloseTo(0.9);
    editor.select({ kind: 'point', index: 0 });
    editor.deleteSelected();
    expect(editor.curve.points).toHaveLength(4);
    editor.select({ kind: 'point', index: 1 });
    editor.deleteSelected();
    expect(editor.curve.points).toHaveLength(3);
  });

  it('switches the selected segment between linear, quadratic and bezier', () => {
    const { editor } = session();
    editor.select({ kind: 'segment', index: 1 });
    editor.setMode('bezier');
    expect(editor.curve.segments[1]?.mode).toBe('bezier');
    editor.setDetail(3);
    expect(editor.curve.segments[1]?.detail).toBe(3);
    editor.straighten();
    expect(editor.curve.segments[1]?.mode).toBe('linear');
  });

  it('adopts outside changes without an undo step and ignores them mid-drag', () => {
    const { editor, commits } = session();
    const outside = curveFromPolyline([
      [0, 1],
      [1, 1],
    ]);
    editor.adopt(outside);
    expect(editor.curve.points).toHaveLength(2);
    expect(commits).toHaveLength(0);
    editor.dragStart();
    editor.adopt(
      curveFromPolyline([
        [0, 0],
        [1, 0],
      ]),
    );
    expect(editor.curve.points[0]?.y).toBe(1);
  });

  it('inverts the Snap setting while Shift is held', () => {
    const { editor } = session();
    editor.snapStep = 0.05;
    for (const [snapOn, shiftHeld, snapped] of [
      [true, false, true],
      [true, true, false],
      [false, false, false],
      [false, true, true],
    ] as const) {
      editor.snapOn = snapOn;
      editor.shiftHeld = shiftHeld;
      expect(editor.snapActive()).toBe(snapped);
      expect(editor.snap(0.512)).toBeCloseTo(snapped ? 0.5 : 0.512, 9);
    }
  });
});

describe('curve editor session multi-selection', () => {
  it('replaces, adds and toggles points; the last added point is primary', () => {
    const { editor } = session();
    editor.selectPoints([0, 1], 'replace');
    expect(editor.points).toEqual([0, 1]);
    expect(editor.selection).toEqual({ kind: 'point', index: 1 });
    editor.selectPoints([2], 'add');
    expect(editor.points).toEqual([0, 1, 2]);
    editor.selectPoints([1], 'toggle');
    expect(editor.points).toEqual([0, 2]);
    editor.select({ kind: 'segment', index: 0 });
    expect(editor.points).toEqual([]);
    editor.selectPoints([], 'replace');
    expect(editor.selection).toBeNull();
  });

  it('drags the group from its start, snapped, as one undo step', () => {
    const { editor, commits, history } = session();
    editor.snapStep = 0.05;
    editor.selectPoints([0, 1], 'replace');
    editor.dragStart();
    editor.dragGroup(1, { x: 0.52, y: 0.73 });
    editor.dragGroup(1, { x: 0.61, y: 0.74 });
    editor.dragEnd();
    expect(commits).toHaveLength(1);
    expect(editor.curve.points.map((point) => [Number(point.x.toFixed(6)), Number(point.y.toFixed(6))])).toEqual([
      [0, 0.35],
      [0.6, 0.75],
      [1, 0.2],
    ]);
    history.undo();
    expect(editor.curve.points[1]?.x).toBe(0.5);
  });

  it('scales from the opposite edge and deletes every selected inner point', () => {
    const { editor } = session();
    editor.snapOn = false;
    editor.selectPoints([0, 1, 2], 'replace');
    editor.dragStart();
    editor.dragScale({ x: 0, y: 1 }, { x: 0.5, y: 1 });
    editor.dragEnd();
    expect(editor.curve.points.map((point) => Number(point.y.toFixed(6)))).toEqual([0.2, 1, 0.2]);
    editor.selectPoints([0, 1, 2], 'replace');
    editor.deleteSelected();
    expect(editor.curve.points).toHaveLength(2);
    expect(editor.points).toEqual([]);
  });
});

describe('curve editor session sections', () => {
  it('cycles the active segment or marquee-selected segments through all sections', () => {
    const { editor, history } = session();
    editor.select({ kind: 'segment', index: 1 });
    editor.cycleSection();
    expect(editor.curve.segments.map((segment) => segment.section ?? 'round')).toEqual(['round', 'square']);
    expect(editor.sectionType()).toBe('square');
    editor.selectPoints([0, 1, 2], 'replace');
    expect(editor.sectionTargets()).toEqual([0, 1]);
    editor.cycleSection();
    expect(editor.curve.segments.every((segment) => segment.section === 'square')).toBe(true);
    editor.setSectionProperty('cornerSize', 0.6);
    expect(editor.curve.segments.every((segment) => segment.cornerSize === 0.6)).toBe(true);
    editor.cycleSection();
    expect(editor.sectionType()).toBe('polygon');
    expect(editor.curve.segments.every((segment) => segment.cornerSize === 0.6)).toBe(true);
    editor.cycleSection();
    expect(editor.sectionType()).toBe('cross');
    expect(editor.curve.segments.every((segment) => segment.armWidth !== undefined && !segment.cornerSize)).toBe(true);
    editor.cycleSection();
    expect(editor.sectionType()).toBe('bar');
    expect(editor.curve.segments.every((segment) => segment.armWidth !== undefined)).toBe(true);
    editor.cycleSection();
    expect(editor.sectionType()).toBe('stadium');
    expect(editor.curve.segments.every((segment) => segment.straight !== undefined && !segment.armWidth)).toBe(true);
    editor.cycleSection();
    expect(editor.curve.segments.every((segment) => segment.section === undefined)).toBe(true);
    history.undo();
    expect(editor.sectionType()).toBe('stadium');
  });
});
