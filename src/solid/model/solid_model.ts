import * as THREE from 'three';
import { SolidBrushInstance } from './solid_brush_instance.js';
import { SolidBrushFactory } from '../brush/solid_brush_factory.js';
import { SolidCsgCompiler } from '../algorithm/solid_csg_compiler.js';
import { SurfaceTriangulator } from '../algorithm/surface_triangulator.js';
import { SolidOperation } from '../types/solid_operation.js';
import { SolidBrushVisual } from './solid_brush_visual.js';
import { createContentMaterial } from '../../materials/content_material_factory.js';
import {
  DECORATIVE_EDGE_USERDATA_KEY,
  rebuildDecorativeEdges
} from '../../utils/mesh_edge_sync.js';
import { DEFAULT_CHECKER_TEXTURE_ID } from '../../texture/texture_id.js';
import { Theme } from '../../theme.js';
import {
  FaceTextureMapping,
  createDefaultFaceTextureMapping
} from '../../texture/face_texture_mapping.js';
import {
  getFaceTextureMaps,
  setFaceTextureMaps
} from '../../texture/face_texture_storage.js';
import { rebakeStoredFaceTextureMaps } from '../../texture/planar_uv_projector.js';
import { rebuildSurfaceMaterials } from '../../texture/surface_material_builder.js';

/**
 * UserData key marking the solid model root group.
 */
export const SOLID_MODEL_USERDATA_KEY = 'isSolidModel';

/**
 * UserData key marking the compiled CSG result mesh under a solid model.
 */
export const SOLID_MODEL_RESULT_USERDATA_KEY = 'isSolidModelResult';

/**
 * UserData key storing per-triangle brush surface sources on the result mesh.
 */
export const SOLID_TRIANGLE_SOURCES_USERDATA_KEY = 'solidTriangleSources';

/**
 * Registry of solid model roots (groups) to controller instances.
 * Kept off userData so Object3D.clone() remains safe.
 */
const solidModelRegistry = new WeakMap<THREE.Object3D, SolidModel>();

/**
 * A hierarchical solid model: group root, selectable brush children, and a
 * textured compiled result mesh rebuilt via Sander-style solid CSG.
 */
export class SolidModel {
  readonly root: THREE.Group;
  private brushes: SolidBrushInstance[];
  private resultMesh: THREE.Mesh;
  private brushCounter: number;
  private readonly compiler: SolidCsgCompiler;
  private dirty: boolean;
  private lastSurfaceRegions: Array<{
    triangleIndices: number[];
    textureId: string;
  }>;
  private static modelCounter = 0;

  /**
   * Creates a solid model group ready for the scene hierarchy.
   * @param name Optional display name.
   */
  constructor(name?: string) {
    SolidModel.modelCounter += 1;
    this.root = new THREE.Group();
    this.root.name = name ?? `SolidModel${this.padNumber(SolidModel.modelCounter)}`;
    this.root.userData[SOLID_MODEL_USERDATA_KEY] = true;
    solidModelRegistry.set(this.root, this);
    this.resultMesh = this.createResultMesh();
    this.root.add(this.resultMesh);
    this.brushes = [];
    this.brushCounter = 0;
    this.compiler = new SolidCsgCompiler();
    this.dirty = true;
    this.lastSurfaceRegions = [];
  }

  /**
   * Back-compat alias used by older call sites that referred to mesh.
   * @returns Compiled result mesh.
   */
  get mesh(): THREE.Mesh {
    return this.resultMesh;
  }

  /**
   * Returns whether an object is a solid model root or belongs to one.
   * @param object Candidate scene object.
   * @returns True for solid model roots.
   */
  static isSolidModelObject(object: THREE.Object3D): boolean {
    return object.userData[SOLID_MODEL_USERDATA_KEY] === true;
  }

