import * as THREE from 'three';
import { computeTriangleNormal } from '@/selection/pick/utils_triangle_geometry.js';
import { countTriangles } from '@/texture/uv/planar_uv_projector.js';
import { expandFaceSelectionIndices, findSameSolidBrushSurfaceIndices } from './solid_result_face_indices.js';
import {
  buildFacePickRegionKey,
  findFirstTriangleForBrushSurface,
  parseSolidRegionKey,
} from './solid_triangle_source_index.js';

/** A single face selection entry referencing a mesh and a face index. */
export interface FaceSelection {
  mesh: THREE.Mesh;
  faceIndex: number;
  /**
   * Stable region identity at selection time (mesh uuid + brush face or
   * triangle). Used to rebind or drop selection after undo/remesh.
   */
  regionKey?: string;
}

/**
 * Callback invoked when the face selection set changes.
 *
 * @param selected The current set of face selections.
 */
export type FaceSelectionChangedCallback = (selected: FaceSelection[]) => void;

/**
 * Decides whether faces on meshes may be selected.
 *
 * @param meshes Meshes that own the faces about to be selected.
 * @param additive True when the faces join the current selection.
 * @returns True to allow the selection.
 */
export type FaceSelectionAdmission = (meshes: readonly THREE.Mesh[], additive: boolean) => boolean;

/**
 * Manages selection of polygonal faces on meshes. Solid CSG results store one
 * entry per authored brush face (region), not every fragmented triangle —
 * critical for large VMF-style solids. Ordinary meshes expand to coplanar
 * triangles as before.
 */
export class ManagerFaceSelection {
  private selectedFaces: FaceSelection[];
  /** Region keys (solid brush faces) or mesh:triangle keys already selected. */
  private readonly selectedRegionKeys: Set<string>;
  private changeCallback: FaceSelectionChangedCallback | null;
  /** Check consulted before faces are selected, or null to admit all. */
  private admission: FaceSelectionAdmission | null;

  /** Creates a new face selection manager with an empty selection. */
  constructor() {
    this.selectedFaces = [];
    this.selectedRegionKeys = new Set();
    this.changeCallback = null;
    this.admission = null;
  }

  /**
   * Installs or removes the check consulted before faces are selected.
   *
   * @param admission Admission callback, or null to admit everything.
   */
  setAdmission(admission: FaceSelectionAdmission | null): void {
    this.admission = admission;
  }

  /**
   * Selects a face on a mesh. Solid results add one region seed; ordinary
   * meshes expand to the full coplanar face unit when expandFace is true. Does
   * nothing when the admission refuses the mesh.
   *
   * @param mesh The mesh containing the face.
   * @param faceIndex The triangle index of the face to select.
   * @param addToSelection Whether to add to existing selection or replace it.
   * @param expandFace When true, expands ordinary meshes to coplanar faces.
   */
  selectFace(mesh: THREE.Mesh, faceIndex: number, addToSelection: boolean, expandFace: boolean = true): void {
    if (this.admission && !this.admission([mesh], addToSelection)) return;
    if (!addToSelection) {
      this.selectedFaces = [];
      this.selectedRegionKeys.clear();
    }
    if (this.isSolidResultMesh(mesh)) {
      this.selectSolidRegion(mesh, faceIndex);
      return;
    }
    this.selectOrdinaryFace(mesh, faceIndex, expandFace);
  }

  /** Clears all selected faces. */
  deselectAll(): void {
    if (this.selectedFaces.length === 0) return;
    this.selectedFaces = [];
    this.selectedRegionKeys.clear();
    this.notifyChange();
  }

