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
  chip: 'solid-script-editor-chip',
  chipLabel: 'solid-script-editor-chip-label',
  chipClose: 'solid-script-editor-chip-close',
  chipNote: 'solid-script-editor-chip-note',
  blank: 'solid-script-editor-blank',
  parameter: 'solid-script-editor-parameter',
  parameterName: 'solid-script-editor-parameter-name',
  parameterValue: 'solid-script-editor-parameter-value',
  dropBefore: 'solid-script-editor-drop-before',
  dropAfter: 'solid-script-editor-drop-after',
  dropInto: 'solid-script-editor-drop-into',
  current: 'solid-script-editor-current',
  stepped: 'solid-script-editor-stepped',
  traced: 'solid-script-editor-traced',
  failed: 'solid-script-editor-failed',
  output: 'solid-script-editor-output',
  outputTabs: 'solid-script-editor-output-tabs',
  outputTab: 'solid-script-editor-output-tab',
  outputText: 'solid-script-editor-output-text',
  outputError: 'solid-script-editor-output-error',
  variables: 'solid-script-editor-variables',
  variablesCaption: 'solid-script-editor-variables-caption',
  variable: 'solid-script-editor-variable',
  help: 'solid-script-editor-help',
  helpTitle: 'solid-script-editor-help-title',
  helpCategory: 'solid-script-editor-help-category',
  helpText: 'solid-script-editor-help-text',
  helpUsage: 'solid-script-editor-help-usage',
  helpParameter: 'solid-script-editor-help-parameter',
  icon: 'solid-script-editor-icon',
  field: 'solid-script-editor-field',
  fieldLabel: 'solid-script-editor-field-label',
  fieldInputs: 'solid-script-editor-field-inputs',
  fieldHint: 'solid-script-editor-field-hint',
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
  Parts: '#d4537e',
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

/** Script line rules: every parameter is shown as a caption with a strong value. */
const SOLID_SCRIPT_EDITOR_LINES_CSS = `
.${c.lines} { flex: 1; min-width: 0; overflow: auto; padding: 6px 0 24px; background: ${ThemeCss.inputBackground}; }
.${c.row} { position: relative; display: flex; align-items: center; min-height: 28px; padding-right: 8px; }
.${c.gutter} { width: 40px; flex-shrink: 0; padding-right: 8px; text-align: right; color: ${ThemeCss.mutedTextColor}; font: 11px ${SOLID_SCRIPT_EDITOR_CODE_FONT}; user-select: none; box-sizing: border-box; }
.${c.chip} { display: inline-flex; align-items: center; flex-wrap: wrap; gap: 4px 6px; max-width: calc(100% - 8px); min-width: 0; margin: 1px 0; padding: 3px 8px 3px 7px; border-radius: 5px; border: 1px solid ${ThemeCss.inkAlpha(0.14)}; border-left: 3px solid var(--solid-script-chip-color); background: ${ThemeCss.buttonBackground}; color: ${ThemeCss.textColor}; cursor: default; user-select: none; outline: none; box-sizing: border-box; }
.${c.chip}:hover { background: ${ThemeCss.buttonHoverBackground}; }
.${c.chipLabel} { font-weight: 700; white-space: nowrap; color: var(--solid-script-chip-color); margin-right: 2px; }
.${c.chipClose} { padding-top: 1px; padding-bottom: 1px; background: transparent; }
.${c.chipClose} .${c.chipLabel} { font-weight: 600; }
.${c.chipNote} { font-style: italic; color: ${ThemeCss.textColor}; white-space: pre-wrap; }
.${c.chipNote}::before { content: '// '; color: var(--solid-script-chip-color); font-style: normal; font-family: ${SOLID_SCRIPT_EDITOR_CODE_FONT}; }
.${c.blank} { min-width: 160px; height: 22px; border: 1px dashed transparent; background: transparent; }
.${c.row}.${c.current} .${c.blank}, .${c.blank}:hover { border-color: ${ThemeCss.inkAlpha(0.22)}; }
.${c.parameter} { display: inline-flex; align-items: baseline; gap: 5px; padding: 1px 6px; border-radius: 4px; background: ${ThemeCss.inkAlpha(0.06)}; white-space: nowrap; }
.${c.parameterName} { font-size: 11px; font-weight: 500; color: ${ThemeCss.textColor}; }
.${c.parameterValue} { font: 600 12px ${SOLID_SCRIPT_EDITOR_CODE_FONT}; color: ${ThemeCss.inputTextColor}; white-space: pre; }
.${c.row}.${c.dropBefore}::before, .${c.row}.${c.dropAfter}::after { content: ''; position: absolute; left: 40px; right: 8px; height: 2px; background: ${ThemeCss.accentColor}; pointer-events: none; }
.${c.row}.${c.dropBefore}::before { top: -1px; }
.${c.row}.${c.dropAfter}::after { bottom: -1px; }
.${c.row}.${c.dropInto} { background: ${ThemeCss.accentAlpha(0.14)}; }
.${c.row}.${c.current} { background: ${ThemeCss.inkAlpha(0.05)}; }
.${c.row}.${c.traced} .${c.gutter} { color: ${ThemeCss.accentColor}; }
.${c.row}.${c.traced} { box-shadow: inset 3px 0 0 ${ThemeCss.accentAlpha(0.45)}; }
.${c.row}.${c.stepped} { background: ${ThemeCss.accentAlpha(0.2)}; }
.${c.row}.${c.stepped} .${c.gutter} { color: ${ThemeCss.accentColor}; font-weight: 700; }
.${c.row}.${c.failed} .${c.gutter} { color: #e5484d; font-weight: 700; }
.${c.row}.${c.failed} { box-shadow: inset 3px 0 0 #e5484d; }
`;