  /**
   * Returns whether an object is the compiled result mesh of a solid model.
   * @param object Candidate object.
   * @returns True for result meshes.
   */
  static isResultMesh(object: THREE.Object3D): boolean {
    return object.userData[SOLID_MODEL_RESULT_USERDATA_KEY] === true;
  }

  /**
   * Resolves the SolidModel for a root, brush, or result object.
   * @param object Candidate object.
   * @returns SolidModel or null.
   */
  static fromObject(object: THREE.Object3D): SolidModel | null {
    const direct = solidModelRegistry.get(object);
    if (direct) return direct;
    let current: THREE.Object3D | null = object;
    while (current) {
      const model = solidModelRegistry.get(current);
      if (model) return model;
      current = current.parent;
    }
    return null;
  }

  /**
   * Resyncs brush order from the scene graph and rebuilds every solid under a root.
   * Call after outliner reparent and undo/redo so CSG order always matches the outliner.
   * @param root Scene or world root to scan.
   */
  static rebuildAllUnder(root: THREE.Object3D): void {
    const models = new Set<SolidModel>();
    root.traverse((object) => {
      if (!SolidModel.isSolidModelObject(object)) return;
      const model = solidModelRegistry.get(object);
      if (model) models.add(model);
    });
    for (const model of models) {
      model.syncBrushOrderFromScene();
      model.markDirty();
      model.rebuild(true);
    }
  }

  /**
   * Returns brush instances in tree order.
   * @returns Brush list copy.
   */
  getBrushes(): SolidBrushInstance[] {
    return this.brushes.slice();
  }

  /**
   * Returns the number of brushes.
   * @returns Brush count.
   */
  getBrushCount(): number {
    return this.brushes.length;
  }

  /**
   * Finds a brush by id.
   * @param id Brush id.
   * @returns Brush or undefined.
   */
  findBrush(id: string): SolidBrushInstance | undefined {
    return this.brushes.find((brush) => brush.id === id);
  }

  /**
   * Finds a brush by its scene mesh.
   * @param mesh Candidate mesh.
   * @returns Brush or undefined.
   */
  findBrushByMesh(mesh: THREE.Object3D): SolidBrushInstance | undefined {
    return this.brushes.find((brush) => brush.mesh === mesh);
  }

  /**
   * Returns the compiled result mesh.
   * @returns Result mesh.
   */
  getResultMesh(): THREE.Mesh {
    return this.resultMesh;
  }

  /**
   * Adds a centered box brush as a selectable child mesh and rebuilds.
   * @param size Cube edge length.
   * @param operation CSG operation.
   * @returns Created brush instance.
   */
  addBoxBrush(
    size: number = 2,
    operation: SolidOperation = SolidOperation.Additive
  ): SolidBrushInstance {
    this.brushCounter += 1;
    const name = `Brush${this.padNumber(this.brushCounter)}`;
    const brush = SolidBrushFactory.createCenteredBox(size, size, size);
    const instance = new SolidBrushInstance(
      this.allocateBrushId(),
      name,
      brush,
      operation
    );
    const preview = SolidBrushVisual.createBoxPreview(name, size, operation);
    instance.attachMesh(preview);
    this.root.add(preview);
    this.brushes.push(instance);
    this.markDirty();
    this.rebuild();
    return instance;
  }

  /**
   * Adds a prebuilt brush instance, creating a preview mesh when missing.
   * @param instance Brush instance to own.
   * @param previewSize Size used when creating a default box preview.
   */
  addBrushInstance(instance: SolidBrushInstance, previewSize: number = 2): void {
    this.registerBrushAt(instance, this.brushes.length, previewSize);
    this.markDirty();
    this.rebuild();
  }

  /**
   * Inserts a brush at a list index and restores sibling order for CSG.
   * @param instance Brush instance to own.
   * @param listIndex Index in the brush evaluation list.
   * @param previewSize Size used when creating a default box preview.
   */
  insertBrushInstance(
    instance: SolidBrushInstance,
    listIndex: number,
    previewSize: number = 2
  ): void {
    this.registerBrushAt(instance, listIndex, previewSize);
    this.markDirty();
    this.rebuild(true);
  }

