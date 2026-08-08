import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { Theme } from '@/theme.js';
import {
  applyEditModeLineStyleForOrthographicPass,
  applyEditModeLineStyleForPerspectivePass,
  setEditModeViewportLineStyleActive,
} from '@/edit/session/edit_mode_viewport_line_style.js';
import { EDIT_MODE_REST_WIRE_COLOR_2D } from '@/edit/component/component_edit_selection_draw.js';
import { rebuildDecorativeEdges, DECORATIVE_EDGE_USERDATA_KEY } from '@/utils/mesh_edge_sync.js';
import { SolidBrushEdgeMaterials } from '@/solid/model/solid_brush_edge_materials.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { EDIT_MODE_WIREFRAME_SUPPRESSED_USERDATA_KEY } from '@/utils/edit_mode_wireframe_suppress.js';

describe('edit_mode_viewport_line_style', () => {
  let world: THREE.Group;

  beforeEach(() => {
    world = new THREE.Group();
    setEditModeViewportLineStyleActive(false);
  });

  afterEach(() => {
    setEditModeViewportLineStyleActive(false);
  });

  it('darkens free-content rest wires in 2D edit mode but keeps brush operation colors', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    world.add(mesh);
    rebuildDecorativeEdges(mesh);
    const decorative = findDecorative(mesh);
    expect(decorative).toBeTruthy();
    setEditModeViewportLineStyleActive(true);
    applyEditModeLineStyleForOrthographicPass(world);
    expect(readLineColor(decorative!)).toBe(EDIT_MODE_REST_WIRE_COLOR_2D);
    const brushMaterial = SolidBrushEdgeMaterials.getFrontMaterial(SolidOperation.Additive);
    expect(readBrushDiffuseHex(brushMaterial)).toBe(
      SolidBrushEdgeMaterials.edgeColorForOperation(SolidOperation.Additive),
    );
    applyEditModeLineStyleForPerspectivePass(world);
    expect(readLineColor(decorative!)).toBe(Theme.boxEdgeColor);
    expect(readBrushDiffuseHex(brushMaterial)).toBe(
      SolidBrushEdgeMaterials.edgeColorForOperation(SolidOperation.Additive),
    );
  });

  it('restores object-mode content edge color after leaving edit mode', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    world.add(mesh);
    rebuildDecorativeEdges(mesh);
    const decorative = findDecorative(mesh)!;
    setEditModeViewportLineStyleActive(true);
    applyEditModeLineStyleForOrthographicPass(world);
    setEditModeViewportLineStyleActive(false);
    applyEditModeLineStyleForOrthographicPass(world);
    expect(readLineColor(decorative)).toBe(Theme.boxEdgeColor);
  });

  it('does not recolor edit-mode suppressed domain wireframes', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    world.add(mesh);
    rebuildDecorativeEdges(mesh);
    const decorative = findDecorative(mesh)!;
    (decorative.material as THREE.LineBasicMaterial).color.setHex(Theme.boxEdgeColor);
    decorative.userData[EDIT_MODE_WIREFRAME_SUPPRESSED_USERDATA_KEY] = true;
    setEditModeViewportLineStyleActive(true);
    applyEditModeLineStyleForOrthographicPass(world);
    expect(readLineColor(decorative)).toBe(Theme.boxEdgeColor);
  });
});

/**
 * Finds the decorative edge child on a mesh.
 *
 * @param mesh Content mesh.
 * @returns Decorative line, or null.
 */
function findDecorative(mesh: THREE.Mesh): THREE.LineSegments | null {
  for (const child of mesh.children) {
    if (child.userData[DECORATIVE_EDGE_USERDATA_KEY] === true && child instanceof THREE.LineSegments) {
      return child;
    }
  }
  return null;
}

/**
 * Reads LineBasicMaterial hex color from a line object.
 *
 * @param object Line object.
 * @returns Hex color.
 */
function readLineColor(object: THREE.Object3D): number {
  const material = (object as THREE.LineSegments).material as THREE.LineBasicMaterial;
  return material.color.getHex();
}

/**
 * Reads brush edge shader diffuse hex.
 *
 * @param material Shared brush edge material.
 * @returns Hex color.
 */
function readBrushDiffuseHex(material: THREE.ShaderMaterial): number {
  const diffuse = material.uniforms['diffuse']!.value as THREE.Color;
  return diffuse.getHex();
}
