import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  solidScriptBodyBox,
  solidScriptBodyBrush,
  solidScriptBodyConvex,
  solidScriptBodyFacesMoved,
  solidScriptBodyFromLoops,
  solidScriptBodyHull,
  solidScriptBodyPrism,
  solidScriptBodySolid,
  solidScriptBodyWelded,
  type SolidScriptBody,
} from '@/solid_script/language/solid_script_body.js';
import { solidScriptMeshLoopNormal } from '@/solid_script/language/solid_script_mesh.js';
import { solidScriptBodyFaceKeys } from './solid_script_body_keys.js';

/**
 * Tells whether every face of a body winds counter-clockwise seen from outside.
 *
 * @param body Body.
 * @returns True when it does.
 */
function outwards(body: SolidScriptBody): boolean {
  const middle = body.points
    .reduce((sum, point) => sum.add(point), new THREE.Vector3())
    .divideScalar(body.points.length);
  return body.faces.every((loop) => {
    const center = loop
      .reduce((sum, index) => sum.add(body.points[index]!), new THREE.Vector3())
      .divideScalar(loop.length);
    return solidScriptMeshLoopNormal(body.points, loop).dot(center.sub(middle)) > 0;
  });
}

const BOX = solidScriptBodyBox(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 2, 3));

describe('SolidScript bodies', () => {
  it('builds a box with the editor box faces, wound outwards', () => {
    expect(BOX.points).toHaveLength(8);
    expect(BOX.faces).toHaveLength(6);
    expect(outwards(BOX)).toBe(true);
    expect(solidScriptBodyConvex(BOX)).toBe(true);
  });

  it('turns the faces around for a mirroring move only', () => {
    const turn = new THREE.Matrix4().makeRotationY(1);
    expect(solidScriptBodyFacesMoved(BOX.faces, turn)).toBe(BOX.faces);
    const mirror = new THREE.Matrix4().makeScale(-1, 1, 1);
    const moved = {
      points: BOX.points.map((point) => point.clone().applyMatrix4(mirror)),
      faces: solidScriptBodyFacesMoved(BOX.faces, mirror),
    };
    expect(outwards(moved)).toBe(true);
    expect(solidScriptBodyFaceKeys(moved)).toEqual(
      solidScriptBodyFaceKeys(solidScriptBodyBox(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 2, 3))),
    );
  });

  it('makes the same faces as a hull of its corners, and a brush from them', () => {
    expect(solidScriptBodyFaceKeys(BOX)).toEqual(solidScriptBodyFaceKeys(solidScriptBodyHull(BOX.points, 'Box')));
    const brush = solidScriptBodyBrush(BOX, 'Box');
    expect(brush.faces).toHaveLength(6);
    const corners = (points: readonly THREE.Vector3[]) => points.map((point) => point.toArray().join(',')).sort();
    expect(corners(brush.vertices)).toEqual(corners(BOX.points));
  });

  it('refuses a flat body, as a brush and as a hull', () => {
    const flat = { points: BOX.points.map((point) => new THREE.Vector3(point.x, 0, point.z)), faces: BOX.faces };
    expect(solidScriptBodySolid(flat)).toBe(false);
    expect(() => solidScriptBodyBrush(flat, 'Slab')).toThrow('Slab is flat or degenerate');
    expect(() => solidScriptBodyHull(flat.points, 'Slab')).toThrow('Slab is flat or degenerate');
  });

  it('tells a dented, bent or non-strict body from a convex one', () => {
    const dented = { points: BOX.points.map((point) => point.clone()), faces: BOX.faces };
    dented.points[0]!.lerp(new THREE.Vector3(0, 0.5, 1), 0.9);
    expect(solidScriptBodyConvex(dented)).toBe(false);
    const bent = { points: BOX.points.map((point) => point.clone()), faces: BOX.faces };
    bent.points[0]!.addScalar(-0.1);
    expect(solidScriptBodyConvex(bent)).toBe(false);
    const grown = { points: BOX.points.map((point) => point.clone().multiplyScalar(2)), faces: BOX.faces };
    expect(solidScriptBodyConvex(grown)).toBe(true);
  });

  it('welds corners that meet and drops the faces they close', () => {
    const square = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(1, 0, 1),
      new THREE.Vector3(0, 0, 1),
    ];
    const apex = square.map(() => new THREE.Vector3(0.5, 1, 0.5));
    const pyramid = solidScriptBodyPrism(square, apex, 'Pyramid');
    expect(pyramid.points).toHaveLength(5);
    expect(pyramid.faces).toHaveLength(5);
    expect(outwards(pyramid)).toBe(true);
    expect(solidScriptBodyWelded([square[0]!, square[0]!.clone()], [[0, 1, 0]]).faces).toEqual([]);
  });

  it('builds prisms either way round, and rebuilds twisted sides from the corners', () => {
    const square = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(1, 0, 1),
      new THREE.Vector3(0, 0, 1),
    ];
    const up = square.map((point) => point.clone().add(new THREE.Vector3(0, 2, 0)));
    for (const prism of [solidScriptBodyPrism(square, up, 'P'), solidScriptBodyPrism(up, square, 'P')]) {
      expect(prism.faces).toHaveLength(6);
      expect(outwards(prism)).toBe(true);
      expect(solidScriptBodyConvex(prism)).toBe(true);
    }
    const twisted = up.map((point) => point.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.3));
    const wrapped = solidScriptBodyFromLoops([...square, ...twisted], solidScriptBodyPrism(square, up, 'P').faces, 'P');
    expect(solidScriptBodyFaceKeys(wrapped)).toEqual(
      solidScriptBodyFaceKeys(solidScriptBodyHull([...square, ...twisted], 'P')),
    );
  });
});