  /**
   * Removes a brush and its preview mesh, then rebuilds.
   * @param id Brush id.
   * @param disposeResources When true, disposes preview GPU resources (default true).
   * @returns True when removed.
   */
  removeBrush(id: string, disposeResources: boolean = true): boolean {
    const index = this.brushes.findIndex((brush) => brush.id === id);
    if (index < 0) return false;
    const brush = this.brushes[index];
    if (brush.mesh) {
      this.root.remove(brush.mesh);
      if (disposeResources) {
        this.disposeMeshResources(brush.mesh);
      }
    }
    this.brushes.splice(index, 1);
    this.markDirty();
    this.rebuild(true);
    return true;
  }

  /**
   * Disposes GPU resources for a brush preview mesh (history drop / permanent delete).
   * @param mesh Brush preview mesh.
   */
  disposeBrushMeshResources(mesh: THREE.Mesh): void {
    this.disposeMeshResources(mesh);
  }

  /**
   * Updates a brush operation, restyles its preview, and rebuilds.
   * @param id Brush id.
   * @param operation New operation.
   * @returns True when found.
   */
  setBrushOperation(id: string, operation: SolidOperation): boolean {
    const brush = this.findBrush(id);
    if (!brush) return false;
    brush.operation = operation;
    if (brush.mesh) {
      SolidBrushVisual.applyOperationStyle(brush.mesh, operation);
    }
    this.markDirty();
    this.rebuild();
    return true;
  }

  /**
   * Updates brush transform data and the preview mesh, then rebuilds.
   * @param id Brush id.
   * @param position Optional position.
   * @param rotation Optional rotation.
   * @param scale Optional scale.
   * @returns True when found.
   */
  setBrushTransform(
    id: string,
    position?: THREE.Vector3,
    rotation?: THREE.Euler,
    scale?: THREE.Vector3
  ): boolean {
    const brush = this.findBrush(id);
    if (!brush) return false;
    if (position) brush.position.copy(position);
    if (rotation) brush.rotation.copy(rotation);
    if (scale) brush.scale.copy(scale);
    brush.pushTransformToMesh();
    this.markDirty();
    this.rebuild();
    return true;
  }

  /**
   * Renames a brush and its preview mesh.
   * @param id Brush id.
   * @param name New name.
   * @returns True when found.
   */
  renameBrush(id: string, name: string): boolean {
    const brush = this.findBrush(id);
    if (!brush) return false;
    brush.name = name;
    if (brush.mesh) brush.mesh.name = name;
    return true;
  }

  /**
   * Duplicates a brush inside this solid model with an optional local offset.
   * @param id Source brush id.
   * @param offset Optional position offset applied after cloning.
   * @returns The new brush instance, or null when the source is missing.
   */
  duplicateBrush(
    id: string,
    offset: THREE.Vector3 = new THREE.Vector3(1, 0, 0)
  ): SolidBrushInstance | null {
    const source = this.findBrush(id);
    if (!source) return null;
    source.pullTransformFromMesh();
    this.brushCounter += 1;
    const name = `${source.name}_copy`;
    const clone = source.cloneWithId(this.allocateBrushId(), name);
    clone.position.add(offset);
    const previewSize = this.estimateBrushPreviewSize(source);
    const preview = SolidBrushVisual.createBoxPreview(
      name,
      previewSize,
      clone.operation
    );
    clone.attachMesh(preview);
    this.root.add(preview);
    this.brushes.push(clone);
    this.markDirty();
    this.rebuild();
    return clone;
  }

  /**
   * Estimates a box preview edge length from brush local bounds.
   * @param source Brush to measure.
   * @returns Preview cube size.
   */
  private estimateBrushPreviewSize(source: SolidBrushInstance): number {
    const bounds = source.brush.computeLocalBounds();
    const size = new THREE.Vector3();
    bounds.getSize(size);
    const maxAxis = Math.max(size.x, size.y, size.z);
    return maxAxis > 1e-6 ? maxAxis : 2;
  }

