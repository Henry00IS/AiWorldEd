import * as THREE from 'three';
import { SolidModelRegistry } from '@/solid/model/solid_model_registry.js';
import type { SolidModel } from '@/solid/model/solid_model.js';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { SOLID_TRIANGLE_SOURCES_USERDATA_KEY } from '@/solid/model/solid_model_keys.js';
import { isContentViewLitMaterial } from '@/materials/factory_content_view_lit_material.js';
import { PaintAtlas, type PaintBakeFace } from '@/paint/bake/paint_atlas.js';
import { PAINT_DAB_STRIDE, type PaintStroke, paintStrokeCompare } from '@/paint/stroke/paint_stroke.js';
import type { PaintImageSource } from '@/paint/raster/paint_image.js';
import type { PaintTileLayer } from '@/paint/raster/paint_tile_raster.js';
import {
  type PaintOverlayBrush,
  type PaintOverlaySource,
  paintOverlayBuild,
  paintOverlayFacingSigns,
} from '@/paint/overlay/paint_overlay_geometry.js';
import { paintOverlayMaterialCreate } from '@/paint/overlay/paint_overlay_material.js';
import { paintBrushKey, paintWorldToBrush } from './paint_brush_key.js';
import { type PaintCopyTarget, paintCopyTargets } from './paint_copy_targets.js';
import type { PaintStrokeLayer } from '@/paint/stroke/paint_stroke_layer.js';

/** Frames between retries of brushes that wait for an image. */
const PAINT_PENDING_RETRY_FRAMES = 30;
/** Frames between checks whether the atlas can drop a page. */
const PAINT_COMPACT_FRAMES = 120;
/** Render order of the multiply pass; the add pass draws right after it. */
const PAINT_OVERLAY_RENDER_ORDER = 10;

/** Layers a brush face receives on top of its paint (decal volumes). */
export interface PaintLayerProvider {
  /** Called once per frame before any brush asks for layers. */
  prepare?(): void;
  /**
   * Returns the layers that reach a brush, with a signature that changes
   * whenever they change.
   *
   * @param model Owning model.
   * @param brush Brush.
   * @param brushToWorld Where the brush's local space is in the world; omitted
   *   for the authored brush itself, given for a modifier copy of it.
   * @returns Layers per face index, their brush-local reach, and a signature.
   */
  layersFor(
    model: SolidModel,
    brush: SolidBrushInstance,
    brushToWorld?: THREE.Matrix4,
  ): { signature: string; layers: (faceIndex: number) => readonly PaintTileLayer[]; bounds: readonly THREE.Box3[] };
}

/**
 * Whether modifier copies show the paint of their authored brush. Copies always
 * receive the decal layers that reach them where they stand.
 */
export const PAINT_COPIES_SHARE_STROKES = true;

/** What has been baked for one brush. */
interface PaintBrushBaked {
  strokes: Map<string, PaintStroke>;
  facesSignature: string;
  layersSignature: string;
  pending: boolean;
}

/** Overlay of one solid model. */
interface PaintModelOverlay {
  readonly group: THREE.Group;
  readonly multiply: THREE.Mesh;
  readonly add: THREE.Mesh;
  signature: string;
}

/**
 * Keeps painted brushes baked into the atlas and draws them on top of their
 * solid results. Runs once per frame before rendering; everything it creates
 * lives outside the world so it is never saved, synced or picked.
 */
export class PaintSceneSystem {
  /** Atlas holding every painted tile. */
  readonly atlas: PaintAtlas;
  private readonly root = new THREE.Group();
  private readonly baked = new Map<string, PaintBrushBaked>();
  private readonly overlays = new Map<SolidModel, PaintModelOverlay>();
  private readonly previews = new Map<string, readonly PaintStroke[]>();
  private readonly facingSigns = new WeakMap<
    SolidModel,
    { key: unknown; version: number; brushIds: string; signs: Map<string, number> }
  >();
  /**
   * Atlas key each copy draws from: its own, or its authored brush's when
   * shared.
   */
  private readonly copyAtlasKeys = new Map<string, string>();
  private readonly pageMaterials: { multiply: THREE.ShaderMaterial; add: THREE.ShaderMaterial }[] = [];
  private layerProvider: PaintLayerProvider | null = null;
  private frame = 0;
  private enabled = true;

