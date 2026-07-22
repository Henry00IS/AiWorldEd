/**
 * Class names used by the texture browser stylesheet.
 */
export const TEXTURE_BROWSER_ROOT_CLASS = 'tb-browser-root';
export const TEXTURE_BROWSER_GRID_CLASS = 'tb-browser-grid';
export const TEXTURE_BROWSER_TILE_CLASS = 'tb-browser-tile';
export const TEXTURE_BROWSER_THUMB_CLASS = 'tb-browser-thumb';
export const TEXTURE_BROWSER_NAME_CLASS = 'tb-browser-name';

/**
 * Style element id so the sheet is only injected once.
 */
const TEXTURE_BROWSER_STYLE_ELEMENT_ID = 'tb-browser-stylesheet';

/**
 * Minimum outer tile track size used by auto-fill columns (pixels).
 */
export const TEXTURE_BROWSER_MIN_TRACK_PX = 96;

/**
 * Injects or refreshes texture browser rules.
 * Always writes the latest CSS so a stale sheet cannot linger after reloads.
 */
export function ensureTextureBrowserStylesheet(): void {
  if (typeof document === 'undefined') return;
  let style = document.getElementById(
    TEXTURE_BROWSER_STYLE_ELEMENT_ID
  ) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = TEXTURE_BROWSER_STYLE_ELEMENT_ID;
    document.head.appendChild(style);
  }
  style.textContent = buildTextureBrowserCss();
}

/**
 * Builds the CSS text for the texture browser grid and tiles.
 * Thumb height uses container query units (cqi) so grid row sizing
 * sees a real height — percentage padding does not, and collapses rows.
 * @returns Stylesheet source.
 */
function buildTextureBrowserCss(): string {
  return [
    buildGridCss(),
    buildTileCss(),
    buildThumbCss(),
    buildNameCss()
  ].join('\n');
}

/**
 * Builds grid container CSS for auto-fill texture tiles.
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
 * Builds CSS for texture name labels under each tile.
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