  /**
   * Pulls transforms from all brush meshes (e.g. after gizmo edits).
   */
  syncBrushesFromScene(): void {
    this.syncBrushOrderFromScene();
    for (const brush of this.brushes) {
      brush.pullTransformFromMesh();
    }
    this.markDirty();
  }

  /**
   * Reorders the internal brush list to match outliner / scene-graph sibling order.
   * CSG tree order follows this list (first = earliest in boolean evaluation).
   */
  syncBrushOrderFromScene(): void {
    const ordered: SolidBrushInstance[] = [];
    const remaining = new Map(
      this.brushes.map((brush) => [brush.id, brush] as const)
    );
    for (const child of this.root.children) {
      if (!SolidBrushVisual.isBrushObject(child)) continue;
      const brush = this.findBrushByMesh(child);
      if (!brush) continue;
      ordered.push(brush);
      remaining.delete(brush.id);
    }
    remaining.forEach((brush) => ordered.push(brush));
    this.brushes = ordered;
  }

  /**
   * Marks the model dirty so the next rebuild regenerates the result mesh.
   */
  markDirty(): void {
    this.dirty = true;
  }

  /**
   * Rebuilds the compiled result mesh from current brush transforms.
   * @param force Rebuild even when not marked dirty.
   */
  rebuild(force: boolean = false): void {
    if (!this.dirty && !force) return;
    this.compileResultGeometry();
    if (this.hasResultGeometry()) {
      this.applyBrushTexturesToResult();
      rebuildDecorativeEdges(this.resultMesh, Theme.boxEdgeColor);
    }
    this.resetResultLocalTransform();
    this.dirty = false;
  }

  /**
   * Live rebuild during interactive drag: full CSG + UVs/materials, skip edges.
   * Keeps the solid visible and textured while brushes move (Sander-style).
   */
  rebuildLive(): void {
    this.compileResultGeometry();
    if (this.hasResultGeometry()) {
      this.applyBrushTexturesToResult();
    }
    this.resetResultLocalTransform();
    this.dirty = true;
  }

  /**
   * Sets the default surface texture for a whole brush and rebuilds.
   * @param brushId Brush id.
   * @param textureId Texture identity to apply to all faces of that brush.
   * @returns True when the brush was found.
   */
  setBrushSurfaceTexture(brushId: string, textureId: string): boolean {
    const brush = this.findBrush(brushId);
    if (!brush) return false;
    brush.setAllFacesTextureId(textureId);
    this.markDirty();
    this.rebuild(true);
    return true;
  }

  /**
   * Sets one brush face texture (face-mode paint on brush or result) and rebuilds.
   * @param brushId Brush id.
   * @param surfaceIndex Brush face index.
   * @param textureId Texture identity.
   * @returns True when the brush was found.
   */
  setBrushFaceTexture(
    brushId: string,
    surfaceIndex: number,
    textureId: string
  ): boolean {
    const brush = this.findBrush(brushId);
    if (!brush) return false;
    brush.setFaceTextureId(surfaceIndex, textureId);
    this.markDirty();
    this.rebuild(true);
    return true;
  }

  /**
   * Returns the result mesh for clone geometry propagation after live rebuild.
   * @returns Result mesh.
   */
  getResultMeshForSync(): THREE.Mesh {
    return this.resultMesh;
  }

  /**
   * Pulls brush transforms, runs CSG, and replaces result buffers.
   */
  private compileResultGeometry(): void {
    this.syncBrushOrderFromScene();
    for (const brush of this.brushes) {
      brush.pullTransformFromMesh();
    }
    const polygons = this.compiler.compile(this.brushes);
    const arrays = SurfaceTriangulator.buildMeshArrays(polygons);
    this.lastSurfaceRegions = arrays.surfaceRegions;
    this.replaceResultGeometry(arrays.positions, arrays.normals);
    this.resultMesh.userData[SOLID_TRIANGLE_SOURCES_USERDATA_KEY] =
      arrays.triangleSources;
  }

