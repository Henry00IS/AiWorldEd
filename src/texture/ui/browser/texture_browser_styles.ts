/** CSS class name for the texture browser root element. */
export const TEXTURE_BROWSER_ROOT_CLASS = 'tb-browser-root';

/** CSS class name for the texture browser grid container. */
export const TEXTURE_BROWSER_GRID_CLASS = 'tb-browser-grid';

/** CSS class name for each texture tile. */
export const TEXTURE_BROWSER_TILE_CLASS = 'tb-browser-tile';

/** CSS class name for each texture thumbnail. */
export const TEXTURE_BROWSER_THUMB_CLASS = 'tb-browser-thumb';

/** CSS class name for each texture name label. */
export const TEXTURE_BROWSER_NAME_CLASS = 'tb-browser-name';

/** DOM id of the style element that holds texture browser CSS. */
const TEXTURE_BROWSER_STYLE_ELEMENT_ID = 'tb-browser-stylesheet';

/** Minimum outer tile track size in pixels for auto-fill columns. */
export const TEXTURE_BROWSER_MIN_TRACK_PX = 96;

/**
 * Injects or refreshes texture browser CSS rules into the document head.
 * Creates the style element when missing and always overwrites its text
 * content.
 */
export function ensureTextureBrowserStylesheet(): void {
  if (typeof document === 'undefined') return;
  let style = document.getElementById(TEXTURE_BROWSER_STYLE_ELEMENT_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = TEXTURE_BROWSER_STYLE_ELEMENT_ID;
    document.head.appendChild(style);
  }
  style.textContent = buildTextureBrowserCss();
}

/**
 * Builds the full CSS text for the texture browser grid, tiles, thumbs, and
 * name labels.
 *
 * @returns Stylesheet source.
 */
function buildTextureBrowserCss(): string {
  return [buildGridCss(), buildTileCss(), buildThumbCss(), buildNameCss()].join('\n');
}

/**
 * Builds grid container CSS for auto-fill texture tiles.
 *
 * @returns CSS rules for the browser grid.
 */
function buildGridCss(): string {
  return `
.${TEXTURE_BROWSER_GRID_CLASS} {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(${TEXTURE_BROWSER_MIN_TRACK_PX}px, 1fr));
  grid-auto-rows: max-content;
  gap: 8px;
  align-content: start;
  align-items: start;
  box-sizing: border-box;
  min-width: 0;
  width: 100%;
  overflow-x: hidden;
  overflow-y: auto;
}`.trim();
}

/**
 * Builds CSS for individual texture tiles as flex columns.
 *
 * @returns CSS rules for texture tiles.
 */
function buildTileCss(): string {
  return `
.${TEXTURE_BROWSER_TILE_CLASS} {
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  container-type: inline-size;
  min-width: 0;
  width: 100%;
  margin: 0;
  padding: 4px;
  text-align: center;
  cursor: pointer;
}`.trim();
}

/**
 * Builds CSS for square texture thumbnails using container query height.
 *
 * @returns CSS rules for thumbnail elements.
 */
function buildThumbCss(): string {
  return `
.${TEXTURE_BROWSER_THUMB_CLASS} {
  display: block;
  box-sizing: border-box;
  width: 100%;
  height: 100cqi;
  flex-shrink: 0;
  margin: 0;
  padding: 0;
  border: none;
  border-radius: 2px;
  background-color: #111;
  background-position: center center;
  background-repeat: no-repeat;
  background-size: cover;
}`.trim();
}

/**
 * Builds CSS for texture name labels.
 *
 * @returns CSS rules for name labels.
 */
function buildNameCss(): string {
  return `
.${TEXTURE_BROWSER_NAME_CLASS} {
  display: block;
  box-sizing: border-box;
  width: 100%;
  margin-top: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: center;
  font-family: monospace;
  font-size: 10px;
  line-height: 1.2;
  flex-shrink: 0;
}`.trim();
}
