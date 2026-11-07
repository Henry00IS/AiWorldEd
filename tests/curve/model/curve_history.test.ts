import { describe, expect, it } from 'vitest';
import { CURVE_HISTORY_LIMIT, CurveHistory } from '@/curve/model/curve_history.js';
import { curveFromPolyline, curveEquals } from '@/curve/model/curve_model.js';
import { curveMovePoint } from '@/curve/model/curve_constrain.js';

describe('curve history', () => {
  it('undoes and redoes edits', () => {
    const history = new CurveHistory();
    const first = curveFromPolyline([
      [0, 0],
      [1, 0],
    ]);
    const second = curveMovePoint(first, 0, 0, 0.5);
    history.record(first);
    expect(history.canUndo()).toBe(true);
    const undone = history.undo(second);
    if (!undone) throw new Error('Expected an undo');
    expect(curveEquals(undone, first)).toBe(true);
    const redone = history.redo(undone);
    if (!redone) throw new Error('Expected a redo');
    expect(curveEquals(redone, second)).toBe(true);
    expect(history.canRedo()).toBe(false);
  });

  it('keeps a bounded number of steps', () => {
    const history = new CurveHistory();
    const curve = curveFromPolyline([
      [0, 0],
      [1, 0],
    ]);
    for (let index = 0; index < CURVE_HISTORY_LIMIT + 10; index++)
      history.record(curveMovePoint(curve, 0, 0, (index % 2) * 0.5));
    let undone = 0;
    while (history.undo(curve)) undone++;
    expect(undone).toBe(CURVE_HISTORY_LIMIT);
  });
});
