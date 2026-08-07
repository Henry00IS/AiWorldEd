import * as THREE from 'three';
import { CommandStack } from '@/commands/command_stack.js';
import { CommandSolidModelCreate } from '@/solid/commands/model/command_solid_model_create.js';
import { CommandSolidBoxBrushAdd } from '@/solid/commands/brush/command_solid_box_brush_add.js';
import { CommandSolidBrushOperationSet } from '@/solid/commands/brush/command_solid_brush_operation_set.js';
import { CommandSolidGroupOperationSet } from '@/solid/commands/group/command_solid_group_operation_set.js';
import { CommandUndoBatch } from '@/commands/command_undo_batch.js';
import type { UndoCommand } from '@/commands/command_undo.js';
import {
  CommandSolidBrushesReorder,
  SolidBrushOrderEnd,
} from '@/solid/commands/brushes/command_solid_brushes_reorder.js';
import { ManagerSelection } from '@/selection/object/manager_selection.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidModelPanel } from '@/solid/ui/panel/solid_model_panel.js';
import { SolidOperation, solidOperationToggleAdditiveSubtractive } from '@/solid/types/solid_operation.js';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';
import { SolidBrushEdgeBatch } from '@/solid/model/solid_brush_edge_batch.js';
import {
  findSolidModelRoot,
  getSolidGroupOperation,
  isSolidCsgGroup,
  isValidSolidTreeParent,
} from '@/solid/model/solid_group.js';
import { SOLID_MODEL_STARTUP_DEFAULT_BRUSH_SIZE } from '@/solid/model/solid_model_startup_default.js';
import {
  computeOcclusionAwareSpawnPosition,
  DEFAULT_SPAWN_DISTANCE,
  snapPositionToGrid,
} from '@/navigation/placement/object_spawn_placement.js';
import type { EditorOrientation } from '@/navigation/orientation/editor_orientation.js';
import type { GridSnap } from '@/transform/snap/grid_snap.js';
import { TextureLockSettings } from '@/texture/lock/texture_lock_settings.js';
import type { TextureLockFlags } from '@/texture/lock/texture_lock_transform.js';
import { TransformMode } from '@/types/transform_mode.js';
import {
  solidObjectIsLocalIdentityPose,
  solidResultResetLocalTransform,
  solidRootBakeResultTransform,
  solidRootClearBakeBaselines,
} from '@/solid/controller/solid_model_controller_root_bake.js';

/** Coordinates solid model creation, hierarchy brushes, and rebuild after edits. */
export class SolidModelController {
  private worldObject: THREE.Group;
  private commandStack: CommandStack;
  private selectionManager: ManagerSelection;
  private panel: SolidModelPanel;
  private textureLock: TextureLockSettings | null;
  private getTransformMode: (() => TransformMode) | null;
  private syncViewports: (() => void) | null;
  private refreshOutliner: (() => void) | null;
  private revealOutlinerObject: ((object: THREE.Object3D) => void) | null;
  private showStatus: ((message: string) => void) | null;
  private getActiveCamera: (() => THREE.Camera | null) | null;
  private getGridInterval: (() => number) | null;
  private getGridSnap: (() => GridSnap | null) | null;
  private getGridOrientation: (() => EditorOrientation | null) | null;
  private readonly scratchRootWorldQuaternion: THREE.Quaternion;
  private readonly scratchGridWorldQuaternion: THREE.Quaternion;
  private readonly scratchModelLocalQuaternion: THREE.Quaternion;
  private readonly scratchModelLocalEuler: THREE.Euler;

  /** True while a live CSG flush is scheduled on requestAnimationFrame. */
  private liveRebuildQueued: boolean;
  /**
   * True while a live rebuild is running (may span multiple frames of wall
   * time).
   */
  private liveRebuildInProgress: boolean;
  /** Latest meshes from transform drag; always the most recent pointer sample. */
  private pendingLiveMeshes: THREE.Mesh[] | null;
  /** Monotonic counter advanced on every live transform sample. */
  private liveTransformGeneration: number;
  /** Generation last successfully applied to solid result geometry. */
  private builtLiveGeneration: number;
  /** Invalidates in-flight rAF callbacks superseded by a sync flush. */
  private liveFlushToken: number;
  private onLiveGeometryUpdated: ((meshes: THREE.Mesh[]) => void) | null;
  /** Last solid model the user worked with, retained when selection is cleared. */
  private lastActiveModel: SolidModel | null;
  /** Last solid hierarchy parent for new brushes (solid root or CSG group). */
  private lastBrushInsertParent: THREE.Object3D | null;
  /** Pre-drag solid-root matrix baselines for residual result-mesh pose bake. */
  private readonly solidRootBakeBaselines = new WeakMap<SolidModel, THREE.Matrix4>();
  private readonly selectionChangedHandler: () => void;

  /**
   * Creates a solid model controller.
   *
   * @param worldObject Scene root group.
   * @param commandStack Undo stack.
   * @param selectionManager Selection manager.
   * @param panel Solid model tools panel.
   */
  constructor(
    worldObject: THREE.Group,
    commandStack: CommandStack,
    selectionManager: ManagerSelection,
    panel: SolidModelPanel,
  ) {
    this.worldObject = worldObject;
    this.commandStack = commandStack;
    this.selectionManager = selectionManager;
    this.panel = panel;
    this.textureLock = null;
    this.getTransformMode = null;
    this.syncViewports = null;
    this.refreshOutliner = null;
    this.revealOutlinerObject = null;
    this.showStatus = null;
    this.getActiveCamera = null;
    this.getGridInterval = null;
    this.getGridSnap = null;
    this.getGridOrientation = null;
    this.scratchRootWorldQuaternion = new THREE.Quaternion();
    this.scratchGridWorldQuaternion = new THREE.Quaternion();
    this.scratchModelLocalQuaternion = new THREE.Quaternion();
    this.scratchModelLocalEuler = new THREE.Euler(0, 0, 0, 'XYZ');
    this.liveRebuildQueued = false;
    this.liveRebuildInProgress = false;
    this.pendingLiveMeshes = null;
    this.liveTransformGeneration = 0;
    this.builtLiveGeneration = 0;
    this.liveFlushToken = 0;
    this.onLiveGeometryUpdated = null;
    this.lastActiveModel = null;
    this.lastBrushInsertParent = null;
    this.selectionChangedHandler = () => this.onSelectionChanged();
    this.selectionManager.onSelectionChanged(this.selectionChangedHandler);
  }

