import { ThemeCss } from '@/ui/theme/theme_ui_css_variables.js';
import { Theme } from '@/theme.js';

/** DOM id of the style element holding the script editor rules. */
const SOLID_SCRIPT_EDITOR_STYLE_ID = 'solid-script-editor-stylesheet';

/** Font of script code. */
export const SOLID_SCRIPT_EDITOR_CODE_FONT = 'Consolas, "Cascadia Mono", "SF Mono", Menlo, monospace';

/** Class names of the script editor. */
export const SOLID_SCRIPT_EDITOR_CLASSES = {
  root: 'solid-script-editor',
  toolbar: 'solid-script-editor-toolbar',
  tool: 'solid-script-editor-tool',
  toolSeparator: 'solid-script-editor-tool-separator',
  body: 'solid-script-editor-body',
  palette: 'solid-script-editor-palette',
  paletteCaption: 'solid-script-editor-palette-caption',
  paletteItem: 'solid-script-editor-palette-item',
  lines: 'solid-script-editor-lines',
  row: 'solid-script-editor-row',
  gutter: 'solid-script-editor-gutter',
  code: 'solid-script-editor-code',
  chip: 'solid-script-editor-chip',
  chipLabel: 'solid-script-editor-chip-label',
  chipSummary: 'solid-script-editor-chip-summary',
  dropBefore: 'solid-script-editor-drop-before',
  dropAfter: 'solid-script-editor-drop-after',
  dropInto: 'solid-script-editor-drop-into',
  current: 'solid-script-editor-current',
  stepped: 'solid-script-editor-stepped',
  failed: 'solid-script-editor-failed',
  output: 'solid-script-editor-output',
  outputError: 'solid-script-editor-output-error',
  icon: 'solid-script-editor-icon',
  field: 'solid-script-editor-field',
  fieldLabel: 'solid-script-editor-field-label',
  fieldInputs: 'solid-script-editor-field-inputs',
  input: 'solid-script-editor-input',
  preview: 'solid-script-editor-preview',
  list: 'solid-script-editor-list',
  listItem: 'solid-script-editor-list-item',
  selected: 'solid-script-editor-selected',
} as const;

/** Accent colour of each palette category, readable on light and dark panels. */
export const SOLID_SCRIPT_EDITOR_CATEGORY_COLORS: Readonly<Record<string, string>> = {
  Solids: '#e2762b',
  '2D Shapes': '#2aa198',
  Transforms: '#3d8fd6',
  Combine: '#9b6bd6',
  Logic: '#8a9a3c',
};

const c = SOLID_SCRIPT_EDITOR_CLASSES;

/** Window, toolbar and palette rules. */
const SOLID_SCRIPT_EDITOR_FRAME_CSS = `
.${c.root} { display: flex; flex-direction: column; color: ${ThemeCss.textColor}; font-family: ${Theme.uiFontFamily}; font-size: 12px; }
.${c.toolbar} { display: flex; align-items: center; gap: 4px; padding: 6px 8px; border-bottom: 1px solid ${ThemeCss.separatorColor}; background: linear-gradient(180deg, ${ThemeCss.toolbarBackground}, ${ThemeCss.toolbarBackgroundEnd}); flex-shrink: 0; }
.${c.tool} { display: inline-flex; align-items: center; gap: 5px; height: 26px; padding: 0 9px; border-radius: 5px; border: 1px solid ${ThemeCss.inkAlpha(0.12)}; background: ${ThemeCss.buttonBackground}; color: ${ThemeCss.textColor}; font: inherit; cursor: pointer; }
.${c.tool}:hover:not(:disabled) { background: ${ThemeCss.buttonHoverBackground}; }
.${c.tool}:focus-visible, .${c.paletteItem}:focus-visible, .${c.chip}:focus-visible, .${c.listItem}:focus-visible { outline: 2px solid ${ThemeCss.accentColor}; outline-offset: -2px; }
.${c.tool}:disabled { opacity: 0.45; cursor: default; }
.${c.tool}[aria-pressed="true"] { border-color: ${ThemeCss.accentColor}; background: ${ThemeCss.accentAlpha(0.22)}; }
.${c.toolSeparator} { width: 1px; height: 18px; margin: 0 4px; background: ${ThemeCss.separatorColor}; }
.${c.icon} { display: inline-flex; width: 14px; height: 14px; flex-shrink: 0; }
.${c.icon} svg { width: 100%; height: 100%; }
.${c.body} { display: flex; flex: 1; min-height: 0; }
.${c.palette} { width: 176px; flex-shrink: 0; overflow-y: auto; padding: 4px 0 8px; border-right: 1px solid ${ThemeCss.separatorColor}; }
.${c.paletteCaption} { padding: 10px 12px 4px; font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; color: ${ThemeCss.mutedTextColor}; }
.${c.paletteItem} { display: flex; align-items: center; gap: 8px; margin: 1px 6px; padding: 5px 8px; border-radius: 5px; cursor: grab; user-select: none; }
.${c.paletteItem}:hover { background: ${ThemeCss.inkAlpha(0.07)}; }
.${c.paletteItem}:active { cursor: grabbing; }
`;

