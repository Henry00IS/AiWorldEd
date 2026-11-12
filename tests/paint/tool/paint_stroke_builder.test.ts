import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { PAINT_DAB_STRIDE, paintStrokeDabCount } from '@/paint/stroke/paint_stroke.js';
import {
  PAINT_STROKE_MAX_DABS,
  PaintStrokeBuilder,
  type PaintStrokeTarget,
} from '@/paint/tool/paint_stroke_builder.js';
import { TEST_PAINT_STYLE } from '../paint_test_strokes.js';

const UP = new THREE.Vector3(0, 1, 0);
const VIEW_UP = new THREE.Vector3(0, 0, -1);

/**
 * Creates a floor target covering x in [minX, maxX].
 *
 * @param key Key.
 * @param minX Min x.
 * @param maxX Max x.
 * @param worldToLocal Transform.
 * @returns Target.
 */
function floorTarget(key: string, minX: number, maxX: number, worldToLocal = new THREE.Matrix4()): PaintStrokeTarget {
  return {
    key,
    worldToLocal,
    worldBounds: new THREE.Box3(new THREE.Vector3(minX, -1, -2), new THREE.Vector3(maxX, 0, 2)),
    order: 5,
  };
}

/**
 * Creates sequential ids.
 *
 * @returns Id factory.
 */
function ids(): () => string {
  let next = 0;
  return () => `s${String(next++)}`;
}