  /**
   * Sets a callback invoked after live result geometry updates.
   *
   * @param callback Receives updated result meshes after a live rebuild.
   */
  setOnLiveGeometryUpdated(callback: ((meshes: THREE.Mesh[]) => void) | null): void {
    this.onLiveGeometryUpdated = callback;
  }

  /**
   * Sets viewport sync callback after scene changes.
   *
   * @param callback Sync function.
   */
  setSyncViewports(callback: () => void): void {
    this.syncViewports = callback;
  }

  /**
   * Sets outliner refresh callback.
   *
   * @param callback Refresh function.
   */
  setRefreshOutliner(callback: () => void): void {
    this.refreshOutliner = callback;
  }

  /**
   * Sets callback that expands ancestors and scrolls the outliner to an object.
   *
   * @param callback Reveal function.
   */
  setRevealOutlinerObject(callback: ((object: THREE.Object3D) => void) | null): void {
    this.revealOutlinerObject = callback;
  }

  /**
   * Sets status message callback.
   *
   * @param callback Status function.
   */
  setShowStatus(callback: (message: string) => void): void {
    this.showStatus = callback;
  }

  /**
   * Sets shared texture lock settings used when solid brushes are transformed.
   *
   * @param settings Texture lock settings, or null to leave UVs world-sliding.
   */
  setTextureLockSettings(settings: TextureLockSettings | null): void {
    this.textureLock = settings;
  }

  /**
   * Sets a provider for the active transform gizmo mode.
   *
   * @param provider Returns the current TransformMode, or null to clear.
   */
  setTransformModeProvider(provider: (() => TransformMode) | null): void {
    this.getTransformMode = provider;
  }

  /**
   * Provides the active view camera for placing new brushes in view.
   *
   * @param callback Returns the camera used for spawn placement, or null.
   */
  setActiveCameraProvider(callback: (() => THREE.Camera | null) | null): void {
    this.getActiveCamera = callback;
  }

  /**
   * Provides the current grid interval for snapping new brush placement.
   *
   * @param callback Returns a positive grid step.
   */
  setGridIntervalProvider(callback: (() => number) | null): void {
    this.getGridInterval = callback;
  }

  /**
   * Provides the shared grid snap store (oriented lattice) for brush spawn.
   *
   * @param callback Returns the live grid snap instance, or null.
   */
  setGridSnapProvider(callback: (() => GridSnap | null) | null): void {
    this.getGridSnap = callback;
  }

  /**
   * Provides the working grid orientation for new brush rotation.
   *
   * @param callback Returns the live grid orientation, or null.
   */
  setGridOrientationProvider(callback: (() => EditorOrientation | null) | null): void {
    this.getGridOrientation = callback;
  }

  /** Creates a solid model with one additive box brush and selects that brush. */
  createSolidModel(): void {
    const model = new SolidModel();
    const brush = model.addBoxBrush(SOLID_MODEL_STARTUP_DEFAULT_BRUSH_SIZE, SolidOperation.Additive);
    this.placeModelInScene(model, brush.mesh ?? model.root, `Created ${model.root.name}`);
  }

  /**
   * Adds an already-built solid model with undo support without changing
   * selection.
   *
   * @param model Solid model ready for the scene.
   * @param statusMessage Optional status text after placement.
   */
  placeImportedModel(model: SolidModel, statusMessage?: string): void {
    const message = statusMessage ?? `Imported ${model.root.name} (${model.getBrushCount()} brushes)`;
    this.placeModelInScene(model, null, message);
  }

  /**
   * Adopts the first solid model already parented under the world as the
   * working context (startup default solid). Does not push undo or change
   * selection.
   *
   * @returns True when a solid model was found and remembered.
   */
  adoptFirstSolidModelInWorld(): boolean {
    const model = this.findFirstSolidModelInWorld();
    if (!model) return false;
    this.rememberActiveModel(model);
    return true;
  }

  /**
   * Pushes a create command, optionally selects a target, and refreshes UI.
   *
   * @param model Solid model to parent under the world.
   * @param selectTarget Mesh to select after placement, or null to clear
   *   selection (imports).
   * @param statusMessage Status bar text.
   */
  private placeModelInScene(model: SolidModel, selectTarget: THREE.Object3D | null, statusMessage: string): void {
    const command = new CommandSolidModelCreate(model, this.worldObject);
    this.commandStack.push(command);
    this.applyPlacementSelection(selectTarget);
    this.rememberActiveModel(model);
    this.syncViewports?.();
    this.refreshOutliner?.();
    this.showStatus?.(statusMessage);
  }

  /**
   * Applies selection after placing a solid model in the scene.
   *
   * @param selectTarget Mesh to select, or null to clear the current selection.
   */
  private applyPlacementSelection(selectTarget: THREE.Object3D | null): void {
    if (selectTarget instanceof THREE.Mesh) {
      this.selectionManager.selectObject(selectTarget);
      return;
    }
    if (selectTarget === null) {
      this.selectionManager.clearSelection();
    }
  }

