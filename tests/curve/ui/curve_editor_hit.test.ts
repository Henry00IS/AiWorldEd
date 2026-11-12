import { describe, expect, it } from 'vitest';
import { curveFromPolyline } from '@/curve/model/curve_model.js';
import { curveSegmentModeSet } from '@/curve/model/curve_edit.js';
import { curveEditorHitTest, curveEditorVisibleHandles } from '@/curve/ui/curve_editor_hit.js';
import { CurveEditorView } from '@/curve/ui/curve_editor_view.js';

describe('curve editor hit testing', () => {
  it('finds points, then segments, and shows handles only of bent segments next to the selection', () => {
    const view = new CurveEditorView();
    view.resize(300, 300);
    view.frameAll();
    const curve = curveSegmentModeSet(
      curveFromPolyline([
        [0, 0],
        [0.5, 0.5],
        [1, 0.5],
      ]),
      0,
      'bezier',
    );
    expect(curveEditorHitTest(curve, view, null, view.toScreen({ x: 0.5, y: 0.5 }))).toEqual({
      kind: 'point',
      index: 1,
    });
    expect(curveEditorHitTest(curve, view, null, view.toScreen({ x: 0.75, y: 0.5 }))).toEqual({
      kind: 'segment',
      index: 1,
    });
    expect(curveEditorHitTest(curve, view, null, view.toScreen({ x: 0.75, y: 0.1 }))).toBeNull();
    expect(curveEditorVisibleHandles(curve, { kind: 'segment', index: 1 })).toEqual([]);
    expect(curveEditorVisibleHandles(curve, { kind: 'segment', index: 0 })).toHaveLength(2);
  });
});