  /**
   * @param scene Scene the overlays are drawn in.
   * @param worldObject Returns the current world root.
   * @param images Image source for stencils, stamps and decals.
   */
  constructor(
    scene: THREE.Scene,
    private readonly worldObject: () => THREE.Object3D | null,
    images: PaintImageSource,
  ) {
    this.atlas = new PaintAtlas(images);
    this.root.name = 'paint_overlays';
    this.root.matrixAutoUpdate = false;
    scene.add(this.root);
  }

  /**
   * Sets who supplies decal layers.
   *
   * @param provider Provider, or null for none.
   */
  setLayerProvider(provider: PaintLayerProvider | null): void {
    this.layerProvider = provider;
  }

  /**
   * Shows or hides every overlay.
   *
   * @param enabled True to draw paint.
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Shows strokes that are still being drawn on a brush, or removes them.
   *
   * @param model Owning model.
   * @param brush Brush.
   * @param strokes Strokes in progress; empty removes the preview.
   */
  previewSet(model: SolidModel, brush: SolidBrushInstance, strokes: readonly PaintStroke[]): void {
    const key = paintBrushKey(model, brush);
    if (strokes.length === 0) this.previews.delete(key);
    else this.previews.set(key, strokes);
  }

  /** Drops every preview stroke. */
  previewClear(): void {
    this.previews.clear();
  }

  /**
   * Reads the shown paint at a world point of a brush face as blend factors, so
   * the color there is base × A + B.
   *
   * @param model Owning model.
   * @param brush Brush.
   * @param faceIndex Face index.
   * @param worldPoint World point on the face.
   * @param out Receives A rgb then B rgb.
   * @param copy Array or mirror copy of the brush the point is on, if any.
   * @returns True when the face has paint there.
   */
  sampleAt(
    model: SolidModel,
    brush: SolidBrushInstance,
    faceIndex: number,
    worldPoint: THREE.Vector3,
    out: Float32Array,
    copy: PaintCopyTarget | null = null,
  ): boolean {
    if (copy !== null) {
      const local = worldPoint.clone().applyMatrix4(paintCopyToWorld(model, copy).invert());
      const key = this.copyAtlasKeys.get(paintCopyKey(model, copy)) ?? paintBrushKey(model, brush);
      return this.atlas.sampleAffine(key, faceIndex, local, out);
    }
    const local = worldPoint.clone().applyMatrix4(paintWorldToBrush(model, brush, new THREE.Matrix4()));
    return this.atlas.sampleAffine(paintBrushKey(model, brush), faceIndex, local, out);
  }

  /** Brings atlas and overlays up to date; call once per frame before rendering. */
  update(): void {
    this.frame++;
    const world = this.worldObject();
    const models = world === null ? new Set<SolidModel>() : SolidModelRegistry.collectUnder(world);
    this.layerProvider?.prepare?.();
    this.copyAtlasKeys.clear();
    const seen = new Set<string>();
    for (const model of models) this.updateModelBakes(model, seen);
    for (const key of [...this.baked.keys()]) {
      if (seen.has(key)) continue;
      this.atlas.releaseBrush(key);
      this.baked.delete(key);
    }
    if (this.frame % PAINT_COMPACT_FRAMES === 0 && this.previews.size === 0) this.atlas.compactIfUseful();
    this.syncPageMaterials();
    for (const model of models) this.updateModelOverlay(model);
    for (const [model, overlay] of [...this.overlays]) {
      if (models.has(model)) continue;
      this.overlayDispose(overlay);
      this.overlays.delete(model);
    }
    this.atlas.flush();
  }

  /** Removes overlays and frees the atlas. */
  dispose(): void {
    this.overlays.forEach((overlay) => this.overlayDispose(overlay));
    this.overlays.clear();
    this.pageMaterials.forEach((pair) => {
      pair.multiply.dispose();
      pair.add.dispose();
    });
    this.pageMaterials.length = 0;
    this.atlas.dispose();
    this.root.removeFromParent();
  }