  /** Toggles the solid model panel visibility. */
  togglePanel(): void {
    this.panel.toggle();
    if (this.panel.isOpen()) {
      this.bindPanelToSelection();
    }
  }

  /**
   * Adds a box brush under the active solid model and selects it. Spawns
   * grid-aligned in front of the active camera (model-local space). Appends
   * under the most recently selected solid parent (CSG group or solid root).
   */
  addBoxBrush(): void {
    if (this.selectionManager.isSelectionChangeLocked()) {
      this.selectionManager.notifySelectionChangeBlocked();
      return;
    }
    const model = this.resolveActiveModel();
    if (!model) {
      this.showStatus?.('Select a solid model or brush first');
      return;
    }
    const parent = this.resolveBrushInsertParent(model);
    const offset = this.computeNewBrushLocalPosition(model);
    const rotation = this.computeNewBrushModelLocalRotation(model);
    const command = new CommandSolidBoxBrushAdd(
      model,
      SOLID_MODEL_STARTUP_DEFAULT_BRUSH_SIZE,
      SolidOperation.Additive,
      offset,
      parent,
      rotation,
    );
    this.commandStack.push(command);
    const brush = command.getCreatedBrush();
    if (brush?.mesh) {
      if (!this.selectionManager.selectObject(brush.mesh)) {
        this.refreshOutliner?.();
        this.panel.refresh();
        this.syncViewports?.();
        return;
      }
      this.lastBrushInsertParent = brush.mesh.parent;
    }
    this.panel.refresh();
    this.syncViewports?.();
    // Selection change already reveals/refreshes the outliner for the new brush.
    // A second full tree pass is unnecessary for large solid models.
    if (!brush?.mesh) {
      this.refreshOutliner?.();
    }
    this.showStatus?.(`Added ${brush?.name ?? 'brush'}`);
  }

  /**
   * Enables or disables inverted-world CSG on the solid model owning the
   * current selection (or the last active solid). Rebuilds immediately.
   *
   * @param inverted True when CSG starts solid so subtractives carve rooms.
   */
  setInvertedWorldForSelection(inverted: boolean): void {
    const model = this.resolveActiveModel();
    if (!model) {
      this.showStatus?.('Select a solid model or brush first');
      return;
    }
    if (model.isInvertedWorld() === inverted) return;
    model.setInvertedWorld(inverted);
    this.rememberActiveModel(model);
    this.panel.refresh();
    this.syncViewports?.();
    this.refreshOutliner?.();
    this.showStatus?.(inverted ? 'Inverted world enabled' : 'Inverted world disabled');
  }

  /**
   * Sets the CSG operation on solid brush meshes (undoable, batched).
   *
   * @param meshes Brush preview meshes.
   * @param operation New operation.
   */
  setBrushOperationForMeshes(meshes: THREE.Mesh[], operation: SolidOperation): void {
    if (meshes.length === 0) return;
    const command = new CommandSolidBrushOperationSet(meshes, operation);
    this.commandStack.push(command);
    this.panel.refresh();
    this.syncViewports?.();
    this.refreshOutliner?.();
    this.showStatus?.('Updated brush operation');
  }

  /**
   * Applies a CSG operation to currently selected solid brushes and solid CSG
   * groups. Group selection updates the group branch op only; descendant brush
   * meshes are not also rewritten.
   *
   * @param operation Additive or subtractive operation to apply.
   */
  setOperationOnSelection(operation: SolidOperation): void {
    const groups = this.selectedSolidCsgGroupsCollect();
    const brushes = this.selectedSolidBrushMeshesOutsideGroupsCollect(groups);
    if (brushes.length === 0 && groups.length === 0) {
      return;
    }
    if (brushes.length > 0) {
      this.setBrushOperationForMeshes(brushes, operation);
    }
    if (groups.length > 0) {
      this.setGroupOperationForGroups(groups, operation);
    }
  }

  /**
   * Toggles selected solid brushes and CSG groups between additive and
   * subtractive in one undo step. Each item flips independently so mixed
   * selections swap both ways at once. Intersecting is left unchanged.
   */
  toggleAdditiveSubtractiveOnSelection(): void {
    const groups = this.selectedSolidCsgGroupsCollect();
    const brushes = this.selectedSolidBrushMeshesOutsideGroupsCollect(groups);
    const commands = this.buildAdditiveSubtractiveToggleCommands(brushes, groups);
    if (commands.length === 0) {
      return;
    }
    const command = commands.length === 1 ? commands[0]! : new CommandUndoBatch(commands);
    this.commandStack.push(command);
    this.panel.refresh();
    this.syncViewports?.();
    this.refreshOutliner?.();
    this.showStatus?.('Toggled additive / subtractive');
  }

  /**
   * Builds undoable commands that flip additive ↔ subtractive for brushes and
   * groups.
   *
   * @param brushes Selected brush meshes outside selected groups.
   * @param groups Selected solid CSG groups.
   * @returns Commands to execute (may be empty).
   */
  private buildAdditiveSubtractiveToggleCommands(
    brushes: readonly THREE.Mesh[],
    groups: readonly THREE.Group[],
  ): UndoCommand[] {
    const commands: UndoCommand[] = [];
    this.appendBrushToggleCommands(brushes, commands);
    this.appendGroupToggleCommands(groups, commands);
    return commands;
  }

