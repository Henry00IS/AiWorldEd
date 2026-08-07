import * as THREE from 'three';
import { Theme } from '@/theme.js';
import { FaceSelection } from './manager_face_selection.js';
import { expandFaceSelectionIndices } from './solid_result_face_indices.js';
import { buildFacePickRegionKey } from './solid_triangle_source_index.js';
import { getTriangleVertexIndices } from '@/selection/pick/utils_triangle_geometry.js';
import { GizmoVisualStyle } from '@/transform/gizmo/gizmo_visual_style.js';
import { isResultMesh, SOLID_TRIANGLE_SOURCES_USERDATA_KEY } from '@/solid/model/solid_model_keys.js';

/**
 * Face-fill opacities for ordinary content meshes (light underlays like default
 * cubes). Transparent orange over light surfaces reads darker/heavier.
 */
const CONTENT_FACE_FRONT_OPACITY = 0.32;
const CONTENT_FACE_OCCLUDED_OPACITY = 0.15;

/**
 * Face-fill opacities for solid CSG result meshes (typically darker textured
 * underlays). Same transparent orange reads weaker, so intensity is raised to
 * match the content look.
 */
const SOLID_FACE_FRONT_OPACITY = 0.42;
const SOLID_FACE_OCCLUDED_OPACITY = 0.2;

/** Dual-pass materials for one underlay class. */
interface FaceHighlightMaterials {
  front: THREE.MeshBasicMaterial;
  occluded: THREE.MeshBasicMaterial;
}

/**
 * Renders orange face-selection overlays with gizmo-style depth treatment.
 * Content and solid meshes use different opacities so the fill reads equally
 * strong over light primitives and dark brush surfaces. Geometry updates are
 * per-region and incremental.
 */
export class FaceSelectionHighlight {
  private scene: THREE.Scene;
  private highlightGroup: THREE.Group;
  private readonly contentMaterials: FaceHighlightMaterials;
  private readonly solidMaterials: FaceHighlightMaterials;
  /** Dual-pass highlight group keyed by face region identity. */
  private regionGroups: Map<string, THREE.Group>;
  /** Seed selection used to build each active region group. */
  private regionSeeds: Map<string, FaceSelection>;
  private pendingFaces: FaceSelection[] | null;
  private coalesceFrame: number;
  private readonly scratchVertex = new THREE.Vector3();

