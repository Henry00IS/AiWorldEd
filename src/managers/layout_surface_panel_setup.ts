import { SelectionManager } from './selection_manager.js';
import { CommandStack } from '../commands/command_stack.js';
import { FaceExtrusionController } from './face_extrusion_controller.js';
import { UvEditor } from '../ui/uv_editor.js';
import { UvEditorController } from './uv_editor_controller.js';
import { TextureBrowser } from '../ui/texture_browser.js';
import { TextureBrowserController } from './texture_browser_controller.js';
import { TextureAssignmentController } from './texture_assignment_controller.js';
import { StatusBar } from '../ui/status_bar.js';

/**
 * Dependencies for constructing the UV editor floating panel.
 */
export interface UvEditorSetupDeps {
  selectionManager: SelectionManager;
  faceController: FaceExtrusionController;
  commandStack: CommandStack;
  toolbarContainer: HTMLElement;
  anchorViewport: HTMLElement;
  statusBar: StatusBar | null;
  afterSurfaceChange: () => void;
}

/**
 * Result of UV editor construction.
 */
export interface UvEditorSetupResult {
  uvEditor: UvEditor;
  uvEditorController: UvEditorController;
}

/**
 * Dependencies for constructing the texture browser floating panel.
 */
export interface TextureBrowserSetupDeps {
  selectionManager: SelectionManager;
  faceController: FaceExtrusionController;
  commandStack: CommandStack;
  toolbarContainer: HTMLElement;
  anchorViewport: HTMLElement;
  statusBar: StatusBar | null;
  afterSurfaceChange: () => void;
}

/**
 * Result of texture browser construction.
 */
export interface TextureBrowserSetupResult {
  textureBrowser: TextureBrowser;
  textureBrowserController: TextureBrowserController;
  textureAssignmentController: TextureAssignmentController;
}

/**
 * Creates the floating UV editor panel and wires selection refresh callbacks.
 * @param deps Shared services and DOM anchors for the UV editor.
 * @returns Created UV editor instances.
 */
export function setupUvEditorPanel(deps: UvEditorSetupDeps): UvEditorSetupResult {
  const uvEditorController = createUvEditorController(deps);
  const uvEditor = createUvEditorUi(deps, uvEditorController);
  wireUvEditorRefresh(deps, uvEditor, uvEditorController);
  return { uvEditor, uvEditorController };
}

/**
 * Creates the UV mapping controller with status feedback.
 * @param deps UV editor setup dependencies.
 * @returns Configured UV editor controller.
 */
function createUvEditorController(deps: UvEditorSetupDeps): UvEditorController {
  const controller = new UvEditorController(
    deps.selectionManager,
    deps.faceController,
    deps.commandStack
  );
  controller.setStatusCallback((message) => {
    deps.statusBar?.setLastAction(message);
  });
  return controller;
}

/**
 * Builds the UV editor panel and connects apply/reset actions.
 * @param deps UV editor setup dependencies.
 * @param controller UV mapping controller.
 * @returns Created UV editor panel.
 */
function createUvEditorUi(
  deps: UvEditorSetupDeps,
  controller: UvEditorController
): UvEditor {
  return new UvEditor(
    deps.toolbarContainer,
    {
      onAlign: (align) => {
        controller.applyAlign(align);
        deps.afterSurfaceChange();
      },
      onApplyMapping: (mapping) => {
        controller.applyMappingFields(mapping);
        deps.afterSurfaceChange();
      },
      onReset: () => {
        controller.resetMapping();
        deps.afterSurfaceChange();
      }
    },
    deps.anchorViewport
  );
}

/**
 * Wires UI refresh when object or face selection changes.
 * @param deps UV editor setup dependencies.
 * @param uvEditor UV editor panel.
 * @param controller UV mapping controller.
 */
function wireUvEditorRefresh(
  deps: UvEditorSetupDeps,
  uvEditor: UvEditor,
  controller: UvEditorController
): void {
  controller.setUiRefreshCallback((mapping, count) => {
    uvEditor.setFromSelection(mapping, count);
  });
  deps.faceController.setFaceSelectionChangedCallback(() => {
    controller.refreshFromSelection();
  });
}

/**
 * Creates the texture browser, library controller, and assignment wiring.
 * @param deps Shared services and DOM anchors for the texture browser.
 * @returns Created texture browser instances.
 */
export function setupTextureBrowserPanel(
  deps: TextureBrowserSetupDeps
): TextureBrowserSetupResult {
  const textureAssignmentController = createTextureAssignmentController(deps);
  const controllerHolder: { current: TextureBrowserController | null } = {
    current: null
  };
  const textureBrowser = createTextureBrowserUi(deps, controllerHolder);
  const textureBrowserController = createTextureBrowserController(
    deps,
    textureBrowser,
    textureAssignmentController
  );
  controllerHolder.current = textureBrowserController;
  return {
    textureBrowser,
    textureBrowserController,
    textureAssignmentController
  };
}

/**
 * Creates the texture assignment controller with status feedback.
 * @param deps Texture browser setup dependencies.
 * @returns Configured assignment controller.
 */
function createTextureAssignmentController(
  deps: TextureBrowserSetupDeps
): TextureAssignmentController {
  const controller = new TextureAssignmentController(
    deps.selectionManager,
    deps.faceController,
    deps.commandStack
  );
  controller.setStatusCallback((message) => {
    deps.statusBar?.setLastAction(message);
  });
  return controller;
}

/**
 * Builds the texture browser panel with deferred controller callbacks.
 * @param deps Texture browser setup dependencies.
 * @param controllerHolder Mutable holder filled after controller construction.
 * @returns Created browser panel.
 */
function createTextureBrowserUi(
  deps: TextureBrowserSetupDeps,
  controllerHolder: { current: TextureBrowserController | null }
): TextureBrowser {
  return new TextureBrowser(
    deps.toolbarContainer,
    {
      onOpenFolder: () => {
        void controllerHolder.current?.openFolder();
      },
      onSelectTexture: (entryId) => {
        controllerHolder.current?.selectTexture(entryId);
      }
    },
    deps.anchorViewport
  );
}

/**
 * Creates the browser controller and binds status/selection callbacks.
 * @param deps Texture browser setup dependencies.
 * @param browser Texture browser panel.
 * @param assignmentController Texture assignment controller.
 * @returns Configured browser controller.
 */
function createTextureBrowserController(
  deps: TextureBrowserSetupDeps,
  browser: TextureBrowser,
  assignmentController: TextureAssignmentController
): TextureBrowserController {
  const controller = new TextureBrowserController({ browser });
  controller.setStatusCallback((message) => {
    deps.statusBar?.setLastAction(message);
  });
  controller.setSelectionCallback((entry) => {
    if (!entry) return;
    assignmentController.onTextureSelected(entry);
    deps.afterSurfaceChange();
  });
  return controller;
}
