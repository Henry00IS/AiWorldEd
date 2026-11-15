import { ThemeCss } from '@/ui/theme/theme_ui_css_variables.js';

/** DOM id of the style element that holds folder tree CSS. */
const FOLDER_TREE_STYLE_ELEMENT_ID = 'editor-folder-tree-stylesheet';

/** CSS class prefix shared by folder tree elements. */
export const FOLDER_TREE_CLASS = 'editor-folder-tree';

/** Injects or refreshes the folder tree CSS in the document head. */
export function folderTreeStylesheetEnsure(): void {
  if (typeof document === 'undefined') return;
  let style = document.getElementById(FOLDER_TREE_STYLE_ELEMENT_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = FOLDER_TREE_STYLE_ELEMENT_ID;
    document.head.appendChild(style);
  }
  style.textContent = folderTreeCss();
}

/**
 * Builds CSS for the tree host, its scroller and its rows. Rows inherit the
 * font of the element the tree sits in.
 *
 * @returns CSS rules.
 */
function folderTreeCss(): string {
  return `
.${FOLDER_TREE_CLASS}-host { position: relative; display: flex; min-height: 0; }
.${FOLDER_TREE_CLASS} { flex: 1 1 auto; min-width: 0; overflow-x: hidden; overflow-y: auto; padding: 4px 0; box-sizing: border-box; outline: none; }
.${FOLDER_TREE_CLASS}-row { display: flex; align-items: center; gap: 4px; color: ${ThemeCss.textColor}; padding: 3px 8px; cursor: pointer;
  white-space: nowrap; overflow: hidden; }
.${FOLDER_TREE_CLASS}-row:hover { background: rgba(var(--aiworlded-ink-rgb, 255, 255, 255), 0.06); }
.${FOLDER_TREE_CLASS}-row[aria-selected="true"] { background: rgba(var(--aiworlded-accent-rgb, 232, 106, 23), 0.25); color: var(--aiworlded-gray-ffffff, #ffffff); }
.${FOLDER_TREE_CLASS}-row[data-drop="true"] { outline: 1px dashed rgba(var(--aiworlded-accent-rgb, 232, 106, 23), 0.9); outline-offset: -1px; }
.${FOLDER_TREE_CLASS}-arrow { display: inline-flex; align-items: center; justify-content: center; flex: 0 0 auto; width: 14px; height: 12px;
  color: var(--aiworlded-gray-888888, #888888); font-size: 10px; transform-origin: center center; }
.${FOLDER_TREE_CLASS}-icon { display: inline-flex; flex: 0 0 auto; width: 14px; height: 14px; }
.${FOLDER_TREE_CLASS}-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.${FOLDER_TREE_CLASS}-count { flex: 0 0 auto; color: ${ThemeCss.mutedTextColor}; }`.trim();
}