  /**
   * Appends brush operation-set commands for additive ↔ subtractive flips.
   *
   * @param brushes Brush meshes.
   * @param commands Accumulator.
   */
  private appendBrushToggleCommands(brushes: readonly THREE.Mesh[], commands: UndoCommand[]): void {
    const toSubtractive: THREE.Mesh[] = [];
    const toAdditive: THREE.Mesh[] = [];
    for (const mesh of brushes) {
      const operation = this.resolveBrushMeshOperation(mesh);
      if (operation === null) {
        continue;
      }
      const next = solidOperationToggleAdditiveSubtractive(operation);
      if (next === SolidOperation.Subtractive) {
        toSubtractive.push(mesh);
      } else if (next === SolidOperation.Additive) {
        toAdditive.push(mesh);
      }
    }
    if (toSubtractive.length > 0) {
      commands.push(new CommandSolidBrushOperationSet(toSubtractive, SolidOperation.Subtractive));
    }
    if (toAdditive.length > 0) {
      commands.push(new CommandSolidBrushOperationSet(toAdditive, SolidOperation.Additive));
    }
  }

  /**
   * Appends group operation-set commands for additive ↔ subtractive flips.
   *
   * @param groups Solid CSG groups.
   * @param commands Accumulator.
   */
  private appendGroupToggleCommands(groups: readonly THREE.Group[], commands: UndoCommand[]): void {
    const toSubtractive: THREE.Group[] = [];
    const toAdditive: THREE.Group[] = [];
    for (const group of groups) {
      const next = solidOperationToggleAdditiveSubtractive(getSolidGroupOperation(group));
      if (next === SolidOperation.Subtractive) {
        toSubtractive.push(group);
      } else if (next === SolidOperation.Additive) {
        toAdditive.push(group);
      }
    }
    if (toSubtractive.length > 0) {
      commands.push(new CommandSolidGroupOperationSet(toSubtractive, SolidOperation.Subtractive));
    }
    if (toAdditive.length > 0) {
      commands.push(new CommandSolidGroupOperationSet(toAdditive, SolidOperation.Additive));
    }
  }

  /**
   * Reads the CSG operation for a solid brush preview mesh.
   *
   * @param mesh Brush preview mesh.
   * @returns Operation, or null when not a solid brush.
   */
  private resolveBrushMeshOperation(mesh: THREE.Mesh): SolidOperation | null {
    const model = SolidModel.fromObject(mesh);
    if (!model) {
      return null;
    }
    const brush = model.findBrushByMesh(mesh);
    if (!brush) {
      return null;
    }
    return brush.operation;
  }

  /**
   * Collects selected solid brush meshes that are not under any of the given
   * solid CSG groups.
   *
   * @param groups Selected solid CSG groups.
   * @returns Brush meshes outside those groups.
   */
  private selectedSolidBrushMeshesOutsideGroupsCollect(groups: readonly THREE.Group[]): THREE.Mesh[] {
    const underGroup = (mesh: THREE.Mesh): boolean => {
      for (const group of groups) {
        if (this.objectIsDescendantOf(mesh, group)) {
          return true;
        }
      }
      return false;
    };
    return this.selectedSolidBrushMeshesCollect().filter((mesh) => !underGroup(mesh));
  }

  /**
   * Returns whether an object lives under a hierarchy ancestor.
   *
   * @param object Candidate descendant.
   * @param ancestor Ancestor to search toward.
   * @returns True when ancestor is above object.
   */
  private objectIsDescendantOf(object: THREE.Object3D, ancestor: THREE.Object3D): boolean {
    let current: THREE.Object3D | null = object.parent;
    while (current) {
      if (current === ancestor) {
        return true;
      }
      current = current.parent;
    }
    return false;
  }

  /**
   * Collects selected solid brush preview meshes from viewport and inspector
   * selection.
   *
   * @returns Unique solid brush meshes.
   */
  private selectedSolidBrushMeshesCollect(): THREE.Mesh[] {
    const brushes: THREE.Mesh[] = [];
    const seen = new Set<THREE.Mesh>();
    for (const mesh of this.selectionManager.getSelectedObjects()) {
      this.solidBrushMeshAppendIfNew(mesh, brushes, seen);
    }
    for (const object of this.selectionManager.getInspectorObjects()) {
      if (object instanceof THREE.Mesh) {
        this.solidBrushMeshAppendIfNew(object, brushes, seen);
      }
    }
    return brushes;
  }

  /**
   * Collects selected solid CSG groups from hierarchy inspector selection.
   *
   * @returns Unique solid CSG groups.
   */
  private selectedSolidCsgGroupsCollect(): THREE.Group[] {
    const groups: THREE.Group[] = [];
    const seen = new Set<THREE.Group>();
    for (const object of this.selectionManager.getInspectorObjects()) {
      if (!(object instanceof THREE.Group) || !isSolidCsgGroup(object)) {
        continue;
      }
      if (seen.has(object)) {
        continue;
      }
      seen.add(object);
      groups.push(object);
    }
    return groups;
  }

  /**
   * Appends a mesh when it is a solid brush preview not already collected.
   *
   * @param mesh Candidate mesh.
   * @param brushes Accumulator list.
   * @param seen Deduping set.
   */
  private solidBrushMeshAppendIfNew(mesh: THREE.Mesh, brushes: THREE.Mesh[], seen: Set<THREE.Mesh>): void {
    if (!SolidBrushVisual.isBrushObject(mesh)) {
      return;
    }
    if (seen.has(mesh)) {
      return;
    }
    seen.add(mesh);
    brushes.push(mesh);
  }

