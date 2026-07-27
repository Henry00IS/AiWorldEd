import type { CommandStack } from '../../commands/command_stack.js';
import type { GameProfile } from '../../settings/settings_types.js';
import type { SolidModelController } from '../solid/solid_model_controller.js';
import type { ClipPlaneHandler } from '../clip_plane/clip_plane_handler.js';
import type { FaceModeCoordinator } from '../face/face_mode_coordinator.js';
import type { SceneIOHandler } from '../tools/scene_io_handler.js';
import type { SelectionManager } from '../../selection/object/selection_manager.js';
import type { SnapSettingsController } from '../tools/snap_settings_controller.js';
import type { PropertiesPanel } from '../../ui/properties/properties_panel.js';
import type { StatusBar } from '../../ui/status_bar.js';
import { showConfirmDialog } from '../../ui/confirm_dialog.js';
import { SolidModel } from '../../solid/model/solid_model.js';
import { createDefaultStartupSolidModel } from '../../solid/model/default_startup_solid_model.js';
import type * as THREE from 'three';

/** Dependencies for scene load / history refresh side effects. */
export interface LayoutSceneRefreshContext {
  selectionManager: SelectionManager;
  faceModeCoordinator: FaceModeCoordinator;
  commandStack: CommandStack;
  clipPlaneHandler: ClipPlaneHandler | null;
  snapSettingsController: SnapSettingsController;
  worldObject: THREE.Object3D;
  propertiesPanel: PropertiesPanel;
  /**
   * Full visual refresh (clones, selection/hulls, CAD rulers, gizmo, outliner).
   * Must be the same path used after inspector transforms.
   */
  refreshAfterWorldMutation: () => void;
}

/**
 * Handles post-load synchronization and UI refresh after a scene file loads.
 *
 * @param context Scene refresh dependencies.
 */
export function handleLayoutSceneLoaded(context: LayoutSceneRefreshContext): void {
  context.selectionManager.clearSelection();
  context.faceModeCoordinator.getFaceExtrusionController().clearFaceSelection();
  context.commandStack.clear();
  context.clipPlaneHandler?.reattachPreviewToWorld();
  context.refreshAfterWorldMutation();
}

/**
 * Applies undo or redo and refreshes dependent editor UI state.
 *
 * @param context Scene refresh dependencies.
 * @param direction Whether to undo or redo the top command.
 */
export function applyLayoutHistoryChange(context: LayoutSceneRefreshContext, direction: 'undo' | 'redo'): void {
  if (direction === 'undo') context.commandStack.undo();
  else context.commandStack.redo();
  context.selectionManager.pruneSelectionNotInScene(context.worldObject);
  context.snapSettingsController.rebakeWorldTexturesIfLocked();
  SolidModel.refreshAfterHistoryChange(context.worldObject);
  // After solid remesh, drop face selections for deleted brushes/surfaces only.
  context.faceModeCoordinator.getFaceExtrusionController().pruneInvalidFaceSelection(context.worldObject);
  // refreshAfterWorldMutation owns clones, selection, hulls, rulers, gizmo, and
  // properties re-read — same contract as inspector transform commits.
  context.refreshAfterWorldMutation();
}

/**
 * Loads a VMF file, builds a solid model, and places it with undo support.
 *
 * @param sceneIOHandler Scene file dialog and import handler.
 * @param statusBar Status bar for progress and errors.
 * @param solidModelController Solid model placement controller.
 * @param refreshAfterWorldMutation Callback after the world graph changes.
 */
export async function runLayoutVmfImport(
  sceneIOHandler: SceneIOHandler,
  statusBar: StatusBar | null,
  solidModelController: SolidModelController | null,
  refreshAfterWorldMutation: () => void,
): Promise<void> {
  const result = await sceneIOHandler.importVmf(statusBar);
  if (!result) return;
  if (!solidModelController) {
    statusBar?.setErrorText('Solid model tools are not ready');
    return;
  }
  solidModelController.placeImportedModel(result.model, `Imported ${result.importedBrushCount} brushes from VMF`);
  refreshAfterWorldMutation();
}