  /**
   * Bakes every brush of a model whose paint, shape or layers changed.
   *
   * @param model Model.
   * @param seen Receives the keys of brushes that keep tiles.
   */
  private updateModelBakes(model: SolidModel, seen: Set<string>): void {
    const brushes = model.getBrushes().map((brush) => {
      const key = paintBrushKey(model, brush);
      const layers = this.layerProvider?.layersFor(model, brush) ?? null;
      return { brush, key, preview: this.previews.get(key), layers };
    });
    const layered = new Set(
      brushes.filter((entry) => (entry.layers?.bounds.length ?? 0) > 0).map((entry) => entry.brush),
    );
    // A copy draws from its authored brush's tiles unless decals reach it or its
    // authored brush; then it bakes its own tiles with the same strokes.
    const own: {
      copy: PaintCopyTarget;
      key: string;
      preview: readonly PaintStroke[] | undefined;
      layers: ReturnType<PaintLayerProvider['layersFor']> | null;
    }[] = [];
    for (const copy of this.modelCopies(model)) {
      const key = paintCopyKey(model, copy);
      const layers = this.layerProvider?.layersFor(model, copy.source, paintCopyToWorld(model, copy)) ?? null;
      const preview = this.previews.get(paintBrushKey(model, copy.source));
      const hasLayers = (layers?.bounds.length ?? 0) > 0;
      if (!hasLayers && !layered.has(copy.source)) {
        this.copyAtlasKeys.set(key, paintBrushKey(model, copy.source));
        continue;
      }
      this.copyAtlasKeys.set(key, key);
      own.push({ copy, key, preview, layers });
    }
    const signs = this.modelFacingSigns(
      model,
      own.map((entry) => entry.copy),
    );
    for (const { brush, key, preview, layers } of brushes) {
      const hasLayers = layers !== null && layers.bounds.length > 0;
      if (brush.paint.isEmpty() && preview === undefined && !hasLayers && !this.baked.has(key)) continue;
      seen.add(key);
      this.bakeBrush(key, brush.id, brush, brush.paint, preview, signs, layers);
    }
    for (const { copy, key, preview, layers } of own) {
      seen.add(key);
      this.bakeBrush(key, copy.id, copy.source, copy.source.paint, preview, signs, layers);
    }
  }

  /**
   * Returns the modifier copies of a model that can show paint.
   *
   * @param model Model.
   * @returns Copies.
   */
  private modelCopies(model: SolidModel): PaintCopyTarget[] {
    return paintCopyTargets(model);
  }

  /**
   * Bakes one brush incrementally: a change of shape or layers rebakes it
   * whole, otherwise only tiles reached by added or removed strokes change.
   *
   * @param key Atlas key.
   * @param id Id the result's triangle sources use: the brush id, or the copy
   *   id.
   * @param brush Brush whose faces are baked (the authored brush of a copy).
   * @param paint Strokes to bake, or null for none.
   * @param preview Strokes in progress, if any.
   * @param signs Facing signs keyed `id|face`.
   * @param layers Decal layers, or null.
   */
  private bakeBrush(
    key: string,
    id: string,
    brush: SolidBrushInstance,
    paint: PaintStrokeLayer | null,
    preview: readonly PaintStroke[] | undefined,
    signs: Map<string, number>,
    layers: ReturnType<PaintLayerProvider['layersFor']> | null,
  ): void {
    const strokes = new Map<string, PaintStroke>();
    for (const stroke of paint?.ordered() ?? []) strokes.set(stroke.id, stroke);
    for (const stroke of preview ?? []) {
      if (!strokes.has(stroke.id)) strokes.set(stroke.id, stroke);
    }
    const faces = paintBakeFaces(id, brush, signs, layers);
    const facesSignature = paintFacesSignature(faces);
    const layersSignature = layers?.signature ?? '';
    const previous = this.baked.get(key);
    const ordered = [...strokes.values()].sort(paintStrokeCompare);
    const input = { brushId: key, faces, strokes: ordered };
    const full =
      previous === undefined ||
      previous.facesSignature !== facesSignature ||
      previous.layersSignature !== layersSignature ||
      (previous.pending && this.frame % PAINT_PENDING_RETRY_FRAMES === 0);
    if (full) {
      const result = this.atlas.bakeBrush(input);
      this.baked.set(key, { strokes, facesSignature, layersSignature, pending: result.pending });
      return;
    }
    const focus = paintStrokesChanged(previous.strokes, strokes);
    if (focus.length === 0) return;
    const result = this.atlas.bakeBrush(input, focus);
    this.baked.set(key, { strokes, facesSignature, layersSignature, pending: previous.pending || result.pending });
  }

