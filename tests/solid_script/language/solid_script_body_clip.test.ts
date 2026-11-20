import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  solidScriptBodyBox,
  solidScriptBodyConvex,
  solidScriptBodyHull,
  solidScriptBodySolid,
  type SolidScriptBody,
} from '@/solid_script/language/solid_script_body.js';
import { solidScriptBodyClip } from '@/solid_script/language/solid_script_body_clip.js';
import { solidScriptBodyFaceKeys } from './solid_script_body_keys.js';

/**
 * The part of a body behind a plane, worked out from a hull of the kept corners
 * and crossings, to compare with the clip.
 *
 * @param body Body.
 * @param normal Unit plane direction.
 * @param constant Plane offset.
 * @returns Body.
 */
function hullClip(body: SolidScriptBody, normal: THREE.Vector3, constant: number): SolidScriptBody {
  const side = (point: THREE.Vector3) => normal.dot(point) - constant;
  const kept = body.points.filter((point) => side(point) <= 1e-9);
  for (const loop of body.faces)
    loop.forEach((index, at) => {
      const a = body.points[index]!;
      const b = body.points[loop[(at + 1) % loop.length]!]!;
      if (side(a) * side(b) < 0) kept.push(a.clone().lerp(b, side(a) / (side(a) - side(b))));
    });
  return solidScriptBodyHull(kept, 'Clip');
}

const BOX = solidScriptBodyBox(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1));

describe('SolidScript body clip', () => {
  it.each<[string, [number, number, number], number]>([
    ['straight', [0, 1, 0], 0.25],
    ['slanted', [1, 1, 0], 0.3],
    ['corner', [1, 1, 1], 0.5],
    ['through two edges', [1, 1, 0], 0],
    ['through a corner', [1, 1, 1], 1],
  ])('cuts a box %s into the same convex solid a hull gives', (_, way, constant) => {
    const normal = new THREE.Vector3(...way).normalize();
    const cut = solidScriptBodyClip(BOX, normal, constant);
    expect(solidScriptBodyConvex(cut) || solidScriptBodySolid(cut)).toBe(true);
    expect(solidScriptBodyFaceKeys(cut)).toEqual(solidScriptBodyFaceKeys(hullClip(BOX, normal, constant)));
  });

  it('keeps the body as it is when the plane misses it, and leaves a flat remnant flat', () => {
    expect(solidScriptBodyClip(BOX, new THREE.Vector3(0, 1, 0), 1)).toBe(BOX);
    expect(solidScriptBodySolid(solidScriptBodyClip(BOX, new THREE.Vector3(0, 1, 0), -1))).toBe(false);
  });
});