  /**
   * Writes per-face textures and UV params from originating brushes onto the result.
   * One coplanar CSG polygon = one UV region (never merges whole-cube sides).
   */
  private applyBrushTexturesToResult(): void {
    const maps = this.lastSurfaceRegions.map((region) => ({
      triangleIndices: region.triangleIndices.slice(),
      mapping: this.resolveRegionMapping(region)
    }));
    setFaceTextureMaps(this.resultMesh, maps);
    rebakeStoredFaceTextureMaps(this.resultMesh);
    rebuildSurfaceMaterials(this.resultMesh);
  }

  /**
   * Resolves the authored face mapping for one compiled surface region.
   * @param region Surface region with brush source identity.
   * @returns Mapping to bake onto the result mesh.
   */
  private resolveRegionMapping(region: {
    textureId: string;
    brushId: string;
    surfaceIndex: number;
  }): FaceTextureMapping {
    const brush = this.findBrush(region.brushId);
    if (brush) return brush.getSurfaceMapping(region.surfaceIndex);
    return createDefaultFaceTextureMapping(
      region.textureId || DEFAULT_CHECKER_TEXTURE_ID
    );
  }

  /**
   * Writes UV editor changes on the result mesh back onto owning brush faces.
   * Call after face-texture apply so rebuild and JSON save keep authored UVs.
   */
  syncAuthoredMappingsFromResultMesh(): void {
    const maps = getFaceTextureMaps(this.resultMesh);
    const sources =
      (this.resultMesh.userData[SOLID_TRIANGLE_SOURCES_USERDATA_KEY] as
        | Array<{ brushId: string; surfaceIndex: number }>
        | undefined) ?? [];
    for (const entry of maps) {
      this.writeMapEntryToBrushFaces(entry.triangleIndices, entry.mapping, sources);
    }
  }

  /**
   * Applies one result-mesh mapping to the brush faces that own its triangles.
   * @param triangleIndices Result triangle indices for the region.
   * @param mapping Authored mapping from the UV editor or texture tools.
   * @param sources Per-triangle brush surface sources.
   */
  private writeMapEntryToBrushFaces(
    triangleIndices: number[],
    mapping: FaceTextureMapping,
    sources: Array<{ brushId: string; surfaceIndex: number }>
  ): void {
    const written = new Set<string>();
    for (const triangleIndex of triangleIndices) {
      const source = sources[triangleIndex];
      if (!source?.brushId) continue;
      const key = `${source.brushId}:${source.surfaceIndex}`;
      if (written.has(key)) continue;
      written.add(key);
      const brush = this.findBrush(source.brushId);
      if (!brush) continue;
      brush.setFaceMapping(source.surfaceIndex, mapping);
    }
  }

  /**
   * Returns whether the result mesh has triangle geometry.
   * @returns True when a position attribute with vertices exists.
   */
  private hasResultGeometry(): boolean {
    const position = this.resultMesh.geometry.getAttribute('position');
    return !!position && position.count >= 3;
  }

  /**
   * Keeps the compiled mesh at local identity under the solid model root.
   */
  private resetResultLocalTransform(): void {
    this.resultMesh.position.set(0, 0, 0);
    this.resultMesh.rotation.set(0, 0, 0);
    this.resultMesh.scale.set(1, 1, 1);
  }

