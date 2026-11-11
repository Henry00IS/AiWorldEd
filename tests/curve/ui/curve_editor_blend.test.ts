import { describe, expect, it } from 'vitest';
import { curveFromPolyline, type Curve } from '@/curve/model/curve_model.js';
import { CurveEditorSession } from '@/curve/ui/curve_editor_session.js';
import { CurveEditorBlendControl } from '@/curve/ui/curve_editor_blend_control.js';
import { CurveHistoryFake } from './curve_history_fake.js';

/**
 * Creates a session on a square block below a round shaft, with Blend off and
 * the shaft segment active.
 *
 * @returns Session, its commits and the history they enter.
 */
function session() {
  const commits: Curve[] = [];
  const curve = curveFromPolyline([
    [0, 0.5],
    [0.5, 0.5],
    [1, 0.5],
  ]);
  curve.segments[0]!.section = 'square';
  const history = new CurveHistoryFake(curve, (next) => editor.adopt(next));
  const editor = new CurveEditorSession(curve, {
    onPreview: () => undefined,
    onCommit: (next) => {
      commits.push(next);
      history.commit(next);
    },
    onState: () => undefined,
  });
  editor.select({ kind: 'segment', index: 1 });
  return { editor, commits, history };
}

describe('curve editor blend', () => {
  it('turns Blend on and off as single undoable steps', () => {
    const { editor, commits, history } = session();
    editor.setBlend(true);
    expect(commits).toHaveLength(1);
    expect(editor.curve.segments[1]?.blend).toBe(true);
    editor.setBlend(false);
    expect(editor.curve.segments[1]?.blend).toBeUndefined();
    history.undo();
    expect(editor.curve.segments[1]?.blend).toBe(true);
    history.undo();
    expect(editor.curve.segments[1]?.blend).toBeUndefined();
    history.redo();
    expect(editor.curve.segments[1]?.blend).toBe(true);
  });

  it('shows the checkbox only where a section changes, with the shared state', () => {
    const { editor } = session();
    const control = new CurveEditorBlendControl(editor);
    const checkbox = control.element().querySelector('input')!;
    control.refresh([1]);
    expect(control.element().style.display).toBe('inline-flex');
    expect(checkbox.checked).toBe(false);
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change'));
    expect(editor.curve.segments[1]?.blend).toBe(true);
    control.refresh([0, 1]);
    expect(checkbox.indeterminate).toBe(true);
    control.refresh([]);
    expect(control.element().style.display).toBe('none');
    editor.setSection('square');
    control.refresh([1]);
    expect(control.element().style.display).toBe('none');
  });
});
