import { describe, expect, it } from 'vitest';
import { paintStrokeDecode, paintStrokeEncode } from '@/paint/stroke/paint_stroke_codec.js';
import { paintStrokeCompare } from '@/paint/stroke/paint_stroke.js';
import { testFloorStroke } from '../paint_test_strokes.js';

describe('Paint stroke codec', () => {
  it('round-trips a stroke exactly once dabs are quantized', () => {
    const stroke = testFloorStroke(
      's1',
      3,
      [
        [0.123456, 1, -2.5],
        [0.25, 1, -2.4],
      ],
      { color: 0x12abef, stencilTextureId: 'tex-a', stencilScale: 2, opacity: 0.5 },
    );
    const decoded = paintStrokeDecode('s1', JSON.parse(JSON.stringify(paintStrokeEncode(stroke))));
    expect(decoded).not.toBeNull();
    expect(decoded?.color).toBe(0x12abef);
    expect(decoded?.stencilTextureId).toBe('tex-a');
    expect(decoded?.stencilScale).toBe(2);
    expect(decoded?.opacity).toBe(0.5);
    expect(Array.from(decoded?.dabs ?? [])).toEqual(Array.from(stroke.dabs));
  });

  it('omits optional texture fields when unused', () => {
    const encoded = paintStrokeEncode(testFloorStroke('s1', 1, [[0, 0, 0]]));
    expect('stencilTextureId' in encoded).toBe(false);
    expect('stampTextureId' in encoded).toBe(false);
  });

  it('rejects malformed strokes', () => {
    expect(paintStrokeDecode('s1', null)).toBeNull();
    expect(paintStrokeDecode('s1', { order: 1 })).toBeNull();
    const encoded = paintStrokeEncode(testFloorStroke('s1', 1, [[0, 0, 0]]));
    expect(paintStrokeDecode('s1', { ...encoded, mode: 'smudge' })).toBeNull();
    expect(paintStrokeDecode('s1', { ...encoded, dabs: '' })).toBeNull();
    expect(paintStrokeDecode('', encoded)).toBeNull();
  });

  it('clamps opacity and hardness into range', () => {
    const encoded = paintStrokeEncode(testFloorStroke('s1', 1, [[0, 0, 0]]));
    const decoded = paintStrokeDecode('s1', { ...encoded, opacity: 4, hardness: -1 });
    expect(decoded?.opacity).toBe(1);
    expect(decoded?.hardness).toBe(0);
  });

  it('orders strokes by order then id', () => {
    const first = testFloorStroke('b', 1, [[0, 0, 0]]);
    const second = testFloorStroke('a', 2, [[0, 0, 0]]);
    const tie = testFloorStroke('a', 1, [[0, 0, 0]]);
    expect([second, first, tie].sort(paintStrokeCompare).map((stroke) => stroke.id + stroke.order)).toEqual([
      'a1',
      'b1',
      'a2',
    ]);
  });
});
