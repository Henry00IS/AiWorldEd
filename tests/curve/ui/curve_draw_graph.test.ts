import { describe, expect, it } from 'vitest';
import { curveMarkerSwitch } from '@/curve/model/curve_markers.js';
import { curveFromPolyline, type Curve } from '@/curve/model/curve_model.js';
import { curveDrawGraph, curveDrawGraphPng } from '@/curve/ui/curve_draw_graph.js';

/** One recorded canvas call. */
interface Call {
  /** Method name. */
  name: string;
  /** Arguments. */
  args: unknown[];
}

/**
 * Creates a canvas whose context records every method call.
 *
 * @param width Canvas width in device pixels.
 * @param height Canvas height in device pixels.
 * @returns Canvas and its recorded calls.
 */
function recordingCanvas(width: number, height: number): { canvas: HTMLCanvasElement; calls: Call[] } {
  const calls: Call[] = [];
  const gradient = { addColorStop: () => undefined };
  const context = new Proxy(
    {},
    {
      get:
        (_target, name) =>
        (...args: unknown[]) => {
          calls.push({ name: String(name), args });
          return name === 'createLinearGradient' ? gradient : undefined;
        },
      set: () => true,
    },
  );
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext = (() => context) as never;
  canvas.toBlob = (done: BlobCallback) => done(new Blob(['png'], { type: 'image/png' }));
  return { canvas, calls };
}

/** A three-point curve with a square middle segment and Base and Top on. */
const CURVE: Curve = (() => {
  const curve = curveFromPolyline([
    [0, 0.4],
    [0.5, 1],
    [1, 0.2],
  ]);
  curve.segments[1]!.section = 'square';
  return curveMarkerSwitch(curveMarkerSwitch(curve, 'bottom', true), 'top', true);
})();

describe('curve graph previews', () => {
  it('draws the editor graph: grid labels, markers and every point', () => {
    const { canvas, calls } = recordingCanvas(592, 192);
    curveDrawGraph(canvas, CURVE, 296, 96);
    expect(calls[0]).toEqual({ name: 'setTransform', args: [2, 0, 0, 2, 0, 0] });
    const texts = calls.filter((call) => call.name === 'fillText').map((call) => call.args[0]);
    expect(texts).toEqual(expect.arrayContaining(['x0', 'x1', 'y1', 'base', 'top']));
    const points = calls.filter((call) => call.name === 'strokeRect');
    expect(points).toHaveLength(CURVE.points.length);
  });

  it('draws smaller points on chat cards than on link previews', () => {
    const pointWidth = (width: number, height: number) => {
      const { canvas, calls } = recordingCanvas(width * 2, height * 2);
      curveDrawGraph(canvas, CURVE, width, height);
      return calls.find((call) => call.name === 'strokeRect')!.args[2] as number;
    };
    expect(pointWidth(296, 96)).toBe(5);
    expect(pointWidth(600, 315)).toBe(8);
  });

  it('draws the secondary line only when a segment uses it', () => {
    const custom = structuredClone(CURVE);
    custom.secondary = {
      points: structuredClone(custom.points),
      segments: [
        { mode: 'linear', detail: 8 },
        { mode: 'linear', detail: 8 },
      ],
    };
    const strokes = (curve: Curve) => {
      const { canvas, calls } = recordingCanvas(600, 315);
      curveDrawGraph(canvas, curve, 600, 315);
      return calls.filter((call) => call.name === 'stroke').length;
    };
    expect(strokes(custom)).toBe(strokes(CURVE));
    custom.segments[0]!.side = 'custom';
    expect(strokes(custom)).toBeGreaterThan(strokes(CURVE));
  });

  it('encodes link previews drawn at half size and doubled', async () => {
    const { canvas, calls } = recordingCanvas(1, 1);
    const create = document.createElement.bind(document);
    document.createElement = ((tag: string) =>
      tag === 'canvas' ? canvas : create(tag)) as typeof document.createElement;
    try {
      const png = await curveDrawGraphPng(CURVE, 1200, 630);
      expect(png?.type).toBe('image/png');
    } finally {
      document.createElement = create;
    }
    expect([canvas.width, canvas.height]).toEqual([1200, 630]);
    expect(calls[0]).toEqual({ name: 'setTransform', args: [2, 0, 0, 2, 0, 0] });
  });
});
