import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { DecalFragment } from '@/decal/fragment/decal_fragment.js';
import { DecalFirstHitClip } from '@/decal/occlusion/decal_first_hit_clip.js';
import { DecalPresentationGeometry } from '@/decal/presentation/decal_presentation_geometry.js';
import {
  decalPolygonSignedArea,
  decalPolygonSplit,
  decalPolygonSubtract,
} from '@/decal/occlusion/decal_image_polygon.js';
import { DecalModelLayer } from '@/decal/layer/decal_model_layer.js';
import { decalLayerSyncReportEmpty } from '@/decal/layer/decal_layer_sync_report.js';
import { decalTestLevelCreate, decalTestProjector, decalTestServices } from '../decal_test_fixture.js';

/**
 * Builds a fragment whose model space equals projector space.
 *
 * @param triangles Projector-space triangles, nine floats each.
 * @param shields Shielding triangles.
 * @returns Fragment.
 */
function fragmentOf(triangles: number[], shields: number[] = []): DecalFragment {
  const count = triangles.length / 9;
  const normals: number[] = [];
  const uvs: number[] = [];
  for (let corner = 0; corner < count * 3; corner++) {
    normals.push(0, 1, 0);
    uvs.push((triangles[corner * 3] ?? 0) + 0.5, (triangles[corner * 3 + 2] ?? 0) + 0.5);
  }
  return {
    positions: new Float32Array(triangles),
    normals: new Float32Array(normals),
    uvs: new Float32Array(uvs),
    triangleCount: count,
    projectorLocal: new Float32Array(triangles),
    shields: new Float32Array(shields),
  };
}

/**
 * Sums the image-plane area of triangles.
 *
 * @param positions Positions, nine floats per triangle.
 * @returns Area on x and z.
 */
function imageArea(positions: Float32Array): number {
  let area = 0;
  for (let base = 0; base < positions.length; base += 9) {
    area += Math.abs(
      decalPolygonSignedArea([
        positions[base]!,
        positions[base + 2]!,
        positions[base + 3]!,
        positions[base + 5]!,
        positions[base + 6]!,
        positions[base + 8]!,
      ]),
    );
  }
  return area;
}

/**
 * Counts corners that lie strictly inside an edge of another triangle.
 *
 * @param positions Positions, nine floats per triangle.
 * @returns T-junction count.
 */
function tJunctionsOf(positions: Float32Array): number {
  const corners: THREE.Vector3[] = [];
  for (let base = 0; base < positions.length; base += 3) corners.push(new THREE.Vector3().fromArray(positions, base));
  let found = 0;
  const line = new THREE.Line3();
  const closest = new THREE.Vector3();
  for (let triangle = 0; triangle < corners.length / 3; triangle++) {
    for (let edge = 0; edge < 3; edge++) {
      const start = corners[triangle * 3 + edge]!;
      const end = corners[triangle * 3 + ((edge + 1) % 3)]!;
      if (start.distanceTo(end) < 1e-6) continue;
      line.set(start, end);
      for (const corner of corners) {
        const along = line.closestPointToPointParameter(corner, true);
        if (along <= 1e-4 || along >= 1 - 1e-4) continue;
        if (line.at(along, closest).distanceTo(corner) < 1e-6) found++;
      }
    }
  }
  return found;
}

/** Floor square from -0.5 to 0.5 at height -0.4, as two triangles. */
const FLOOR = [-0.5, -0.4, -0.5, -0.5, -0.4, 0.5, 0.5, -0.4, 0.5, -0.5, -0.4, -0.5, 0.5, -0.4, 0.5, 0.5, -0.4, -0.5];