  /**
   * Returns which way each painted face of a model shows, recomputed when the
   * result changes.
   *
   * @param model Model.
   * @param copies Copies that show paint or layers.
   * @returns Signs keyed `brushId|face`, or `copyId|face` for copies.
   */
  private modelFacingSigns(model: SolidModel, copies: readonly PaintCopyTarget[]): Map<string, number> {
    const result = model.getResultMesh();
    const sourceKey = result.userData[SOLID_TRIANGLE_SOURCES_USERDATA_KEY] as unknown;
    const version = (result.geometry.getAttribute('position') as THREE.BufferAttribute | undefined)?.version ?? -1;
    const painted = model
      .getBrushes()
      .filter(
        (brush) =>
          !brush.paint.isEmpty() ||
          this.previews.has(paintBrushKey(model, brush)) ||
          this.baked.has(paintBrushKey(model, brush)),
      );
    const brushIds = [...painted.map((brush) => brush.id), ...copies.map((copy) => copy.id)].join(',');
    const cached = this.facingSigns.get(model);
    if (
      cached !== undefined &&
      cached.key === sourceKey &&
      cached.version === version &&
      cached.brushIds === brushIds
    ) {
      return cached.signs;
    }
    const matrices = new Map<string, THREE.Matrix4>();
    const planes = new Map<string, SolidBrushInstance>();
    for (const brush of painted) {
      matrices.set(brush.id, paintResultToBrush(result, brush));
      planes.set(brush.id, brush);
    }
    for (const copy of copies) {
      matrices.set(copy.id, paintResultToCopy(result, model, copy));
      planes.set(copy.id, copy.source);
    }
    const signs =
      matrices.size === 0
        ? new Map<string, number>()
        : paintOverlayFacingSigns(
            result.geometry,
            paintSources(result),
            matrices,
            (id, face) => planes.get(id)?.brush.planes[face]?.normal ?? null,
          );
    this.facingSigns.set(model, { key: sourceKey, version, brushIds, signs });
    return signs;
  }

  /**
   * Rebuilds a model's overlay when its result or tiles changed and keeps it on
   * top of the result.
   *
   * @param model Model.
   */
  private updateModelOverlay(model: SolidModel): void {
    const result = model.getResultMesh();
    const brushes = new Map<string, PaintOverlayBrush>();
    let signature = `${result.geometry.uuid}|${(result.geometry.getAttribute('position') as THREE.BufferAttribute | undefined)?.version ?? -1}|${this.pageMaterials.length}`;
    for (const brush of model.getBrushes()) {
      const key = paintBrushKey(model, brush);
      if (!this.atlas.hasBrush(key)) continue;
      const resultToBrush = paintResultToBrush(result, brush);
      brushes.set(brush.id, { resultToBrush, faceTiles: (face) => this.atlas.faceTiles(key, face) });
      signature += `|${key}:${this.atlas.brushVersion(key)}:${resultToBrush.elements.map((value) => value.toFixed(5)).join(',')}`;
    }
    for (const copy of this.modelCopies(model)) {
      const key = this.copyAtlasKeys.get(paintCopyKey(model, copy));
      if (key === undefined || !this.atlas.hasBrush(key)) continue;
      const resultToBrush = paintResultToCopy(result, model, copy);
      brushes.set(copy.id, { resultToBrush, faceTiles: (face) => this.atlas.faceTiles(key, face) });
      signature += `|${key}:${this.atlas.brushVersion(key)}:${resultToBrush.elements.map((value) => value.toFixed(5)).join(',')}`;
    }
    let overlay = this.overlays.get(model);
    if (brushes.size === 0) {
      if (overlay !== undefined) {
        this.overlayDispose(overlay);
        this.overlays.delete(model);
      }
      return;
    }
    const sources = result.userData[SOLID_TRIANGLE_SOURCES_USERDATA_KEY] as unknown;
    if (overlay === undefined) {
      overlay = this.overlayCreate();
      this.overlays.set(model, overlay);
    }
    if (overlay.signature !== signature || overlay.multiply.userData['sources'] !== sources) {
      overlay.signature = signature;
      overlay.multiply.userData['sources'] = sources;
      this.overlayGeometrySet(overlay, paintOverlayBuild(result.geometry, paintSources(result), brushes));
    }
    result.updateWorldMatrix(true, false);
    overlay.group.matrix.copy(result.matrixWorld);
    overlay.group.matrixWorldNeedsUpdate = true;
    overlay.group.visible = this.enabled && paintResultShowsLitContent(result);
  }

