import type * as THREE from 'three';
import type { ProjectHistoryThumbnailCapture } from '@/project/history/core/project_history_store.js';
import type { CommandStack } from '@/commands/command_stack.js';
import type { LoaderCollaborationMenu } from '@/collaboration/loader/loader_collaboration_menu.js';
import { ControllerProjectEditor } from '@/project/host/controller_project_editor.js';
import type { HostProjectEditor } from '@/project/host/host_project_editor.js';
import type { SolidModelController } from '@/solid/controller/solid_model_controller.js';
import type { ControllerTextureBrowser } from '@/texture/controller/controller_texture_browser.js';
import {
  bindFloatingPanelToViewports,
  scheduleStartupFloatingPanelLayoutPass,
} from '@/tools/clip_plane/layout/layout_clip_tools_setup.js';
import { getTextureMapCache } from '@/texture/library/texture_map_cache.js';
import type { HandlerSceneIo } from '@/tools/io/handler_scene_io.js';
import { showMessageBox } from '@/ui/dialog/dialog_message_box.js';
import type { StatusBar } from '@/ui/status/status_bar.js';
import type { Toolbar } from '@/ui/toolbar/toolbar.js';
import type { ViewportEditor } from '@/viewports/core/viewport_editor.js';
import { layoutCollaborationSceneBlocked } from './layout_collaboration_host.js';
import { placeImportedObjMeshes } from './layout_scene_io_actions.js';
import { runLayoutGlbImportBytes, type LayoutGlbImportParts } from './layout_glb_import.js';
import { runLayoutFbxImportBytes } from './layout_fbx_import.js';
import { projectFolderCurrentSet } from '@/project/fs/project_folder_current.js';
import type { ProjectModelPlacement } from '@/project/host/host_project_editor.js';
import {
  modelSpawnPlace,
  type ModelContentShift,
  type ModelSpawnPosition,
} from '@/navigation/placement/model_spawn_placement.js';
import { textureEmbeddedIdsIn } from '@/texture/embedded/texture_embedded_references.js';
import { sceneTextureIds } from '@/io/scene/scene_texture_ids.js';
import { objImportDialogShow } from '@/ui/import/dialog_obj_import.js';
import type { EditorSettingsStore } from '@/settings/store/editor_settings_store.js';

/** Folder icon of the Project toolbar button. */
const LAYOUT_PROJECT_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="25" height="25" aria-hidden="true">' +
  '<path fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" ' +
  'd="M3.5 6.5a1 1 0 0 1 1-1h5l2 2h8a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1z"/>' +
  '<path fill="none" stroke="currentColor" stroke-width="1.5" d="M3.5 10h17"/></svg>';

/** Editor parts the project folder features use. */
export interface LayoutProjectHostParts {
  toolbar: Toolbar;
  container: HTMLElement;
  world: THREE.Group;
  commandStack: CommandStack;
  statusBar: StatusBar | null;
  sceneIo: HandlerSceneIo;
  collaborationMenu: LoaderCollaborationMenu;
  textureBrowserController: ControllerTextureBrowser;
  solidModelController: () => SolidModelController | null;
  viewports: () => readonly ViewportEditor[];
  sceneLoaded: () => void;
  refresh: () => void;
  /** Spawn rule of new volumes, for models opened from the project. */
  spawnPosition: ModelSpawnPosition;
  /** Grid step the minimum corner of a placed model snaps to. */
  gridInterval: () => number;
  /** Editor settings (the OBJ import's Source Program). */
  settingsStore: () => EditorSettingsStore;
  /** Takes the thumbnail of a saved level state. */
  historyThumbnail: ProjectHistoryThumbnailCapture;
}

/**
 * Creates the project folder features, adds the Project toolbar button next to
 * the texture browser button and restores the last project.
 *
 * @param parts Editor parts.
 * @returns Project editor controller, or null without a texture browser.
 */
export function installLayoutProject(
  parts: Omit<LayoutProjectHostParts, 'textureBrowserController'> & {
    textureBrowserController: ControllerTextureBrowser | null;
  },
): ControllerProjectEditor | null {
  const textureBrowserController = parts.textureBrowserController;
  if (textureBrowserController === null) return null;
  return installLayoutProjectEditor({ ...parts, textureBrowserController });
}

/**
 * Creates the project editor for a layout with a texture browser.
 *
 * @param parts Editor parts.
 * @returns Project editor controller.
 */