/**
 * Exports the world as GLB using the active game profile when available.
 *
 * @param sceneIOHandler Scene I/O handler.
 * @param worldObject Root world group.
 * @param statusBar Status bar for progress.
 * @param profile Active game profile or null.
 */
export function runLayoutExportGlb(
  sceneIOHandler: SceneIOHandler,
  worldObject: THREE.Group,
  statusBar: StatusBar | null,
  profile: GameProfile | null,
): void {
  void sceneIOHandler.exportGlb(worldObject, statusBar, profile);
}

/**
 * Exports the world as Wavefront OBJ using the active game profile when
 * available.
 *
 * @param sceneIOHandler Scene I/O handler.
 * @param worldObject Root world group.
 * @param statusBar Status bar for progress.
 * @param profile Active game profile or null.
 */
export function runLayoutExportObj(
  sceneIOHandler: SceneIOHandler,
  worldObject: THREE.Group,
  statusBar: StatusBar | null,
  profile: GameProfile | null,
): void {
  void sceneIOHandler.exportObj(worldObject, statusBar, profile);
}

/**
 * Exports the world as Autodesk FBX using the active game profile when
 * available.
 *
 * @param sceneIOHandler Scene I/O handler.
 * @param worldObject Root world group.
 * @param statusBar Status bar for progress.
 * @param profile Active game profile or null.
 */
export function runLayoutExportFbx(
  sceneIOHandler: SceneIOHandler,
  worldObject: THREE.Group,
  statusBar: StatusBar | null,
  profile: GameProfile | null,
): void {
  void sceneIOHandler.exportFbx(worldObject, statusBar, profile);
}

/**
 * Prompts to discard unsaved work, then resets the world to the same default
 * solid model cube used at editor startup.
 *
 * @param host DOM host for the confirmation dialog.
 * @param sceneIOHandler Scene clear helper.
 * @param worldObject Root world group.
 * @param commandStack Undo history to abandon after clearing.
 * @param statusBar Status bar for feedback.
 * @param solidModelController Solid controller to adopt the seeded model, or
 *   null when solid tools are not ready.
 * @param onSceneCleared Callback after the default scene is restored.
 */
export async function runLayoutNewScene(
  host: HTMLElement,
  sceneIOHandler: SceneIOHandler,
  worldObject: THREE.Group,
  commandStack: CommandStack,
  statusBar: StatusBar | null,
  solidModelController: SolidModelController | null,
  onSceneCleared: () => void,
): Promise<void> {
  const shouldPrompt = sceneIOHandler.hasSceneContent(worldObject) || commandStack.canUndo() || commandStack.canRedo();
  if (shouldPrompt) {
    const confirmed = await showConfirmDialog({
      host,
      title: 'Create New Scene',
      message: 'Are you sure you want to create a new scene?\n\nAny unsaved changes will be permanently lost.',
      confirmLabel: 'Yes',
      cancelLabel: 'No',
    });
    if (!confirmed) return;
  }
  seedDefaultStartupScene(sceneIOHandler, worldObject, statusBar);
  onSceneCleared();
  solidModelController?.adoptFirstSolidModelInWorld();
}

/**
 * Clears world content and parents the startup default solid model (unit cube).
 *
 * @param sceneIOHandler Scene clear helper.
 * @param worldObject Root world group.
 * @param statusBar Status bar for feedback.
 */
function seedDefaultStartupScene(
  sceneIOHandler: SceneIOHandler,
  worldObject: THREE.Group,
  statusBar: StatusBar | null,
): void {
  sceneIOHandler.clearScene(worldObject, statusBar);
  worldObject.add(createDefaultStartupSolidModel().root);
  if (statusBar) {
    statusBar.setLastAction('Created new scene');
    statusBar.setLastSavedInfo('untitled');
  }
}
