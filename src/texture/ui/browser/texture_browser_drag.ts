/** Drag data type carrying the id of a texture dragged from the browser. */
export const TEXTURE_BROWSER_DRAG_TYPE = 'application/x-aiworlded-texture-id';

/**
 * Lets a browser tile be dragged onto faces in the viewports.
 *
 * @param tile Texture tile.
 * @param textureId Texture the tile shows.
 */
export function textureBrowserTileDragBind(tile: HTMLElement, textureId: string): void {
  tile.draggable = true;
  tile.addEventListener('dragstart', (event) => {
    if (event.dataTransfer === null) return;
    event.dataTransfer.setData(TEXTURE_BROWSER_DRAG_TYPE, textureId);
    event.dataTransfer.effectAllowed = 'copy';
  });
}

/**
 * Tells whether a drag carries a browser texture.
 *
 * @param data Drag data, or null.
 * @returns True for texture drags.
 */
export function textureBrowserDragHas(data: DataTransfer | null): data is DataTransfer {
  return data !== null && Array.from(data.types).includes(TEXTURE_BROWSER_DRAG_TYPE);
}
