import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  SolidBrushEdgeMaterials,
  BRUSH_EDGE_FADE_NEAR,
  BRUSH_EDGE_FADE_FAR,
  BRUSH_EDGE_FRONT_OPACITY,
  BRUSH_EDGE_OCCLUDED_OPACITY,
  BRUSH_EDGE_SHARED_MATERIAL_KEY,
  BRUSH_EDGE_DISTANCE_FADE_KEY,
} from '../../src/solid/model/solid_brush_edge_materials.js';
import { SolidOperation } from '../../src/solid/types/solid_operation.js';

/** Unit tests for shared distance-faded brush edge materials. */
describe('SolidBrushEdgeMaterials', () => {
  it('reuses one front material instance per operation', () => {
    const first = SolidBrushEdgeMaterials.getFrontMaterial(SolidOperation.Additive);
    const second = SolidBrushEdgeMaterials.getFrontMaterial(SolidOperation.Additive);
    expect(first).toBe(second);
    expect(first.userData[BRUSH_EDGE_SHARED_MATERIAL_KEY]).toBe(true);
    expect(first.userData[BRUSH_EDGE_DISTANCE_FADE_KEY]).toBe(true);
  });

  it('configures front and occluded depth functions and opacities', () => {
    const front = SolidBrushEdgeMaterials.getFrontMaterial(SolidOperation.Subtractive);
    const occluded = SolidBrushEdgeMaterials.getOccludedMaterial(SolidOperation.Subtractive);
    expect(front.depthFunc).toBe(THREE.LessEqualDepth);
    expect(occluded.depthFunc).toBe(THREE.GreaterDepth);
    expect(front.uniforms['opacity']!.value).toBeCloseTo(BRUSH_EDGE_FRONT_OPACITY);
    expect(occluded.uniforms['opacity']!.value).toBeCloseTo(BRUSH_EDGE_OCCLUDED_OPACITY);
    expect(front.uniforms['fadeNear']!.value).toBe(BRUSH_EDGE_FADE_NEAR);
    expect(front.uniforms['fadeFar']!.value).toBe(BRUSH_EDGE_FADE_FAR);
    expect(occluded.uniforms['opacity']!.value).toBeLessThan(front.uniforms['opacity']!.value);
  });

  it('disables distance fade on cloned materials for 2D views', () => {
    const shared = SolidBrushEdgeMaterials.getFrontMaterial(SolidOperation.Intersecting);
    const cloned = shared.clone();
    SolidBrushEdgeMaterials.disableDistanceFade(cloned);
    expect(cloned.uniforms['fadeNear']!.value).toBeGreaterThan(1e6);
    expect(cloned.uniforms['fadeFar']!.value).toBeGreaterThan(cloned.uniforms['fadeNear']!.value);
    expect(shared.uniforms['fadeNear']!.value).toBe(BRUSH_EDGE_FADE_NEAR);
  });

  it('prepares ortho clones without depth testing so all 2D views show edges', () => {
    const shared = SolidBrushEdgeMaterials.getFrontMaterial(SolidOperation.Additive);
    const cloned = shared.clone();
    SolidBrushEdgeMaterials.prepareForOrthoClone(cloned);
    expect(cloned.depthTest).toBe(false);
    expect(cloned.depthWrite).toBe(false);
    expect(cloned.depthFunc).toBe(THREE.AlwaysDepth);
    expect(cloned.uniforms['fadeNear']!.value).toBeGreaterThan(1e6);
    expect(shared.depthTest).toBe(true);
    expect(shared.uniforms['fadeNear']!.value).toBe(BRUSH_EDGE_FADE_NEAR);
  });

  it('returns distinct colors per CSG operation', () => {
    const additive = SolidBrushEdgeMaterials.edgeColorForOperation(SolidOperation.Additive);
    const subtractive = SolidBrushEdgeMaterials.edgeColorForOperation(SolidOperation.Subtractive);
    const intersecting = SolidBrushEdgeMaterials.edgeColorForOperation(SolidOperation.Intersecting);
    expect(additive).not.toBe(subtractive);
    expect(subtractive).not.toBe(intersecting);
  });

  it('skips distance fade for orthographic cameras in the shared edge shader', () => {
    const material = SolidBrushEdgeMaterials.getFrontMaterial(SolidOperation.Additive);
    expect(material.vertexShader).toContain('projectionMatrix[2][3]');
    expect(material.vertexShader).toContain('isPerspective');
    expect(material.vertexShader).toContain('vFade = 1.0');
  });

  it('toggles shared material depth occlusion for 2D multi-view passes', () => {
    const front = SolidBrushEdgeMaterials.getFrontMaterial(SolidOperation.Additive);
    const occluded = SolidBrushEdgeMaterials.getOccludedMaterial(SolidOperation.Additive);
    SolidBrushEdgeMaterials.setDepthOcclusionEnabled(true);
    expect(SolidBrushEdgeMaterials.isDepthOcclusionEnabled()).toBe(true);
    expect(front.depthTest).toBe(true);
    expect(front.depthFunc).toBe(THREE.LessEqualDepth);
    expect(occluded.depthFunc).toBe(THREE.GreaterDepth);
    SolidBrushEdgeMaterials.setDepthOcclusionEnabled(false);
    expect(SolidBrushEdgeMaterials.isDepthOcclusionEnabled()).toBe(false);
    expect(front.depthTest).toBe(false);
    expect(front.depthFunc).toBe(THREE.AlwaysDepth);
    expect(occluded.depthTest).toBe(false);
    expect(occluded.depthFunc).toBe(THREE.AlwaysDepth);
    SolidBrushEdgeMaterials.setDepthOcclusionEnabled(true);
    expect(front.depthTest).toBe(true);
    expect(front.depthFunc).toBe(THREE.LessEqualDepth);
    expect(occluded.depthFunc).toBe(THREE.GreaterDepth);
  });
});
