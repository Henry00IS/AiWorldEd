import type { CommandStack } from '@/commands/command_stack.js';
import type { GameProfile } from '@/settings/store/settings_types.js';
import type { SolidModelController } from '@/solid/controller/solid_model_controller.js';
import type { HandlerClipPlane } from '@/tools/clip_plane/handler_clip_plane.js';
import type { CoordinatorFaceMode } from '@/tools/face/coordinator_face_mode.js';
import type { HandlerSceneIo } from '@/tools/io/handler_scene_io.js';
import type { ManagerSelection } from '@/selection/object/manager_selection.js';
import type { ControllerSnapSettings } from '@/tools/snap/controller_snap_settings.js';
import type { PanelProperties } from '@/ui/properties/panel_properties.js';
import type { StatusBar } from '@/ui/status/status_bar.js';
import { showMessageBox } from '@/ui/dialog/dialog_message_box.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { createSolidModelStartupDefault } from '@/solid/model/solid_model_startup_default.js';
import { hierarchyNameAllocator } from '@/utils/utils_hierarchy_name_allocator.js';
import type * as THREE from 'three';

/** Dependencies for scene load / history refresh side effects. */
export interface LayoutSceneRefreshContext {
  selectionManager: ManagerSelection;
  faceModeCoordinator: CoordinatorFaceMode;
  commandStack: CommandStack;
  clipPlaneHandler: HandlerClipPlane | null;
  snapSettingsController: ControllerSnapSettings;
  worldObject: THREE.Object3D;
  propertiesPanel: PanelProperties;
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
  hierarchyNameAllocator.rebuildFromWorld(context.worldObject);
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
  context.faceModeCoordinator.getFaceExtrusionController().pruneInvalidFaceSelection(context.worldObject);
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
  sceneIOHandler: HandlerSceneIo,
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
 * Exports the world as canonical glTF GLB content.
 *
 * @param sceneIOHandler Scene I/O handler.
 * @param worldObject Root world group.
 * @param statusBar Status bar for progress.
 */
export function runLayoutExportGlb(
  sceneIOHandler: HandlerSceneIo,
  worldObject: THREE.Group,
  statusBar: StatusBar | null,
): void {
  void sceneIOHandler.exportGlb(worldObject, statusBar);
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
  sceneIOHandler: HandlerSceneIo,
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
  sceneIOHandler: HandlerSceneIo,
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
  sceneIOHandler: HandlerSceneIo,
  worldObject: THREE.Group,
  commandStack: CommandStack,
  statusBar: StatusBar | null,
  solidModelController: SolidModelController | null,
  onSceneCleared: () => void,
): Promise<void> {
  const shouldPrompt = sceneIOHandler.hasSceneContent(worldObject) || commandStack.canUndo() || commandStack.canRedo();
  if (shouldPrompt) {
    const confirmed = await showMessageBox({
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
  sceneIOHandler: HandlerSceneIo,
  worldObject: THREE.Group,
  statusBar: StatusBar | null,
): void {
  sceneIOHandler.clearScene(worldObject, statusBar);
  hierarchyNameAllocator.reset();
  worldObject.add(createSolidModelStartupDefault().root);
  if (statusBar) {
    statusBar.setLastAction('Created new scene');
    statusBar.setLastSavedInfo('untitled');
  }
}
