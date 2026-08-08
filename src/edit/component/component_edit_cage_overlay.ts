import * as THREE from 'three';
import type { ComponentSelectionEntry } from './component_selection_entry.js';
import type { BrushEditCage } from '@/edit/brush/brush_edit_cage.js';
import {
  buildComponentCageDrawBuffers,
  buildComponentSelectionDrawBuffers,
  EDIT_SELECTED_EDGE_COLOR,
  type ComponentCageMeshSource,
} from './component_edit_selection_draw.js';
import { ComponentEditLineMaterials } from './component_edit_line_materials.js';

export type { ComponentCageMeshSource };

/** Face fill opacity for the depth-tested front pass. */
const FACE_FRONT_OPACITY = 0.38;

/** Face fill opacity for the occluded (see-through) pass. */
const FACE_OCCLUDED_OPACITY = 0.16;

/** Screen-pixel size for cage vertex dots (in front of wires, black/white). */
export const EDIT_CAGE_VERTEX_POINT_SIZE = 4;

/** Draw order for cage wires (below selection edges and vertex dots). */
const CAGE_EDGE_RENDER_ORDER = 1000;

/** Draw order for selected / half-selected edges. */
const CAGE_SELECTED_EDGE_RENDER_ORDER = 1001;

/**
 * Draw order for vertex dots. Must be above transparent cage wires so selected
 * white verts are not buried under black/orange line fragments.
 */
const CAGE_VERTEX_RENDER_ORDER = 1010;

/**
 * Blender-style Edit Mode cage: vertex dots (black/white by selection), cage
 * wires and selection edges via shared shaders that choose 2D/3D colors from
 * the active camera projection, and dual-pass orange face fills.
 */
export class ComponentEditCageOverlay {
  private readonly scene: THREE.Scene;
  private readonly group: THREE.Group;
  private readonly cagePoints: THREE.Points;
  private readonly cageEdges: THREE.LineSegments;
  private readonly fullSelectedEdges: THREE.LineSegments;
  private readonly halfSelectedEdges: THREE.LineSegments;
  private readonly selectedFaceFront: THREE.Mesh;
  private readonly selectedFaceOccluded: THREE.Mesh;
  private readonly faceFillGeometry: THREE.BufferGeometry;