  /**
   * Sets the CSG operation on solid compound groups (undoable, batched).
   *
   * @param groups Solid CSG groups.
   * @param operation New operation for the compound branch.
   */
  setGroupOperationForGroups(groups: THREE.Group[], operation: SolidOperation): void {
    if (groups.length === 0) return;
    const command = new CommandSolidGroupOperationSet(groups, operation);
    this.commandStack.push(command);
    this.panel.refresh();
    this.syncViewports?.();
    this.refreshOutliner?.();
    this.showStatus?.('Updated group operation');
  }

  /**
   * Sets the CSG operation on a single brush mesh (undoable).
   *
   * @param mesh Brush preview mesh.
   * @param operation New operation.
   */
  setBrushOperationForMesh(mesh: THREE.Mesh, operation: SolidOperation): void {
    this.setBrushOperationForMeshes([mesh], operation);
  }

  /**
   * Finalizes solid models after selected mesh transforms are committed.
   *
   * @param selectedMeshes Meshes that were edited.
   * @returns True when every selected mesh belongs to a solid model.
   */
  onTransformsCommitted(selectedMeshes: THREE.Mesh[]): boolean {
    // Invalidate any scheduled live rAF; commit will re-pull transforms and compile once.
    this.liveFlushToken += 1;
    this.liveRebuildQueued = false;
    this.pendingLiveMeshes = null;
    this.builtLiveGeneration = this.liveTransformGeneration;
    SolidBrushEdgeBatch.endLivePoseTracking();
    const models = this.collectAffectedModels(selectedMeshes);
    if (models.size === 0) return false;
    const selectedSet = new Set(selectedMeshes);
    const updatedResults: THREE.Mesh[] = [];
    for (const model of models) {
      this.finalizeModelAfterTransform(model, selectedSet);
      updatedResults.push(model.getResultMeshForSync());
    }
    solidRootClearBakeBaselines(models, this.solidRootBakeBaselines);
    this.panel.refresh();
    this.onLiveGeometryUpdated?.(updatedResults);
    this.refreshOutliner?.();
    return this.selectionIsSolidOnly(selectedMeshes);
  }

  /**
   * Moves selected solid brushes and solid CSG groups to first or last among
   * siblings under their own parent (undoable). Each parent tree is handled
   * independently so multi-select does not flatten hierarchy.
   *
   * @param nodes Brush meshes and/or solid CSG groups.
   * @param end Target end among siblings under each node's parent.
   */
  moveBrushesInOrder(nodes: THREE.Object3D[], end: SolidBrushOrderEnd): void {
    const reorderNodes = nodes.filter((node) => SolidBrushVisual.isBrushObject(node) || isSolidCsgGroup(node));
    if (reorderNodes.length === 0) return;
    const command = new CommandSolidBrushesReorder(reorderNodes, end);
    this.commandStack.push(command);
    this.panel.refresh();
    this.syncViewports?.();
    this.refreshOutliner?.();
    this.revealOutlinerAfterReorder(reorderNodes);
    this.showStatus?.(
      end === 'first' ? 'Moved selection to first in hierarchy order' : 'Moved selection to last in hierarchy order',
    );
  }

  /**
   * Scrolls the outliner to the most recently interacted reorder target after
   * To First / To Last so the row stays in view at its new sibling position.
   *
   * @param reorderNodes Nodes that were moved.
   */
  private revealOutlinerAfterReorder(reorderNodes: readonly THREE.Object3D[]): void {
    const focus = this.resolveOutlinerRevealFocusAfterReorder(reorderNodes);
    if (!focus) {
      return;
    }
    this.revealOutlinerObject?.(focus);
  }

  /**
   * Picks which hierarchy node to follow after a sibling reorder. Prefers a
   * node that was itself moved (last selected mesh, then inspector root), then
   * a descendant under a moved group, then the last moved node.
   *
   * @param reorderNodes Nodes that were moved.
   * @returns Focus object, or null when none is available.
   */
  private resolveOutlinerRevealFocusAfterReorder(reorderNodes: readonly THREE.Object3D[]): THREE.Object3D | null {
    const reorderSet = new Set(reorderNodes);
    const lastSelected = this.selectionManager.getLastSelectedObject();
    if (lastSelected && reorderSet.has(lastSelected)) {
      return lastSelected;
    }
    const inspectorObjects = this.selectionManager.getInspectorObjects();
    for (let index = inspectorObjects.length - 1; index >= 0; index--) {
      const inspectorObject = inspectorObjects[index];
      if (inspectorObject && reorderSet.has(inspectorObject)) {
        return inspectorObject;
      }
    }
    if (lastSelected && this.reorderNodesContainFocus(reorderNodes, lastSelected)) {
      return lastSelected;
    }
    for (let index = inspectorObjects.length - 1; index >= 0; index--) {
      const inspectorObject = inspectorObjects[index];
      if (inspectorObject && this.reorderNodesContainFocus(reorderNodes, inspectorObject)) {
        return inspectorObject;
      }
    }
    return reorderNodes[reorderNodes.length - 1] ?? null;
  }