  /**
   * Creates an empty overlay.
   *
   * @returns Overlay.
   */
  private overlayCreate(): PaintModelOverlay {
    const group = new THREE.Group();
    group.name = 'paint_overlay';
    group.matrixAutoUpdate = false;
    const geometry = new THREE.BufferGeometry();
    const multiply = new THREE.Mesh(geometry, []);
    const add = new THREE.Mesh(geometry, []);
    multiply.renderOrder = PAINT_OVERLAY_RENDER_ORDER;
    add.renderOrder = PAINT_OVERLAY_RENDER_ORDER + 1;
    for (const mesh of [multiply, add]) {
      mesh.frustumCulled = false;
      mesh.raycast = () => undefined;
      group.add(mesh);
    }
    this.root.add(group);
    return { group, multiply, add, signature: '' };
  }

  /**
   * Replaces an overlay's triangles.
   *
   * @param overlay Overlay.
   * @param batches Triangles per page.
   */
  private overlayGeometrySet(overlay: PaintModelOverlay, batches: ReturnType<typeof paintOverlayBuild>): void {
    const geometry = new THREE.BufferGeometry();
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const multiplyMaterials: THREE.Material[] = [];
    const addMaterials: THREE.Material[] = [];
    for (const batch of batches) {
      const pair = this.pageMaterials[batch.page];
      if (pair === undefined) continue;
      geometry.addGroup(positions.length / 3, batch.positions.length / 3, multiplyMaterials.length);
      multiplyMaterials.push(pair.multiply);
      addMaterials.push(pair.add);
      positions.push(...batch.positions);
      normals.push(...batch.normals);
      uvs.push(...batch.uvs);
    }
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    overlay.multiply.geometry.dispose();
    overlay.multiply.geometry = geometry;
    overlay.add.geometry = geometry;
    overlay.multiply.material = multiplyMaterials;
    overlay.add.material = addMaterials;
  }

  /**
   * Disposes an overlay.
   *
   * @param overlay Overlay.
   */
  private overlayDispose(overlay: PaintModelOverlay): void {
    overlay.multiply.geometry.dispose();
    overlay.group.removeFromParent();
  }

  /** Keeps one material pair per atlas page. */
  private syncPageMaterials(): void {
    while (this.pageMaterials.length > this.atlas.pageCount) {
      const pair = this.pageMaterials.pop();
      pair?.multiply.dispose();
      pair?.add.dispose();
    }
    for (let page = 0; page < this.atlas.pageCount; page++) {
      const texture = this.atlas.pageTexture(page);
      if (texture === null) continue;
      const pair = this.pageMaterials[page];
      if (pair !== undefined && pair.multiply.uniforms['atlas']?.value === texture) continue;
      pair?.multiply.dispose();
      pair?.add.dispose();
      this.pageMaterials[page] = {
        multiply: paintOverlayMaterialCreate('multiply', texture),
        add: paintOverlayMaterialCreate('add', texture),
      };
    }
  }
}

/**
 * Returns the matrix from a model's result space to a brush's local space.
 *
 * @param result Result mesh.
 * @param brush Brush.
 * @returns Matrix.
 */
export function paintResultToBrush(result: THREE.Mesh, brush: SolidBrushInstance): THREE.Matrix4 {
  result.updateWorldMatrix(true, false);
  if (brush.mesh === null) return brush.getModelSpaceMatrix().invert();
  brush.mesh.updateWorldMatrix(true, false);
  return new THREE.Matrix4().copy(brush.mesh.matrixWorld).invert().multiply(result.matrixWorld);
}

/**
 * Returns the atlas key of a modifier copy.
 *
 * @param model Owning model.
 * @param copy Copy.
 * @returns Key.
 */
export function paintCopyKey(model: SolidModel, copy: PaintCopyTarget): string {
  return `${model.root.uuid}/${copy.id}`;
}

/**
 * Returns where a copy's authored-local space is in the world.
 *
 * @param model Owning model.
 * @param copy Copy.
 * @returns Matrix from the authored brush's local space to world space.
 */
export function paintCopyToWorld(model: SolidModel, copy: PaintCopyTarget): THREE.Matrix4 {
  model.root.updateWorldMatrix(true, false);
  return new THREE.Matrix4().multiplyMatrices(model.root.matrixWorld, copy.sourceToModel);
}

/**
 * Returns the matrix from a model's result space to the authored-local space of
 * a copy, where its paint is rasterized.
 *
 * @param result Result mesh.
 * @param model Owning model.
 * @param copy Copy.
 * @returns Matrix.
 */
export function paintResultToCopy(result: THREE.Mesh, model: SolidModel, copy: PaintCopyTarget): THREE.Matrix4 {
  result.updateWorldMatrix(true, false);
  return paintCopyToWorld(model, copy).invert().multiply(result.matrixWorld);
}