  /**
   * Drops face selections whose mesh left the scene, whose triangle is gone, or
   * whose solid brush surface no longer exists after undo/remesh. Surviving
   * solid regions rebind to a live triangle seed. Other multi-selected faces
   * stay selected.
   *
   * @param sceneRoot World root used to test mesh membership.
   * @returns True when the selection set changed.
   */
  pruneInvalidSelections(sceneRoot: THREE.Object3D): boolean {
    if (this.selectedFaces.length === 0) return false;
    const previous = this.selectedFaces.slice();
    const survivors: FaceSelection[] = [];
    const survivorKeys = new Set<string>();
    for (const entry of previous) {
      const resolved = this.resolveSurvivingSelection(entry, sceneRoot);
      if (!resolved) continue;
      const key = resolved.regionKey ?? buildFacePickRegionKey(resolved.mesh, resolved.faceIndex);
      if (survivorKeys.has(key)) continue;
      survivorKeys.add(key);
      survivors.push({ ...resolved, regionKey: key });
    }
    if (!this.didSelectionChange(previous, survivors)) return false;
    this.selectedFaces = survivors;
    this.selectedRegionKeys.clear();
    survivors.forEach((entry) => {
      if (entry.regionKey) this.selectedRegionKeys.add(entry.regionKey);
    });
    this.notifyChange();
    return true;
  }

  /**
   * Removes a specific face (or its solid region) from the selection.
   *
   * @param mesh The mesh containing the face.
   * @param faceIndex The triangle index of the face to remove.
   */
  removeFace(mesh: THREE.Mesh, faceIndex: number): void {
    const regionKey = buildFacePickRegionKey(mesh, faceIndex);
    if (!this.selectedRegionKeys.has(regionKey)) return;
    this.selectedRegionKeys.delete(regionKey);
    this.selectedFaces = this.selectedFaces.filter(
      (entry) => buildFacePickRegionKey(entry.mesh, entry.faceIndex) !== regionKey,
    );
    this.notifyChange();
  }

  /**
   * Selects face seeds in one batch. Ordinary mesh seeds still expand to
   * coplanar units; solid seeds stay one region each.
   *
   * @param seeds Region seeds to select.
   * @param addToSelection When false, clears the current selection first.
   */
  selectFaceSeeds(seeds: FaceSelection[], addToSelection: boolean): void {
    if (
      this.admission &&
      !this.admission(
        seeds.map((seed) => seed.mesh),
        addToSelection,
      )
    )
      return;
    if (!addToSelection) {
      this.selectedFaces = [];
      this.selectedRegionKeys.clear();
    }
    let changed = !addToSelection;
    for (const seed of seeds) {
      if (this.appendExpandedSeed(seed)) {
        changed = true;
      }
    }
    if (changed) {
      this.notifyChange();
    }
  }

  /**
   * Removes every matching face region seed in one batch.
   *
   * @param seeds Region seeds to remove.
   */
  removeFaceSeeds(seeds: FaceSelection[]): void {
    let changed = false;
    for (const seed of seeds) {
      if (this.removeSeedSilently(seed)) {
        changed = true;
      }
    }
    if (changed) {
      this.notifyChange();
    }
  }

  /**
   * Expands and appends one seed without notifying listeners.
   *
   * @param seed Face seed from hierarchy or pick.
   * @returns True when at least one region was newly selected.
   */
  private appendExpandedSeed(seed: FaceSelection): boolean {
    if (this.isSolidResultMesh(seed.mesh)) {
      return this.appendSolidRegionSilently(seed.mesh, seed.faceIndex);
    }
    return this.appendOrdinaryFaceSilently(seed.mesh, seed.faceIndex, true);
  }

  /**
   * Removes one seed region without notifying listeners.
   *
   * @param seed Face seed to drop.
   * @returns True when the region was present and removed.
   */
  private removeSeedSilently(seed: FaceSelection): boolean {
    const regionKey = seed.regionKey ?? buildFacePickRegionKey(seed.mesh, seed.faceIndex);
    if (!this.selectedRegionKeys.has(regionKey)) {
      return false;
    }
    this.selectedRegionKeys.delete(regionKey);
    this.selectedFaces = this.selectedFaces.filter(
      (entry) => (entry.regionKey ?? buildFacePickRegionKey(entry.mesh, entry.faceIndex)) !== regionKey,
    );
    return true;
  }