function installLayoutProjectEditor(parts: LayoutProjectHostParts): ControllerProjectEditor {
  const host = createLayoutProjectHost(parts, () => editor);
  const editor: ControllerProjectEditor = new ControllerProjectEditor(host);
  bindFloatingPanelToViewports(editor.panel, parts.viewports);
  scheduleStartupFloatingPanelLayoutPass(editor.panel, parts.viewports);
  parts.textureBrowserController.setProject(
    async () => void (await editor.openOrReopen()),
    () => editor.project.fileSystem() !== null,
  );
  editor.project.listenerAdd((event) => {
    if (event.type === 'opened' || event.type === 'closed') projectFolderCurrentSet(editor.project.fileSystem());
  });
  parts.collaborationMenu.historyOpenerSet(() => void editor.history.open());
  const button = parts.toolbar.addIconButton('Project', LAYOUT_PROJECT_ICON, () => editor.panel.toggle());
  button.parentElement?.querySelector('button[aria-label="Texture Browser"]')?.after(button);
  layoutProjectMissingWatch(parts);
  parts.sceneIo.textureReadFailuresWatch(parts.statusBar);
  layoutProjectEmbeddedReferencesInstall(parts);
  editor.start();
  return editor;
}

/**
 * Lets the texture lists see which textures the level uses, and refreshes the
 * texture browser's missing list after edits.
 *
 * @param parts Editor parts.
 */
function layoutProjectMissingWatch(parts: LayoutProjectHostParts): void {
  getTextureMapCache().usedRootSet(parts.world);
  layoutProjectHistoryListen(parts.commandStack, () => parts.textureBrowserController.sceneChanged());
}

/**
 * Adapts the viewport layout to the project host interface.
 *
 * @param parts Editor parts.
 * @param editor Project editor the host is created for.
 * @returns Project host.
 */
function createLayoutProjectHost(
  parts: LayoutProjectHostParts,
  editor: () => ControllerProjectEditor,
): HostProjectEditor {
  const status = (message: string) => parts.statusBar?.setLastAction(message);
  return {
    container: parts.container,
    anchor: () => null,
    status,
    sceneBlocked: (quiet) => layoutCollaborationSceneBlocked(parts.collaborationMenu, quiet ? () => undefined : status),
    sceneHasUnsavedWork: () => !parts.commandStack.isAtSavedPoint(),
    sceneLoad: (file, name, handle) =>
      parts.sceneIo.loadSceneFile(file, parts.world, parts.sceneLoaded, parts.statusBar, name, handle),
    sceneCapture: () => ({ data: parts.sceneIo.serializeScene(parts.world) }),
    vmfImport: (text, name, placement) => layoutProjectVmfImport(parts, text, name, placement),
    objImport: (text, name, placement) => layoutProjectObjImport(parts, text, name, placement),
    glbImport: (bytes, name, _path, placement) =>
      runLayoutGlbImportBytes(layoutProjectGlbParts(parts, editor), bytes, name, layoutProjectPlace(parts, placement)),
    fbxImport: (bytes, name, path, placement) =>
      runLayoutFbxImportBytes(
        layoutProjectGlbParts(parts, editor),
        bytes,
        name,
        path,
        layoutProjectPlace(parts, placement),
      ),
    textureSelect: (id) => parts.textureBrowserController.selectTexture(id),
    confirm: (title, message, confirmLabel, cancelLabel) =>
      showMessageBox({ host: parts.container, title, message, confirmLabel, cancelLabel }),
    historyListen: (listener) => layoutProjectHistoryListen(parts.commandStack, listener),
    textureLibrary: () => parts.textureBrowserController.getLibrary(),
    textureIdsLive: () => layoutProjectTextureIdsLive(parts),
    roomActive: () => parts.collaborationMenu.active(),
    historyRoom: () => parts.collaborationMenu.historyRoom(),
    history: {
      thumbnail: parts.historyThumbnail,
      revision: () => parts.commandStack.getHistoryRevision(),
      state: () => (parts.collaborationMenu.active() ? undefined : parts.commandStack.peekUndo()),
      title: () => parts.sceneIo.getSceneFileSession().getCurrentFilename(),
    },
  };
}

