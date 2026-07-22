import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  GizmoVisualStyle,
  createGizmoFrontMaterial,
  createGizmoOccludedMaterial,
  createGizmoOccludedMesh,
  createGizmoFrontLineMaterial,
  createGizmoOccludedLineMaterial
} from '../../src/transform/gizmo_visual_style.js';

describe('GizmoVisualStyle', () => {
  it('should use one stem radius for all axis tools', () => {
    expect(GizmoVisualStyle.stemRadius).toBeGreaterThan(0);
    expect(GizmoVisualStyle.stemRadius).toBeLessThan(0.1);
  });

  it('should create front materials with less-equal depth testing', () => {
    const material = createGizmoFrontMaterial(0xff0000);
    expect(material.depthTest).toBe(true);
    expect(material.depthFunc).toBe(THREE.LessEqualDepth);
    expect(material.opacity).toBe(GizmoVisualStyle.frontOpacity);
    material.dispose();
  });

  it('should create occluded materials that only draw behind scene depth', () => {
    const material = createGizmoOccludedMaterial(0x00ff00);
    expect(material.depthTest).toBe(true);
    expect(material.depthFunc).toBe(THREE.GreaterDepth);
    expect(material.opacity).toBe(GizmoVisualStyle.occludedOpacity);
    material.dispose();
  });

  it('should mark occluded ghost meshes for helper exclusion', () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const mesh = createGizmoOccludedMesh(geometry, 0x0000ff, 42);
    expect(mesh.userData.isGizmoOccludedGhost).toBe(true);
    expect(mesh.userData.handleId).toBe(42);
    geometry.dispose();
    (mesh.material as THREE.Material).dispose();
  });

  it('should create front line materials with less-equal depth testing', () => {
    const material = createGizmoFrontLineMaterial();
    expect(material.depthTest).toBe(true);
    expect(material.depthFunc).toBe(THREE.LessEqualDepth);
    expect(material.vertexColors).toBe(true);
    expect(material.opacity).toBe(GizmoVisualStyle.frontOpacity);
    material.dispose();
  });

  it('should create occluded line materials that only draw behind scene depth', () => {
    const material = createGizmoOccludedLineMaterial();
    expect(material.depthTest).toBe(true);
    expect(material.depthFunc).toBe(THREE.GreaterDepth);
    expect(material.vertexColors).toBe(true);
    expect(material.opacity).toBe(GizmoVisualStyle.occludedOpacity);
    material.dispose();
  });
});
