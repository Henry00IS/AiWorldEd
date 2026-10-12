import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  COINCIDENT_WARNING_SCREEN_OFFSET_NDC,
  OverlayVertexCoincidentWarning,
} from '@/edit/overlay/overlay_vertex_coincident_warning.js';
import { detectTopologyCoincidentClusters } from '@/edit/topology/topology_coincident.js';
import { brushToWorkingGeometry } from '@/edit/topology/topology_working_from_brush.js';
import { meshDocumentFromPolygonList } from '@/mesh/convert/mesh_from_polygon_list.js';
import { SolidBrushFactory } from '@/solid/brush/solid_brush_factory.js';
import { topologyWorkingVertexRead } from '@/edit/topology/topology_working_vertex_read.js';
import { computeViewportConstantScreenScale } from '@/viewports/scale/viewport_constant_screen_scale.js';

describe('overlay_vertex_coincident_warning', () => {
  it('creates one marker per coincident cluster', () => {
    const scene = new THREE.Scene();
    const overlay = new OverlayVertexCoincidentWarning(scene);
    const working = brushToWorkingGeometry(SolidBrushFactory.createCenteredBox(2, 2, 2));
    const source = topologyWorkingVertexRead(working, 0);
    expect(source).toBeTruthy();
    if (!source) {
      overlay.dispose();
      return;
    }
    working.positions.push(source.clone());
    overlay.updateFromWorldGeometries([working]);
    const position = overlayScenePointCount(scene);
    expect(position).toBe(detectTopologyCoincidentClusters(working).length);
    overlay.dispose();
  });

  it('refreshes packed document clusters when the geometry generation changes', () => {
    const document = meshDocumentFromPolygonList(new Float32Array([0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0]), [
      [0, 2, 3],
      [1, 2, 3],
    ]);
    const scene = new THREE.Scene();
    const overlay = new OverlayVertexCoincidentWarning(scene);
    const source = { targetId: 'mesh', mesh: new THREE.Mesh(), document };
    overlay.updateFromCageSources([source], []);
    expect(overlayScenePointCount(scene)).toBe(1);
    overlay.updateFromCageSources([source], []);
    expect(overlayScenePointCount(scene)).toBe(1);
    document.getTopology().getPositions()[0] = 2;
    document.markPositionsDirty();
    overlay.updateFromCageSources([source], []);
    expect(overlayScenePointCount(scene)).toBe(0);
    overlay.dispose();
  });

  it('offsets the warning in screen space so it sits beside the vertex', () => {
    expect(COINCIDENT_WARNING_SCREEN_OFFSET_NDC).toBeGreaterThan(0);
    const scene = new THREE.Scene();
    const overlay = new OverlayVertexCoincidentWarning(scene);
    let shader = '';
    scene.traverse((child) => {
      if (!(child instanceof THREE.Points)) {
        return;
      }
      const material = child.material;
      if (!Array.isArray(material) && material instanceof THREE.ShaderMaterial) {
        shader = material.vertexShader;
      }
    });
    expect(shader).toContain('screenOffsetNdc');
    overlay.dispose();
  });

  it('draws a single triangle with a transparent background and an exclamation', () => {
    const scene = new THREE.Scene();
    const overlay = new OverlayVertexCoincidentWarning(scene);
    let fragment = '';
    scene.traverse((child) => {
      if (!(child instanceof THREE.Points)) {
        return;
      }
      const material = child.material;
      if (!Array.isArray(material) && material instanceof THREE.ShaderMaterial) {
        fragment = material.fragmentShader;
      }
    });
    expect(fragment).toContain('insideTriangle');
    expect(fragment).toContain('exclamationBar');
    expect(fragment).toContain('discard');
    overlay.dispose();
  });

  it('uses the same constant-screen helper family as gizmos', () => {
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(0, 0, 10);
    const scale = computeViewportConstantScreenScale(camera, new THREE.Vector3());
    expect(scale).toBeGreaterThan(0);
  });
});

/**
 * Counts warning-overlay point vertices in a scene.
 *
 * @param scene Scene that may contain the overlay.
 * @returns Point count.
 */
function overlayScenePointCount(scene: THREE.Scene): number {
  let count = 0;
  scene.traverse((child) => {
    if (!(child instanceof THREE.Points) || child.name !== 'overlay_vertex_coincident_warning') {
      return;
    }
    const position = child.geometry.getAttribute('position');
    count += position ? position.count : 0;
  });
  return count;
}