/**
 * Lists the texture ids the editor references: the serialized scene plus every
 * id resolved this session (covers undo and redo).
 *
 * @param parts Editor parts.
 * @returns Texture ids.
 */
function layoutProjectTextureIdsLive(parts: LayoutProjectHostParts): Set<string> {
  const ids = new Set(getTextureMapCache().cachedIds());
  sceneTextureIds(parts.sceneIo.serializeScene(parts.world).objects).forEach((id) => ids.add(id));
  return ids;
}

/**
 * Lets saves over a level file keep the embedded textures the scene and its
 * undo and redo entries use, and drop the rest once nothing uses them.
 *
 * @param parts Editor parts.
 */
function layoutProjectEmbeddedReferencesInstall(parts: LayoutProjectHostParts): void {
  parts.sceneIo.setEmbeddedReferences(() => {
    const ids = textureEmbeddedIdsIn(parts.commandStack.entries());
    if (ids === null) return null;
    sceneTextureIds(parts.sceneIo.serializeScene(parts.world).objects).forEach((id) => ids.add(id));
    return ids;
  });
  parts.commandStack.onStackChanged(() => parts.sceneIo.embeddedHistoryChanged());
}

/**
 * Returns how a model opened from the project is moved before it is added.
 *
 * @param parts Editor parts.
 * @param placement In front of the last used view, or where the file places it.
 * @returns Mover (pivot at the bounds centre, minimum corner on the grid), or
 *   undefined to keep the file's placement and pivot.
 */
function layoutProjectPlace(
  parts: LayoutProjectHostParts,
  placement: ProjectModelPlacement,
): ((objects: readonly THREE.Object3D[], shift?: ModelContentShift) => void) | undefined {
  if (placement === 'original') return undefined;
  return (objects, shift) =>
    void modelSpawnPlace(objects, parts.world, parts.spawnPosition, parts.gridInterval(), shift);
}

/**
 * Imports VMF text from the project as a placed solid model.
 *
 * @param parts Editor parts.
 * @param text VMF contents.
 * @param name File name.
 * @param placement Where the model lands.
 */
async function layoutProjectVmfImport(
  parts: LayoutProjectHostParts,
  text: string,
  name: string,
  placement: ProjectModelPlacement,
): Promise<void> {
  const place = layoutProjectPlace(parts, placement);
  const result = await parts.sceneIo.importVmfFromText(
    text,
    name,
    parts.statusBar,
    place && ((model) => place([model.root], (_root, offset) => model.translateBrushes(offset.clone().negate()))),
  );
  const controller = parts.solidModelController();
  if (!result || !controller) return;
  controller.placeImportedModel(result.model, `Imported ${result.importedBrushCount} brushes from ${name}`);
  parts.refresh();
}

/**
 * Imports OBJ text from the project as undoable meshes, asking which program
 * wrote it when the file does not say.
 *
 * @param parts Editor parts.
 * @param text OBJ contents.
 * @param name File name.
 * @param placement Where the model lands.
 */
async function layoutProjectObjImport(
  parts: LayoutProjectHostParts,
  text: string,
  name: string,
  placement: ProjectModelPlacement,
): Promise<void> {
  const result = await parts.sceneIo.importObjText(
    text,
    name,
    parts.statusBar,
    async () => (await objImportDialogShow(parts.container, parts.settingsStore()))?.objSpace ?? null,
  );
  if (!result) return;
  layoutProjectPlace(parts, placement)?.(result.meshes);
  placeImportedObjMeshes(result.meshes, result.sourceFileName, parts.world, parts.commandStack);
  parts.refresh();
}

/**
 * Builds the GLB and FBX import parts of the project host.
 *
 * @param parts Editor parts.
 * @param editor Project editor.
 * @returns Import parts.
 */
function layoutProjectGlbParts(
  parts: LayoutProjectHostParts,
  editor: () => ControllerProjectEditor,
): LayoutGlbImportParts {
  return {
    ...parts,
    projectEditor: editor,
    library: () => parts.textureBrowserController.getLibrary(),
  };
}

/**
 * Follows undo stack changes.
 *
 * @param commandStack Undo stack.
 * @param listener Runs after each change.
 * @returns Unsubscribe.
 */
function layoutProjectHistoryListen(commandStack: CommandStack, listener: () => void): () => void {
  const callback = () => listener();
  commandStack.onStackChanged(callback);
  return () => commandStack.offStackChanged(callback);
}
