import type * as THREE from 'three';
import { ControllerTextureDrop } from '@/texture/drop/controller_texture_drop.js';
import { ManagerSelection } from '@/selection/object/manager_selection.js';
import { CommandStack } from '@/commands/command_stack.js';
import { ControllerFaceExtrusion } from '@/tools/face/controller_face_extrusion.js';
import { TextureBrowser } from '@/texture/ui/browser/texture_browser.js';
import { ControllerTextureBrowser } from '@/texture/controller/controller_texture_browser.js';
import { ControllerTextureAssignment } from '@/texture/controller/controller_texture_assignment.js';
import { StatusBar } from '@/ui/status/status_bar.js';
import type { ViewportEditor } from '@/viewports/core/viewport_editor.js';
import type { HandlerComponentMeshOperations } from '@/edit/topology/handler_component_mesh_operations.js';
import { routeTexturePick } from './texture_pick_route.js';
import {
  bindFloatingPanelToViewports,
  scheduleStartupFloatingPanelLayoutPass,
} from '@/tools/clip_plane/layout/layout_clip_tools_setup.js';

/** Dependencies for constructing the texture browser floating panel. */
export interface TextureBrowserSetupDeps {
  selectionManager: ManagerSelection;
  faceController: ControllerFaceExtrusion;
  commandStack: CommandStack;
  toolbarContainer: HTMLElement;
  getViewports: () => readonly ViewportEditor[];
  statusBar: StatusBar | null;
  afterSurfaceChange: () => void;
  /** World holding the solid models textures are dropped on. */
  worldObject: THREE.Object3D;
  /** Admits a one-shot edit of an object (collaboration locks). */
  editGate: (object: THREE.Object3D, apply: () => void) => void;
  /** Mesh operations of the open edit session, which paint Edit Mode faces. */
  getEditMeshOperations: () => HandlerComponentMeshOperations | null;
}

/** Result of texture browser construction. */
export interface TextureBrowserSetupResult {
  textureBrowser: TextureBrowser;
  textureBrowserController: ControllerTextureBrowser;
  textureAssignmentController: ControllerTextureAssignment;
  textureDropController: ControllerTextureDrop;
}

/**
 * Creates the texture browser, library controller, and assignment wiring.
 *
 * @param deps Shared services and DOM anchors for the texture browser.
 * @returns Created texture browser instances.
 */
export function setupTextureBrowserPanel(deps: TextureBrowserSetupDeps): TextureBrowserSetupResult {
  const textureAssignmentController = createTextureAssignmentController(deps);
  const controllerHolder: { current: ControllerTextureBrowser | null } = {
    current: null,
  };
  const textureBrowser = createTextureBrowserUi(deps, controllerHolder);
  bindFloatingPanelToViewports(textureBrowser, deps.getViewports);
  scheduleStartupFloatingPanelLayoutPass(textureBrowser, deps.getViewports);
  const textureBrowserController = createTextureBrowserController(deps, textureBrowser, textureAssignmentController);
  controllerHolder.current = textureBrowserController;
  return {
    textureBrowser,
    textureBrowserController,
    textureAssignmentController,
    textureDropController: createTextureDropController(deps, textureBrowserController, textureAssignmentController),
  };
}

/**
 * Lets textures dragged from the browser paint the face they are dropped on.
 *
 * @param deps Texture browser setup dependencies.
 * @param browserController Library owner.
 * @param assignment Texture assignment controller.
 * @returns Drop controller.
 */
function createTextureDropController(
  deps: TextureBrowserSetupDeps,
  browserController: ControllerTextureBrowser,
  assignment: ControllerTextureAssignment,
): ControllerTextureDrop {
  return new ControllerTextureDrop(document, {
    world: deps.worldObject,
    viewports: deps.getViewports,
    entry: (id) => browserController.getLibrary().getEntryById(id),
    assignment,
    gate: (object, apply) =>
      deps.editGate(object, () => {
        apply();
        deps.afterSurfaceChange();
      }),
    status: (message) => deps.statusBar?.setLastAction(message),
  });
}

/**
 * Creates the texture assignment controller with status feedback.
 *
 * @param deps Texture browser setup dependencies.
 * @returns Configured assignment controller.
 */
function createTextureAssignmentController(deps: TextureBrowserSetupDeps): ControllerTextureAssignment {
  const controller = new ControllerTextureAssignment(deps.selectionManager, deps.faceController, deps.commandStack);
  controller.setStatusCallback((message) => {
    deps.statusBar?.setLastAction(message);
  });
  return controller;
}

/**
 * Builds the texture browser panel with deferred controller callbacks.
 *
 * @param deps Texture browser setup dependencies.
 * @param controllerHolder Mutable holder filled after controller construction.
 * @returns Created browser panel.
 */
function createTextureBrowserUi(
  deps: TextureBrowserSetupDeps,
  controllerHolder: { current: ControllerTextureBrowser | null },
): TextureBrowser {
  return new TextureBrowser(deps.toolbarContainer, {
    onOpenProject: () => {
      void controllerHolder.current?.openProject();
    },
    onSelectTexture: (entryId) => {
      controllerHolder.current?.selectTexture(entryId);
    },
    onShowImportedChange: (show) => {
      controllerHolder.current?.setShowImported(show);
    },
  });
}

/**
 * Creates the browser controller and binds status/selection callbacks.
 *
 * @param deps Texture browser setup dependencies.
 * @param browser Texture browser panel.
 * @param assignmentController Texture assignment controller.
 * @returns Configured browser controller.
 */
function createTextureBrowserController(
  deps: TextureBrowserSetupDeps,
  browser: TextureBrowser,
  assignmentController: ControllerTextureAssignment,
): ControllerTextureBrowser {
  const controller = new ControllerTextureBrowser({ browser });
  controller.setStatusCallback((message) => {
    deps.statusBar?.setLastAction(message);
  });
  controller.setSelectionCallback((entry) => {
    if (!entry) return;
    routeTexturePick(entry, deps.getEditMeshOperations(), assignmentController);
    deps.afterSurfaceChange();
  });
  return controller;
}
