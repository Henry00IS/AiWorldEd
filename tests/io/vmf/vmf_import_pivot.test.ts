import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { VmfSolidImporter } from '@/io/vmf/vmf_solid_importer.js';
import type { SolidModel } from '@/solid/model/solid_model.js';
import { buildAxisAlignedSideBlocks } from './vmf_test_solids.js';

/** Two world brushes away from the origin, one with a rotated-texture face set. */
const SOURCE = `
world
{
	"id" "1"
	"classname" "worldspawn"
	solid
	{
		"id" "10"
${buildAxisAlignedSideBlocks({ x: 64, y: 0, z: 0 }, { x: 128, y: 32, z: 96 }, 'BRICK/BRICKWALL001A')}
	}
	solid
	{
		"id" "11"
${buildAxisAlignedSideBlocks({ x: 96, y: 40, z: 0 }, { x: 150, y: 70, z: 20 }, 'DEV/DEV_MEASUREGENERIC01')}
	}
}
`;

/**
 * Lists the compiled result's triangles in world space with their UVs, sorted.
 *
 * @param model Solid model.
 * @returns Sorted triangle keys.
 */
function resultTriangles(model: SolidModel): string[] {
  model.root.updateMatrixWorld(true);
  const keys: string[] = [];
  model.root.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || object.userData['isSolidModelResult'] !== true) return;
    const geometry = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry;
    const positions = geometry.getAttribute('position') as THREE.BufferAttribute;
    const uvs = geometry.getAttribute('uv') as THREE.BufferAttribute;
    for (let index = 0; index < positions.count; index += 3) {
      const corners: string[] = [];
      for (let corner = index; corner < index + 3; corner += 1) {
        const point = new THREE.Vector3().fromBufferAttribute(positions, corner).applyMatrix4(object.matrixWorld);
        const round = (value: number): number => Math.round(value * 1e4) / 1e4 + 0;
        corners.push([...point.toArray(), uvs.getX(corner), uvs.getY(corner)].map(round).join(','));
      }
      keys.push(corners.sort().join(' '));
    }
  });
  return keys.sort();
}

describe('VMF import pivot', () => {
  it('moves the brushes before the single rebuild without changing the compiled geometry or its UVs', async () => {
    const importer = new VmfSolidImporter();
    const plain = await importer.importFromTextAsync(SOURCE);
    const offset = new THREE.Vector3(3.1, -0.4, 1.7);
    let rebuilt = true;
    const shifted = await importer.importFromTextAsync(SOURCE, {
      beforeRebuild: (model) => {
        rebuilt = model.root.children.some(
          (child) =>
            child.userData['isSolidModelResult'] === true &&
            (child as THREE.Mesh).geometry.getAttribute('position')?.count > 0,
        );
        model.translateBrushes(offset.clone().negate());
        model.root.position.add(offset);
      },
    });
    expect(rebuilt).toBe(false);
    const expected = resultTriangles(plain.model);
    expect(expected.length).toBeGreaterThan(0);
    expect(resultTriangles(shifted.model)).toEqual(expected);
    expect(shifted.model.getBrushes()[0]!.position.toArray()).toEqual(
      plain.model.getBrushes()[0]!.position.clone().sub(offset).toArray(),
    );
  });
});