/** Script line rules. */
const SOLID_SCRIPT_EDITOR_LINES_CSS = `
.${c.lines} { flex: 1; min-width: 0; overflow: auto; padding: 6px 0 24px; background: ${ThemeCss.inputBackground}; }
.${c.row} { position: relative; display: flex; align-items: center; min-height: 24px; padding-right: 8px; }
.${c.gutter} { width: 40px; flex-shrink: 0; padding-right: 8px; text-align: right; color: ${ThemeCss.mutedTextColor}; font: 11px ${SOLID_SCRIPT_EDITOR_CODE_FONT}; user-select: none; box-sizing: border-box; }
.${c.code} { flex: 1; min-width: 0; height: 22px; padding: 0 4px; border: 1px solid transparent; border-radius: 3px; background: transparent; color: ${ThemeCss.inputTextColor}; font: 12px ${SOLID_SCRIPT_EDITOR_CODE_FONT}; outline: none; }
.${c.code}:focus { border-color: ${ThemeCss.inkAlpha(0.14)}; background: ${ThemeCss.inkAlpha(0.03)}; }
.${c.chip} { display: inline-flex; align-items: baseline; gap: 8px; max-width: 100%; min-width: 0; margin: 1px 0; padding: 3px 10px 3px 8px; border-radius: 5px; border: 1px solid ${ThemeCss.inkAlpha(0.12)}; border-left: 3px solid var(--solid-script-chip-color); background: ${ThemeCss.buttonBackground}; cursor: default; user-select: none; outline: none; }
.${c.chip}:hover { background: ${ThemeCss.buttonHoverBackground}; }
.${c.chipLabel} { font-weight: 600; white-space: nowrap; }
.${c.chipSummary} { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: ${ThemeCss.mutedTextColor}; font: 11px ${SOLID_SCRIPT_EDITOR_CODE_FONT}; }
.${c.row}.${c.dropBefore}::before, .${c.row}.${c.dropAfter}::after { content: ''; position: absolute; left: 40px; right: 8px; height: 2px; background: ${ThemeCss.accentColor}; pointer-events: none; }
.${c.row}.${c.dropBefore}::before { top: -1px; }
.${c.row}.${c.dropAfter}::after { bottom: -1px; }
.${c.row}.${c.dropInto} { background: ${ThemeCss.accentAlpha(0.14)}; }
.${c.row}.${c.current} { background: ${ThemeCss.inkAlpha(0.05)}; }
.${c.row}.${c.stepped} { background: ${ThemeCss.accentAlpha(0.2)}; }
.${c.row}.${c.stepped} .${c.gutter} { color: ${ThemeCss.accentColor}; font-weight: 700; }
.${c.row}.${c.failed} .${c.gutter} { color: #e5484d; font-weight: 700; }
.${c.row}.${c.failed} { box-shadow: inset 3px 0 0 #e5484d; }
.${c.output} { flex-shrink: 0; max-height: 72px; min-height: 22px; overflow-y: auto; padding: 5px 10px; border-top: 1px solid ${ThemeCss.separatorColor}; font: 11px ${SOLID_SCRIPT_EDITOR_CODE_FONT}; color: ${ThemeCss.mutedTextColor}; white-space: pre-wrap; }
.${c.outputError} { color: #e5484d; }
`;

/** Configurator and file dialog rules. */
const SOLID_SCRIPT_EDITOR_DIALOG_CSS = `
.${c.field} { display: grid; grid-template-columns: 112px minmax(0, 1fr); align-items: center; gap: 8px; margin-bottom: 8px; }
.${c.fieldLabel} { color: ${ThemeCss.mutedTextColor}; }
.${c.fieldInputs} { display: flex; gap: 6px; min-width: 0; }
.${c.input} { flex: 1; min-width: 0; height: 26px; padding: 0 7px; border-radius: 4px; border: 1px solid ${ThemeCss.inputBorderColor}; background: ${ThemeCss.inputBackground}; color: ${ThemeCss.inputTextColor}; font: 12px ${SOLID_SCRIPT_EDITOR_CODE_FONT}; box-sizing: border-box; }
.${c.input}:focus { outline: none; border-color: ${ThemeCss.accentColor}; }
.${c.preview} { margin: 12px 0 14px; padding: 8px 10px; border-radius: 5px; background: ${ThemeCss.inputBackground}; border: 1px solid ${ThemeCss.inkAlpha(0.08)}; font: 12px ${SOLID_SCRIPT_EDITOR_CODE_FONT}; color: ${ThemeCss.inputTextColor}; white-space: pre-wrap; word-break: break-word; }
.${c.list} { max-height: 240px; overflow-y: auto; margin-bottom: 14px; border-radius: 5px; border: 1px solid ${ThemeCss.inkAlpha(0.1)}; background: ${ThemeCss.inputBackground}; }
.${c.listItem} { padding: 6px 10px; cursor: pointer; }
.${c.listItem}:hover { background: ${ThemeCss.inkAlpha(0.06)}; }
.${c.listItem}.${c.selected} { background: ${ThemeCss.accentAlpha(0.24)}; }
`;

/** Injects the script editor rules once. */
export function solidScriptEditorStylesheetEnsure(): void {
  if (typeof document === 'undefined' || document.getElementById(SOLID_SCRIPT_EDITOR_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = SOLID_SCRIPT_EDITOR_STYLE_ID;
  style.textContent = [SOLID_SCRIPT_EDITOR_FRAME_CSS, SOLID_SCRIPT_EDITOR_LINES_CSS, SOLID_SCRIPT_EDITOR_DIALOG_CSS]
    .join('\n')
    .trim();
  document.head.appendChild(style);
}
