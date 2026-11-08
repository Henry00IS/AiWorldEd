import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { modifierGeneratorNodeCreate } from '@/modifier/stack/modifier_generator_node.js';
import { modifierStackCompile } from '@/modifier/stack/evaluate/modifier_stack_compile.js';
import {
  prepareBrushOverlapMaterials,
  resolveOverlapMaterial,
} from '@/viewports/shading/shading_brush_overlap_materials.js';

/**
 * Builds a scene with a moved solid holding one authored brush and a column
 * generator node, compiled so the generator's pieces are published.
 *
 * @returns Scene, solid, generator node, and the generated piece count.
 */
function buildGeneratorScene(): { scene: THREE.Scene; model: SolidModel; node: THREE.Object3D; pieces: number } {
  const scene = new THREE.Scene();
  const model = new SolidModel('Overlap generator');
  model.root.position.set(5, 1, -3);
  scene.add(model.root);
  model.addBoxBrush(1, SolidOperation.Additive);
  const node = modifierGeneratorNodeCreate('column');
  node.scale.set(2, 4, 2);
  model.root.add(node);
  scene.updateMatrixWorld(true);
  const compiled = modifierStackCompile(model.getBrushes(), model.root);
  const pieces = compiled.instances.filter((brush) => brush.id.startsWith(`${node.uuid}#`)).length;
  return { scene, model, node, pieces };
}

/**
 * Lists the overlap hulls currently drawn for generated brushes.
 *
 * @param scene Scene to inspect.
 * @returns Derived hull meshes.
 */
function derivedHulls(scene: THREE.Scene): THREE.Mesh[] {
  return scene.children.filter(
    (child): child is THREE.Mesh => child instanceof THREE.Mesh && child.userData['isDerivedBrushOverlapHull'] === true,
  );
}

describe('Overlap shading of generated brushes', () => {
  it('draws one additive overdraw hull per generated piece inside the generator box', () => {
    const { scene, node, pieces } = buildGeneratorScene();
    expect(pieces).toBeGreaterThan(0);
    const restore = prepareBrushOverlapMaterials(scene, false);
    const hulls = derivedHulls(scene);
    expect(hulls.length).toBe(pieces);
    const nodeBox = new THREE.Box3().setFromObject(node).expandByScalar(1e-3);
    scene.updateMatrixWorld(true);
    for (const hull of hulls) {
      expect(hull.material).toBe(resolveOverlapMaterial(SolidOperation.Additive));
      const hullBox = new THREE.Box3().setFromObject(hull);
      expect(hullBox.isEmpty()).toBe(false);
      expect(nodeBox.containsBox(hullBox)).toBe(true);
    }
    restore();
    expect(derivedHulls(scene)).toEqual([]);
  });

  it('reuses hulls between passes and skips solids the user hid', () => {
    const { scene, model } = buildGeneratorScene();
    prepareBrushOverlapMaterials(scene, false)();
    const firstPass = prepareBrushOverlapMaterials(scene, false);
    const first = derivedHulls(scene);
    firstPass();
    const secondPass = prepareBrushOverlapMaterials(scene, false);
    expect(derivedHulls(scene)).toEqual(first);
    secondPass();
    model.root.visible = false;
    const hiddenPass = prepareBrushOverlapMaterials(scene, false);
    expect(derivedHulls(scene)).toEqual([]);
    hiddenPass();
  });
});
