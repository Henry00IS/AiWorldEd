import * as THREE from 'three';
import { SolidModelRegistry } from '@/solid/model/solid_model_registry.js';
import { isSolidModelObject } from '@/solid/model/solid_model_keys.js';
import type { SolidModel } from '@/solid/model/solid_model.js';
import { DecalProjectorSettingsStore } from '@/decal/settings/decal_projector_settings.js';
import { DecalModelLayer, type DecalModelLayerServices } from '@/decal/layer/decal_model_layer.js';
import { decalLayerSyncReportEmpty, type DecalLayerSyncReport } from '@/decal/layer/decal_layer_sync_report.js';

/**
 * Keeps one decal layer per solid model of a world and feeds every layer the
 * world's visible decal projectors once per frame.
 */
export class DecalSceneSync {
  /** Recutting time one frame may spend across all models, in milliseconds. */
  static readonly defaultFrameBudgetMilliseconds = 6;

  private readonly layers = new Map<SolidModel, DecalModelLayer>();

  /**
   * Creates the synchronizer.
   *
   * @param services Image resolver and clock handed to every layer.
   * @param frameBudgetMilliseconds Recutting time allowed per frame.
   */
  constructor(
    private readonly services: DecalModelLayerServices,
    private readonly frameBudgetMilliseconds: number = DecalSceneSync.defaultFrameBudgetMilliseconds,
  ) {}

  /**
   * Brings every decal of a world up to date.
   *
   * @param world World root holding solid models and decal projectors.
   * @returns Work counts of this pass.
   */
  sync(world: THREE.Object3D): DecalLayerSyncReport {
    const report = decalLayerSyncReportEmpty();
    const { projectors, models } = this.sceneScan(world);
    this.layersPrune(models);
    if (projectors.length === 0 && this.layers.size === 0) return report;
    const budget = this.frameBudgetMilliseconds / Math.max(1, models.size);
    for (const model of models) this.layerEnsure(model).sync(projectors, budget, report);
    return report;
  }

  /**
   * Returns the layer of a model, if it has one.
   *
   * @param model Solid model.
   * @returns Layer or undefined.
   */
  layerOf(model: SolidModel): DecalModelLayer | undefined {
    return this.layers.get(model);
  }

  private readonly scanModels = new Set<SolidModel>();
  private readonly scanProjectors: THREE.Object3D[] = [];
  private readonly scanStack: THREE.Object3D[] = [];
  private readonly scanShown: boolean[] = [];

  /**
   * Walks a world once, without callbacks or allocations, collecting its solid
   * models (shown or not) and its visible decal projectors in scene order.
   * Projectors get current world matrices.
   *
   * @param world World root.
   * @returns Projectors and models, reused between calls.
   */
  private sceneScan(world: THREE.Object3D): { projectors: THREE.Object3D[]; models: Set<SolidModel> } {
    const projectors = this.scanProjectors;
    const models = this.scanModels;
    const stack = this.scanStack;
    const shown = this.scanShown;
    projectors.length = 0;
    models.clear();
    stack.length = 0;
    shown.length = 0;
    stack.push(world);
    shown.push(world.visible);
    while (stack.length > 0) {
      const object = stack.pop()!;
      const visible = shown.pop()!;
      if (isSolidModelObject(object)) {
        const model = SolidModelRegistry.get(object);
        if (model) models.add(model);
      }
      if (visible && DecalProjectorSettingsStore.isActiveProjector(object)) projectors.push(object);
      const children = object.children;
      for (let index = children.length - 1; index >= 0; index--) {
        const child = children[index]!;
        stack.push(child);
        shown.push(visible && child.visible);
      }
    }
    for (const projector of projectors) projector.updateWorldMatrix(true, false);
    return { projectors, models };
  }

  /**
   * Lists the visible decal projectors under a world root in scene order, with
   * current world matrices.
   *
   * @param world World root.
   * @returns Projectors.
   */
  static projectorsCollect(world: THREE.Object3D): THREE.Object3D[] {
    const projectors: THREE.Object3D[] = [];
    world.traverseVisible((object) => {
      if (DecalProjectorSettingsStore.isActiveProjector(object)) projectors.push(object);
    });
    for (const projector of projectors) projector.updateWorldMatrix(true, false);
    return projectors;
  }

  /**
   * Returns the layer of a model, creating it first.
   *
   * @param model Solid model.
   * @returns Layer.
   */
  private layerEnsure(model: SolidModel): DecalModelLayer {
    const known = this.layers.get(model);
    if (known) return known;
    const resultMesh = model.getResultMesh();
    resultMesh.updateWorldMatrix(true, false);
    const layer = new DecalModelLayer(resultMesh, model.getCollisionChunkSource(), this.services);
    this.layers.set(model, layer);
    return layer;
  }

  /**
   * Disposes the layers of models that left the world.
   *
   * @param models Models currently in the world.
   */
  private layersPrune(models: ReadonlySet<SolidModel>): void {
    for (const [model, layer] of this.layers) {
      if (models.has(model)) continue;
      layer.dispose();
      this.layers.delete(model);
    }
  }

  /** Disposes every layer. */
  dispose(): void {
    for (const layer of this.layers.values()) layer.dispose();
    this.layers.clear();
  }
}
