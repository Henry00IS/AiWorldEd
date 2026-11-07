import { describe, expect, it } from 'vitest';
import { curveDecode, curveEncode } from '@/curve/model/curve_codec.js';
import { curveMirror } from '@/curve/model/curve_edit.js';
import { CURVE_FILE_VERSION, curveFileRead, curveFileWrite } from '@/curve/model/curve_file.js';
import {
  CURVE_MARKER_GAP,
  curveMarkerSet,
  curveMarkersConstrain,
  curveMarkersHeightMap,
} from '@/curve/model/curve_markers.js';
import { curveFromPolyline } from '@/curve/model/curve_model.js';
import { curvePresetBuild } from '@/curve/model/curve_preset.js';
import { CURVE_PRESETS_ARCHITECTURE } from '@/curve/model/curve_preset_architecture.js';
import { generatorRevolveStationsFromCurve } from '@/generator/revolve/generator_revolve_curve.js';

const LINE = curveFromPolyline([
  [0, 1],
  [1, 0.5],
]);

describe('curve markers', () => {
  it('keeps markers inside the curve, apart, and bottom below top', () => {
    expect(curveMarkersConstrain({ bottom: -1, top: 2 })).toEqual({
      bottom: CURVE_MARKER_GAP,
      top: 1 - CURVE_MARKER_GAP,
    });
    let curve = curveMarkerSet(LINE, 'bottom', 0.3);
    curve = curveMarkerSet(curve, 'top', 0.1);
    expect(curve.markers).toEqual({ bottom: 0.3, top: 0.3 + CURVE_MARKER_GAP });
    curve = curveMarkerSet(curve, 'bottom', 0.9);
    expect(curve.markers?.bottom).toBeCloseTo(0.3, 9);
    expect(curveMarkerSet(curveMarkerSet(curve, 'bottom', null), 'top', null).markers).toBeUndefined();
  });

  it('maps fixed sections at fixed heights and stretches the middle', () => {
    const both = curveMarkersHeightMap({ bottom: 0.2, top: 0.8 }, 10, { base: 1, top: 2 });
    expect([0, 0.1, 0.2, 0.5, 0.8, 0.9, 1].map((x) => Number(both(x).toFixed(9)))).toEqual([0, 0.5, 1, 4.5, 8, 9, 10]);
    const baseOnly = curveMarkersHeightMap({ bottom: 0.25 }, 6, { base: 1, top: 5 });
    expect([baseOnly(0.25), baseOnly(1)]).toEqual([1, 6]);
    const short = curveMarkersHeightMap({ bottom: 0.2, top: 0.8 }, 1.5, { base: 1, top: 2 });
    expect([short(0.2), short(0.5), short(0.8), short(1)].map((value) => Number(value.toFixed(9)))).toEqual([
      0.5, 0.5, 0.5, 1.5,
    ]);
    expect(curveMarkersHeightMap(undefined, 4, { base: 1, top: 1 })(0.25)).toBe(1);
  });

  it('saves markers in curve text and files, and still reads version 1 files', () => {
    const curve = curveMarkerSet(curveMarkerSet(LINE, 'bottom', 0.2), 'top', 0.7);
    expect(curveDecode(curveEncode(curve))?.markers).toEqual({ bottom: 0.2, top: 0.7 });
    const text = curveFileWrite(curve, 'Marked');
    expect(JSON.parse(text).version).toBe(CURVE_FILE_VERSION);
    expect(CURVE_FILE_VERSION).toBe(2);
    const read = curveFileRead(text);
    expect('curve' in read ? read.curve.markers : null).toEqual({ bottom: 0.2, top: 0.7 });
    const old = JSON.stringify({
      format: 'aiworlded-curve',
      version: 1,
      name: 'Old',
      curve: {
        points: [
          [0, 1],
          [1, 1],
        ],
        segments: [['linear', 8]],
      },
    });
    const legacy = curveFileRead(old);
    expect('curve' in legacy && legacy.curve.markers === undefined).toBe(true);
  });

  it('swaps markers when the curve is mirrored', () => {
    const curve = curveMarkerSet(curveMarkerSet(LINE, 'bottom', 0.2), 'top', 0.7);
    const mirrored = curveMirror(curve).markers;
    expect(mirrored?.bottom).toBeCloseTo(0.3, 9);
    expect(mirrored?.top).toBeCloseTo(0.8, 9);
  });

  it('keeps stock presets unmarked and offers a fixed attic base', () => {
    const marked = CURVE_PRESETS_ARCHITECTURE.filter((preset) => curvePresetBuild(preset).markers);
    expect(marked.map((preset) => preset.id)).toEqual(['attic_base_fixed']);
    const attic = curvePresetBuild(marked[0]!);
    for (const height of [3, 9]) {
      const stations = generatorRevolveStationsFromCurve(attic, height, 1, { base: 0.6, top: 0 });
      const base = stations.find((station) => Math.abs(station.radius - 0.72) < 1e-9 && station.height > 0);
      expect(base?.height).toBeCloseTo(0.6, 9);
      expect(stations[stations.length - 1]?.height).toBeCloseTo(height, 9);
    }
  });

  it('adds a station exactly at each marker so sections meet cleanly', () => {
    const curve = curveMarkerSet(LINE, 'bottom', 0.5);
    const stations = generatorRevolveStationsFromCurve(curve, 4, 1, { base: 1, top: 0 });
    expect(stations.map((station) => [station.height, station.radius])).toEqual([
      [0, 1],
      [1, 0.75],
      [4, 0.5],
    ]);
  });
});
