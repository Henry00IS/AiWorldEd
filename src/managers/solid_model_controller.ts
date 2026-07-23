import * as THREE from 'three';
import { CommandStack } from '../commands/command_stack.js';
import { CreateSolidModelCommand } from '../commands/create_solid_model_command.js';
import { AddSolidBoxBrushCommand } from '../commands/add_solid_box_brush_command.js';
import { SetSolidBrushOperationCommand } from '../commands/set_solid_brush_operation_command.js';
import { SelectionManager } from './selection_manager.js';
import { SolidModel } from '../solid/model/solid_model.js';
import { SolidModelPanel } from '../ui/solid_model_panel.js';
import { SolidOperation } from '../solid/types/solid_operation.js';

/**
 * Coordinates solid model creation, hierarchy brushes, and rebuild after edits.
 */
export class SolidModelController {
  private worldObject: THREE.Group;
  private commandStack: CommandStack;
  private selectionManager: SelectionManager;
  private panel: SolidModelPanel;
  private syncViewports: (() => void) | null;
  private refreshOutliner: (() => void) | null;
  private showStatus: ((message: string) => void) | null;
  private solidModelCounter: number;
  private liveRebuildQueued: boolean;
  private pendingLiveMeshes: THREE.Mesh[] | null;
  private onLiveGeometryUpdated: ((meshes: THREE.Mesh[]) => void) | null;
  private readonly selectionChangedHandler: () => void;

  /**
   * Creates a solid model controller.
   * @param worldObject Scene root group.
   * @param commandStack Undo stack.
   * @param selectionManager Selection manager.
   * @param panel Solid model tools panel.
   */
  constructor(
    worldObject: THREE.Group,
    commandStack: CommandStack,
    selectionManager: SelectionManager,
    panel: SolidModelPanel
  ) {
    this.worldObject = worldObject;
    this.commandStack = commandStack;
    this.selectionManager = selectionManager;
    this.panel = panel;
    this.syncViewports = null;
    this.refreshOutliner = null;
    this.showStatus = null;
    this.solidModelCounter = 0;
    this.liveRebuildQueued = false;
    this.pendingLiveMeshes = null;
    this.onLiveGeometryUpdated = null;
    this.selectionChangedHandler = () => this.onSelectionChanged();
    this.selectionManager.onSelectionChanged(this.selectionChangedHandler);
  }

  /**
   * Sets a callback that pushes live result geometry into viewport clones.
   * @param callback Receives updated result meshes after a live rebuild.
   */
  setOnLiveGeometryUpdated(
    callback: ((meshes: THREE.Mesh[]) => void) | null
  ): void {
    this.onLiveGeometryUpdated = callback;
  }

  /**
   * Sets viewport sync callback after scene changes.
   * @param callback Sync function.
   */
  setSyncViewports(callback: () => void): void {
    this.syncViewports = callback;
  }

  /**
   * Sets outliner refresh callback.
   * @param callback Refresh function.
   */
  setRefreshOutliner(callback: () => void): void {
    this.refreshOutliner = callback;
  }

  /**
   * Sets status message callback.
   * @param callback Status function.
   */
  setShowStatus(callback: (message: string) => void): void {
    this.showStatus = callback;
  }

  /**
   * Creates a solid model with one additive box brush and selects that brush.
   */
  createSolidModel(): void {
    this.solidModelCounter += 1;
    const model = new SolidModel(
      `SolidModel${this.padNumber(this.solidModelCounter)}`
    );
    const brush = model.addBoxBrush(2, SolidOperation.Additive);
    this.placeModelInScene(model, brush.mesh ?? model.root, `Created ${model.root.name}`);
  }

  /**
   * Adds an already-built solid model (e.g. VMF import) with undo support.
   * @param model Solid model ready for the scene.
   * @param statusMessage Optional status text after placement.
   */
  placeImportedModel(model: SolidModel, statusMessage?: string): void {
    this.solidModelCounter += 1;
    const firstBrush = model.getBrushes()[0];
    const selectTarget = firstBrush?.mesh ?? model.root;
    const message =
      statusMessage ??
      `Imported ${model.root.name} (${model.getBrushCount()} brushes)`;
    this.placeModelInScene(model, selectTarget, message);
  }