  /**
   * Adds one solid region when missing.
   *
   * @param mesh Solid result mesh.
   * @param faceIndex Seed triangle.
   * @returns True when the region was newly added.
   */
  private appendSolidRegionSilently(mesh: THREE.Mesh, faceIndex: number): boolean {
    const regionKey = buildFacePickRegionKey(mesh, faceIndex);
    if (this.selectedRegionKeys.has(regionKey)) {
      return false;
    }
    this.selectedRegionKeys.add(regionKey);
    this.selectedFaces.push({ mesh, faceIndex, regionKey });
    return true;
  }

  /**
   * Adds ordinary coplanar (or single) triangles when missing.
   *
   * @param mesh Ordinary mesh.
   * @param faceIndex Seed triangle.
   * @param expandFace Whether to expand to coplanar triangles.
   * @returns True when any triangle was newly added.
   */
  private appendOrdinaryFaceSilently(mesh: THREE.Mesh, faceIndex: number, expandFace: boolean): boolean {
    const faceIndices = expandFace ? expandFaceSelectionIndices(mesh, faceIndex) : [faceIndex];
    let changed = false;
    for (const index of faceIndices) {
      const regionKey = buildFacePickRegionKey(mesh, index);
      if (this.selectedRegionKeys.has(regionKey)) {
        continue;
      }
      this.selectedRegionKeys.add(regionKey);
      this.selectedFaces.push({ mesh, faceIndex: index, regionKey });
      changed = true;
    }
    return changed;
  }

  /**
   * Returns the array of currently selected faces (region seeds for solids).
   *
   * @returns The array of face selection entries.
   */
  getSelectedFaces(): FaceSelection[] {
    return this.selectedFaces;
  }

  /**
   * Returns the count of currently selected faces (regions for solid results).
   *
   * @returns The number of selected face units.
   */
  getSelectedFaceCount(): number {
    return this.selectedFaces.length;
  }

  /**
   * Checks whether a triangle belongs to the current selection (including other
   * triangles of the same solid brush face).
   *
   * @param mesh The mesh to check.
   * @param faceIndex The face index to check.
   * @returns True if the face unit is selected.
   */
  isFaceSelected(mesh: THREE.Mesh, faceIndex: number): boolean {
    return this.selectedRegionKeys.has(buildFacePickRegionKey(mesh, faceIndex));
  }

  /**
   * Computes the average normal vector across all selected face seeds.
   *
   * @returns The average normal direction as a Vector3.
   */
  computeAverageNormal(): THREE.Vector3 {
    const normalAccumulator = new THREE.Vector3();
    this.selectedFaces.forEach((entry) => {
      normalAccumulator.add(computeTriangleNormal(entry.mesh.geometry, entry.faceIndex));
    });
    if (this.selectedFaces.length > 0) {
      normalAccumulator.divideScalar(this.selectedFaces.length);
    }
    return normalAccumulator.normalize();
  }

  /**
   * Registers a callback to be invoked on face selection changes.
   *
   * @param callback The function to call when selection changes.
   */
  setSelectionChangedCallback(callback: FaceSelectionChangedCallback): void {
    this.changeCallback = callback;
  }

  /** Clears all state and callbacks. */
  clear(): void {
    this.selectedFaces = [];
    this.selectedRegionKeys.clear();
    this.changeCallback = null;
  }

  /**
   * Adds one solid brush-face region if it is not already selected.
   *
   * @param mesh Solid result mesh.
   * @param faceIndex Seed triangle on that region.
   */
  private selectSolidRegion(mesh: THREE.Mesh, faceIndex: number): void {
    if (this.appendSolidRegionSilently(mesh, faceIndex)) {
      this.notifyChange();
    }
  }

  /**
   * Selects ordinary mesh faces with optional coplanar expansion.
   *
   * @param mesh Non-solid mesh.
   * @param faceIndex Seed triangle.
   * @param expandFace Whether to expand to coplanar triangles.
   */
  private selectOrdinaryFace(mesh: THREE.Mesh, faceIndex: number, expandFace: boolean): void {
    if (this.appendOrdinaryFaceSilently(mesh, faceIndex, expandFace)) {
      this.notifyChange();
    }
  }

