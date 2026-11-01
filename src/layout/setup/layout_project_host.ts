import type * as THREE from 'three';
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
import type { HandlerSceneIo } from '@/tools/io/handler_scene_io.js';
import { showMessageBox } from '@/ui/dialog/dialog_message_box.js';
import type { StatusBar } from '@/ui/status/status_bar.js';
import type { Toolbar } from '@/ui/toolbar/toolbar.js';
import type { ViewportEditor } from '@/viewports/core/viewport_editor.js';
import { layoutCollaborationSceneBlocked } from './layout_collaboration_host.js';
import { placeImportedObjMeshes } from './layout_scene_io_actions.js';

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
  const editor = new ControllerProjectEditor(createLayoutProjectHost(parts));
  bindFloatingPanelToViewports(editor.panel, parts.viewports);
  scheduleStartupFloatingPanelLayoutPass(editor.panel, parts.viewports);
  parts.textureBrowserController.setProject(
    async () => void (await editor.openOrReopen()),
    () => editor.project.fileSystem() !== null,
  );
  const button = parts.toolbar.addIconButton('Project', LAYOUT_PROJECT_ICON, () => editor.panel.toggle());
  button.parentElement?.querySelector('button[aria-label="Texture Browser"]')?.after(button);
  editor.start();
  return editor;
}

/**
 * Adapts the viewport layout to the project host interface.
 *
 * @param parts Editor parts.
 * @returns Project host.
 */
function createLayoutProjectHost(parts: LayoutProjectHostParts): HostProjectEditor {
  const status = (message: string) => parts.statusBar?.setLastAction(message);
  return {
    container: parts.container,
    anchor: () => null,
    status,
    sceneBlocked: (quiet) => layoutCollaborationSceneBlocked(parts.collaborationMenu, quiet ? () => undefined : status),
    sceneHasUnsavedWork: () => !parts.commandStack.isAtSavedPoint(),
    sceneLoad: (text, name) => parts.sceneIo.loadSceneText(text, parts.world, parts.sceneLoaded, parts.statusBar, name),
    sceneCapture: () => {
      const data = parts.sceneIo.serializeScene(parts.world);
      return { data, objectCount: data.objects.length };
    },
    vmfImport: (text, name) => layoutProjectVmfImport(parts, text, name),
    objImport: (text, name) => layoutProjectObjImport(parts, text, name),
    textureSelect: (id) => parts.textureBrowserController.selectTexture(id),
    confirm: (title, message, confirmLabel, cancelLabel) =>
      showMessageBox({ host: parts.container, title, message, confirmLabel, cancelLabel }),
    historyListen: (listener) => layoutProjectHistoryListen(parts.commandStack, listener),
    textureLibrary: () => parts.textureBrowserController.getLibrary(),
  };
}

/**
 * Imports VMF text from the project as a placed solid model.
 *
 * @param parts Editor parts.
 * @param text VMF contents.
 * @param name File name.
 */
async function layoutProjectVmfImport(parts: LayoutProjectHostParts, text: string, name: string): Promise<void> {
  const result = await parts.sceneIo.importVmfFromText(text, name, parts.statusBar);
  const controller = parts.solidModelController();
  if (!result || !controller) return;
  controller.placeImportedModel(result.model, `Imported ${result.importedBrushCount} brushes from ${name}`);
  parts.refresh();
}

/**
 * Imports OBJ text from the project as undoable meshes.
 *
 * @param parts Editor parts.
 * @param text OBJ contents.
 * @param name File name.
 */
function layoutProjectObjImport(parts: LayoutProjectHostParts, text: string, name: string): void {
  const result = parts.sceneIo.importObjFromText(text, name, parts.statusBar);
  if (!result) return;
  placeImportedObjMeshes(result.meshes, result.sourceFileName, parts.world, parts.commandStack);
  parts.refresh();
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