  /**
   * Pushes a create command, selects a target, and refreshes UI.
   * @param model Solid model to parent under the world.
   * @param selectTarget Object to select after placement.
   * @param statusMessage Status bar text.
   */
  private placeModelInScene(
    model: SolidModel,
    selectTarget: THREE.Object3D,
    statusMessage: string
  ): void {
    const command = new CreateSolidModelCommand(model, this.worldObject);
    this.commandStack.push(command);
    this.selectionManager.selectObject(selectTarget);
    this.panel.setModel(model);
    this.syncViewports?.();
    this.refreshOutliner?.();
    this.showStatus?.(statusMessage);
  }

  /**
   * Toggles the solid model panel visibility.
   */
  togglePanel(): void {
    this.panel.toggle();
    if (this.panel.isOpen()) {
      this.bindPanelToSelection();
    }
  }

  /**
   * Adds a box brush under the active solid model and selects it.
   */
  addBoxBrush(): void {
    const model = this.resolveActiveModel();
    if (!model) {
      this.showStatus?.('Select a solid model or brush first');
      return;
    }
    const offsetDistance = model.getBrushCount() * 0.5;
    const offset = new THREE.Vector3(offsetDistance, 0, offsetDistance);
    const command = new AddSolidBoxBrushCommand(
      model,
      2,
      SolidOperation.Additive,
      offset
    );
    this.commandStack.push(command);
    const brush = command.getCreatedBrush();
    if (brush?.mesh) {
      this.selectionManager.selectObject(brush.mesh);
    }
    this.panel.refresh();
    this.syncViewports?.();
    this.refreshOutliner?.();
    this.showStatus?.(`Added ${brush?.name ?? 'brush'}`);
  }

  /**
   * Sets the CSG operation on solid brush meshes (undoable, batched).
   * @param meshes Brush preview meshes.
   * @param operation New operation.
   */
  setBrushOperationForMeshes(
    meshes: THREE.Mesh[],
    operation: SolidOperation
  ): void {
    if (meshes.length === 0) return;
    const command = new SetSolidBrushOperationCommand(meshes, operation);
    this.commandStack.push(command);
    this.panel.refresh();
    this.syncViewports?.();
    this.showStatus?.('Updated brush operation');
  }

  /**
   * Sets the CSG operation on a single brush mesh (undoable).
   * @param mesh Brush preview mesh.
   * @param operation New operation.
   */
  setBrushOperationForMesh(mesh: THREE.Mesh, operation: SolidOperation): void {
    this.setBrushOperationForMeshes([mesh], operation);
  }

  /**
   * After transform tools or inspector edits finish, rebuild affected solids.
   * @param selectedMeshes Meshes that were edited.
   */
  onTransformsCommitted(selectedMeshes: THREE.Mesh[]): void {
    this.pendingLiveMeshes = null;
    this.liveRebuildQueued = false;
    const models = this.collectAffectedModels(selectedMeshes);
    if (models.size === 0) return;
    const selectedSet = new Set(selectedMeshes);
    for (const model of models) {
      this.finalizeModelAfterTransform(model, selectedSet);
    }
    this.panel.refresh();
    this.syncViewports?.();
    this.refreshOutliner?.();
  }

  /**
   * Live CSG update while a solid brush is dragged (Sander-style interactive preview).
   * Coalesces to one rebuild per animation frame for smooth interaction.
   * @param selectedMeshes Meshes currently being transformed.
   */
  onTransformsLive(selectedMeshes: THREE.Mesh[]): void {
    if (!this.involvesSolidModels(selectedMeshes)) return;
    this.pendingLiveMeshes = selectedMeshes;
    if (this.liveRebuildQueued) return;
    this.liveRebuildQueued = true;
    requestAnimationFrame(() => this.flushLiveRebuild());
  }

