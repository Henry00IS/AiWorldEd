import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SolidBrushVisual } from '../../src/solid/model/solid_brush_visual.js';
import { SolidBrushEdgeFader } from '../../src/solid/model/solid_brush_edge_fader.js';
import {
  BRUSH_EDGE_FADE_FAR,
  BRUSH_EDGE_FADE_NEAR,
  SOLID_BRUSH_EDGE_USERDATA_KEY,
  SolidBrushEdgeMaterials,
} from '../../src/solid/model/solid_brush_edge_materials.js';
import { SolidOperation } from '../../src/solid/types/solid_operation.js';
import { SOLID_BRUSH_OCCLUDED_EDGE_USERDATA_KEY } from '../../src/solid/model/solid_brush_visual.js';

/** Unit tests for perspective brush edge distance culling. */
describe('SolidBrushEdgeFader', () => {
  it('hides edge passes for brushes beyond the fade distance', () => {
    const root = new THREE.Group();
    const brush = SolidBrushVisual.createBoxPreview('Far', 2, SolidOperation.Additive);
    brush.position.set(0, 0, BRUSH_EDGE_FADE_FAR + 40);
    root.add(brush);
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    camera.position.set(0, 0, 0);
    SolidBrushEdgeFader.updateForCamera(root, camera);
    const edges = collectEdges(brush);
    expect(edges.length).toBe(2);
    edges.forEach((edge) => expect(edge.visible).toBe(false));
  });

  it('shows front edges for nearby brushes and occluded only when close', () => {
    const root = new THREE.Group();
    const nearBrush = SolidBrushVisual.createBoxPreview('Near', 2, SolidOperation.Additive);
    nearBrush.position.set(0, 0, BRUSH_EDGE_FADE_NEAR * 0.25);
    root.add(nearBrush);
    const midBrush = SolidBrushVisual.createBoxPreview('Mid', 2, SolidOperation.Subtractive);
    midBrush.position.set(0, 0, BRUSH_EDGE_FADE_NEAR * 1.6);
    root.add(midBrush);
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    camera.position.set(0, 0, 0);
    SolidBrushEdgeFader.updateForCamera(root, camera);
    const nearFront = findFrontEdge(nearBrush);
    const nearOccluded = findOccludedEdge(nearBrush);
    const midFront = findFrontEdge(midBrush);
    const midOccluded = findOccludedEdge(midBrush);
    expect(nearFront.visible).toBe(true);
    expect(nearOccluded.visible).toBe(true);
    expect(midFront.visible).toBe(true);
    expect(midOccluded.visible).toBe(false);
  });

  it('keeps selected brush edges visible farther than unselected ones', () => {
    const root = new THREE.Group();
    const brush = SolidBrushVisual.createBoxPreview('Selected', 2, SolidOperation.Additive);
    const distance = BRUSH_EDGE_FADE_FAR + 20;
    brush.position.set(0, 0, distance);
    root.add(brush);
    SolidBrushVisual.setHullFillVisible(brush, true);
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    camera.position.set(0, 0, 0);
    SolidBrushEdgeFader.updateForCamera(root, camera);
    expect(findFrontEdge(brush).visible).toBe(true);
  });

  it('restores all brush edge passes after a perspective distance cull', () => {
    const root = new THREE.Group();
    const brush = SolidBrushVisual.createBoxPreview('Far', 2, SolidOperation.Additive);
    brush.position.set(0, 0, BRUSH_EDGE_FADE_FAR + 40);
    root.add(brush);
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    camera.position.set(0, 0, 0);
    SolidBrushEdgeFader.updateForCamera(root, camera);
    collectEdges(brush).forEach((edge) => expect(edge.visible).toBe(false));
    SolidBrushEdgeFader.showAllEdges(root);
    collectEdges(brush).forEach((edge) => expect(edge.visible).toBe(true));
  });

  it('prepares orthographic passes with full-bright front edges and no occluded pass', () => {
    const root = new THREE.Group();
    const brush = SolidBrushVisual.createBoxPreview('Sky', 2, SolidOperation.Additive);
    brush.position.set(0, 50, 0);
    root.add(brush);
    SolidBrushEdgeMaterials.setDepthOcclusionEnabled(true);
    SolidBrushEdgeFader.prepareForOrthographicPass(root);
    expect(SolidBrushEdgeMaterials.isDepthOcclusionEnabled()).toBe(false);
    expect(findFrontEdge(brush).visible).toBe(true);
    expect(findOccludedEdge(brush).visible).toBe(false);
    expect(SolidBrushEdgeMaterials.getFrontMaterial(SolidOperation.Additive).depthTest).toBe(false);
    SolidBrushEdgeFader.prepareForPerspectivePass(root);
    expect(SolidBrushEdgeMaterials.isDepthOcclusionEnabled()).toBe(true);
    expect(SolidBrushEdgeMaterials.getFrontMaterial(SolidOperation.Additive).depthTest).toBe(true);
  });

  it('disables selected hull fill depth occlusion for orthographic multi-view passes', () => {
    const root = new THREE.Group();
    const brush = SolidBrushVisual.createBoxPreview('Selected', 2, SolidOperation.Additive);
    root.add(brush);
    SolidBrushVisual.setHullFillVisible(brush, true);
    SolidBrushEdgeFader.prepareForPerspectivePass(root);
    const material = brush.material as THREE.MeshBasicMaterial;
    expect(material.depthTest).toBe(true);
    expect(SolidBrushVisual.isHullFillDepthOcclusionEnabled()).toBe(true);
    SolidBrushEdgeFader.prepareForOrthographicPass(root);
    expect(SolidBrushVisual.isHullFillDepthOcclusionEnabled()).toBe(false);
    expect(material.depthTest).toBe(false);
    expect(material.depthFunc).toBe(THREE.AlwaysDepth);
    expect(brush.renderOrder).toBeGreaterThan(2);
    SolidBrushEdgeFader.prepareForPerspectivePass(root);
    expect(material.depthTest).toBe(true);
    expect(material.depthFunc).toBe(THREE.LessEqualDepth);
    expect(brush.renderOrder).toBe(2);
  });
});

/**
 * Collects decorative edge line children of a brush mesh.
 *
 * @param mesh Brush preview mesh.
 * @returns Edge line segments.
 */
function collectEdges(mesh: THREE.Mesh): THREE.LineSegments[] {
  return mesh.children.filter(
    (child): child is THREE.LineSegments =>
      child instanceof THREE.LineSegments && child.userData[SOLID_BRUSH_EDGE_USERDATA_KEY] === true,
  );
}

/**
 * Finds the front (non-occluded) edge pass on a brush.
 *
 * @param mesh Brush preview mesh.
 * @returns Front edge line segments.
 */
function findFrontEdge(mesh: THREE.Mesh): THREE.LineSegments {
  const edge = collectEdges(mesh).find((child) => child.userData[SOLID_BRUSH_OCCLUDED_EDGE_USERDATA_KEY] !== true);
  if (!edge) throw new Error('missing front edge');
  return edge;
}

/**
 * Finds the occluded edge pass on a brush.
 *
 * @param mesh Brush preview mesh.
 * @returns Occluded edge line segments.
 */
function findOccludedEdge(mesh: THREE.Mesh): THREE.LineSegments {
  const edge = collectEdges(mesh).find((child) => child.userData[SOLID_BRUSH_OCCLUDED_EDGE_USERDATA_KEY] === true);
  if (!edge) throw new Error('missing occluded edge');
  return edge;
}
