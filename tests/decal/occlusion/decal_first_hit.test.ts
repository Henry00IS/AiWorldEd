import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { DecalModelLayer } from '@/decal/layer/decal_model_layer.js';
import { decalLayerSyncReportEmpty } from '@/decal/layer/decal_layer_sync_report.js';
import {
  decalTestBox,
  decalTestLevelCreate,
  decalTestLevelRebuild,
  decalTestParametersSet,
  decalTestProjector,
  decalTestServices,
  type DecalTestLevel,
} from '../decal_test_fixture.js';

/**
 * Floor and top areas a decal covers, and how many floor points under the
 * pillar it paints.
 */
interface DecalCoverage {
  floor: number;
  pillarTop: number;
  floorUnderPillar: number;
}

/** Floor points inside the pillar's footprint. */
const DECAL_UNDER_PILLAR: readonly (readonly [number, number])[] = [
  [4.1, 4.05],
  [3.9, 4.12],
  [4.07, 3.88],
];

/**
 * Projects straight down over the level's floating pillar, reaching the floor
 * beneath it, and measures what the decal covers.
 *
 * @param level Test level.
 * @param firstHitOnly First-hit switch.
 * @returns Covered areas.
 */
function pillarCoverage(level: DecalTestLevel, firstHitOnly: boolean): DecalCoverage {
  const projector = decalTestProjector({ firstHitOnly });
  projector.position.set(4, 2.625, 4);
  projector.scale.set(2, 5.75, 2);
  level.world.add(projector);
  level.world.updateMatrixWorld(true);
  const layer = new DecalModelLayer(
    level.model.getResultMesh(),
    level.model.getCollisionChunkSource(),
    decalTestServices(),
  );
  layer.sync([projector], 1000, decalLayerSyncReportEmpty());
  const geometry = layer.presentationOf(projector)?.mesh.geometry;
  return coverageOf(geometry?.getAttribute('position')?.array ?? new Float32Array(0));
}

/**
 * Sums triangle areas on the floor, on the pillar top, and on the floor inside
 * the pillar's footprint.
 *
 * @param positions Decal positions.
 * @returns Covered areas.
 */
function coverageOf(positions: ArrayLike<number>): DecalCoverage {
  const coverage = { floor: 0, pillarTop: 0, floorUnderPillar: 0 };
  for (let base = 0; base + 9 <= positions.length; base += 9) {
    const a = new THREE.Vector3().fromArray(positions, base);
    const b = new THREE.Vector3().fromArray(positions, base + 3);
    const c = new THREE.Vector3().fromArray(positions, base + 6);
    const area = b.clone().sub(a).cross(c.clone().sub(a)).length() / 2;
    const centre = a.clone().add(b).add(c).divideScalar(3);
    if (centre.y > 4.9) coverage.pillarTop += area;
    else if (Math.abs(centre.y) < 0.01) {
      coverage.floor += area;
      const triangle = new THREE.Triangle(a, b, c);
      for (const [x, z] of DECAL_UNDER_PILLAR)
        if (triangle.containsPoint(new THREE.Vector3(x, centre.y, z))) coverage.floorUnderPillar++;
    }
  }
  return coverage;
}

describe('first-hit decals', () => {
  it('paint the floor behind a pillar only when first hit only is off', () => {
    const everything = pillarCoverage(decalTestLevelCreate(), false);
    expect(everything.pillarTop).toBeCloseTo(0.25, 3);
    expect(everything.floor).toBeCloseTo(4, 3);
    expect(everything.floorUnderPillar).toBe(DECAL_UNDER_PILLAR.length);
    const firstHit = pillarCoverage(decalTestLevelCreate(), true);
    expect(firstHit.pillarTop).toBeCloseTo(0.25, 3);
    expect(firstHit.floor).toBeCloseTo(3.75, 4);
    expect(firstHit.floorUnderPillar).toBe(0);
  });

  it('let faces too steep to receive the image still shield what lies behind them', () => {
    const behindWall = (firstHitOnly: boolean) => {
      const level = decalTestLevelCreate();
      const projector = decalTestProjector({ firstHitOnly, facingLimit: 40 });
      projector.position.set(-2.5, 1.5, 0);
      projector.rotation.z = -Math.PI / 6;
      projector.scale.set(6, 6, 2);
      level.world.add(projector);
      level.world.updateMatrixWorld(true);
      const layer = new DecalModelLayer(
        level.model.getResultMesh(),
        level.model.getCollisionChunkSource(),
        decalTestServices(),
      );
      layer.sync([projector], 1000, decalLayerSyncReportEmpty());
      const positions = layer.presentationOf(projector)?.mesh.geometry.getAttribute('position')?.array ?? [];
      return floorAreaBetween(positions, -4.1, -2.6);
    };
    expect(behindWall(false)).toBeGreaterThan(1);
    expect(behindWall(true)).toBe(0);
  });

  it('recut when the switch changes', () => {
    const level = decalTestLevelCreate();
    const projector = decalTestProjector();
    projector.position.set(4, 2.625, 4);
    projector.scale.set(2, 5.75, 2);
    level.world.add(projector);
    level.world.updateMatrixWorld(true);
    const layer = new DecalModelLayer(
      level.model.getResultMesh(),
      level.model.getCollisionChunkSource(),
      decalTestServices(),
    );
    layer.sync([projector], 1000, decalLayerSyncReportEmpty());
    const before = layer.presentationOf(projector)?.triangleCount() ?? 0;
    decalTestParametersSet(projector, { firstHitOnly: true });
    const report = decalLayerSyncReportEmpty();
    layer.sync([projector], 1000, report);
    expect(report.rebuiltDecals).toBe(1);
    expect(layer.presentationOf(projector)?.triangleCount()).not.toBe(before);
  });
});

