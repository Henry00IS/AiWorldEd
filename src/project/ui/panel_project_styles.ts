import { Theme } from '@/theme.js';
import { hexToRgb } from '@/utils/utils_color.js';

/** DOM id of the style element that holds project panel CSS. */
const PANEL_PROJECT_STYLE_ELEMENT_ID = 'pp-panel-stylesheet';

/** CSS class prefix shared by project panel elements. */
export const PANEL_PROJECT_CLASS = 'pp-panel';

/** Injects or refreshes the project panel CSS in the document head. */
export function panelProjectStylesheetEnsure(): void {
  if (typeof document === 'undefined') return;
  let style = document.getElementById(PANEL_PROJECT_STYLE_ELEMENT_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = PANEL_PROJECT_STYLE_ELEMENT_ID;
    document.head.appendChild(style);
  }
  style.textContent = [panelProjectChromeCss(), panelProjectTreeCss(), panelProjectGridCss()].join('\n');
}

/**
 * Builds CSS for the rows, inputs and messages.
 *
 * @returns CSS rules.
 */
function panelProjectChromeCss(): string {
  const muted = Theme.statusBarTextColor;
  return `
.${PANEL_PROJECT_CLASS}-row { display: flex; align-items: center; gap: 6px; padding: 8px 10px 4px; flex-shrink: 0; box-sizing: border-box; }
.${PANEL_PROJECT_CLASS}-search { flex: 1 1 auto; min-width: 0; font: 11px monospace; padding: 3px 6px; border-radius: 3px;
  background: ${hexToRgb(Theme.buttonBackground)}; color: ${Theme.buttonTextColor}; border: 1px solid ${Theme.inputBorderColor}; }
.${PANEL_PROJECT_CLASS}-label { padding: 0 10px 6px; color: ${muted}; font: 10px monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex-shrink: 0; }
.${PANEL_PROJECT_CLASS}-notice { margin: 0 10px 6px; padding: 6px 8px; border-radius: 3px; font: 11px sans-serif; line-height: 1.35;
  color: ${Theme.buttonTextColor}; background: rgba(232, 106, 23, 0.16); border: 1px solid rgba(232, 106, 23, 0.5); flex-shrink: 0; }
.${PANEL_PROJECT_CLASS}-body { display: flex; flex: 1 1 auto; min-height: 0; border-top: 1px solid ${Theme.inputBorderColor}; }
.${PANEL_PROJECT_CLASS}-empty { grid-column: 1 / -1; color: ${muted}; font: 11px monospace; padding: 24px 8px; text-align: center; }
.${PANEL_PROJECT_CLASS}-status { padding: 6px 10px 8px; color: ${muted}; font: 10px monospace; flex-shrink: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }`.trim();
}

/**
 * Builds CSS for the folder tree.
 *
 * @returns CSS rules.
 */
function panelProjectTreeCss(): string {
  return `
.${PANEL_PROJECT_CLASS}-tree { width: 34%; min-width: 110px; max-width: 260px; overflow: auto; padding: 4px 0; box-sizing: border-box;
  border-right: 1px solid ${Theme.inputBorderColor}; }
.${PANEL_PROJECT_CLASS}-folder { font: 11px monospace; color: ${Theme.buttonTextColor}; padding: 3px 8px; cursor: pointer; white-space: nowrap;
  overflow: hidden; text-overflow: ellipsis; }
.${PANEL_PROJECT_CLASS}-folder:hover { background: rgba(255, 255, 255, 0.06); }
.${PANEL_PROJECT_CLASS}-folder[aria-selected="true"] { background: rgba(232, 106, 23, 0.25); }
.${PANEL_PROJECT_CLASS}-count { color: ${Theme.statusBarTextColor}; margin-left: 4px; }`.trim();
}

/**
 * Builds CSS for the file grid and tiles.
 *
 * @returns CSS rules.
 */
function panelProjectGridCss(): string {
  return `
.${PANEL_PROJECT_CLASS}-grid { flex: 1 1 auto; min-width: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(84px, 1fr));
  grid-auto-rows: max-content; gap: 6px; align-content: start; padding: 8px; overflow-y: auto; box-sizing: border-box; }
.${PANEL_PROJECT_CLASS}-tile { display: flex; flex-direction: column; border-radius: 4px; padding: 4px; gap: 3px; cursor: pointer; min-width: 0;
  background: ${hexToRgb(Theme.buttonBackground)}; border: 1px solid ${Theme.inputBorderColor}; box-sizing: border-box; }
.${PANEL_PROJECT_CLASS}-tile[aria-selected="true"] { border-color: ${hexToRgb(Theme.selectionColor)}; background: rgba(232, 106, 23, 0.22); }
.${PANEL_PROJECT_CLASS}-thumb { aspect-ratio: 1 / 1; width: 100%; background: #1b1b1b center / contain no-repeat; image-rendering: pixelated;
  display: flex; align-items: center; justify-content: center; font: bold 12px monospace; color: #c9c9c9; border-radius: 2px; }
.${PANEL_PROJECT_CLASS}-thumb[data-kind="scene"] { background-color: #23384f; }
.${PANEL_PROJECT_CLASS}-thumb[data-kind="vmf"] { background-color: #3d2f4f; }
.${PANEL_PROJECT_CLASS}-thumb[data-kind="obj"] { background-color: #2f4a35; }
.${PANEL_PROJECT_CLASS}-name { font: 10px monospace; color: ${Theme.buttonTextColor}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-align: center; }`.trim();
}