describe('PaintStrokeBuilder', () => {
  it('places dabs at the shape spacing along the path', () => {
    const builder = new PaintStrokeBuilder({ ...TEST_PAINT_STYLE, radius: 0.1 }, [floorTarget('a', -5, 5)], ids());
    builder.addPoint(new THREE.Vector3(0, 0, 0), UP, VIEW_UP);
    builder.addPoint(new THREE.Vector3(0.5, 0, 0), UP, VIEW_UP);
    builder.addPoint(new THREE.Vector3(1, 0, 0), UP, VIEW_UP);
    const spacing = builder.spacing;
    expect(spacing).toBeCloseTo(0.024);
    expect(builder.dabCount).toBe(1 + Math.floor(1 / spacing + 1e-6));
    const [record] = builder.records();
    const dabs = record?.stroke.dabs ?? new Float32Array();
    expect(record?.stroke.order).toBe(5);
    expect(dabs[PAINT_DAB_STRIDE]).toBeCloseTo(spacing, 4);
    expect([dabs[3], dabs[4], dabs[5]]).toEqual([0, -1, 0]);
    expect(dabs[PAINT_DAB_STRIDE + 6]).toBeCloseTo(1, 1);
  });

  it('stores dabs in each brush local space and scales the radius', () => {
    const toLocal = new THREE.Matrix4().makeScale(2, 2, 2).multiply(new THREE.Matrix4().makeTranslation(-3, 0, 0));
    const builder = new PaintStrokeBuilder(
      { ...TEST_PAINT_STYLE, radius: 0.25 },
      [floorTarget('a', 0, 6, toLocal)],
      ids(),
    );
    builder.addPoint(new THREE.Vector3(3, 0, 1), UP, VIEW_UP);
    const stroke = builder.records()[0]?.stroke;
    expect(stroke?.radius).toBeCloseTo(0.5);
    expect([stroke?.dabs[0], stroke?.dabs[1], stroke?.dabs[2]]).toEqual([0, 0, 2]);
  });

  it('copies a stroke onto every brush it crosses with the same id', () => {
    const builder = new PaintStrokeBuilder(
      { ...TEST_PAINT_STYLE, radius: 0.1 },
      [floorTarget('a', -2, 0), floorTarget('b', 0, 2)],
      ids(),
    );
    builder.addPoint(new THREE.Vector3(-1, 0, 0), UP, VIEW_UP);
    builder.addPoint(new THREE.Vector3(1, 0, 0), UP, VIEW_UP);
    const records = builder.records();
    expect(records.map((record) => record.target.key)).toEqual(['a', 'b']);
    expect(new Set(records.map((record) => record.stroke.id)).size).toBe(1);
    const total = records.reduce((sum, record) => sum + paintStrokeDabCount(record.stroke), 0);
    expect(total).toBeGreaterThan(builder.dabCount);
  });

  it('keeps footsteps alternating across brushes', () => {
    const builder = new PaintStrokeBuilder(
      { ...TEST_PAINT_STYLE, shape: 'footprints', radius: 0.2 },
      [floorTarget('a', -3, 0), floorTarget('b', 0.3, 3)],
      ids(),
    );
    builder.addPoint(new THREE.Vector3(-2, 0, 0), UP, VIEW_UP);
    builder.addPoint(new THREE.Vector3(2, 0, 0), UP, VIEW_UP);
    const variants: number[] = [];
    const sides: number[] = [];
    for (const record of builder.records()) {
      for (let dab = 0; dab < paintStrokeDabCount(record.stroke); dab++) {
        variants.push(record.stroke.dabs[dab * PAINT_DAB_STRIDE + 9] ?? -1);
        sides.push(Math.sign(record.stroke.dabs[dab * PAINT_DAB_STRIDE + 2] ?? 0));
      }
    }
    for (let index = 0; index < variants.length; index++) {
      const left = (variants[index] ?? 0) % 2 === 0;
      expect(sides[index]).toBe(left ? -1 : 1);
    }
    expect(variants.some((value) => value % 2 === 1)).toBe(true);
  });

  it('continues long strokes in new records with rising order', () => {
    const builder = new PaintStrokeBuilder({ ...TEST_PAINT_STYLE, radius: 0.01 }, [floorTarget('a', -100, 100)], ids());
    builder.addPoint(new THREE.Vector3(-1, 0, 0), UP, VIEW_UP);
    builder.addPoint(new THREE.Vector3(5, 0, 0), UP, VIEW_UP);
    const records = builder.records();
    expect(builder.dabCount).toBeGreaterThan(PAINT_STROKE_MAX_DABS);
    expect(records.length).toBe(2);
    expect(records.map((record) => record.stroke.id)).toEqual(['s0', 's1']);
    expect(records.map((record) => record.stroke.order)).toEqual([5, 6]);
    const first = records[0];
    expect(first === undefined ? 0 : paintStrokeDabCount(first.stroke)).toBe(PAINT_STROKE_MAX_DABS);
  });

  it('aims a stamp along the first movement or places it on release', () => {
    const style = { ...TEST_PAINT_STYLE, shape: 'heart', radius: 0.2 };
    const dragged = new PaintStrokeBuilder(style, [floorTarget('a', -5, 5)], ids());
    expect(dragged.addPoint(new THREE.Vector3(0, 0, 0), UP, VIEW_UP)).toEqual([]);
    const [first] = dragged.addPoint(new THREE.Vector3(0.5, 0, 0), UP, VIEW_UP);
    expect(first?.center.x).toBeCloseTo(0);
    expect(first?.up.x).toBeCloseTo(1);
    const clicked = new PaintStrokeBuilder(style, [floorTarget('a', -5, 5)], ids());
    clicked.addPoint(new THREE.Vector3(1, 0, 1), UP, VIEW_UP);
    const [stamp] = clicked.finish();
    expect(stamp?.up.z).toBeCloseTo(-1);
    expect(clicked.finish()).toEqual([]);
    expect(clicked.records().length).toBe(1);
  });

  it('ignores brushes the dabs do not reach', () => {
    const builder = new PaintStrokeBuilder(TEST_PAINT_STYLE, [floorTarget('far', 50, 60)], ids());
    builder.addPoint(new THREE.Vector3(0, 0, 0), UP, VIEW_UP);
    expect(builder.dabCount).toBe(1);
    expect(builder.records()).toEqual([]);
  });
});
