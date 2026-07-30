import { ViewportLayoutManager } from './managers/layout/viewport_layout_manager.js';
import { installAppE2eTestBridge } from './e2e_bridge/app_test_bridge.js';
import { showEditorStartupError } from './ui/editor_startup_error.js';

const editorContainer = document.getElementById('editor-container') as HTMLElement;

/**
 * Starts the editor and converts renderer startup failures into visible UI.
 *
 * @param container Root editor container.
 */
function startEditor(container: HTMLElement): void {
  try {
    const layoutManager = new ViewportLayoutManager(container);
    layoutManager.start();
    installAppE2eTestBridge(layoutManager);
    console.log('AiWorldEd started');
  } catch (error) {
    console.error('[AiWorldEd] Editor startup failed.', error);
    showEditorStartupError(container, error);
  }
}

startEditor(editorContainer);
