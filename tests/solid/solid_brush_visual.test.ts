import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SolidBrushFactory } from '../../src/solid/brush/solid_brush_factory.js';
import { SolidBrushVisual, SOLID_BRUSH_OCCLUDED_EDGE_USERDATA_KEY } from '../../src/solid/model/solid_brush_visual.js';
import {
  SolidBrushEdgeMaterials,
  BRUSH_EDGE_FADE_NEAR,
  BRUSH_EDGE_FADE_FAR,
} from '../../src/solid/model/solid_brush_edge_materials.js';
import { SolidOperation } from '../../src/solid/types/solid_operation.js';
import { SOLID_BRUSH_EDGE_USERDATA_KEY } from '../../src/solid/model/solid_brush_edge_materials.js';
import { rebuildDecorativeEdges, usesContentDecorativeEdges } from '../../src/utils/mesh_edge_sync.js';

/** Unit tests for solid brush preview visuals (outline-only vs selected fill). */
describe('SolidBrushVisual', () => {
  it('creates box previews that are outline-only by default', () => {
    const size = 1.5 + Math.random();
    const mesh = SolidBrushVisual.createBoxPreview('Brush', size, SolidOperation.Subtractive);
    expect(SolidBrushVisual.isBrushObject(mesh)).toBe(true);
    expect(SolidBrushVisual.isHullFillVisible(mesh)).toBe(false);
    const material = mesh.material as THREE.MeshBasicMaterial;
    expect(material).toBeInstanceOf(THREE.MeshBasicMaterial);
    expect(material.colorWrite).toBe(false);
    expect(material.visible).toBe(false);
    expect(material.transparent).toBe(false);
    expect(material.depthWrite).toBe(false);
    expect(material.side).toBe(THREE.FrontSide);
    disposeBrushPreview(mesh);
  });

  it('uses shared dual-pass distance-faded edge materials', () => {
    const brush = SolidBrushFactory.createCenteredBox(2, 2, 2);
    const mesh = SolidBrushVisual.createHullPreview('Hull', brush, SolidOperation.Subtractive);
    const edges = collectDecorativeEdges(mesh);
    expect(edges).toHaveLength(2);
    const front = edges.find((edge) => edge.userData[SOLID_BRUSH_OCCLUDED_EDGE_USERDATA_KEY] !== true);
    const occluded = edges.find((edge) => edge.userData[SOLID_BRUSH_OCCLUDED_EDGE_USERDATA_KEY] === true);
    expect(front).toBeDefined();
    expect(occluded).toBeDefined();
    expect(front!.material).toBe(SolidBrushEdgeMaterials.getFrontMaterial(SolidOperation.Subtractive));
    expect(occluded!.material).toBe(SolidBrushEdgeMaterials.getOccludedMaterial(SolidOperation.Subtractive));
    const frontMaterial = front!.material as THREE.ShaderMaterial;
    const occludedMaterial = occluded!.material as THREE.ShaderMaterial;
    expect(frontMaterial.depthFunc).toBe(THREE.LessEqualDepth);
    expect(occludedMaterial.depthFunc).toBe(THREE.GreaterDepth);
    expect(frontMaterial.uniforms['fadeNear']!.value).toBe(BRUSH_EDGE_FADE_NEAR);
    expect(frontMaterial.uniforms['fadeFar']!.value).toBe(BRUSH_EDGE_FADE_FAR);
    expect(occludedMaterial.uniforms['opacity']!.value).toBeLessThan(frontMaterial.uniforms['opacity']!.value);
    disposeBrushPreview(mesh);
  });

  it('shows translucent operation-tinted fill only when fill is enabled', () => {
    const mesh = SolidBrushVisual.createBoxPreview('Brush', 2, SolidOperation.Subtractive);
    SolidBrushVisual.setHullFillVisible(mesh, true);
    expect(SolidBrushVisual.isHullFillVisible(mesh)).toBe(true);
    const material = mesh.material as THREE.MeshBasicMaterial;
    expect(material.visible).toBe(true);
    expect(material.colorWrite).toBe(true);
    expect(material.transparent).toBe(true);
    expect(material.opacity).toBeCloseTo(0.22, 5);
    expect(material.color.getHex()).toBe(0xc0392b);
    expect(material.side).toBe(THREE.FrontSide);
    expect(material.depthTest).toBe(true);
    SolidBrushVisual.setHullFillVisible(mesh, false);
    expect(material.visible).toBe(false);
    expect(material.colorWrite).toBe(false);
    expect(material.transparent).toBe(false);
    expect(material.depthWrite).toBe(false);
    disposeBrushPreview(mesh);
  });

  it('disables depth testing on selected hull fills for orthographic 2D clones', () => {
    const mesh = SolidBrushVisual.createBoxPreview('Brush', 2, SolidOperation.Additive);
    SolidBrushVisual.prepareBrushMeshForOrthoClone(mesh);
    SolidBrushVisual.setHullFillVisible(mesh, true);
    const material = mesh.material as THREE.MeshBasicMaterial;
    expect(SolidBrushVisual.isOrthoCloneBrush(mesh)).toBe(true);
    expect(material.depthTest).toBe(false);
    expect(material.depthWrite).toBe(false);
    expect(material.depthFunc).toBe(THREE.AlwaysDepth);
    expect(mesh.renderOrder).toBeGreaterThan(2);
    disposeBrushPreview(mesh);
  });

  it('toggles selected hull fill depth for shared orthographic multi-view passes', () => {
    const root = new THREE.Group();
    const mesh = SolidBrushVisual.createBoxPreview('Brush', 2, SolidOperation.Additive);
    root.add(mesh);
    SolidBrushVisual.setHullFillVisible(mesh, true);
    const material = mesh.material as THREE.MeshBasicMaterial;
    SolidBrushVisual.setHullFillDepthOcclusionEnabled(root, true);
    expect(material.depthTest).toBe(true);
    expect(material.depthFunc).toBe(THREE.LessEqualDepth);
    SolidBrushVisual.setHullFillDepthOcclusionEnabled(root, false);
    expect(SolidBrushVisual.isHullFillDepthOcclusionEnabled()).toBe(false);
    expect(material.depthTest).toBe(false);
    expect(material.depthFunc).toBe(THREE.AlwaysDepth);
    expect(mesh.renderOrder).toBeGreaterThan(2);
    const newlySelected = SolidBrushVisual.createBoxPreview('Later', 1, SolidOperation.Subtractive);
    root.add(newlySelected);
    SolidBrushVisual.setHullFillVisible(newlySelected, true);
    const laterMaterial = newlySelected.material as THREE.MeshBasicMaterial;
    expect(laterMaterial.depthTest).toBe(false);
    SolidBrushVisual.setHullFillDepthOcclusionEnabled(root, true);
    expect(material.depthTest).toBe(true);
    expect(laterMaterial.depthTest).toBe(true);
    disposeBrushPreview(mesh);
    disposeBrushPreview(newlySelected);
  });

  it('rebinds shared edge materials when the brush operation changes', () => {
    const mesh = SolidBrushVisual.createBoxPreview('Brush', 2, SolidOperation.Additive);
    SolidBrushVisual.setHullFillVisible(mesh, true);
    SolidBrushVisual.applyOperationStyle(mesh, SolidOperation.Intersecting);
    expect(SolidBrushVisual.isHullFillVisible(mesh)).toBe(true);
    const material = mesh.material as THREE.MeshBasicMaterial;
    expect(material.colorWrite).toBe(true);
    expect(material.color.getHex()).toBe(0x2980b9);
    const edges = collectDecorativeEdges(mesh);
    expect(edges.length).toBe(2);
    edges.forEach((edge) => {
      const isOccluded = edge.userData[SOLID_BRUSH_OCCLUDED_EDGE_USERDATA_KEY] === true;
      const expected = isOccluded
        ? SolidBrushEdgeMaterials.getOccludedMaterial(SolidOperation.Intersecting)
        : SolidBrushEdgeMaterials.getFrontMaterial(SolidOperation.Intersecting);
      expect(edge.material).toBe(expected);
    });
    disposeBrushPreview(mesh);
  });

  it('creates additive edge materials for additive box previews', () => {
    const mesh = SolidBrushVisual.createBoxPreview('Add', 1, SolidOperation.Additive);
    const edges = collectDecorativeEdges(mesh);
    expect(edges.length).toBeGreaterThan(0);
    edges.forEach((edge) => {
      const isOccluded = edge.userData[SOLID_BRUSH_OCCLUDED_EDGE_USERDATA_KEY] === true;
      const expected = isOccluded
        ? SolidBrushEdgeMaterials.getOccludedMaterial(SolidOperation.Additive)
        : SolidBrushEdgeMaterials.getFrontMaterial(SolidOperation.Additive);
      expect(edge.material).toBe(expected);
    });
    disposeBrushPreview(mesh);
  });

  it('never accepts white content decorative edges on brush previews', () => {
    const mesh = SolidBrushVisual.createBoxPreview('NoWhite', 2, SolidOperation.Additive);
    expect(usesContentDecorativeEdges(mesh)).toBe(false);
    const brushEdgeCount = collectDecorativeEdges(mesh).length;
    rebuildDecorativeEdges(mesh);
    expect(collectDecorativeEdges(mesh).length).toBe(brushEdgeCount);
    const whiteEdges = mesh.children.filter(
      (child) => child instanceof THREE.LineSegments && child.userData['isDecorativeEdge'] === true,
    );
    expect(whiteEdges).toHaveLength(0);
    disposeBrushPreview(mesh);
  });
});

/**
 * Collects decorative edge LineSegments under a brush preview.
 *
 * @param mesh Brush preview mesh.
 * @returns Decorative edge children.
 */
function collectDecorativeEdges(mesh: THREE.Mesh): THREE.LineSegments[] {
  return mesh.children.filter(
    (child): child is THREE.LineSegments =>
      child instanceof THREE.LineSegments && child.userData[SOLID_BRUSH_EDGE_USERDATA_KEY] === true,
  );
}

/**
 * Disposes geometry and owned materials for a brush preview mesh.
 *
 * @param mesh Brush preview created by SolidBrushVisual.
 */
function disposeBrushPreview(mesh: THREE.Mesh): void {
  mesh.traverse((child) => {
    if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) {
      child.geometry?.dispose();
      const material = child.material;
      if (Array.isArray(material)) {
        material.forEach((entry) => {
          if (!SolidBrushEdgeMaterials.isSharedMaterial(entry)) entry.dispose();
        });
      } else if (material && !SolidBrushEdgeMaterials.isSharedMaterial(material)) {
        material.dispose();
      }
    }
  });
}