describe('DecalFirstHitClip', () => {
  it('cuts a diagonal shadow out of the floor exactly, carrying attributes over', () => {
    const occluder = [-0.2, 0.3, 0, 0.2, 0.3, -0.25, 0.1, 0.3, 0.3];
    const fragments = [fragmentOf(FLOOR), fragmentOf(occluder)];
    const joined = DecalPresentationGeometry.join(fragments);
    const clipped = new DecalFirstHitClip().apply(joined, fragments);
    const occluderArea = Math.abs(decalPolygonSignedArea([-0.2, 0, 0.2, -0.25, 0.1, 0.3]));
    expect(imageArea(clipped.positions)).toBeCloseTo(1 + occluderArea - occluderArea, 6);
    let floorArea = 0;
    for (let base = 0; base < clipped.positions.length; base += 9)
      if (clipped.positions[base + 1]! < 0) floorArea += imageArea(clipped.positions.subarray(base, base + 9));
    expect(floorArea).toBeCloseTo(1 - occluderArea, 6);
    for (let corner = 0; corner < clipped.uvs.length / 2; corner++) {
      expect(clipped.uvs[corner * 2]!).toBeCloseTo(clipped.positions[corner * 3]! + 0.5, 5);
      expect(clipped.uvs[corner * 2 + 1]!).toBeCloseTo(clipped.positions[corner * 3 + 2]! + 0.5, 5);
    }
  });

  it('shares every corner along the seams it cuts, leaving no T-junctions', () => {
    const occluders = [-0.2, 0.3, 0, 0.2, 0.3, -0.25, 0.1, 0.3, 0.3, 0.3, 0.2, 0.3, 0.45, 0.2, 0.1, 0.2, 0.2, 0.45];
    const fragments = [fragmentOf(FLOOR), fragmentOf([], occluders)];
    const clipped = new DecalFirstHitClip().apply(DecalPresentationGeometry.join(fragments), fragments);
    expect(tJunctionsOf(clipped.positions)).toBe(0);
  });

  it('shields only where a tilted surface rises above the receiver', () => {
    const ramp = [-0.5, -0.6, -0.5, -0.5, -0.6, 0.5, 0.5, -0.2, 0];
    const fragments = [fragmentOf(FLOOR), fragmentOf([], ramp)];
    const clipped = new DecalFirstHitClip().apply(DecalPresentationGeometry.join(fragments), fragments);
    // The ramp crosses the floor height at x = 0: only its part beyond that shields.
    const rampAbove = Math.abs(decalPolygonSignedArea([0, -0.25, 0, 0.25, 0.5, 0]));
    expect(imageArea(clipped.positions)).toBeCloseTo(1 - rampAbove, 3);
  });

  it('keeps triangles nothing reaches untouched and drops fully shielded ones', () => {
    const roof = [-0.6, 0.4, -0.6, -0.6, 0.4, 0.6, 0.6, 0.4, 0.6, -0.6, 0.4, -0.6, 0.6, 0.4, 0.6, 0.6, 0.4, -0.6];
    const shielded = [fragmentOf(FLOOR), fragmentOf([], roof)];
    expect(new DecalFirstHitClip().apply(DecalPresentationGeometry.join(shielded), shielded).positions.length).toBe(0);
    const alone = [fragmentOf(FLOOR)];
    const joined = DecalPresentationGeometry.join(alone);
    expect(Array.from(new DecalFirstHitClip().apply(joined, alone).positions)).toEqual(Array.from(joined.positions));
  });

  it('subtracts convex polygons into convex pieces that cover the rest', () => {
    const out: number[][] = [];
    decalPolygonSubtract([0, 0, 1, 0, 1, 1, 0, 1], [0.25, 0.25, 0.75, 0.25, 0.75, 0.75, 0.25, 0.75], out);
    expect(out.reduce((sum, piece) => sum + decalPolygonSignedArea(piece), 0)).toBeCloseTo(0.75, 9);
  });

  it('follows a pillar outline exactly at any projector turn, with no stair steps', () => {
    for (const turn of [0, Math.PI / 7, Math.PI / 4]) {
      const everything = pillarFloor(turn, false);
      const firstHit = pillarFloor(turn, true);
      expect(everything.underPillar).toBeCloseTo(0.25, 4);
      expect(firstHit.underPillar, `floor painted under the pillar at turn ${turn}`).toBeLessThan(1e-6);
      expect(everything.area - firstHit.area).toBeCloseTo(0.25, 4);
    }
  });
});

/** Counter-clockwise edges of the pillar's footprint on x and z. */
const PILLAR_FOOTPRINT_EDGES = [
  [3.75, 3.75, 4.25, 3.75],
  [4.25, 3.75, 4.25, 4.25],
  [4.25, 4.25, 3.75, 4.25],
  [3.75, 4.25, 3.75, 3.75],
];

/**
 * Projects straight down over the level's floating pillar, turned about the
 * vertical, and measures the floor the decal paints.
 *
 * @param turn Projector turn in radians.
 * @param firstHitOnly First-hit switch.
 * @returns Floor area, and the part of it inside the pillar's footprint.
 */
function pillarFloor(turn: number, firstHitOnly: boolean): { area: number; underPillar: number } {
  const level = decalTestLevelCreate();
  const projector = decalTestProjector({ firstHitOnly });
  projector.position.set(4, 2.625, 4);
  projector.rotation.y = turn;
  projector.scale.set(1.6, 5.75, 1.6);
  level.world.add(projector);
  level.world.updateMatrixWorld(true);
  const layer = new DecalModelLayer(
    level.model.getResultMesh(),
    level.model.getCollisionChunkSource(),
    decalTestServices(),
  );
  layer.sync([projector], 1000, decalLayerSyncReportEmpty());
  const positions = layer.presentationOf(projector)?.mesh.geometry.getAttribute('position')?.array as Float32Array;
  const result = { area: 0, underPillar: 0 };
  const [a, b, c] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  for (let base = 0; base < positions.length; base += 9) {
    a.fromArray(positions, base);
    b.fromArray(positions, base + 3);
    c.fromArray(positions, base + 6);
    if (Math.abs(a.y) > 0.01) continue;
    result.area += b.clone().sub(a).cross(c.clone().sub(a)).length() / 2;
    let inside = [a.x, a.z, b.x, b.z, c.x, c.z];
    for (const line of PILLAR_FOOTPRINT_EDGES) inside = decalPolygonSplit(inside, line)[0];
    if (inside.length >= 6) result.underPillar += Math.abs(decalPolygonSignedArea(inside));
  }
  return result;
}
