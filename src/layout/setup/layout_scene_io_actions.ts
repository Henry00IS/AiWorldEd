import type { CommandStack } from '@/commands/command_stack.js';
import type { EditorSettingsStore } from '@/settings/store/editor_settings_store.js';
import { modelExportDialogShow } from '@/ui/export/dialog_model_export.js';
import { objImportDialogShow } from '@/ui/import/dialog_obj_import.js';
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
import { CommandPrimitiveCreate } from '@/tools/creation/commands/command_primitive_create.js';
import { CommandObjectGroup } from '@/outliner/commands/command_object_group.js';
import { buildObjImportGroupBaseName } from '@/io/obj/obj_importer.js';
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
   * Full visual refresh (selection/hulls, CAD rulers, gizmo, outliner). Must be
   * the same path used after inspector transforms.
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
  context.commandStack.markSavedPoint();
  context.clipPlaneHandler?.reattachPreviewToWorld();
  hierarchyNameAllocator.rebuildFromWorld(context.worldObject);
  context.refreshAfterWorldMutation();
}

/** Dependencies for undo / redo side effects, including status feedback. */
export interface LayoutHistoryChangeContext extends LayoutSceneRefreshContext {
  /** Writes the history feedback message to the status bar. */
  showStatusMessage: (message: string) => void;
}

/**
 * Applies undo or redo and refreshes dependent editor UI state.
 *
 * @param context History change dependencies.
 * @param direction Whether to undo or redo the top command.
 */
export function applyLayoutHistoryChange(context: LayoutHistoryChangeContext, direction: 'undo' | 'redo'): void {
  const wasApplied = direction === 'undo' ? context.commandStack.undo() : context.commandStack.redo();
  context.selectionManager.pruneSelectionNotInScene(context.worldObject);
  context.snapSettingsController.rebakeWorldTexturesIfLocked();
  SolidModel.refreshAfterHistoryChange(context.worldObject);
  context.faceModeCoordinator.getFaceExtrusionController().pruneInvalidFaceSelection(context.worldObject);
  context.refreshAfterWorldMutation();
  context.showStatusMessage(buildLayoutHistoryChangeStatusMessage(direction, wasApplied));
}

/**
 * Builds the status bar message reporting the outcome of an undo or redo.
 *
 * @param direction Whether undo or redo was requested.
 * @param wasApplied True when a command was actually undone or redone.
 * @returns Feedback message for the status bar.
 */
export function buildLayoutHistoryChangeStatusMessage(direction: 'undo' | 'redo', wasApplied: boolean): string {
  if (direction === 'undo') {
    return wasApplied ? 'Undo' : 'Nothing to undo';
  }
  return wasApplied ? 'Redo' : 'Nothing to redo';
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
 * Loads a Wavefront OBJ file, asking which program wrote it when the file does
 * not say, and places content meshes with undo support.
 *
 * @param host DOM host for the dialog.
 * @param store Editor settings (the remembered Source Program).
 * @param sceneIOHandler Scene file dialog and import handler.
 * @param statusBar Status bar for progress and errors.
 * @param worldObject World root receiving imported meshes.
 * @param commandStack Undo stack for create commands.
 * @param refreshAfterWorldMutation Callback after the world graph changes.
 */
export async function runLayoutObjImport(
  host: HTMLElement,
  store: EditorSettingsStore,
  sceneIOHandler: HandlerSceneIo,
  statusBar: StatusBar | null,
  worldObject: THREE.Group,
  commandStack: CommandStack,
  refreshAfterWorldMutation: () => void,
): Promise<void> {
  const result = await sceneIOHandler.importObj(
    statusBar,
    async () => (await objImportDialogShow(host, store))?.objSpace ?? null,
  );
  if (!result) {
    return;
  }
  placeImportedObjMeshes(result.meshes, result.sourceFileName, worldObject, commandStack);
  refreshAfterWorldMutation();
}

/**
 * Parents imported OBJ meshes into the world. A single mesh is added directly;
 * multiple meshes share one undoable group named from the file stem.
 *
 * @param meshes Imported content meshes.
 * @param sourceFileName Source file path or name.
 * @param worldObject World root.
 * @param commandStack Undo stack.
 */
export function placeImportedObjMeshes(
  meshes: readonly THREE.Mesh[],
  sourceFileName: string,
  worldObject: THREE.Group,
  commandStack: CommandStack,
): void {
  if (meshes.length === 0) {
    return;
  }
  if (meshes.length === 1) {
    commandStack.push(new CommandPrimitiveCreate(meshes[0]!, worldObject));
    return;
  }
  const groupName = hierarchyNameAllocator.allocate(buildObjImportGroupBaseName(sourceFileName));
  commandStack.push(new CommandObjectGroup([...meshes], worldObject, groupName));
}

/**
 * Opens the Export dialog and exports the world as chosen there.
 *
 * @param host DOM host for the dialogs.
 * @param sceneIOHandler Scene I/O handler.
 * @param worldObject Root world group.
 * @param statusBar Status bar for progress.
 * @param store Editor settings (remembered choices).
 * @param fileName Suggested file name without extension.
 */
export async function runLayoutExportModel(
  host: HTMLElement,
  sceneIOHandler: HandlerSceneIo,
  worldObject: THREE.Group,
  statusBar: StatusBar | null,
  store: EditorSettingsStore,
  fileName: string,
): Promise<void> {
  const answer = await modelExportDialogShow({
    host,
    store,
    pickFolder: sceneIOHandler.exportFolderPicker(),
    folder: await sceneIOHandler.exportFolderRecall(),
    fileName,
  });
  if (answer === null) return;
  await sceneIOHandler.exportModel(worldObject, statusBar, answer);
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
 * Saves the scene and marks the history saved point on success, so the unload
 * guard stops warning. Edits made while the save dialog was open keep the scene
 * dirty, because they are not in the written file.
 *
 * @param sceneIOHandler Scene save handler.
 * @param worldObject Root world group to serialize.
 * @param statusBar Status bar for feedback.
 * @param commandStack History whose saved point is updated.
 * @param alwaysPrompt True for Save As: always show the save picker.
 * @returns True when the scene was written.
 */
export async function runLayoutSaveScene(
  sceneIOHandler: HandlerSceneIo,
  worldObject: THREE.Group,
  statusBar: StatusBar | null,
  commandStack: CommandStack,
  alwaysPrompt = false,
): Promise<boolean> {
  const revisionAtSerialize = commandStack.getHistoryRevision();
  const saved = await sceneIOHandler.saveScene(worldObject, statusBar, alwaysPrompt);
  if (saved && commandStack.getHistoryRevision() === revisionAtSerialize) {
    commandStack.markSavedPoint();
  }
  return saved;
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