  /**
   * Rebinds one selection entry after scene/history mutation, or drops it.
   *
   * @param entry Previous selection entry.
   * @param sceneRoot World root.
   * @returns Surviving entry, or null when invalid.
   */
  private resolveSurvivingSelection(entry: FaceSelection, sceneRoot: THREE.Object3D): FaceSelection | null {
    if (!this.isMeshUnderRoot(entry.mesh, sceneRoot)) return null;
    const regionKey = entry.regionKey ?? buildFacePickRegionKey(entry.mesh, entry.faceIndex);
    const solidIdentity = parseSolidRegionKey(regionKey, entry.mesh.uuid);
    if (solidIdentity) {
      return this.resolveSolidSurvivingSelection(entry.mesh, solidIdentity, regionKey);
    }
    return this.resolveOrdinarySurvivingSelection(entry, regionKey);
  }

  /**
   * Rebinds a solid brush-face selection when that surface still exists.
   *
   * @param mesh Solid result mesh.
   * @param identity Brush face identity from the stored region key.
   * @param regionKey Original region key.
   * @returns Updated seed, or null when the brush surface is gone.
   */
  private resolveSolidSurvivingSelection(
    mesh: THREE.Mesh,
    identity: { brushId: string; surfaceIndex: number },
    regionKey: string,
  ): FaceSelection | null {
    const seed = findFirstTriangleForBrushSurface(mesh, identity.brushId, identity.surfaceIndex);
    if (seed < 0) return null;
    return { mesh, faceIndex: seed, regionKey };
  }

  /**
   * Keeps an ordinary triangle selection when the index is still in range.
   *
   * @param entry Previous entry.
   * @param regionKey Region key to preserve.
   * @returns Entry when valid, otherwise null.
   */
  private resolveOrdinarySurvivingSelection(entry: FaceSelection, regionKey: string): FaceSelection | null {
    const triangleCount = countTriangles(entry.mesh.geometry);
    if (entry.faceIndex < 0 || entry.faceIndex >= triangleCount) return null;
    return { mesh: entry.mesh, faceIndex: entry.faceIndex, regionKey };
  }

  /**
   * Returns whether the selection list identity changed.
   *
   * @param previous Prior faces.
   * @param next New faces.
   * @returns True when length, mesh, index, or region key differs.
   */
  private didSelectionChange(previous: FaceSelection[], next: FaceSelection[]): boolean {
    if (previous.length !== next.length) return true;
    for (let index = 0; index < previous.length; index++) {
      const before = previous[index]!;
      const after = next[index]!;
      if (before.mesh !== after.mesh) return true;
      if (before.faceIndex !== after.faceIndex) return true;
      if ((before.regionKey ?? '') !== (after.regionKey ?? '')) return true;
    }
    return false;
  }

  /**
   * Returns whether a mesh is still parented under the world root.
   *
   * @param mesh Candidate mesh.
   * @param root Scene root.
   * @returns True when mesh is root or a descendant.
   */
  private isMeshUnderRoot(mesh: THREE.Object3D, root: THREE.Object3D): boolean {
    let current: THREE.Object3D | null = mesh;
    while (current) {
      if (current === root) return true;
      current = current.parent;
    }
    return false;
  }

  /**
   * Returns whether the mesh carries solid triangle sources (CSG result).
   *
   * @param mesh Candidate mesh.
   * @returns True when solid region selection applies.
   */
  private isSolidResultMesh(mesh: THREE.Mesh): boolean {
    return findSameSolidBrushSurfaceIndices(mesh, 0) !== null;
  }

  /** Notifies the registered callback of a selection change. */
  private notifyChange(): void {
    if (this.changeCallback) {
      this.changeCallback(this.selectedFaces);
    }
  }
}