/**
 * Returns the per-triangle sources of a result mesh.
 *
 * @param result Result mesh.
 * @returns Sources (empty when missing).
 */
function paintSources(result: THREE.Mesh): readonly (PaintOverlaySource | undefined)[] {
  const sources = result.userData[SOLID_TRIANGLE_SOURCES_USERDATA_KEY] as unknown;
  return Array.isArray(sources) ? (sources as (PaintOverlaySource | undefined)[]) : [];
}

/**
 * Returns whether a result mesh is shown with the lit content look the overlay
 * matches (not wireframe or another debug view).
 *
 * @param result Result mesh.
 * @returns True when the overlay should draw.
 */
function paintResultShowsLitContent(result: THREE.Mesh): boolean {
  let object: THREE.Object3D | null = result;
  while (object !== null) {
    if (!object.visible) return false;
    object = object.parent;
  }
  const materials = Array.isArray(result.material) ? result.material : [result.material];
  return materials.length > 0 && materials.every((material) => isContentViewLitMaterial(material));
}

/**
 * Describes a brush's faces for baking.
 *
 * @param id Id the facing signs use.
 * @param brush Brush.
 * @param signs Facing signs keyed `id|face`.
 * @param layers Decal layers, or null.
 * @returns Faces.
 */
function paintBakeFaces(
  id: string,
  brush: SolidBrushInstance,
  signs: Map<string, number>,
  layers: ReturnType<PaintLayerProvider['layersFor']> | null,
): PaintBakeFace[] {
  return brush.brush.faces.map((face, faceIndex) => {
    const plane = brush.brush.planes[faceIndex];
    const faceLayers = layers?.layers(faceIndex) ?? [];
    return {
      faceIndex,
      normal: plane?.normal.clone().normalize() ?? new THREE.Vector3(0, 1, 0),
      // Brush planes store d of n·p + d = 0; canvas frames use n·p = offset.
      offset: -(plane?.offset ?? 0),
      vertices: brush.brush.getFaceVertices(face),
      facingSign: signs.get(`${id}|${faceIndex}`) ?? 1,
      layers: faceLayers,
      layerBounds: faceLayers.length > 0 ? (layers?.bounds ?? []) : [],
    };
  });
}

/**
 * Returns a signature of the faces that changes with their planes, outlines or
 * facing.
 *
 * @param faces Faces.
 * @returns Signature.
 */
function paintFacesSignature(faces: readonly PaintBakeFace[]): string {
  return faces
    .map(
      (face) =>
        `${face.normal.x},${face.normal.y},${face.normal.z},${face.offset},${face.facingSign}:${face.vertices
          .map((vertex) => `${vertex.x},${vertex.y},${vertex.z}`)
          .join(';')}`,
    )
    .join('|');
}

/**
 * Lists strokes whose tiles must be rewritten: added, removed or grown strokes.
 * A grown stroke (one still being drawn) only contributes its new dabs and the
 * one before them.
 *
 * @param before Strokes baked last time.
 * @param after Current strokes.
 * @returns Strokes reaching every tile that changed.
 */
function paintStrokesChanged(
  before: ReadonlyMap<string, PaintStroke>,
  after: ReadonlyMap<string, PaintStroke>,
): PaintStroke[] {
  const changed: PaintStroke[] = [];
  for (const [id, stroke] of after) {
    const previous = before.get(id);
    if (previous === stroke) continue;
    if (previous !== undefined && paintStrokeGrew(previous, stroke)) {
      const start = Math.max(0, previous.dabs.length - PAINT_DAB_STRIDE);
      changed.push({ ...stroke, dabs: stroke.dabs.subarray(start) });
      continue;
    }
    changed.push(stroke);
    if (previous !== undefined) changed.push(previous);
  }
  for (const [id, stroke] of before) if (!after.has(id)) changed.push(stroke);
  return changed;
}

/**
 * Returns whether a stroke only gained dabs at its end.
 *
 * @param previous Earlier version.
 * @param next Later version.
 * @returns True when the earlier dabs are unchanged.
 */
function paintStrokeGrew(previous: PaintStroke, next: PaintStroke): boolean {
  if (next.dabs.length < previous.dabs.length) return false;
  if (previous.order !== next.order || previous.mode !== next.mode || previous.radius !== next.radius) return false;
  for (let index = 0; index < previous.dabs.length; index++) {
    if (previous.dabs[index] !== next.dabs[index]) return false;
  }
  return true;
}
