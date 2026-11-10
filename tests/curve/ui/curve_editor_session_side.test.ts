import { describe, expect, it } from 'vitest';
import { curveDecode, curveEncode } from '@/curve/model/curve_codec.js';
import { curveFromPolyline, type Curve } from '@/curve/model/curve_model.js';
import { curveEditorKeyAction } from '@/curve/ui/curve_editor_keys.js';
import { CurveEditorSession } from '@/curve/ui/curve_editor_session.js';
import { CurveHistoryFake } from './curve_history_fake.js';

/**
 * Creates a session on a two-segment bar curve with the first segment active.
 *
 * @returns Session, its commits and the history they enter.
 */
function session() {
  const commits: Curve[] = [];
  const curve = curveFromPolyline([
    [0, 0.4],
    [0.5, 0.4],
    [1, 0.2],
  ]);
  const history = new CurveHistoryFake(curve, (next) => editor.adopt(next));
  const editor = new CurveEditorSession(curve, {
    onPreview: () => undefined,
    onCommit: (next) => {
      commits.push(next);
      history.commit(next);
    },
    onState: () => undefined,
  });
  editor.snapOn = false;
  editor.selectPoints([0, 1, 2], 'replace');
  editor.setSection('bar');
  return { editor, commits, history };
}

/**
 * Builds a key press.
 *
 * @param key Key name.
 * @returns Keyboard event.
 */
function press(key: string): KeyboardEvent {
  return new KeyboardEvent('keydown', { key, code: key });
}

/** View actions that do nothing. */
const VIEW = { frameAll: () => undefined, rotate: () => undefined, undo: () => undefined, redo: () => undefined };

describe('curve editor session side lines', () => {
  it('offers the secondary line only after a segment uses the custom side', () => {
    const { editor } = session();
    expect(editor.layerAvailable()).toBe(false);
    editor.toggleLayer();
    expect(editor.layer).toBe('primary');
    editor.setSide('positive');
    expect(editor.sideType()).toBe('positive');
    expect(editor.layerAvailable()).toBe(false);
    editor.setSide('custom');
    expect(editor.layerAvailable()).toBe(true);
    expect(editor.fullCurve.secondary?.points).toEqual(editor.fullCurve.points);
  });

  it('edits only the active line and keeps the other one intact', () => {
    const { editor } = session();
    editor.setSide('custom');
    editor.toggleLayer();
    expect(editor.layer).toBe('secondary');
    expect(editor.selection).toBeNull();
    editor.dragStart();
    editor.dragPoint(1, 0.5, 0.1);
    editor.dragEnd();
    expect(editor.curve.points[1]?.y).toBeCloseTo(0.1);
    expect(editor.fullCurve.points[1]?.y).toBeCloseTo(0.4);
    expect(editor.fullCurve.secondary?.points[1]?.y).toBeCloseTo(0.1);
    expect(editor.fullCurve.segments[0]?.side).toBe('custom');
  });

  it('undoes secondary edits and side changes as single steps', () => {
    const { editor, history } = session();
    editor.setSide('custom');
    editor.setLayer('secondary');
    editor.movePointTo(1, 0.5, 0.1);
    history.undo();
    expect(editor.fullCurve.secondary?.points[1]?.y).toBeCloseTo(0.4);
    history.undo();
    expect(editor.fullCurve.secondary).toBeUndefined();
    expect(editor.layer).toBe('primary');
    expect(editor.fullCurve.segments[0]?.side).toBeUndefined();
  });

  it('locks the section settings while the secondary line is edited', () => {
    const { editor } = session();
    editor.setSide('custom');
    editor.setLayer('secondary');
    editor.selectPoints([0, 1], 'replace');
    editor.setSection('round');
    editor.setFixedDepth(true);
    editor.setSide('mirror');
    expect(editor.fullCurve.segments[0]?.section).toBe('bar');
    expect(editor.fullCurve.segments[0]?.side).toBe('custom');
    expect(editor.fullCurve.segments[0]?.fixedDepth).toBeUndefined();
  });

  it('mirrors both lines together and keeps them through the codec', () => {
    const { editor } = session();
    editor.setSide('custom');
    editor.setLayer('secondary');
    editor.movePointTo(1, 0.5, 0.1);
    editor.mirror();
    expect(editor.fullCurve.secondary?.points[0]?.y).toBeCloseTo(0.2);
    expect(editor.fullCurve.points[0]?.y).toBeCloseTo(0.2);
    const decoded = curveDecode(curveEncode(editor.fullCurve));
    expect(decoded?.secondary?.points[1]?.y).toBeCloseTo(0.1);
  });

  it('switches lines with Tab only when a secondary line exists', () => {
    const { editor } = session();
    expect(curveEditorKeyAction(press('Tab'), editor, VIEW)).toBe(false);
    editor.setSide('custom');
    expect(curveEditorKeyAction(press('Tab'), editor, VIEW)).toBe(true);
    expect(editor.layer).toBe('secondary');
    curveEditorKeyAction(press('Tab'), editor, VIEW);
    expect(editor.layer).toBe('primary');
  });

  it('returns to the main line when the custom side is removed', () => {
    const { editor } = session();
    editor.setSide('custom');
    editor.setLayer('secondary');
    editor.setLayer('primary');
    editor.selectPoints([0, 1, 2], 'replace');
    editor.setSide('mirror');
    editor.setLayer('secondary');
    expect(editor.layer).toBe('primary');
  });

  it('marks fixed depth on the targeted segments', () => {
    const { editor } = session();
    editor.setSection('square');
    editor.setFixedDepth(true);
    expect(editor.fullCurve.segments.every((segment) => segment.fixedDepth)).toBe(true);
    editor.setFixedDepth(false);
    expect(editor.fullCurve.segments.some((segment) => segment.fixedDepth)).toBe(false);
  });
});
