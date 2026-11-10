import { describe, expect, it } from 'vitest';
import { curveDecode, curveEncode } from '@/curve/model/curve_codec.js';
import { curveMirror } from '@/curve/model/curve_edit.js';
import { CURVE_FILE_VERSION, curveFileRead, curveFileWrite } from '@/curve/model/curve_file.js';
import {
  CURVE_MARKER_DEFAULT,
  CURVE_MARKER_GAP,
  curveMarkerSet,
  curveMarkerSwitch,
  curveMarkerHeightSet,
  curveMarkerHeights,
  curveMarkersConstrain,
  curveMarkersHeightMap,
} from '@/curve/model/curve_markers.js';
import { curveEquals, curveFromPolyline } from '@/curve/model/curve_model.js';
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
    const off = curveMarkerSwitch(curveMarkerSwitch(curve, 'bottom', false), 'top', false);
    expect(off.markers).toEqual({ parked: { bottom: curve.markers?.bottom, top: curve.markers?.top } });
  });

  it('remembers a switched-off marker and restores it when switched on again', () => {
    const placed = curveMarkerSet(LINE, 'top', 0.63);
    const off = curveMarkerSwitch(placed, 'top', false);
    expect(off.markers?.top).toBeUndefined();
    expect(curveMarkersHeightMap(off.markers, 10, { base: 1, top: 2 })(1)).toBe(10);
    expect(curveDecode(curveEncode(off))?.markers?.parked?.top).toBe(0.63);
    expect(curveMarkerSwitch(off, 'top', true).markers).toEqual({ top: 0.63 });
    expect(curveMarkerSwitch(LINE, 'bottom', true).markers).toEqual({ bottom: CURVE_MARKER_DEFAULT.bottom });
    expect(curveMirror(off).markers?.parked?.bottom).toBeCloseTo(0.37, 9);
  });

  it('stores fixed heights in the curve, keeps them while off and swaps them when mirrored', () => {
    const fixed = curveMarkerHeightSet(curveMarkerHeightSet(LINE, 'bottom', 0.4), 'top', 1.25);
    expect(fixed.markers?.heights).toEqual({ bottom: 0.4, top: 1.25 });
    expect(curveDecode(curveEncode(fixed))).toEqual(fixed);
    expect(curveMarkerHeights(fixed, { base: 9, top: 9 })).toEqual({ base: 0.4, top: 1.25 });
    expect(curveMarkerHeights(LINE, { base: 0.5, top: 0.7 })).toEqual({ base: 0.5, top: 0.7 });
    expect(curveMarkerSwitch(fixed, 'top', true).markers?.heights?.top).toBe(1.25);
    expect(curveMirror(fixed).markers?.heights).toEqual({ bottom: 1.25, top: 0.4 });
    expect(curveMarkerHeightSet(LINE, 'bottom', -3).markers?.heights?.bottom).toBe(0);
    expect(curveEquals(fixed, curveMarkerHeightSet(fixed, 'top', 1))).toBe(false);
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

  it('saves markers in curve text and files', () => {
    const curve = curveMarkerSet(curveMarkerSet(LINE, 'bottom', 0.2), 'top', 0.7);
    expect(curveDecode(curveEncode(curve))?.markers).toEqual({ bottom: 0.2, top: 0.7 });
    const text = curveFileWrite(curve, 'Marked');
    expect(JSON.parse(text).version).toBe(CURVE_FILE_VERSION);
    const read = curveFileRead(text);
    expect('curve' in read ? read.curve.markers : null).toEqual({ bottom: 0.2, top: 0.7 });
  });

  it('swaps markers when the curve is mirrored', () => {
    const curve = curveMarkerSet(curveMarkerSet(LINE, 'bottom', 0.2), 'top', 0.7);
    const mirrored = curveMirror(curve).markers;
    expect(mirrored?.bottom).toBeCloseTo(0.3, 9);
    expect(mirrored?.top).toBeCloseTo(0.8, 9);
  });

  it('builds stock presets with markers at their own places, whose fixed base the column keeps', () => {
    const attic = CURVE_PRESETS_ARCHITECTURE.find((preset) => preset.id === 'attic_base');
    if (!attic) throw new Error('Expected the attic base preset');
    const { height: _height, ...unfixed } = attic;
    expect(curvePresetBuild(unfixed).markers).toEqual({ parked: attic.markers });
    const fixed = curveMarkerSwitch(curvePresetBuild(unfixed), 'bottom', true);
    for (const height of [3, 9]) {
      const stations = generatorRevolveStationsFromCurve(fixed, height, 1, { base: 0.6, top: 0 });
      const base = stations.find((station) => Math.abs(station.radius - 0.72) < 1e-9 && station.height > 0);
      expect(base?.height).toBeCloseTo(0.6, 9);
      expect(stations[stations.length - 1]?.height).toBeCloseTo(height, 9);
    }
  });

  it('uses the fixed heights a curve carries before the column ones', () => {
    const curve = curveMarkerHeightSet(curveMarkerSet(LINE, 'bottom', 0.5), 'bottom', 2);
    const stations = generatorRevolveStationsFromCurve(curve, 4, 1, { base: 1, top: 0 });
    expect(stations.map((station) => station.height)).toEqual([0, 2, 4]);
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
