import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SolidModel } from '@/solid/model/solid_model.js';
import { DecalModelLayer } from '@/decal/layer/decal_model_layer.js';
import { decalLayerSyncReportEmpty } from '@/decal/layer/decal_layer_sync_report.js';
import {
  decalTestBrushMoveLive,
  decalTestLevelCreate,
  decalTestProjector,
  decalTestServices,
  type DecalTestLevel,
} from '../decal_test_fixture.js';

/**
 * Returns a decal's triangles as sorted strings of rounded position and uv, so
 * two builds compare regardless of triangle order.
 *
 * @param layer Decal layer.
 * @param projector Projector.
 * @returns Sorted corner keys per triangle.
 */
function trianglesOf(layer: DecalModelLayer, projector: THREE.Object3D): string[] {
  const geometry = layer.presentationOf(projector)?.mesh.geometry;
  const positions = geometry?.getAttribute('position');
  const uvs = geometry?.getAttribute('uv');
  if (!positions || !uvs) return [];
  const out: string[] = [];
  const r = (value: number) => (Math.round(value * 1e4) / 1e4 + 0).toFixed(4);
  for (let triangle = 0; triangle < positions.count / 3; triangle++) {
    const corners: string[] = [];
    for (let corner = 0; corner < 3; corner++) {
      const index = triangle * 3 + corner;
      corners.push(
        `${r(positions.getX(index))},${r(positions.getY(index))},${r(positions.getZ(index))}|${r(uvs.getX(index))},${r(uvs.getY(index))}`,
      );
    }
    out.push(corners.sort().join(' '));
  }
  return out.sort();
}

/**
 * Returns the uv of every decal corner as a function of its position, so the
 * mapping can be checked without depending on how the surface is triangulated.
 *
 * @param layer Decal layer.
 * @param projector Projector.
 * @returns Largest disagreement between a corner's uv and the uv its position
 *   predicts.
 */
function uvMismatch(
  layer: DecalModelLayer,
  projector: THREE.Object3D,
  reference: Map<string, [number, number]>,
): number {
  const geometry = layer.presentationOf(projector)?.mesh.geometry;
  const positions = geometry?.getAttribute('position');
  const uvs = geometry?.getAttribute('uv');
  if (!positions || !uvs) return Infinity;
  let worst = 0;
  for (let index = 0; index < positions.count; index++) {
    const key = `${positions.getX(index).toFixed(3)},${positions.getY(index).toFixed(3)},${positions.getZ(index).toFixed(3)}`;
    const known = reference.get(key);
    if (!known) continue;
    worst = Math.max(worst, Math.abs(known[0] - uvs.getX(index)), Math.abs(known[1] - uvs.getY(index)));
  }
  return worst;
}

/**
 * Builds a fresh layer over the level as it stands and returns its triangles.
 *
 * @param level Test level.
 * @param projector Projector.
 * @returns Sorted triangle keys.
 */
function freshTriangles(level: DecalTestLevel, projector: THREE.Object3D): string[] {
  const layer = new DecalModelLayer(
    level.model.getResultMesh(),
    level.model.getCollisionChunkSource(),
    decalTestServices(),
  );
  layer.sync([projector], 1e9, decalLayerSyncReportEmpty());
  return trianglesOf(layer, projector);
}

for (const wrap of ['planar', 'sticker'] as const) {
  describe(`decal after brush edits (${wrap})`, () => {
    /**
     * Sets up the level with a decal over the wall's foot and a live layer.
     *
     * @returns Level, projector and live layer.
     */
    function setup() {
      const level = decalTestLevelCreate();
      const projector = decalTestProjector({ wrap, hits: 'first' });
      projector.position.set(-2, 0.5, 0);
      projector.rotation.z = -Math.PI / 5;
      projector.scale.set(4, 3, 3);
      level.world.add(projector);
      level.world.updateMatrixWorld(true);
      const layer = new DecalModelLayer(
        level.model.getResultMesh(),
        level.model.getCollisionChunkSource(),
        decalTestServices(),
      );
      const sync = () => {
        for (let pass = 0; pass < 4; pass++) layer.sync([projector], 1e9, decalLayerSyncReportEmpty());
      };
      sync();
      return { level, projector, layer, sync };
    }

    it('matches a fresh build after a move and its undo', () => {
      const { level, projector, layer, sync } = setup();
      const before = trianglesOf(layer, projector);
      expect(before.length).toBeGreaterThan(0);
      expect(before).toEqual(freshTriangles(level, projector));
      decalTestBrushMoveLive(level, level.wall, new THREE.Vector3(0.6, 0, 0.3));
      sync();
      level.model.finalizeAfterInteractiveEdit();
      sync();
      expect(trianglesOf(layer, projector)).toEqual(freshTriangles(level, projector));
      level.wall.mesh!.position.sub(new THREE.Vector3(0.6, 0, 0.3));
      SolidModel.refreshAfterHistoryChange(level.world);
      sync();
      const undone = trianglesOf(layer, projector);
      expect(undone).toEqual(freshTriangles(level, projector));
      expect(undone).toEqual(before);
    });

    it('matches a fresh build after moving the decal with the brush and undoing both', () => {
      const { level, projector, layer, sync } = setup();
      const before = trianglesOf(layer, projector);
      const offset = new THREE.Vector3(0.6, 0.2, 0.3);
      for (let step = 1; step <= 3; step++) {
        projector.position.add(offset.clone().divideScalar(3));
        decalTestBrushMoveLive(level, level.wall, offset.clone().divideScalar(3));
        sync();
      }
      level.model.finalizeAfterInteractiveEdit();
      sync();
      expect(trianglesOf(layer, projector)).toEqual(freshTriangles(level, projector));
      projector.position.sub(offset);
      level.wall.mesh!.position.sub(offset);
      SolidModel.refreshAfterHistoryChange(level.world);
      sync();
      expect(trianglesOf(layer, projector)).toEqual(freshTriangles(level, projector));
      expect(trianglesOf(layer, projector)).toEqual(before);
    });

    it('matches a fresh build after a brush leaves the decal and an undo brings it back', () => {
      const { level, projector, layer, sync } = setup();
      const before = trianglesOf(layer, projector);
      const away = new THREE.Vector3(12, 0, 0);
      decalTestBrushMoveLive(level, level.wall, away);
      sync();
      level.model.finalizeAfterInteractiveEdit();
      sync();
      level.wall.mesh!.position.sub(away);
      SolidModel.refreshAfterHistoryChange(level.world);
      sync();
      expect(trianglesOf(layer, projector)).toEqual(freshTriangles(level, projector));
      expect(trianglesOf(layer, projector)).toEqual(before);
    });

    it('keeps every corner uv between the live drag and the release', () => {
      const { level, projector, layer, sync } = setup();
      decalTestBrushMoveLive(level, level.wall, new THREE.Vector3(0.6, 0, 0.3));
      sync();
      const live = trianglesOf(layer, projector);
      const reference = new Map<string, [number, number]>();
      for (const triangle of live)
        for (const corner of triangle.split(' ')) {
          const [p, uv] = corner.split('|');
          const [x, y, z] = p!.split(',').map(Number);
          const [u, v] = uv!.split(',').map(Number);
          reference.set(`${x!.toFixed(3)},${y!.toFixed(3)},${z!.toFixed(3)}`, [u!, v!]);
        }
      level.model.finalizeAfterInteractiveEdit();
      sync();
      expect(uvMismatch(layer, projector, reference)).toBeLessThan(1e-3);
    });
  });
}
