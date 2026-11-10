import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildModelFileTransform } from '@/io/coordinates/coordinate_space_transform.js';
import { exportTargetFind } from '@/io/export/export_targets.js';

/**
 * Axis each left-handed program negates when it reads a right-handed model
 * file.
 */
const IMPORT_MIRROR: Record<string, THREE.Vector3> = {
  godot: new THREE.Vector3(1, 1, 1),
  blender: new THREE.Vector3(1, 1, 1),
  unity: new THREE.Vector3(-1, 1, 1),
  unreal: new THREE.Vector3(1, -1, 1),
};

/**
 * Takes an editor direction through a target's model file and the program's
 * import into the program's own axes, per meter.
 *
 * @param targetId Export target id.
 * @param editor Editor direction.
 * @returns Direction in the program's axes.
 */
function inProgram(targetId: string, editor: THREE.Vector3): number[] {
  const space = exportTargetFind(targetId).space;
  const file = editor.clone().applyMatrix4(buildModelFileTransform(space));
  return file
    .multiply(IMPORT_MIRROR[targetId]!)
    .toArray()
    .map((value) => value + 0);
}

describe('export target model axes', () => {
  // A model faces the editor's Front view (+Z) with its right side on the viewer's left (-X).
  it.each([
    ['godot', { front: [0, 0, 1], right: [-1, 0, 0], top: [0, 1, 0] }],
    ['blender', { front: [0, -1, 0], right: [-1, 0, 0], top: [0, 0, 1] }],
    ['unity', { front: [0, 0, 1], right: [1, 0, 0], top: [0, 1, 0] }],
    ['unreal', { front: [100, 0, 0], right: [0, 100, 0], top: [0, 0, 100] }],
  ])("lands a model's front, right and top on %s's own", (targetId, expected) => {
    expect(inProgram(targetId, new THREE.Vector3(0, 0, 1))).toEqual(expected.front);
    expect(inProgram(targetId, new THREE.Vector3(-1, 0, 0))).toEqual(expected.right);
    expect(inProgram(targetId, new THREE.Vector3(0, 1, 0))).toEqual(expected.top);
  });
});
