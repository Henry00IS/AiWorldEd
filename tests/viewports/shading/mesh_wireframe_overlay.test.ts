import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  addMeshWireframeOverlays,
  MESH_WIREFRAME_OVERLAY_USERDATA_KEY,
} from '@/viewports/shading/mesh_wireframe_overlay.js';
import { SOLID_MODEL_RESULT_USERDATA_KEY } from '@/solid/model/solid_model_keys.js';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';

/**
 * Builds a world with a CSG result mesh plus helpers that must not get a final
 * mesh wireframe.
 *
 * @returns Scene, world group, and result mesh.
 */
function buildWorld(): { scene: THREE.Scene; world: THREE.Group; result: THREE.Mesh } {
  const scene = new THREE.Scene();
  const world = new THREE.Group();
  scene.add(world);
  const result = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshStandardMaterial());
  result.userData[SOLID_MODEL_RESULT_USERDATA_KEY] = true;
  result.position.set(3, 0, 0);
  world.add(result);
  world.add(SolidBrushVisual.createBoxPreview('brush', 1, SolidOperation.Additive));
  world.add(ModifierVolume.create({}));
  return { scene, world, result };
}

/**
 * Lists final mesh wireframe lines in a scene.
 *
 * @param scene Scene to inspect.
 * @returns Wireframe line objects.
 */
function wireframeLines(scene: THREE.Scene): THREE.LineSegments[] {
  return scene.children.filter(
    (child): child is THREE.LineSegments => child.userData[MESH_WIREFRAME_OVERLAY_USERDATA_KEY] === true,
  );
}

describe('addMeshWireframeOverlays', () => {
  it('draws every triangle edge of the final CSG mesh only, following its transform', () => {
    const { scene, world, result } = buildWorld();
    const remove = addMeshWireframeOverlays(world, scene);
    const lines = wireframeLines(scene);
    expect(lines.length).toBe(1);
    const triangleCount = result.geometry.index!.count / 3;
    expect(lines[0]!.geometry.getAttribute('position').count).toBeGreaterThanOrEqual(triangleCount * 2);
    scene.updateMatrixWorld(true);
    lines[0]!.onBeforeRender(
      null as never,
      scene,
      null as never,
      lines[0]!.geometry,
      lines[0]!.material as never,
      null as never,
    );
    expect(lines[0]!.matrixWorld.equals(result.matrixWorld)).toBe(true);
    remove();
    expect(wireframeLines(scene)).toEqual([]);
  });

  it('keeps drawing while Overlap hides the result, but not for hidden parents', () => {
    const { scene, world, result } = buildWorld();
    result.visible = false;
    const remove = addMeshWireframeOverlays(world, scene);
    expect(wireframeLines(scene).length).toBe(1);
    remove();
    world.visible = false;
    addMeshWireframeOverlays(world, scene);
    expect(wireframeLines(scene)).toEqual([]);
  });

  it('rebuilds the lines when the mesh geometry changes', () => {
    const { scene, world, result } = buildWorld();
    addMeshWireframeOverlays(world, scene)();
    const before = wireframeLines(scene);
    const remove = addMeshWireframeOverlays(world, scene);
    const firstGeometry = wireframeLines(scene)[0]!.geometry;
    remove();
    expect(before).toEqual([]);
    result.geometry = new THREE.BoxGeometry(1, 1, 1, 2, 2, 2);
    const removeAgain = addMeshWireframeOverlays(world, scene);
    const rebuilt = wireframeLines(scene)[0]!;
    expect(rebuilt.geometry).not.toBe(firstGeometry);
    expect(rebuilt.geometry.getAttribute('position').count).toBeGreaterThan(
      firstGeometry.getAttribute('position').count,
    );
    removeAgain();
  });
});

describe('addMeshWireframeOverlays line color', () => {
  it('uses light lines where surfaces are see-through and dark lines over shaded surfaces', () => {
    const { scene, world } = buildWorld();
    const removeShaded = addMeshWireframeOverlays(world, scene, false);
    const shaded = (wireframeLines(scene)[0]!.material as THREE.LineBasicMaterial).color.getHex();
    removeShaded();
    const removeSeeThrough = addMeshWireframeOverlays(world, scene, true);
    const seeThrough = (wireframeLines(scene)[0]!.material as THREE.LineBasicMaterial).color.getHex();
    removeSeeThrough();
    expect(seeThrough).not.toBe(shaded);
    expect(new THREE.Color(seeThrough).getHSL({ h: 0, s: 0, l: 0 }).l).toBeGreaterThan(
      new THREE.Color(shaded).getHSL({ h: 0, s: 0, l: 0 }).l,
    );
  });
});
