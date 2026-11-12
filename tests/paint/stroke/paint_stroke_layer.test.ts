import { describe, expect, it } from 'vitest';
import { PaintStrokeLayer } from '@/paint/stroke/paint_stroke_layer.js';
import { testFloorStroke } from '../paint_test_strokes.js';

describe('Paint stroke layer', () => {
  it('keeps strokes ordered and hands out the next order', () => {
    const layer = new PaintStrokeLayer();
    expect(layer.nextOrder()).toBe(1);
    layer.add(testFloorStroke('late', 5, [[0, 0, 0]]));
    layer.add(testFloorStroke('early', 2, [[0, 0, 0]]));
    expect(layer.ordered().map((stroke) => stroke.id)).toEqual(['early', 'late']);
    expect(layer.nextOrder()).toBe(6);
  });

  it('bumps its revision on every change', () => {
    const layer = new PaintStrokeLayer();
    const start = layer.revision;
    layer.add(testFloorStroke('a', 1, [[0, 0, 0]]));
    layer.remove('a');
    expect(layer.revision).toBe(start + 2);
    layer.remove('missing');
    expect(layer.revision).toBe(start + 2);
  });

  it('round-trips through its saved form and omits empty paint', () => {
    const layer = new PaintStrokeLayer();
    expect(layer.encode()).toBeUndefined();
    layer.add(testFloorStroke('a', 1, [[0, 1, 0]]));
    layer.add(testFloorStroke('b', 2, [[1, 1, 0]], { mode: 'erase' }));
    const decoded = PaintStrokeLayer.decode(JSON.parse(JSON.stringify(layer.encode())));
    expect(decoded.ordered().map((stroke) => [stroke.id, stroke.mode])).toEqual([
      ['a', 'paint'],
      ['b', 'erase'],
    ]);
  });

  it('skips invalid entries when decoding', () => {
    const layer = new PaintStrokeLayer();
    layer.add(testFloorStroke('a', 1, [[0, 1, 0]]));
    const saved = { ...layer.encode(), broken: { order: 'x' } };
    expect(PaintStrokeLayer.decode(saved).size).toBe(1);
    expect(PaintStrokeLayer.decode('nonsense').size).toBe(0);
  });

  it('clones independently and only changes when replaced with other strokes', () => {
    const layer = new PaintStrokeLayer();
    layer.add(testFloorStroke('a', 1, [[0, 1, 0]]));
    const copy = layer.clone();
    copy.add(testFloorStroke('b', 2, [[0, 1, 0]]));
    expect(layer.size).toBe(1);
    const revision = layer.revision;
    layer.replaceFrom(layer.clone());
    expect(layer.revision).toBe(revision);
    layer.replaceFrom(copy);
    expect(layer.size).toBe(2);
    expect(layer.revision).toBeGreaterThan(revision);
  });
});