  /**
   * Creates the empty result mesh that receives compiled solid geometry.
   * @returns Result mesh child.
   */
  private createResultMesh(): THREE.Mesh {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(0), 3));
    const material = createContentMaterial(Theme.boxColor);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'Result';
    mesh.userData[SOLID_MODEL_RESULT_USERDATA_KEY] = true;
    return mesh;
  }

  /**
   * Replaces result buffer attributes with compiled triangle data.
   * @param positions Position floats.
   * @param normals Normal floats.
   */
  private replaceResultGeometry(
    positions: Float32Array,
    normals: Float32Array
  ): void {
    const oldGeometry = this.resultMesh.geometry;
    const geometry = new THREE.BufferGeometry();
    const safePositions =
      positions.length >= 9 ? positions : new Float32Array(0);
    const safeNormals =
      normals.length === safePositions.length
        ? normals
        : new Float32Array(safePositions.length);
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(safePositions, 3)
    );
    geometry.setAttribute('normal', new THREE.BufferAttribute(safeNormals, 3));
    if (safePositions.length > 0) {
      geometry.computeBoundingSphere();
      geometry.computeBoundingBox();
    }
    this.resultMesh.geometry = geometry;
    oldGeometry.dispose();
    this.stripStaleDecorativeEdges(this.resultMesh);
  }

  /**
   * Removes decorative edge children from a mesh.
   * @param mesh Mesh to clean.
   */
  private stripStaleDecorativeEdges(mesh: THREE.Mesh): void {
    const stale = mesh.children.filter(
      (child) => child.userData[DECORATIVE_EDGE_USERDATA_KEY] === true
    );
    for (const child of stale) {
      mesh.remove(child);
      if (child instanceof THREE.LineSegments) {
        child.geometry.dispose();
        if (child.material instanceof THREE.Material) child.material.dispose();
      }
    }
  }

  /**
   * Disposes geometry and materials for a removed brush mesh.
   * @param mesh Brush preview mesh.
   */
  private disposeMeshResources(mesh: THREE.Mesh): void {
    mesh.traverse((child) => {
      if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) {
        child.geometry?.dispose();
        const material = child.material;
        if (Array.isArray(material)) {
          material.forEach((entry) => entry.dispose());
        } else if (material) {
          material.dispose();
        }
      }
    });
  }

  /**
   * Registers a brush at a list index, ensuring preview mesh and sibling order.
   * @param instance Brush instance to own.
   * @param listIndex Desired index in the evaluation list.
   * @param previewSize Default box preview edge length when mesh is missing.
   */
  private registerBrushAt(
    instance: SolidBrushInstance,
    listIndex: number,
    previewSize: number
  ): void {
    if (this.findBrush(instance.id)) return;
    this.ensureBrushPreviewMesh(instance, previewSize);
    const clampedIndex = Math.max(0, Math.min(listIndex, this.brushes.length));
    this.brushes.splice(clampedIndex, 0, instance);
    this.applyBrushMeshSiblingOrder();
  }

  /**
   * Creates and attaches a box preview when the instance has no mesh.
   * @param instance Brush instance.
   * @param previewSize Box edge length.
   */
  private ensureBrushPreviewMesh(
    instance: SolidBrushInstance,
    previewSize: number
  ): void {
    if (instance.mesh) {
      instance.pushTransformToMesh();
      return;
    }
    const measuredSize = this.estimateBrushPreviewSize(instance);
    const size = measuredSize > 1e-6 ? measuredSize : previewSize;
    const preview = SolidBrushVisual.createBoxPreview(
      instance.name,
      size,
      instance.operation
    );
    instance.attachMesh(preview);
  }

  /**
   * Reorders brush preview meshes under the root to match evaluation list order.
   */
  private applyBrushMeshSiblingOrder(): void {
    for (const brush of this.brushes) {
      if (!brush.mesh) continue;
      this.root.add(brush.mesh);
    }
  }

  /**
   * Allocates a unique brush id.
   * @returns Unique string id.
   */
  private allocateBrushId(): string {
    return `${this.root.uuid}-brush-${this.brushCounter}-${Math.random().toString(36).slice(2, 8)}`;
  }

  /**
   * Pads a number to two digits.
   * @param value Number to pad.
   * @returns Zero-padded string.
   */
  private padNumber(value: number): string {
    return value < 10 ? `0${value}` : String(value);
  }
}