  /**
   * Returns true when any selected mesh belongs to a solid model.
   * @param meshes Candidate meshes.
   * @returns True when solid rebuild may be needed.
   */
  involvesSolidModels(meshes: THREE.Mesh[]): boolean {
    return meshes.some((mesh) => SolidModel.fromObject(mesh) !== null);
  }

  /**
   * Runs the queued live rebuild for the latest drag sample.
   */
  private flushLiveRebuild(): void {
    this.liveRebuildQueued = false;
    const meshes = this.pendingLiveMeshes;
    this.pendingLiveMeshes = null;
    if (!meshes || meshes.length === 0) return;
    const models = this.collectAffectedModels(meshes);
    if (models.size === 0) return;
    const updatedResults: THREE.Mesh[] = [];
    for (const model of models) {
      model.syncBrushesFromScene();
      model.rebuildLive();
      updatedResults.push(model.getResultMeshForSync());
    }
    this.onLiveGeometryUpdated?.(updatedResults);
  }

  /**
   * Reacts to scene selection changes by binding the tools panel.
   */
  private onSelectionChanged(): void {
    this.bindPanelToSelection();
  }

  /**
   * Binds the tools panel to the solid model owning the current selection.
   */
  private bindPanelToSelection(): void {
    this.panel.setModel(this.findSelectedSolidModel());
  }

  /**
   * Finds a solid model from the current selection.
   * @returns Solid model or null.
   */
  private findSelectedSolidModel(): SolidModel | null {
    for (const mesh of this.selectionManager.getSelectedObjects()) {
      const model = SolidModel.fromObject(mesh);
      if (model) return model;
    }
    return null;
  }

  /**
   * Resolves the active model from the panel or selection.
   * @returns Solid model or null.
   */
  private resolveActiveModel(): SolidModel | null {
    return this.panel.getModel() ?? this.findSelectedSolidModel();
  }

  /**
   * Collects unique solid models touched by the given meshes.
   * @param meshes Edited meshes.
   * @returns Set of solid models.
   */
  private collectAffectedModels(meshes: THREE.Mesh[]): Set<SolidModel> {
    const models = new Set<SolidModel>();
    for (const mesh of meshes) {
      const model = SolidModel.fromObject(mesh);
      if (model) models.add(model);
    }
    return models;
  }

  /**
   * Applies post-transform rules for one solid model and rebuilds CSG.
   * @param model Solid model.
   * @param selectedSet Selected meshes from the edit.
   */
  private finalizeModelAfterTransform(
    model: SolidModel,
    selectedSet: Set<THREE.Mesh>
  ): void {
    const result = model.getResultMesh();
    const resultSelected = selectedSet.has(result);
    const selectedBrushCount = model
      .getBrushes()
      .filter((brush) => brush.mesh && selectedSet.has(brush.mesh)).length;
    if (resultSelected && selectedBrushCount === 0) {
      this.bakeResultTransformIntoRoot(model);
    } else if (resultSelected) {
      this.resetResultLocalTransform(result);
    }
    model.syncBrushesFromScene();
    model.rebuild(true);
  }

  /**
   * Bakes a lone result-mesh transform into the solid model root.
   * @param model Solid model whose result was moved alone.
   */
  private bakeResultTransformIntoRoot(model: SolidModel): void {
    const root = model.root;
    const result = model.getResultMesh();
    const resultMatrix = new THREE.Matrix4().compose(
      result.position.clone(),
      new THREE.Quaternion().setFromEuler(result.rotation),
      result.scale.clone()
    );
    root.updateMatrix();
    const combined = new THREE.Matrix4()
      .copy(root.matrix)
      .multiply(resultMatrix);
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    combined.decompose(position, quaternion, scale);
    root.position.copy(position);
    root.quaternion.copy(quaternion);
    root.scale.copy(scale);
    root.rotation.setFromQuaternion(quaternion);
    this.resetResultLocalTransform(result);
  }

  /**
   * Resets the result mesh to local identity under the solid model root.
   * @param result Result mesh.
   */
  private resetResultLocalTransform(result: THREE.Mesh): void {
    result.position.set(0, 0, 0);
    result.rotation.set(0, 0, 0);
    result.scale.set(1, 1, 1);
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
