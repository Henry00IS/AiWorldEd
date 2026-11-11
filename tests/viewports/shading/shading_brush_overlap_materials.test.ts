import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  prepareBrushOverlapMaterials,
  resolveOverlapMaterial,
} from '@/viewports/shading/shading_brush_overlap_materials.js';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { SOLID_MODEL_RESULT_USERDATA_KEY } from '@/solid/model/solid_model_keys.js';

/**
 * Builds a scene with one CSG result mesh and one brush hull per operation.
 *
 * @returns Scene, result mesh, and brush hulls keyed by operation.
 */
function buildOverlapScene(): {
  scene: THREE.Scene;
  result: THREE.Mesh;
  brushes: Map<SolidOperation, THREE.Mesh>;
} {
  const scene = new THREE.Scene();
  const result = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
  result.userData[SOLID_MODEL_RESULT_USERDATA_KEY] = true;
  scene.add(result);
  const brushes = new Map<SolidOperation, THREE.Mesh>();
  for (const operation of [SolidOperation.Additive, SolidOperation.Subtractive, SolidOperation.Intersecting]) {
    const brush = SolidBrushVisual.createBoxPreview(`brush_${operation}`, 1, operation);
    scene.add(brush);
    brushes.set(operation, brush);
  }
  return { scene, result, brushes };
}

describe('prepareBrushOverlapMaterials', () => {
  it('hides CSG results and shows every brush hull with additive translucent overdraw', () => {
    const { scene, result, brushes } = buildOverlapScene();
    const restore = prepareBrushOverlapMaterials(scene);
    expect(result.visible).toBe(false);
    for (const [operation, brush] of brushes) {
      const material = brush.material as THREE.MeshBasicMaterial;
      expect(material).toBe(resolveOverlapMaterial(operation));
      expect(material.blending).toBe(THREE.AdditiveBlending);
      expect(material.transparent).toBe(true);
      expect(material.depthWrite).toBe(false);
    }
    restore();
  });

  it('colours additive, subtractive and intersecting brushes differently', () => {
    const colours = new Set(
      [SolidOperation.Additive, SolidOperation.Subtractive, SolidOperation.Intersecting].map((operation) =>
        resolveOverlapMaterial(operation).color.getHex(),
      ),
    );
    expect(colours.size).toBe(3);
  });

  it('restores the original materials and visibility', () => {
    const { scene, result, brushes } = buildOverlapScene();
    const originals = new Map([...brushes].map(([operation, brush]) => [operation, brush.material]));
    prepareBrushOverlapMaterials(scene)();
    expect(result.visible).toBe(true);
    for (const [operation, brush] of brushes) {
      expect(brush.material).toBe(originals.get(operation));
    }
  });

  it('keeps user-hidden brushes hidden when revealing is disabled', () => {
    const { scene, brushes } = buildOverlapScene();
    const hidden = brushes.get(SolidOperation.Additive);
    expect(hidden).toBeDefined();
    if (!hidden) return;
    hidden.visible = false;
    const originalMaterial = hidden.material;
    const restore = prepareBrushOverlapMaterials(scene, false);
    expect(hidden.visible).toBe(false);
    expect(hidden.material).toBe(originalMaterial);
    restore();
  });
});