  /**
   * Returns whether a focus object is one of the reordered nodes or a brush
   * under a reordered solid CSG group.
   *
   * @param reorderNodes Moved hierarchy nodes.
   * @param focus Candidate focus object.
   * @returns True when the focus belongs to the reorder set.
   */
  private reorderNodesContainFocus(reorderNodes: readonly THREE.Object3D[], focus: THREE.Object3D): boolean {
    for (const node of reorderNodes) {
      if (node === focus) {
        return true;
      }
      if (isSolidCsgGroup(node) && this.objectIsDescendantOf(focus, node)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Live CSG update while a solid brush is dragged. Coalesces to one rebuild
   * per animation frame, but never drops samples that arrive while CSG is still
   * running — those schedule a catch-up flush.
   *
   * @param selectedMeshes Meshes currently being transformed.
   */
  onTransformsLive(selectedMeshes: THREE.Mesh[]): void {
    if (!this.involvesSolidModels(selectedMeshes)) return;
    this.beginBrushWireframeLiveTracking(selectedMeshes);
    if (this.tryBakeSolidRootTransformsLive(selectedMeshes)) {
      return;
    }
    this.pendingLiveMeshes = selectedMeshes;
    this.liveTransformGeneration += 1;
    this.scheduleLiveRebuild();
  }

  /**
   * Attaches personal brush edges and drops those brushes from static batches
   * for the duration of a live transform so wireframes stay glued to the mesh.
   *
   * @param selectedMeshes Meshes currently being transformed.
   */
  private beginBrushWireframeLiveTracking(selectedMeshes: THREE.Mesh[]): void {
    SolidBrushEdgeBatch.beginLivePoseTracking(selectedMeshes);
  }

  /**
   * Immediately bakes solid result mesh transforms into solid roots when only
   * result meshes are selected (no CSG rebuild required).
   *
   * @param selectedMeshes Current transform selection.
   * @returns True when all affected models were handled by root bake.
   */
  private tryBakeSolidRootTransformsLive(selectedMeshes: THREE.Mesh[]): boolean {
    const selectedSet = new Set(selectedMeshes);
    const models = this.collectAffectedModels(selectedMeshes);
    if (models.size === 0) return false;
    let handledAll = true;
    const updatedResults: THREE.Mesh[] = [];
    for (const model of models) {
      if (this.bakeSolidRootTransformIfOnlyResultSelected(model, selectedSet)) {
        updatedResults.push(model.getResultMeshForSync());
        continue;
      }
      handledAll = false;
    }
    if (updatedResults.length > 0) {
      this.onLiveGeometryUpdated?.(updatedResults);
    }
    return handledAll;
  }

  /**
   * Returns true when any selected mesh belongs to a solid model.
   *
   * @param meshes Candidate meshes.
   * @returns True when at least one mesh belongs to a solid model.
   */
  involvesSolidModels(meshes: THREE.Mesh[]): boolean {
    return meshes.some((mesh) => SolidModel.fromObject(mesh) !== null);
  }

  /** Schedules a live CSG flush on the next animation frame when idle. */
  private scheduleLiveRebuild(): void {
    if (this.liveRebuildQueued || this.liveRebuildInProgress) return;
    this.liveRebuildQueued = true;
    const token = ++this.liveFlushToken;
    requestAnimationFrame(() => {
      if (token !== this.liveFlushToken) return;
      this.flushLiveRebuild();
    });
  }

  /**
   * Applies the latest pending brush transforms into solid result geometry.
   * Re-queues itself when newer samples arrived during a long compile.
   */
  private flushLiveRebuild(): void {
    this.liveRebuildQueued = false;
    const meshes = this.pendingLiveMeshes;
    if (!meshes || meshes.length === 0) return;
    const generationAtStart = this.liveTransformGeneration;
    this.liveRebuildInProgress = true;
    const models = this.collectAffectedModels(meshes);
    const updatedResults: THREE.Mesh[] = [];
    const locks = this.getTextureLockFlagsForActiveTransform();
    try {
      for (const model of models) {
        model.setUvStickToBrush(locks.positionLock || locks.stretchLock);
        if (!model.prepareLiveBrushEdit(meshes, locks)) continue;
        model.rebuildLive();
        updatedResults.push(model.getResultMeshForSync());
      }
    } finally {
      this.liveRebuildInProgress = false;
      this.builtLiveGeneration = generationAtStart;
    }
    if (updatedResults.length > 0) {
      this.onLiveGeometryUpdated?.(updatedResults);
    }
    if (this.liveTransformGeneration !== this.builtLiveGeneration) {
      this.scheduleLiveRebuild();
    }
  }

  /**
   * When only the solid result mesh is selected, folds its local transform into
   * the solid model root so the whole solid moves without a CSG rebuild.
   *
   * @param model Solid model.
   * @param selectedSet Selected meshes.
   * @returns True when a root bake was applied.
   */
  private bakeSolidRootTransformIfOnlyResultSelected(model: SolidModel, selectedSet: Set<THREE.Mesh>): boolean {
    const result = model.getResultMesh();
    if (!selectedSet.has(result)) return false;
    const brushSelected = model.getBrushes().some((brush) => brush.mesh && selectedSet.has(brush.mesh));
    if (brushSelected) return false;
    solidRootBakeResultTransform(model, this.solidRootBakeBaselines);
    return true;
  }

  /** Reacts to scene selection changes by binding the tools panel. */
  private onSelectionChanged(): void {
    this.bindPanelToSelection();
    this.updateBrushInsertParentFromSelection();
  }

  /**
   * Binds the tools panel to the solid model owning the current selection. Does
   * not clear the last active model when selection is empty (post-delete).
   */
  private bindPanelToSelection(): void {
    const selectedModel = this.findSelectedSolidModel();
    if (selectedModel) {
      this.rememberActiveModel(selectedModel);
      return;
    }
    const remembered = this.resolveRememberedModel();
    if (remembered) {
      this.panel.setModel(remembered);
    }
  }

  /**
   * Resolves where a new box brush should be parented under the active solid.
   * Prefers the current selection (brush parent or selected CSG group), then
   * the last remembered parent still valid for this model.
   *
   * @param model Active solid model.
   * @returns Solid root or solid CSG group.
   */
  private resolveBrushInsertParent(model: SolidModel): THREE.Object3D {
    const fromSelection = this.resolveBrushInsertParentFromSelection(model);
    if (fromSelection) {
      this.lastBrushInsertParent = fromSelection;
      return fromSelection;
    }
    if (this.lastBrushInsertParent && this.isValidBrushInsertParent(model, this.lastBrushInsertParent)) {
      return this.lastBrushInsertParent;
    }
    return model.root;
  }

  /**
   * Derives an insert parent from the current selection under a solid model.
   *
   * @param model Active solid model.
   * @returns Parent object, or null when selection does not imply one.
   */
  private resolveBrushInsertParentFromSelection(model: SolidModel): THREE.Object3D | null {
    const lastMesh = this.selectionManager.getLastSelectedObject();
    if (lastMesh) {
      const fromMesh = this.brushInsertParentFromObject(model, lastMesh);
      if (fromMesh) return fromMesh;
    }
    for (const object of this.selectionManager.getInspectorObjects()) {
      const fromObject = this.brushInsertParentFromObject(model, object);
      if (fromObject) return fromObject;
    }
    return null;
  }

  /**
   * Maps a selected object to a brush insert parent under the given model.
   * Brushes contribute their parent; solid CSG groups and the solid root are
   * used directly.
   *
   * @param model Active solid model.
   * @param object Selected hierarchy object.
   * @returns Insert parent, or null when the object is not under this model.
   */
  private brushInsertParentFromObject(model: SolidModel, object: THREE.Object3D): THREE.Object3D | null {
    if (object === model.root) return model.root;
    if (isSolidCsgGroup(object) && findSolidModelRoot(object) === model.root) {
      return object;
    }
    if (SolidBrushVisual.isBrushObject(object)) {
      const brushModel = SolidModel.fromObject(object);
      if (brushModel !== model) return null;
      const parent = object.parent;
      if (parent && this.isValidBrushInsertParent(model, parent)) return parent;
    }
    return null;
  }

  /**
   * Returns whether a parent may receive new brushes for the model.
   *
   * @param model Solid model.
   * @param parent Candidate parent.
   * @returns True when parent is the solid root or a CSG group under it.
   */
  private isValidBrushInsertParent(model: SolidModel, parent: THREE.Object3D): boolean {
    return isValidSolidTreeParent(model.root, parent, model.root);
  }

  /** Updates remembered brush insert parent when selection is under a solid. */
  private updateBrushInsertParentFromSelection(): void {
    const model = this.findSelectedSolidModel();
    if (!model) return;
    const parent = this.resolveBrushInsertParentFromSelection(model);
    if (parent) this.lastBrushInsertParent = parent;
  }

  /**
   * Finds a solid model from the current selection.
   *
   * @returns Solid model or null.
   */
  private findSelectedSolidModel(): SolidModel | null {
    for (const object of this.selectionManager.getInspectorObjects()) {
      const model = SolidModel.fromObject(object);
      if (model) return model;
    }
    for (const mesh of this.selectionManager.getSelectedObjects()) {
      const model = SolidModel.fromObject(mesh);
      if (model) return model;
    }
    return null;
  }

  /**
   * Resolves the active model from selection, panel, or last remembered model.
   *
   * @returns Solid model or null.
   */
  private resolveActiveModel(): SolidModel | null {
    const selected = this.findSelectedSolidModel();
    if (selected) {
      this.rememberActiveModel(selected);
      return selected;
    }
    const fromPanel = this.panel.getModel();
    if (fromPanel && this.isModelStillInScene(fromPanel)) {
      this.lastActiveModel = fromPanel;
      return fromPanel;
    }
    return this.resolveRememberedModel();
  }

  /**
   * Stores a model as the current working solid for tools and the panel.
   *
   * @param model Solid model to remember.
   */
  private rememberActiveModel(model: SolidModel): void {
    this.lastActiveModel = model;
    this.panel.setModel(model);
  }

  /**
   * Returns the last active model when it is still parented in the world.
   *
   * @returns Solid model or null.
   */
  private resolveRememberedModel(): SolidModel | null {
    if (!this.lastActiveModel) return null;
    if (!this.isModelStillInScene(this.lastActiveModel)) {
      this.lastActiveModel = null;
      return null;
    }
    return this.lastActiveModel;
  }

  /**
   * Returns whether a solid model root is still attached under the world.
   *
   * @param model Candidate solid model.
   * @returns True when the model root is still under the world.
   */
  private isModelStillInScene(model: SolidModel): boolean {
    let current: THREE.Object3D | null = model.root;
    while (current) {
      if (current === this.worldObject) return true;
      current = current.parent;
    }
    return false;
  }

  /**
   * Finds the first solid model root under the world hierarchy.
   *
   * @returns Solid model or null when none exist.
   */
  private findFirstSolidModelInWorld(): SolidModel | null {
    let found: SolidModel | null = null;
    this.worldObject.traverse((object) => {
      if (found) return;
      if (!SolidModel.isSolidModelObject(object)) return;
      found = SolidModel.fromObject(object);
    });
    return found;
  }

  /**
   * Collects unique solid models touched by the given meshes.
   *
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
   * Applies post-transform rules for one solid model and finalizes geometry.
   *
   * @param model Solid model.
   * @param selectedSet Selected meshes from the edit.
   */
  private finalizeModelAfterTransform(model: SolidModel, selectedSet: Set<THREE.Mesh>): void {
    const result = model.getResultMesh();
    const resultSelected = selectedSet.has(result);
    const selectedBrushMeshes = this.collectSelectedBrushMeshes(model, selectedSet);
    if (resultSelected && selectedBrushMeshes.length === 0) {
      if (solidObjectIsLocalIdentityPose(result)) {
        return;
      }
      solidRootBakeResultTransform(model, this.solidRootBakeBaselines);
      model.markDirty();
      model.rebuild(true);
      return;
    }
    if (resultSelected) {
      solidResultResetLocalTransform(result);
    }
    const locks = this.getTextureLockFlagsForActiveTransform();
    model.setUvStickToBrush(locks.positionLock || locks.stretchLock);
    if (selectedBrushMeshes.length > 0) {
      model.prepareLiveBrushEdit(selectedBrushMeshes, locks);
    } else {
      model.syncBrushesFromScene(locks);
    }
    this.ensureTransformedBrushesDirty(model, selectedBrushMeshes);
    model.finalizeAfterInteractiveEdit();
  }

  /**
   * Collects solid brush preview meshes that belong to the model and appear in
   * the transform selection set.
   *
   * @param model Solid model.
   * @param selectedSet Meshes from the transform commit.
   * @returns Brush meshes from the model that are in the selection set.
   */
  private collectSelectedBrushMeshes(model: SolidModel, selectedSet: Set<THREE.Mesh>): THREE.Mesh[] {
    const meshes: THREE.Mesh[] = [];
    for (const mesh of selectedSet) {
      if (!model.findBrushByMesh(mesh)) continue;
      meshes.push(mesh);
    }
    return meshes;
  }

  /**
   * Marks each transformed solid brush dirty on the model.
   *
   * @param model Solid model.
   * @param brushMeshes Transformed brush meshes.
   */
  private ensureTransformedBrushesDirty(model: SolidModel, brushMeshes: readonly THREE.Mesh[]): void {
    if (brushMeshes.length === 0) return;
    const dirtyIds: string[] = [];
    for (const mesh of brushMeshes) {
      const brush = model.findBrushByMesh(mesh);
      if (brush) dirtyIds.push(brush.id);
    }
    if (dirtyIds.length > 0) {
      model.markBrushesDirty(dirtyIds);
    }
  }

  /**
   * Returns current position/stretch lock flags from the toolbar settings.
   *
   * @returns Lock flags (both off when settings are missing).
   */
  private getTextureLockFlags(): TextureLockFlags {
    if (!this.textureLock) {
      return { positionLock: false, stretchLock: false };
    }
    return this.textureLock.getFlags();
  }

  /**
   * Returns texture lock flags for the active transform mode. Rotation forces
   * both position and stretch locks on.
   *
   * @returns Effective texture lock flags for the current gizmo mode.
   */
  private getTextureLockFlagsForActiveTransform(): TextureLockFlags {
    const mode = this.getTransformMode?.() ?? null;
    if (mode === TransformMode.ROTATE) {
      return { positionLock: true, stretchLock: true };
    }
    return this.getTextureLockFlags();
  }

  /**
   * Returns whether every selected mesh belongs to a solid model hierarchy.
   *
   * @param meshes Selection to inspect.
   * @returns True when every mesh belongs to a solid model.
   */
  private selectionIsSolidOnly(meshes: THREE.Mesh[]): boolean {
    if (meshes.length === 0) return false;
    return meshes.every((mesh) => SolidModel.fromObject(mesh) !== null);
  }

  /**
   * Computes a grid-snapped local position for a new brush under a solid model.
   * Uses occlusion-aware view-ray placement so brushes land in front of walls
   * the camera is looking at; falls back to model origin without a camera.
   *
   * @param model Target solid model.
   * @returns Local position relative to the solid model root.
   */
  private computeNewBrushLocalPosition(model: SolidModel): THREE.Vector3 {
    const camera = this.getActiveCamera?.() ?? null;
    if (!camera) {
      return new THREE.Vector3(0, 0, 0);
    }
    const worldPosition = computeOcclusionAwareSpawnPosition({
      camera,
      preferredDistance: DEFAULT_SPAWN_DISTANCE,
      gridInterval: 0,
      raycastRoot: this.worldObject,
      objectRadius: SOLID_MODEL_STARTUP_DEFAULT_BRUSH_SIZE * 0.5,
    });
    this.snapWorldSpawnPosition(worldPosition);
    model.root.updateMatrixWorld(true);
    return model.root.worldToLocal(worldPosition.clone());
  }

  /**
   * Snaps a world spawn position to the oriented grid lattice when available.
   *
   * @param worldPosition World position modified in place.
   */
  private snapWorldSpawnPosition(worldPosition: THREE.Vector3): void {
    const gridSnap = this.getGridSnap?.() ?? null;
    if (gridSnap && gridSnap.isEnabled()) {
      gridSnap.snapWorldPosition(worldPosition);
      return;
    }
    const gridInterval = this.getGridInterval?.() ?? 0;
    if (gridInterval > 0) {
      snapPositionToGrid(worldPosition, gridInterval);
    }
  }

  /**
   * Resolves model-local rotation so the brush X/Y/Z match the working grid.
   *
   * @param model Solid model that will own the brush.
   * @returns Model-local Euler rotation.
   */
  private computeNewBrushModelLocalRotation(model: SolidModel): THREE.Euler {
    const gridOrientation = this.getGridOrientation?.() ?? null;
    if (!gridOrientation) {
      return new THREE.Euler(0, 0, 0, 'XYZ');
    }
    model.root.updateMatrixWorld(true);
    model.root.getWorldQuaternion(this.scratchRootWorldQuaternion);
    gridOrientation.copyQuaternionTo(this.scratchGridWorldQuaternion);
    this.scratchModelLocalQuaternion
      .copy(this.scratchRootWorldQuaternion)
      .invert()
      .multiply(this.scratchGridWorldQuaternion);
    this.scratchModelLocalEuler.setFromQuaternion(this.scratchModelLocalQuaternion, 'XYZ');
    return this.scratchModelLocalEuler.clone();
  }
}