/**
 * Sums the floor triangle area whose centres lie in an x range.
 *
 * @param positions Decal positions.
 * @param minimumX Lowest centre x.
 * @param maximumX Highest centre x.
 * @returns Area.
 */
function floorAreaBetween(positions: ArrayLike<number>, minimumX: number, maximumX: number): number {
  let area = 0;
  for (let base = 0; base + 9 <= positions.length; base += 9) {
    const a = new THREE.Vector3().fromArray(positions, base);
    const b = new THREE.Vector3().fromArray(positions, base + 3);
    const c = new THREE.Vector3().fromArray(positions, base + 6);
    const centre = a.clone().add(b).add(c).divideScalar(3);
    if (Math.abs(centre.y) > 0.01 || centre.x < minimumX || centre.x > maximumX) continue;
    area += b.sub(a).cross(c.sub(a)).length() / 2;
  }
  return area;
}

describe('inverted decals', () => {
  /**
   * Adds two thin slabs under the test level's pillar, projects down over all
   * of them with Invert, and sums the shade per height, split into inside and
   * outside the pillar's footprint.
   *
   * @returns Area per surface height, under the pillar and beside it.
   */
  function stackedFloorsShade(): Map<number, { under: number; beside: number }> {
    const level = decalTestLevelCreate();
    decalTestBox(level.model, new THREE.Vector3(4, 2, 4), new THREE.Vector3(2, 0.1, 2));
    decalTestBox(level.model, new THREE.Vector3(4, 1, 4), new THREE.Vector3(2, 0.1, 2));
    decalTestLevelRebuild(level.world, level.model);
    const projector = decalTestProjector({ invert: true, lift: 0 });
    projector.position.set(4, 2.625, 4);
    projector.scale.set(2, 5.75, 2);
    level.world.add(projector);
    level.world.updateMatrixWorld(true);
    const layer = new DecalModelLayer(
      level.model.getResultMesh(),
      level.model.getCollisionChunkSource(),
      decalTestServices(),
    );
    layer.sync([projector], 1000, decalLayerSyncReportEmpty());
    const positions = layer.presentationOf(projector)?.mesh.geometry.getAttribute('position')?.array ?? [];
    const shade = new Map<number, { under: number; beside: number }>();
    for (let base = 0; base + 9 <= positions.length; base += 9) {
      const a = new THREE.Vector3().fromArray(positions, base);
      const b = new THREE.Vector3().fromArray(positions, base + 3);
      const c = new THREE.Vector3().fromArray(positions, base + 6);
      const area = b.clone().sub(a).cross(c.clone().sub(a)).length() / 2;
      const centre = a.clone().add(b).add(c).divideScalar(3);
      const height = Math.round(centre.y * 100) / 100;
      const entry = shade.get(height) ?? { under: 0, beside: 0 };
      const under = Math.abs(centre.x - 4) < 0.25 && Math.abs(centre.z - 4) < 0.25;
      if (under) entry.under += area;
      else entry.beside += area;
      shade.set(height, entry);
    }
    return shade;
  }

  it('cast the pillar shade on the first floor behind it only, never on the floors below', () => {
    const shade = stackedFloorsShade();
    expect(shade.get(5)).toBeUndefined();
    expect(shade.get(2.05)?.under).toBeCloseTo(0.25, 3);
    expect(shade.get(2.05)?.beside ?? 0).toBeCloseTo(0, 4);
    expect(shade.get(1.05)?.under ?? 0).toBeCloseTo(0, 4);
    expect(shade.get(0)?.under ?? 0).toBeCloseTo(0, 4);
    expect(shade.get(0)?.beside ?? 0).toBeCloseTo(0, 4);
  });

  it('shade the floor below a slab once, as that slab is its first blocker', () => {
    const shade = stackedFloorsShade();
    expect(shade.get(1.05)?.beside).toBeCloseTo(4 - 0.25, 3);
  });
});
