import { describe, expect, it } from 'vitest';
import { curveFromPolyline, type Curve } from '@/curve/model/curve_model.js';
import { CurveEditorSession } from '@/curve/ui/curve_editor_session.js';

/**
 * Creates a session that records what it reports.
 *
 * @returns Session and the reported previews and commits.
 */
function session() {
  const previews: Curve[] = [];
  const commits: Curve[] = [];
  const curve = curveFromPolyline([
    [0, 0.2],
    [0.5, 0.6],
    [1, 0.2],
  ]);
  const editor = new CurveEditorSession(curve, {
    onPreview: (next) => previews.push(next),
    onCommit: (next) => commits.push(next),
    onState: () => undefined,
  });
  return { editor, previews, commits };
}

describe('curve editor session', () => {
  it('previews every drag step and commits the drag once as one undo step', () => {
    const { editor, previews, commits } = session();
    editor.snapOn = false;
    editor.dragStart();
    editor.dragPoint(1, 0.4, 0.7);
    editor.dragPoint(1, 0.45, 0.8);
    editor.dragEnd();
    expect(previews).toHaveLength(2);
    expect(commits).toHaveLength(1);
    expect(editor.curve.points[1]?.y).toBeCloseTo(0.8);
    editor.undo();
    expect(editor.curve.points[1]?.y).toBeCloseTo(0.6);
    editor.redo();
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
    expect(editor.historyState().undo).toBe(false);
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