  /**
   * Creates a new face highlight renderer and adds it to the scene.
   *
   * @param scene The scene to add the highlight group to.
   */
  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.highlightGroup = new THREE.Group();
    this.contentMaterials = this.createMaterialPair(CONTENT_FACE_FRONT_OPACITY, CONTENT_FACE_OCCLUDED_OPACITY);
    this.solidMaterials = this.createMaterialPair(SOLID_FACE_FRONT_OPACITY, SOLID_FACE_OCCLUDED_OPACITY);
    this.regionGroups = new Map();
    this.regionSeeds = new Map();
    this.pendingFaces = null;
    this.coalesceFrame = 0;
    this.scene.add(this.highlightGroup);
  }

  /**
   * Builds shared front/occluded materials for one underlay class.
   *
   * @param frontOpacity Unoccluded fill opacity.
   * @param occludedOpacity See-through / reverse-side opacity.
   * @returns Material pair.
   */
  private createMaterialPair(frontOpacity: number, occludedOpacity: number): FaceHighlightMaterials {
    return {
      front: this.createPassMaterial(frontOpacity, THREE.LessEqualDepth),
      occluded: this.createPassMaterial(occludedOpacity, THREE.GreaterDepth),
    };
  }

  /**
   * Creates one dual-pass face fill material.
   *
   * @param opacity Pass opacity.
   * @param depthFunc Depth comparison for front or occluded pass.
   * @returns Configured MeshBasicMaterial.
   */
  private createPassMaterial(opacity: number, depthFunc: THREE.DepthModes): THREE.MeshBasicMaterial {
    return new THREE.MeshBasicMaterial({
      color: Theme.selectionColor,
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
  }

  /**
   * Updates highlights to match the selection. Coalesces to one apply per frame
   * and only adds/removes regions that changed.
   *
   * @param faces Current face selection seeds.
   */
  setSelectedFaces(faces: FaceSelection[]): void {
    this.pendingFaces = faces;
    if (this.coalesceFrame !== 0) return;
    if (typeof requestAnimationFrame !== 'function') {
      this.flushPendingHighlights();
      return;
    }
    this.coalesceFrame = requestAnimationFrame(() => {
      this.coalesceFrame = 0;
      this.flushPendingHighlights();
    });
  }

  /** Applies any coalesced highlight update immediately. */
  flushPendingHighlights(): void {
    if (this.coalesceFrame !== 0 && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.coalesceFrame);
      this.coalesceFrame = 0;
    }
    const pending = this.pendingFaces;
    this.pendingFaces = null;
    if (pending) {
      this.applySelectedFacesIncremental(pending);
    }
  }

  /**
   * Diffs the desired selection against active region groups and only builds
   * geometry for newly selected regions.
   *
   * @param faces Desired face selection seeds.
   */
  private applySelectedFacesIncremental(faces: FaceSelection[]): void {
    const desired = this.buildDesiredRegionSeeds(faces);
    for (const regionKey of Array.from(this.regionGroups.keys())) {
      if (!desired.has(regionKey)) {
        this.removeRegion(regionKey);
      }
    }
    desired.forEach((seed, regionKey) => {
      if (this.regionGroups.has(regionKey)) return;
      this.addRegion(regionKey, seed);
    });
  }

  /**
   * Builds a map of region key → seed selection for the desired set.
   *
   * @param faces Face selection seeds to map by region key.
   * @returns Desired region map.
   */
  private buildDesiredRegionSeeds(faces: FaceSelection[]): Map<string, FaceSelection> {
    const desired = new Map<string, FaceSelection>();
    for (const entry of faces) {
      const regionKey = buildFacePickRegionKey(entry.mesh, entry.faceIndex);
      if (!desired.has(regionKey)) {
        desired.set(regionKey, entry);
      }
    }
    return desired;
  }

  /**
   * Builds and mounts a dual-pass highlight for one newly selected region.
   *
   * @param regionKey Stable region identity.
   * @param seed Seed triangle selection for expansion.
   */
  private addRegion(regionKey: string, seed: FaceSelection): void {
    const faceIndices = expandFaceSelectionIndices(seed.mesh, seed.faceIndex);
    const group = this.buildRegionHighlight(seed.mesh, faceIndices);
    if (!group) return;
    this.highlightGroup.add(group);
    this.regionGroups.set(regionKey, group);
    this.regionSeeds.set(regionKey, seed);
  }

  /**
   * Removes and disposes one region highlight.
   *
   * @param regionKey Region to remove.
   */
  private removeRegion(regionKey: string): void {
    const group = this.regionGroups.get(regionKey);
    if (!group) return;
    this.disposeFaceGroup(group);
    this.regionGroups.delete(regionKey);
    this.regionSeeds.delete(regionKey);
  }

  /**
   * Builds a dual-pass highlight group for one face region's triangles.
   *
   * @param mesh Source mesh.
   * @param faceIndices Triangle indices to highlight.
   * @returns Dual-pass group, or null when geometry is empty.
   */
  private buildRegionHighlight(mesh: THREE.Mesh, faceIndices: number[]): THREE.Group | null {
    const geometry = this.buildWorldSpaceBatchedGeometry(mesh, faceIndices);
    if (!geometry) return null;
    const materials = this.materialsForMesh(mesh);
    const group = new THREE.Group();
    group.userData['isFaceSelectionHighlight'] = true;
    group.add(this.createOccludedFaceMesh(geometry, materials.occluded));
    group.add(this.createFrontFaceMesh(geometry, materials.front));
    return group;
  }

  /**
   * Chooses fill materials so solid results and content meshes read equally.
   *
   * @param mesh Mesh whose faces are highlighted.
   * @returns Material pair for that underlay class.
   */
  private materialsForMesh(mesh: THREE.Mesh): FaceHighlightMaterials {
    return this.usesSolidFaceFillIntensity(mesh) ? this.solidMaterials : this.contentMaterials;
  }

  /**
   * Returns whether the mesh is a solid CSG result (darker underlay).
   *
   * @param mesh Candidate mesh.
   * @returns True for solid result meshes.
   */
  private usesSolidFaceFillIntensity(mesh: THREE.Mesh): boolean {
    if (isResultMesh(mesh)) return true;
    const sources = mesh.userData[SOLID_TRIANGLE_SOURCES_USERDATA_KEY];
    return Array.isArray(sources) && sources.length > 0;
  }

  /**
   * Builds non-indexed world-space triangle geometry for the given faces.
   *
   * @param mesh Source mesh.
   * @param faceIndices Triangle indices to include.
   * @returns Batched geometry, or null when no valid triangles exist.
   */
  private buildWorldSpaceBatchedGeometry(mesh: THREE.Mesh, faceIndices: number[]): THREE.BufferGeometry | null {
    const positions = mesh.geometry.getAttribute('position');
    if (!positions || faceIndices.length === 0) return null;
    mesh.updateMatrixWorld(true);
    const worldMatrix = mesh.matrixWorld;
    const floats = new Float32Array(faceIndices.length * 9);
    let write = 0;
    for (const faceIndex of faceIndices) {
      const [i0, i1, i2] = getTriangleVertexIndices(mesh.geometry, faceIndex);
      write = this.writeWorldVertex(positions, i0, worldMatrix, floats, write);
      write = this.writeWorldVertex(positions, i1, worldMatrix, floats, write);
      write = this.writeWorldVertex(positions, i2, worldMatrix, floats, write);
    }
    if (write === 0) return null;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(floats.subarray(0, write), 3));
    geometry.computeBoundingSphere();
    return geometry;
  }

  /**
   * Writes one transformed vertex into the batch float buffer.
   *
   * @param positions Position attribute.
   * @param vertexIndex Attribute vertex index.
   * @param worldMatrix Mesh world matrix.
   * @param floats Destination float buffer.
   * @param write Next float write index.
   * @returns Updated write index.
   */
  private writeWorldVertex(
    positions: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
    vertexIndex: number,
    worldMatrix: THREE.Matrix4,
    floats: Float32Array,
    write: number,
  ): number {
    this.scratchVertex.set(positions.getX(vertexIndex), positions.getY(vertexIndex), positions.getZ(vertexIndex));
    this.scratchVertex.applyMatrix4(worldMatrix);
    floats[write] = this.scratchVertex.x;
    floats[write + 1] = this.scratchVertex.y;
    floats[write + 2] = this.scratchVertex.z;
    return write + 3;
  }

  /**
   * Creates the bright front-pass mesh for a face highlight.
   *
   * @param geometry Shared triangle geometry.
   * @param material Front-pass material for this underlay class.
   * @returns Front highlight mesh.
   */
  private createFrontFaceMesh(geometry: THREE.BufferGeometry, material: THREE.MeshBasicMaterial): THREE.Mesh {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = GizmoVisualStyle.frontRenderOrder;
    mesh.userData['isFaceSelectionHighlight'] = true;
    mesh.frustumCulled = true;
    return mesh;
  }

  /**
   * Creates the ghost mesh drawn only where the face is occluded.
   *
   * @param geometry Shared triangle geometry.
   * @param material Occluded-pass material for this underlay class.
   * @returns Occluded highlight mesh.
   */
  private createOccludedFaceMesh(geometry: THREE.BufferGeometry, material: THREE.MeshBasicMaterial): THREE.Mesh {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = GizmoVisualStyle.occludedRenderOrder;
    mesh.userData['isFaceSelectionHighlight'] = true;
    mesh.userData['isFaceSelectionHighlightOccluded'] = true;
    mesh.frustumCulled = true;
    return mesh;
  }

  /**
   * Removes the group from the highlight parent and disposes its geometry.
   *
   * @param group Group to remove and dispose.
   */
  private disposeFaceGroup(group: THREE.Group): void {
    this.highlightGroup.remove(group);
    const geometry = this.findSharedGeometry(group);
    if (geometry) geometry.dispose();
  }

  /**
   * Returns the geometry of the first mesh child in the group.
   *
   * @param group Group whose children are scanned for mesh geometry.
   * @returns Geometry from the first mesh child, or null when none is found.
   */
  private findSharedGeometry(group: THREE.Group): THREE.BufferGeometry | null {
    for (const child of group.children) {
      if (child instanceof THREE.Mesh && child.geometry) {
        return child.geometry;
      }
    }
    return null;
  }

  /** Removes all face highlights from the scene. */
  private clearHighlights(): void {
    this.regionGroups.forEach((_group, regionKey) => {
      this.removeRegion(regionKey);
    });
  }

  /** Disposes all highlight resources and removes the group from the scene. */
  dispose(): void {
    if (this.coalesceFrame !== 0) {
      cancelAnimationFrame(this.coalesceFrame);
      this.coalesceFrame = 0;
    }
    this.pendingFaces = null;
    this.clearHighlights();
    this.scene.remove(this.highlightGroup);
    this.contentMaterials.front.dispose();
    this.contentMaterials.occluded.dispose();
    this.solidMaterials.front.dispose();
    this.solidMaterials.occluded.dispose();
  }

  /**
   * Returns the count of active highlight region groups after flushing pending
   * updates.
   *
   * @returns Number of highlighted face regions.
   */
  getHighlightCount(): number {
    this.flushPendingHighlights();
    return this.regionGroups.size;
  }
}
