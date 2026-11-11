import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { offscreenCaptureLevelMeshes } from '@/viewports/capture/offscreen_capture_level.js';
import { createSolidModelStartupDefault } from '@/solid/model/solid_model_startup_default.js';

/**
 * Builds a visible box mesh.
 *
 * @param name Object name.
 * @returns Mesh.
 */
function boxMesh(name: string): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  mesh.name = name;
  return mesh;
}

describe('offscreen capture level meshes', () => {
  it('frames primitive meshes and imported model meshes with the level', () => {
    const world = new THREE.Group();
    const primitive = boxMesh('Box');
    world.add(primitive);
    const imported = new THREE.Group();
    imported.name = 'Prop';
    const part = boxMesh('Body');
    imported.add(part);
    world.add(imported);
    const helper = boxMesh('Figurine');
    helper.userData['isPlayerFigurine'] = true;
    world.add(helper);
    const hidden = boxMesh('Hidden');
    hidden.visible = false;
    world.add(hidden);
    const meshes = offscreenCaptureLevelMeshes(world);
    expect(meshes).toEqual(expect.arrayContaining([primitive, part]));
    expect(meshes).not.toContain(helper);
    expect(meshes).not.toContain(hidden);
  });

  it('frames a solid model result with primitives and does not add its brushes twice', () => {
    const world = new THREE.Group();
    const model = createSolidModelStartupDefault();
    world.add(model.root);
    const primitive = boxMesh('Box');
    world.add(primitive);
    const meshes = offscreenCaptureLevelMeshes(world);
    const result = model.getResultMesh();
    expect(result).not.toBeNull();
    expect(meshes).toContain(result);
    expect(meshes).toContain(primitive);
    for (const brush of model.getBrushes()) {
      if (brush.mesh) expect(meshes).not.toContain(brush.mesh);
    }
  });
});
