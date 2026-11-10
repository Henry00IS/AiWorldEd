import { ManagerViewportLayout } from '@/layout/viewport/manager_viewport_layout.js';
import { showErrorEditorStartup } from '@/ui/error/error_editor_startup.js';
import { nativeBrowserDefaultsInstall } from '@/ui/input/native_browser_defaults.js';

const editorContainer = document.getElementById('editor-container') as HTMLElement;

/**
 * Starts the editor and converts renderer startup failures into visible UI.
 *
 * @param container Root editor container.
 */
function startEditor(container: HTMLElement): void {
  try {
    const layoutManager = new ManagerViewportLayout(container);
    layoutManager.start();
    console.log('AiWorldEd started');
  } catch (error) {
    console.error('[AiWorldEd] Editor startup failed.', error);
    showErrorEditorStartup(container, error);
  }
}

nativeBrowserDefaultsInstall(window);
startEditor(editorContainer);