/** Help panel and output area rules. */
const SOLID_SCRIPT_EDITOR_PANES_CSS = `
.${c.help} { width: 220px; flex-shrink: 0; overflow-y: auto; padding: 10px 12px; border-left: 1px solid ${ThemeCss.separatorColor}; box-sizing: border-box; }
.${c.helpTitle} { display: flex; align-items: center; gap: 7px; font-size: 14px; font-weight: 700; }
.${c.helpCategory} { margin: 2px 0 8px; font-size: 11px; color: ${ThemeCss.mutedTextColor}; }
.${c.helpText} { margin: 0 0 8px; line-height: 1.45; }
.${c.helpParameter} { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 2px 8px; align-items: baseline; padding: 6px 0; border-top: 1px solid ${ThemeCss.inkAlpha(0.08)}; }
.${c.helpParameter} .${c.parameterValue} { overflow: hidden; text-overflow: ellipsis; text-align: right; }
.${c.helpParameter} .${c.helpText} { grid-column: 1 / -1; margin: 0; color: ${ThemeCss.textColor}; opacity: 0.85; font-size: 11px; }
.${c.helpUsage} { margin: 10px 0 0; padding-top: 8px; border-top: 1px solid ${ThemeCss.inkAlpha(0.08)}; font-size: 11px; line-height: 1.45; color: ${ThemeCss.mutedTextColor}; }
.${c.output} { display: flex; flex-direction: column; flex-shrink: 0; height: 112px; border-top: 1px solid ${ThemeCss.separatorColor}; }
.${c.outputTabs} { display: flex; gap: 2px; padding: 4px 8px 0; }
.${c.outputTab} { padding: 3px 10px; border: none; border-bottom: 2px solid transparent; background: none; color: ${ThemeCss.textColor}; font: inherit; cursor: pointer; }
.${c.outputTab}[aria-selected="true"] { border-bottom-color: ${ThemeCss.accentColor}; font-weight: 600; }
.${c.outputTab}.${c.outputError} { color: #e5484d; }
.${c.outputText}, .${c.variables} { flex: 1; min-height: 0; overflow-y: auto; padding: 5px 12px; font: 12px ${SOLID_SCRIPT_EDITOR_CODE_FONT}; white-space: pre-wrap; color: ${ThemeCss.textColor}; }
.${c.outputText}.${c.outputError} { color: #e5484d; }
.${c.variablesCaption} { margin-bottom: 4px; font: 11px ${Theme.uiFontFamily}; color: ${ThemeCss.mutedTextColor}; }
.${c.variable} { display: grid; grid-template-columns: minmax(80px, max-content) minmax(0, 1fr); gap: 12px; padding: 1px 0; }
`;

/** Configurator and file dialog rules. */
const SOLID_SCRIPT_EDITOR_DIALOG_CSS = `
.${c.field} { display: grid; grid-template-columns: 112px minmax(0, 1fr); align-items: center; gap: 8px; margin-bottom: 8px; }
.${c.fieldLabel} { color: ${ThemeCss.textColor}; font-weight: 500; }
.${c.fieldHint} { grid-column: 2; margin-top: -4px; font-size: 11px; line-height: 1.35; color: ${ThemeCss.textColor}; opacity: 0.8; }
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
  style.textContent = [
    SOLID_SCRIPT_EDITOR_FRAME_CSS,
    SOLID_SCRIPT_EDITOR_LINES_CSS,
    SOLID_SCRIPT_EDITOR_PANES_CSS,
    SOLID_SCRIPT_EDITOR_DIALOG_CSS,
  ]
    .join('\n')
    .trim();
  document.head.appendChild(style);
}
