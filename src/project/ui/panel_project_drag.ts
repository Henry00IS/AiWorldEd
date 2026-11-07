/** MIME type of a project file path dragged from the project panel. */
export const PANEL_PROJECT_PATH_DRAG_TYPE = 'application/x-aiworlded-project-path';

/**
 * Lets a file tile be dragged onto fields that take project files, such as
 * curve fields.
 *
 * @param tile Tile element.
 * @param path Project path of the file.
 */
export function panelProjectTileDragBind(tile: HTMLElement, path: string): void {
  tile.draggable = true;
  tile.addEventListener('dragstart', (event) => {
    if (!event.dataTransfer) return;
    event.dataTransfer.setData(PANEL_PROJECT_PATH_DRAG_TYPE, path);
    event.dataTransfer.setData('text/plain', path);
    event.dataTransfer.effectAllowed = 'copy';
  });
}