  /**
   * Creates cage overlays in the scene.
   *
   * @param scene Scene receiving the overlay group.
   */
  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'EditComponentCageOverlay';
    this.group.userData['isEditComponentCage'] = true;
    this.cageEdges = this.createSharedLines(
      ComponentEditLineMaterials.getCageMaterial(),
      CAGE_EDGE_RENDER_ORDER,
      false,
    );
    this.fullSelectedEdges = this.createSharedLines(
      ComponentEditLineMaterials.getSolidSelectedMaterial(),
      CAGE_SELECTED_EDGE_RENDER_ORDER,
      false,
    );
    this.halfSelectedEdges = this.createSharedLines(
      ComponentEditLineMaterials.getHalfSelectedMaterial(),
      CAGE_SELECTED_EDGE_RENDER_ORDER,
      true,
    );
    this.faceFillGeometry = new THREE.BufferGeometry();
    this.faceFillGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3));
    this.selectedFaceOccluded = this.createFaceMesh(
      this.faceFillGeometry,
      FACE_OCCLUDED_OPACITY,
      THREE.GreaterDepth,
      997,
    );
    this.selectedFaceFront = this.createFaceMesh(this.faceFillGeometry, FACE_FRONT_OPACITY, THREE.LessEqualDepth, 998);
    this.cagePoints = this.createVertexPoints(EDIT_CAGE_VERTEX_POINT_SIZE, CAGE_VERTEX_RENDER_ORDER);
    this.group.add(this.cageEdges);
    this.group.add(this.selectedFaceOccluded);
    this.group.add(this.selectedFaceFront);
    this.group.add(this.fullSelectedEdges);
    this.group.add(this.halfSelectedEdges);
    this.group.add(this.cagePoints);
    this.scene.add(this.group);
  }

  /**
   * Rebuilds cage and selection overlays.
   *
   * @param meshSources Content mesh sources.
   * @param brushCages Brush wing-edge cages.
   * @param selected Selected components.
   */
  update(
    meshSources: readonly ComponentCageMeshSource[],
    brushCages: readonly BrushEditCage[],
    selected: readonly ComponentSelectionEntry[],
  ): void {
    const cage = buildComponentCageDrawBuffers(meshSources, brushCages, selected);
    const selection = buildComponentSelectionDrawBuffers(meshSources, brushCages, selected);
    this.replaceColoredPoints(this.cagePoints.geometry, cage.vertexCoords, cage.vertexColors);
    this.replacePositionsWithFade(this.cageEdges.geometry, cage.edgeCoords, 0);
    this.replacePositionsWithFade(this.fullSelectedEdges.geometry, selection.fullEdgeCoords, 0);
    this.replaceHalfEdgeGeometry(selection.halfEdgeCoords, selection.halfEdgeFadeT);
    this.replaceFaceGeometry(selection.faceCoords);
  }

  /** Removes overlays and disposes owned GPU resources (not shared materials). */
  dispose(): void {
    this.scene.remove(this.group);
    this.cagePoints.geometry.dispose();
    this.cageEdges.geometry.dispose();
    this.fullSelectedEdges.geometry.dispose();
    this.halfSelectedEdges.geometry.dispose();
    this.faceFillGeometry.dispose();
    (this.cagePoints.material as THREE.Material).dispose();
    (this.selectedFaceFront.material as THREE.Material).dispose();
    (this.selectedFaceOccluded.material as THREE.Material).dispose();
  }

  /**
   * Creates the shared vertex-dot cloud (vertex colors for selection).
   *
   * @param size CSS-pixel point size.
   * @param renderOrder Draw order above wire edges.
   * @returns Points object.
   */
  private createVertexPoints(size: number, renderOrder: number): THREE.Points {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(0), 3));
    const material = new THREE.PointsMaterial({
      size,
      sizeAttenuation: false,
      depthTest: true,
      depthWrite: false,
      transparent: true,
      opacity: 1,
      vertexColors: true,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: -12,
      polygonOffsetUnits: -12,
    });
    const points = new THREE.Points(geometry, material);
    points.renderOrder = renderOrder;
    points.frustumCulled = false;
    return points;
  }

  /**
   * Creates line segments using a shared edit-line shader material.
   *
   * @param material Shared line material.
   * @param renderOrder Draw order.
   * @param needsFadeAttribute When true, allocates a fadeT attribute.
   * @returns Line segments.
   */
  private createSharedLines(
    material: THREE.ShaderMaterial,
    renderOrder: number,
    _needsFadeAttribute: boolean,
  ): THREE.LineSegments {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3));
    geometry.setAttribute('fadeT', new THREE.BufferAttribute(new Float32Array(0), 1));
    const lines = new THREE.LineSegments(geometry, material);
    lines.renderOrder = renderOrder;
    lines.frustumCulled = false;
    return lines;
  }

  /**
   * Creates one dual-pass face fill mesh sharing the fill geometry.
   *
   * @param geometry Shared face fill geometry.
   * @param opacity Pass opacity.
   * @param depthFunc Front or occluded depth comparison.
   * @param renderOrder Draw order.
   * @returns Mesh.
   */
  private createFaceMesh(
    geometry: THREE.BufferGeometry,
    opacity: number,
    depthFunc: THREE.DepthModes,
    renderOrder: number,
  ): THREE.Mesh {
    const material = new THREE.MeshBasicMaterial({
      color: EDIT_SELECTED_EDGE_COLOR,
      transparent: true,
      opacity,
      depthTest: true,
      depthWrite: false,
      depthFunc,
      side: THREE.DoubleSide,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = renderOrder;
    mesh.frustumCulled = false;
    return mesh;
  }

  /**
   * Replaces positions and writes a constant fadeT for non-gradient lines.
   *
   * @param geometry Target geometry.
   * @param coords Flat xyz.
   * @param fadeValue Constant fadeT for every vertex.
   */
  private replacePositionsWithFade(geometry: THREE.BufferGeometry, coords: number[], fadeValue: number): void {
    const vertexCount = Math.floor(coords.length / 3);
    const fade = new Float32Array(vertexCount);
    fade.fill(fadeValue);
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(coords), 3));
    geometry.setAttribute('fadeT', new THREE.BufferAttribute(fade, 1));
    geometry.computeBoundingSphere();
  }

  /**
   * Replaces half-edge positions and per-vertex fadeT weights.
   *
   * @param coords Flat xyz.
   * @param fadeT Per-vertex fade weights.
   */
  private replaceHalfEdgeGeometry(coords: number[], fadeT: number[]): void {
    this.halfSelectedEdges.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(coords), 3));
    this.halfSelectedEdges.geometry.setAttribute('fadeT', new THREE.BufferAttribute(new Float32Array(fadeT), 1));
    this.halfSelectedEdges.geometry.computeBoundingSphere();
  }

  /**
   * Replaces vertex positions and per-vertex colors on the cage point cloud.
   *
   * @param geometry Target geometry.
   * @param coords Flat xyz.
   * @param colors Flat rgb 0–1.
   */
  private replaceColoredPoints(geometry: THREE.BufferGeometry, coords: number[], colors: number[]): void {
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(coords), 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3));
    geometry.computeBoundingSphere();
  }

  /**
   * Replaces shared dual-pass face fill geometry.
   *
   * @param coords Flat triangle xyz list.
   */
  private replaceFaceGeometry(coords: number[]): void {
    this.faceFillGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(coords), 3));
    this.faceFillGeometry.computeBoundingSphere();
  }
}
