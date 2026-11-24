import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { SolidScriptFaceFacts, SolidScriptGeometryLeaf } from '@/solid_script/language/solid_script_geometry.js';
import { solidScriptGeometryFacesOutside } from '@/solid_script/language/solid_script_geometry_outside.js';

/** Makes a square face of a given leaf around a center, facing a direction. */
function square(leaf: object, center: THREE.Vector3, normal: THREE.Vector3, index: number): SolidScriptFaceFacts {
  const across = new THREE.Vector3(0, 1, 0).cross(normal);
  if (across.lengthSq() < 1e-6) across.set(1, 0, 0);
  across.normalize();
  const up = new THREE.Vector3().crossVectors(normal, across);
  const corners = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([a, b]) => center.clone().addScaledVector(across, a!).addScaledVector(up, b!));
  const facts = { index, leaf: leaf as SolidScriptGeometryLeaf, corners, center, normal, across, up };
  return { ...facts, width: 2, height: 2, area: 4, tags: [] };
}

describe('solidScriptGeometryFacesOutside', () => {
  it('drops back to back faces of other leaves and keeps the rest in order', () => {
    const [one, two] = [{}, {}];
    const faces: SolidScriptFaceFacts[] = [];
    for (let index = 0; index < 40; index++) {
      const angle = index * 0.7;
      const normal = new THREE.Vector3(Math.cos(angle), Math.sin(angle * 0.3), Math.sin(angle)).normalize();
      const center = new THREE.Vector3(index, index * 2, -index);
      faces.push(square(one, center, normal, faces.length));
      if (index % 3 === 0) faces.push(square(two, center.clone(), normal.clone().negate(), faces.length));
      if (index % 5 === 0) faces.push(square(one, center.clone(), normal.clone().negate(), faces.length));
    }
    faces.push(square(two, new THREE.Vector3(), new THREE.Vector3(), faces.length));
    const kept = solidScriptGeometryFacesOutside(faces).map((face) => face.index);
    const covered = faces.filter((face) => face.leaf === two && face.normal.lengthSq() > 0);
    const hidden = new Set(covered.flatMap((face) => [face.index, face.index - 1]));
    expect(kept).toEqual(faces.map((face) => face.index).filter((index) => !hidden.has(index)));
  });
});
