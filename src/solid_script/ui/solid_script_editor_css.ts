import { ThemeCss } from '@/ui/theme/theme_ui_css_variables.js';
import { UiStackLayers } from '@/ui/stack/ui_stack_layers.js';
import { Theme } from '@/theme.js';

/** DOM id of the style element holding the script editor rules. */
const SOLID_SCRIPT_EDITOR_STYLE_ID = 'solid-script-editor-stylesheet';

/** Font of script code. */
export const SOLID_SCRIPT_EDITOR_CODE_FONT = 'Consolas, "Cascadia Mono", "SF Mono", Menlo, monospace';

/** Indent per block level of a script line in pixels. */
export const SOLID_SCRIPT_EDITOR_INDENT_PX = 20;

/** Class names of the script editor. */
export const SOLID_SCRIPT_EDITOR_CLASSES = {
  root: 'solid-script-editor',
  toolbar: 'solid-script-editor-toolbar',
  tool: 'solid-script-editor-tool',
  toolSeparator: 'solid-script-editor-tool-separator',
  body: 'solid-script-editor-body',
  palette: 'solid-script-editor-palette',
  paletteCaption: 'solid-script-editor-palette-caption',
  paletteFavorites: 'solid-script-editor-palette-favorites',
  paletteItem: 'solid-script-editor-palette-item',
  paletteSearch: 'solid-script-editor-palette-search',
  paletteList: 'solid-script-editor-palette-list',
  paletteEmpty: 'solid-script-editor-palette-empty',
  paletteHighlighted: 'solid-script-editor-palette-highlighted',
  lines: 'solid-script-editor-lines',
  row: 'solid-script-editor-row',
  gutter: 'solid-script-editor-gutter',
  linesHost: 'solid-script-editor-lines-host',
  linesCanvas: 'solid-script-editor-lines-canvas',
  chip: 'solid-script-editor-chip',
  listName: 'solid-script-editor-list-name',
  listWord: 'solid-script-editor-list-word',
  listValue: 'solid-script-editor-list-value',
  listVariable: 'solid-script-editor-list-variable',
  listNote: 'solid-script-editor-list-note',
  unknown: 'solid-script-editor-unknown',
  blank: 'solid-script-editor-blank',
  parameterName: 'solid-script-editor-parameter-name',
  parameterValue: 'solid-script-editor-parameter-value',
  dropBefore: 'solid-script-editor-drop-before',
  dropAfter: 'solid-script-editor-drop-after',
  dropInto: 'solid-script-editor-drop-into',
  current: 'solid-script-editor-current',
  stepped: 'solid-script-editor-stepped',
  traced: 'solid-script-editor-traced',
  breakpoint: 'solid-script-editor-breakpoint',
  failed: 'solid-script-editor-failed',
  output: 'solid-script-editor-output',
  outputTabs: 'solid-script-editor-output-tabs',
  outputTab: 'solid-script-editor-output-tab',
  outputText: 'solid-script-editor-output-text',
  outputError: 'solid-script-editor-output-error',
  outputFailure: 'solid-script-editor-output-failure',
  outputWarning: 'solid-script-editor-output-warning',
  variablesCaption: 'solid-script-editor-variables-caption',
  help: 'solid-script-editor-help',
  helpTitle: 'solid-script-editor-help-title',
  helpCategory: 'solid-script-editor-help-category',
  helpText: 'solid-script-editor-help-text',
  helpUsage: 'solid-script-editor-help-usage',
  helpParameter: 'solid-script-editor-help-parameter',
  helpStops: 'solid-script-editor-help-stops',
  helpMore: 'solid-script-editor-help-more',
  helpLink: 'solid-script-editor-help-link',
  off: 'solid-script-editor-off',
  runs: 'solid-script-editor-runs',
  icon: 'solid-script-editor-icon',
  field: 'solid-script-editor-field',
  fieldLabel: 'solid-script-editor-field-label',
  fieldInputs: 'solid-script-editor-field-inputs',
  fieldHint: 'solid-script-editor-field-hint',
  fieldEach: 'solid-script-editor-field-each',
  fieldEachIcon: 'solid-script-editor-field-each-icon',
  listEach: 'solid-script-editor-list-each',
  listEachIcon: 'solid-script-editor-list-each-icon',
  suggestionEach: 'solid-script-editor-suggestion-each',
  helpEach: 'solid-script-editor-help-each',
  input: 'solid-script-editor-input',
  preview: 'solid-script-editor-preview',
  list: 'solid-script-editor-list',
  listItem: 'solid-script-editor-list-item',
  selected: 'solid-script-editor-selected',
  invalid: 'solid-script-editor-invalid',
  suggestions: 'solid-script-editor-suggestions',
  suggestionsHost: 'solid-script-editor-suggestions-host',
  scrollHost: 'solid-script-editor-scroll-host',
  inputAdd: 'solid-script-editor-input-add',
  suggestion: 'solid-script-editor-suggestion',
  suggestionHeading: 'solid-script-editor-suggestion-heading',
  suggestionDetail: 'solid-script-editor-suggestion-detail',
  suggestionSignature: 'solid-script-editor-suggestion-signature',
  splitterColumn: 'solid-script-editor-splitter-column',
  splitterRow: 'solid-script-editor-splitter-row',
  fieldWarning: 'solid-script-editor-field-warning',
  stackFrame: 'solid-script-editor-stack-frame',
  explorer: 'solid-script-editor-explorer',
  explorerTop: 'solid-script-editor-explorer-top',
  explorerSearch: 'solid-script-editor-explorer-search',
  explorerBody: 'solid-script-editor-explorer-body',
  explorerCategories: 'solid-script-editor-explorer-categories',
  explorerCategory: 'solid-script-editor-explorer-category',
  explorerColumn: 'solid-script-editor-explorer-column',
  explorerTable: 'solid-script-editor-explorer-table',
  explorerRow: 'solid-script-editor-explorer-row',
  explorerHeader: 'solid-script-editor-explorer-header',
  explorerItem: 'solid-script-editor-explorer-item',
  explorerPlaceholder: 'solid-script-editor-explorer-placeholder',
  explorerLines: 'solid-script-editor-explorer-lines',
  explorerLine: 'solid-script-editor-explorer-line',
  tokenBracket: 'solid-script-editor-token-bracket',
  tokenName: 'solid-script-editor-token-name',
  tokenLocal: 'solid-script-editor-token-local',
  tokenPersistent: 'solid-script-editor-token-persistent',
  tokenSystem: 'solid-script-editor-token-system',
  tokenFunction: 'solid-script-editor-token-function',
  tokenNumber: 'solid-script-editor-token-number',
  tokenString: 'solid-script-editor-token-string',
  tokenOperator: 'solid-script-editor-token-operator',
  tokenKeyword: 'solid-script-editor-token-keyword',
  bracketAround: 'solid-script-editor-bracket-around',
  squiggle: 'solid-script-editor-squiggle',
  squiggleError: 'solid-script-editor-squiggle-error',
  fieldCode: 'solid-script-editor-field-code',
  fieldCodeLayer: 'solid-script-editor-field-code-layer',
  guides: 'solid-script-editor-guides',
  settingsGroup: 'solid-script-editor-settings-group',
  settingsOption: 'solid-script-editor-settings-option',
  fieldFormula: 'solid-script-editor-field-formula',
  colorSwatch: 'solid-script-editor-color-swatch',
  formulaBody: 'solid-script-editor-formula-body',
  formulaText: 'solid-script-editor-formula-text',
  codeTip: 'solid-script-editor-code-tip',
  codeTipHeading: 'solid-script-editor-code-tip-heading',
  codeTipText: 'solid-script-editor-code-tip-text',
  formulaSide: 'solid-script-editor-formula-side',
  formulaStatus: 'solid-script-editor-formula-status',
  formulaProblem: 'solid-script-editor-formula-problem',
  formulaOff: 'solid-script-editor-formula-off',
  shade: 'solid-script-editor-shade',
} as const;

/** Accent colour of each palette category, readable on light and dark panels. */
export const SOLID_SCRIPT_EDITOR_CATEGORY_COLORS: Readonly<Record<string, string>> = {
  Solids: '#e2762b',
  Generators: '#c2603a',
  '2D Shapes': '#2aa198',
  Transforms: '#3d8fd6',
  Combine: '#9b6bd6',
  Objects: '#d98a2b',
  Meshes: '#c99a1e',
  Faces: '#d0703c',
  Edges: '#c4563f',
  Vertices: '#b8507f',
  Points: '#7d6fd4',
  Paths: '#3b9fc6',
  UVs: '#5aa55a',
  Data: '#9a8256',
  Inputs: '#4f9e6b',
  Widgets: '#d6a23d',
  Logic: '#8a9a3c',
  Lists: '#3ca7a0',
  Dictionaries: '#9a8256',
  Parts: '#d4537e',
  Groups: '#2e9e5b',
  Operators: '#9b6bd6',
  Checks: '#3d8fd6',
  Math: '#2aa198',
  Trigonometry: '#d4537e',
  Vector: '#3d8fd6',
  Text: '#4f9e6b',
  List: '#3ca7a0',
  Dictionary: '#9a8256',
  Curve: '#e2762b',
  Random: '#c99a1e',
  Functions: '#2aa198',
  Values: '#c99a1e',
};

const c = SOLID_SCRIPT_EDITOR_CLASSES;

/** Window, toolbar and palette rules. */
const SOLID_SCRIPT_EDITOR_FRAME_CSS = `
.${c.root} { display: flex; flex-direction: column; color: ${ThemeCss.textColor}; font-family: ${Theme.uiFontFamily}; font-size: 12px; }
.${c.toolbar} { display: flex; align-items: center; gap: 4px; padding: 6px 8px; border-bottom: 1px solid ${ThemeCss.separatorColor}; background: linear-gradient(180deg, ${ThemeCss.toolbarBackground}, ${ThemeCss.toolbarBackgroundEnd}); flex-shrink: 0; }
.${c.tool} { display: inline-flex; align-items: center; gap: 5px; height: 26px; padding: 0 9px; border-radius: 5px; border: 1px solid ${ThemeCss.inkAlpha(0.12)}; background: ${ThemeCss.buttonBackground}; color: ${ThemeCss.textColor}; font: inherit; cursor: pointer; }
.${c.tool}:hover:not(:disabled) { background: ${ThemeCss.buttonHoverBackground}; }
.${c.tool}:focus-visible, .${c.paletteItem}:focus-visible, .${c.listItem}:focus-visible { outline: 2px solid ${ThemeCss.accentColor}; outline-offset: -2px; }
.${c.tool}:disabled { opacity: 0.45; cursor: default; }
.${c.tool}[aria-pressed="true"] { border-color: ${ThemeCss.accentColor}; background: ${ThemeCss.accentAlpha(0.22)}; }
.${c.toolSeparator} { width: 1px; height: 18px; margin: 0 4px; background: ${ThemeCss.separatorColor}; }
.${c.icon} { display: inline-flex; width: 14px; height: 14px; flex-shrink: 0; }
.${c.icon} svg { width: 100%; height: 100%; }
.${c.body} { display: flex; flex: 1; min-height: 0; }
.${c.splitterColumn} { flex: 0 0 5px; margin: 0 -2px; cursor: col-resize; z-index: 1; }
.${c.splitterRow} { flex: 0 0 5px; margin: -2px 0; cursor: row-resize; z-index: 1; }
.${c.splitterColumn}:hover, .${c.splitterRow}:hover { background: ${ThemeCss.inkAlpha(0.12)}; }
.${c.palette} { width: 176px; flex-shrink: 0; display: flex; flex-direction: column; min-height: 0; border-right: 1px solid ${ThemeCss.separatorColor}; }
.${c.paletteSearch} { margin: 6px 6px 2px; padding: 4px 8px; border: 1px solid ${ThemeCss.separatorColor}; border-radius: 5px; background: ${ThemeCss.inputBackground}; color: ${ThemeCss.textColor}; font: inherit; outline: none; min-width: 0; }
.${c.paletteSearch}:focus { border-color: ${ThemeCss.accentColor}; }
.${c.paletteList} { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; padding: 0 0 6px; }
.${c.paletteEmpty} { padding: 8px 12px; color: ${ThemeCss.mutedTextColor}; line-height: 1.4; }
.${c.paletteCaption} { padding: 6px 12px 1px; font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; color: ${ThemeCss.mutedTextColor}; white-space: nowrap; }
.${c.paletteItem} { display: flex; align-items: center; gap: 7px; height: 22px; margin: 0 6px; padding: 0 8px; border-radius: 4px; cursor: grab; user-select: none; white-space: nowrap; overflow: hidden; }
.${c.paletteItem}.${c.paletteHighlighted} { background: ${ThemeCss.accentAlpha(0.32)}; }
.${c.paletteItem}[hidden], .${c.paletteCaption}[hidden], .${c.paletteFavorites}[hidden] { display: none; }
.${c.paletteItem}:hover { background: ${ThemeCss.inkAlpha(0.07)}; }
.${c.paletteItem}:active { cursor: grabbing; }
`;

/**
 * Colour of the line the debugger has built up to: distinct from the orange
 * selection.
 */
export const SOLID_SCRIPT_EDITOR_STEP_COLOR = '#2f9e6e';

/** Colour of 🔁 each-item fields, notes and help. */
export const SOLID_SCRIPT_EDITOR_EACH_COLOR = '#2f9e44';

/** Corner radius of configurator text boxes. */
const SOLID_SCRIPT_EDITOR_INPUT_RADIUS = '4px';

/** Colour of the breakpoint dot in the gutter. */
export const SOLID_SCRIPT_EDITOR_BREAKPOINT_COLOR = '#e5484d';

/**
 * Script line rules: one full-width row per line in one readable colour set,
 * the selection in the editor's orange accent across the whole row, and the
 * debugger's step in its own green with a marker.
 */
const SOLID_SCRIPT_EDITOR_LINES_CSS = `
.${c.linesHost} { position: relative; flex: 1; min-width: 0; display: flex; background: ${ThemeCss.inputBackground}; }
.${c.lines} { flex: 1; min-width: 0; overflow: auto; }
.${c.linesCanvas} { position: relative; min-width: 100%; }
.${c.row} { position: absolute; left: 0; min-width: 100%; height: 24px; display: flex; align-items: stretch; flex-wrap: nowrap; white-space: pre; cursor: default; user-select: none; background: var(--solid-script-row-bg, transparent); box-sizing: border-box; }
.${c.row}:hover { --solid-script-row-bg: ${ThemeCss.inkAlpha(0.05)}; }
.${c.gutter} { position: sticky; left: 0; z-index: 1; width: 44px; flex-shrink: 0; padding-right: 8px; display: flex; align-items: center; justify-content: flex-end; color: ${ThemeCss.mutedTextColor}; font: 11px ${SOLID_SCRIPT_EDITOR_CODE_FONT}; box-sizing: border-box; background: linear-gradient(var(--solid-script-row-bg, transparent), var(--solid-script-row-bg, transparent)), ${ThemeCss.inputBackground}; }
.${c.chip} { flex: 1 0 auto; display: flex; flex-wrap: nowrap; align-items: center; padding: 0 16px 0 8px; white-space: pre; color: ${ThemeCss.textColor}; font: 12px ${SOLID_SCRIPT_EDITOR_CODE_FONT}; outline: none; box-sizing: border-box; }
.${c.chip} > span { flex-shrink: 0; white-space: pre; }
.${c.listName} { font-weight: 700; color: ${ThemeCss.textColor}; }
.${c.listWord} { color: ${ThemeCss.textColor}; }
.${c.listValue} { color: ${ThemeCss.inputTextColor}; font-weight: 600; }
.${c.listEach} { color: ${SOLID_SCRIPT_EDITOR_EACH_COLOR}; }
.${c.listEachIcon} { margin-right: 0.25em; }
.${c.listVariable} { color: #3d8fd6; font-weight: 700; }
.${c.listNote} { color: ${SOLID_SCRIPT_EDITOR_EACH_COLOR}; font-weight: 700; }
.${c.unknown} .${c.listName} { color: #e5484d; }
.${c.guides} { background-image: repeating-linear-gradient(to right, ${ThemeCss.inkAlpha(0.16)} 0 1px, transparent 1px ${SOLID_SCRIPT_EDITOR_INDENT_PX}px); background-repeat: no-repeat; background-position: 11px 0; }
.${c.chip} > .${c.icon} { margin-right: 6px; }
.${c.tokenBracket} { color: ${ThemeCss.mutedTextColor}; font-weight: 400; }
.${c.tokenOperator} { color: ${ThemeCss.codeOperatorColor}; font-weight: 400; }
.${c.tokenName} { color: #3d8fd6; }
.${c.tokenLocal} { color: #2aa198; }
.${c.tokenPersistent} { color: #9b6bd6; }
.${c.tokenSystem} { color: #d4537e; }
.${c.tokenFunction} { color: #c99a1e; }
.${c.tokenNumber} { color: #4f9e6b; }
.${c.tokenString} { color: #c2603a; }
.${c.tokenKeyword} { color: #8a63c9; }
.${c.bracketAround} { color: ${ThemeCss.textColor}; -webkit-text-stroke: 0.6px currentColor; }
.${c.squiggle}, .${c.squiggleError} { text-decoration: underline wavy #d4a72c; text-decoration-skip-ink: none; text-underline-offset: 3px; }
.${c.squiggleError} { text-decoration-color: #e5484d; }
.${c.settingsGroup} { display: grid; gap: 4px; margin: 4px 0 0; padding: 6px 10px 8px; border: 1px solid ${ThemeCss.separatorColor}; border-radius: 5px; }
.${c.settingsGroup} > legend { padding: 0 4px; font-weight: 600; }
.${c.settingsGroup} > label, .${c.settingsOption} { display: flex; gap: 6px; align-items: center; }
.${c.fieldCode} { position: relative; display: flex; flex: 1; min-width: 0; }
.${c.fieldCode}:has(> input[hidden]) { display: none; }
.${c.fieldCode} > .${c.input} { color: transparent; caret-color: ${ThemeCss.inputTextColor}; }
.${c.fieldCodeLayer} { position: absolute; inset: 0; display: flex; align-items: center; padding: 0 8px; overflow: hidden; white-space: pre; pointer-events: none; color: ${ThemeCss.inputTextColor}; font: 12px ${SOLID_SCRIPT_EDITOR_CODE_FONT}; }
.${c.fieldCodeLayer} > span { white-space: pre; }
.${c.row}.${c.dropBefore}::before, .${c.row}.${c.dropAfter}::after { content: ''; position: absolute; left: 44px; right: 0; height: 2px; background: ${ThemeCss.accentColor}; pointer-events: none; }
.${c.row}.${c.dropBefore}::before { top: -1px; }
.${c.row}.${c.dropAfter}::after { bottom: -1px; }
.${c.row}.${c.dropInto} { --solid-script-row-bg: ${ThemeCss.accentAlpha(0.14)}; }
.${c.row}.${c.traced} { --solid-script-row-bg: color-mix(in srgb, ${SOLID_SCRIPT_EDITOR_STEP_COLOR} 12%, transparent); }
.${c.row}.${c.traced} .${c.gutter} { box-shadow: inset 4px 0 0 ${SOLID_SCRIPT_EDITOR_STEP_COLOR}; }
.${c.row}.${c.stepped} { --solid-script-row-bg: color-mix(in srgb, ${SOLID_SCRIPT_EDITOR_STEP_COLOR} 26%, transparent); }
.${c.row}.${c.stepped} .${c.gutter} { color: ${SOLID_SCRIPT_EDITOR_STEP_COLOR}; font-weight: 700; }
.${c.row}.${c.stepped} .${c.gutter}::before { content: '\\25B6'; margin-right: 4px; font-size: 9px; }
.${c.gutter} { cursor: pointer; }
.${c.gutter}:hover::after { content: ''; order: -1; width: 9px; height: 9px; margin-right: 5px; border-radius: 50%; background: ${SOLID_SCRIPT_EDITOR_BREAKPOINT_COLOR}; opacity: 0.35; flex-shrink: 0; }
.${c.row}.${c.breakpoint} .${c.gutter}::after { content: ''; order: -1; width: 9px; height: 9px; margin-right: 5px; border-radius: 50%; background: ${SOLID_SCRIPT_EDITOR_BREAKPOINT_COLOR}; opacity: 1; flex-shrink: 0; }
.${c.row}.${c.selected} { --solid-script-row-bg: ${ThemeCss.accentAlpha(0.2)}; }
.${c.row}.${c.current} { --solid-script-row-bg: ${ThemeCss.accentAlpha(0.38)}; }
.${c.row}.${c.current} .${c.gutter} { color: ${ThemeCss.textColor}; font-weight: 700; }
.${c.row}.${c.failed} .${c.gutter} { color: #e5484d; font-weight: 700; }
.${c.row}.${c.failed} .${c.gutter} { box-shadow: inset 3px 0 0 #e5484d; }
`;

/** Help panel and output area rules. */
const SOLID_SCRIPT_EDITOR_PANES_CSS = `
.${c.help} { width: 220px; flex-shrink: 0; overflow-y: auto; padding: 10px 12px; border-left: 1px solid ${ThemeCss.separatorColor}; box-sizing: border-box; }
.${c.helpTitle} { font-size: 14px; font-weight: 700; }
.${c.helpCategory} { margin: 2px 0 8px; font-size: 11px; color: ${ThemeCss.mutedTextColor}; }
.${c.helpText} { margin: 0 0 8px; line-height: 1.45; white-space: pre-wrap; }
.${c.helpParameter} { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 2px 8px; align-items: baseline; padding: 6px 0; border-top: 1px solid ${ThemeCss.inkAlpha(0.08)}; }
.${c.helpParameter} .${c.parameterValue} { overflow: hidden; text-overflow: ellipsis; }
.${c.helpParameter} .${c.helpText} { grid-column: 1 / -1; margin: 0; color: ${ThemeCss.textColor}; opacity: 0.85; font-size: 11px; }
.${c.helpLink} { color: inherit; font-weight: 600; text-decoration: underline dotted; text-underline-offset: 2px; cursor: pointer; }
.${c.helpLink}:hover { text-decoration-style: solid; }
.${c.helpStops} { margin: 0 0 8px; padding-left: 16px; font-size: 11px; line-height: 1.45; }
.${c.helpMore} { margin: 10px 0 0; border-top: 1px solid ${ThemeCss.separatorColor}; padding-top: 6px; }
.${c.helpMore} > summary { cursor: pointer; font-size: 11px; color: ${ThemeCss.mutedTextColor}; margin-bottom: 6px; user-select: none; }
.${c.helpMore} > summary:hover { color: ${ThemeCss.textColor}; }
.${c.runs} { position: sticky; right: 0; z-index: 1; flex: none; display: flex; align-items: center; color: ${ThemeCss.mutedTextColor}; font: 11px ${SOLID_SCRIPT_EDITOR_CODE_FONT}; background: linear-gradient(var(--solid-script-row-bg, transparent), var(--solid-script-row-bg, transparent)), ${ThemeCss.inputBackground}; }
.${c.runs}:not(:empty) { padding: 0 22px 0 6px; }
.${c.off} .${c.chip} { opacity: 0.42; text-decoration: line-through; text-decoration-color: ${ThemeCss.inkAlpha(0.35)}; }
.${c.helpUsage} { margin: 10px 0 0; padding-top: 8px; border-top: 1px solid ${ThemeCss.inkAlpha(0.08)}; font-size: 11px; line-height: 1.45; color: ${ThemeCss.mutedTextColor}; }
.${c.output} { display: flex; flex-direction: column; flex-shrink: 0; height: 140px; border-top: 1px solid ${ThemeCss.separatorColor}; }
.${c.outputTabs} { display: flex; gap: 2px; padding: 4px 8px 0; }
.${c.outputTab} { padding: 3px 10px; border: none; border-bottom: 2px solid transparent; background: none; color: ${ThemeCss.textColor}; font: inherit; cursor: pointer; }
.${c.outputTab}[aria-selected="true"] { border-bottom-color: ${ThemeCss.accentColor}; font-weight: 600; }
.${c.outputTab}.${c.outputError} { color: #e5484d; }
.${c.outputText} { flex: 1; min-height: 0; overflow-y: auto; padding: 5px 12px; font: 12px ${SOLID_SCRIPT_EDITOR_CODE_FONT}; white-space: pre-wrap; color: ${ThemeCss.textColor}; user-select: text; cursor: text; caret-color: currentColor; outline: none; }
.${c.outputFailure} { color: #e5484d; display: flex; flex-direction: column; align-items: flex-start; gap: 8px; }
.${c.outputWarning} { color: #f5a524; }
.${c.outputWarning} > button { background: none; border: none; padding: 0; font: inherit; color: inherit; }
.${c.variablesCaption} { margin-bottom: 4px; font: 11px ${Theme.uiFontFamily}; color: ${ThemeCss.mutedTextColor}; }
.${c.inputAdd} { margin: 2px 0 4px; padding: 2px 8px; font: inherit; border-radius: 4px; cursor: pointer; color: ${ThemeCss.textColor}; background: ${ThemeCss.inkAlpha(0.06)}; border: 1px solid ${ThemeCss.inkAlpha(0.16)}; }
.${c.inputAdd}:hover { background: ${ThemeCss.inkAlpha(0.12)}; }
.${c.stackFrame} { cursor: pointer; border-radius: 3px; font-weight: 600; }
.${c.stackFrame}:hover { background: ${ThemeCss.inkAlpha(0.06)}; }
.${c.explorer} { flex: 1 1 0; min-height: 0; display: flex; flex-direction: column; font: 12px ${SOLID_SCRIPT_EDITOR_CODE_FONT}; color: ${ThemeCss.textColor}; }
.${c.explorerTop} { display: flex; gap: 6px; align-items: center; padding: 4px 8px; }
.${c.explorerSearch} { flex: 1; min-width: 0; height: 22px; padding: 0 8px; border-radius: 4px; border: 1px solid ${ThemeCss.inputBorderColor}; background: ${ThemeCss.inkAlpha(0.04)}; color: ${ThemeCss.textColor}; font: 12px ${Theme.uiFontFamily}; }
.${c.explorerTop} .${c.inputAdd} { margin: 0; }
.${c.explorerBody} { flex: 1 1 0; min-height: 0; display: flex; }
.${c.explorerCategories} { width: 128px; padding: 2px 4px; overflow-y: auto; border-right: 1px solid ${ThemeCss.inkAlpha(0.1)}; }
.${c.explorerCategory} { display: flex; width: 100%; justify-content: space-between; gap: 6px; padding: 2px 6px; border: 0; border-radius: 3px; background: transparent; color: ${ThemeCss.textColor}; font: 12px ${Theme.uiFontFamily}; text-align: left; cursor: pointer; }
.${c.explorerCategory}:hover { background: ${ThemeCss.inkAlpha(0.06)}; }
.${c.explorerCategory}[aria-selected="true"] { background: ${ThemeCss.inkAlpha(0.12)}; font-weight: 600; }
.${c.explorerColumn} { flex: 1 1 0; min-width: 0; overflow: auto; padding: 4px 10px; }
.${c.explorerRow} { display: grid; grid-template-columns: minmax(90px, 1.1fr) minmax(70px, 1.4fr) minmax(70px, 0.9fr) minmax(40px, 0.6fr); gap: 10px; padding: 1px 4px; border-radius: 3px; cursor: pointer; white-space: nowrap; }
.${c.explorerRow} > span { overflow: hidden; text-overflow: ellipsis; }
.${c.explorerRow}:hover { background: ${ThemeCss.inkAlpha(0.06)}; }
.${c.explorerRow}.${c.selected} { background: ${ThemeCss.inkAlpha(0.14)}; }
.${c.explorerHeader} { cursor: default; font: 600 11px ${Theme.uiFontFamily}; color: ${ThemeCss.mutedTextColor}; }
.${c.explorerHeader}:hover { background: transparent; }
.${c.explorerItem} { padding-left: 18px; }
.${c.explorerPlaceholder} { color: ${ThemeCss.mutedTextColor}; font-style: italic; }
.${c.explorerLines} { display: flex; gap: 3px; }
.${c.explorerLine} { padding: 0 4px; border: 0; border-radius: 3px; background: ${ThemeCss.inkAlpha(0.08)}; color: ${ThemeCss.textColor}; font: inherit; cursor: pointer; }
.${c.explorerLine}:hover { background: ${ThemeCss.inkAlpha(0.18)}; }
.${c.stackFrame} { display: grid; grid-template-columns: minmax(80px, max-content) minmax(0, 1fr); gap: 12px; padding: 1px 0; }
`;

/** Configurator and file dialog rules. */
const SOLID_SCRIPT_EDITOR_DIALOG_CSS = `
.${c.field} { display: grid; grid-template-columns: 112px minmax(0, 1fr); align-items: center; gap: 8px; margin-bottom: 8px; }
.${c.fieldLabel} { color: ${ThemeCss.textColor}; font-weight: 500; }
.${c.fieldHint} { grid-column: 2; margin-top: -4px; font-size: 11px; line-height: 1.35; color: ${ThemeCss.textColor}; opacity: 0.8; }
.${c.fieldEachIcon} { display: none; margin-right: 0.3em; }
.${c.fieldEach} .${c.fieldEachIcon} { display: inline; }
.${c.fieldEach} .${c.fieldCode}::before, .${c.fieldEach} .${c.fieldCode}::after { content: ''; position: absolute; left: 0; right: 0; height: 8px; box-sizing: border-box; border: 2px solid ${SOLID_SCRIPT_EDITOR_EACH_COLOR}; pointer-events: none; z-index: 1; }
.${c.fieldEach} .${c.fieldCode}::before { top: 0; border-bottom: none; border-radius: ${SOLID_SCRIPT_EDITOR_INPUT_RADIUS} ${SOLID_SCRIPT_EDITOR_INPUT_RADIUS} 0 0; }
.${c.fieldEach} .${c.fieldCode}::after { bottom: 0; border-top: none; border-radius: 0 0 ${SOLID_SCRIPT_EDITOR_INPUT_RADIUS} ${SOLID_SCRIPT_EDITOR_INPUT_RADIUS}; }
.${c.fieldEach} .${c.input}:focus { outline: none; border-color: ${ThemeCss.accentColor}; box-shadow: inset 0 0 0 1px ${ThemeCss.accentColor}; }
.${c.helpEach} { color: ${SOLID_SCRIPT_EDITOR_EACH_COLOR}; }
.${c.suggestionEach} { color: ${SOLID_SCRIPT_EDITOR_EACH_COLOR}; }
.${c.fieldInputs} { position: relative; display: flex; gap: 6px; min-width: 0; }
.${c.input}.${c.invalid} { border-color: #e5484d; }
.${c.scrollHost} { position: relative; display: flex; flex-direction: column; min-width: 0; min-height: 0; }
.${c.scrollHost} > :first-child { flex: 1 1 auto; min-height: 0; }
.${c.scrollHost}[hidden], .${c.explorer}[hidden] { display: none; }
.${c.suggestionsHost} { position: fixed; z-index: ${UiStackLayers.modalPopup}; display: flex; flex-direction: column; border-radius: 6px; border: 1px solid ${ThemeCss.inputBorderColor}; background: ${ThemeCss.inputBackground}; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4); overflow: hidden; }
.${c.suggestionsHost}[hidden] { display: none; }
.${c.suggestionSignature} { padding: 6px 12px; border-bottom: 1px solid ${ThemeCss.inkAlpha(0.1)}; font: 12px ${SOLID_SCRIPT_EDITOR_CODE_FONT}; color: ${ThemeCss.inputTextColor}; white-space: normal; }
.${c.suggestionSignature}[hidden] { display: none; }
/* No top padding: a sticky heading must sit flush at the top, with nothing showing above it. */
.${c.suggestions} { max-height: 380px; overflow-y: auto; padding: 0 0 4px; }
.${c.suggestionHeading} { position: sticky; top: 0; z-index: 1; margin: 0; padding: 6px 12px 3px; font-size: 10px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: ${ThemeCss.mutedTextColor}; background: ${ThemeCss.inputBackground}; }
.${c.suggestion} { display: grid; grid-template-columns: minmax(120px, max-content) 1fr; gap: 16px; padding: 4px 12px; font: 12px ${SOLID_SCRIPT_EDITOR_CODE_FONT}; color: ${ThemeCss.inputTextColor}; cursor: pointer; white-space: nowrap; }
.${c.suggestion}[aria-selected="true"], .${c.suggestion}:hover { background: ${ThemeCss.accentAlpha(0.3)}; }
.${c.suggestionDetail} { overflow: hidden; text-overflow: ellipsis; color: ${ThemeCss.mutedTextColor}; }
.${c.fieldWarning} { color: ${ThemeCss.mutedTextColor}; }
.${c.input} { flex: 1; min-width: 0; height: 26px; padding: 0 7px; border-radius: ${SOLID_SCRIPT_EDITOR_INPUT_RADIUS}; border: 1px solid ${ThemeCss.inputBorderColor}; background: ${ThemeCss.inputBackground}; color: ${ThemeCss.inputTextColor}; font: 12px ${SOLID_SCRIPT_EDITOR_CODE_FONT}; box-sizing: border-box; }
.${c.input}:focus { outline: none; border-color: ${ThemeCss.accentColor}; }
.${c.field}[hidden] { display: none; }
.${c.fieldFormula} { flex: 0 0 auto; width: 26px; height: 26px; padding: 0; border-radius: ${SOLID_SCRIPT_EDITOR_INPUT_RADIUS}; border: 1px solid ${ThemeCss.inkAlpha(0.16)}; background: ${ThemeCss.inkAlpha(0.06)}; color: ${ThemeCss.textColor}; font: inherit; cursor: pointer; }
.${c.fieldFormula}:hover { background: ${ThemeCss.inkAlpha(0.12)}; }
.${c.colorSwatch} { flex: 0 0 auto; width: 26px; height: 26px; padding: 1px; border-radius: ${SOLID_SCRIPT_EDITOR_INPUT_RADIUS}; border: 1px solid ${ThemeCss.inkAlpha(0.16)}; background: ${ThemeCss.inputBackground}; cursor: pointer; }
.${c.formulaBody} { display: flex; flex: 1 1 0; min-height: 0; margin-bottom: 10px; }
.${c.formulaBody} > .${c.palette} { flex-shrink: 0; border: 1px solid ${ThemeCss.separatorColor}; border-radius: 5px; }
.${c.formulaBody} > .${c.linesHost} { flex: 1; min-width: 0; border: 1px solid ${ThemeCss.separatorColor}; border-radius: 5px; overflow: hidden; }
.${c.formulaSide} { flex-shrink: 0; min-width: 0; display: flex; flex-direction: column; gap: 8px; }
.${c.formulaSide} > .${c.scrollHost} { min-height: 0; border: 1px solid ${ThemeCss.separatorColor}; border-radius: 5px; overflow: hidden; }
.${c.formulaSide} .${c.help} { width: auto; flex: 1 1 0; border-left: none; }
.${c.formulaText} { flex: 0 0 auto; max-height: 40%; overflow: auto; padding: 8px 10px; border-radius: 5px; border: 1px solid ${ThemeCss.inputBorderColor}; background: ${ThemeCss.inputBackground}; color: ${ThemeCss.inputTextColor}; font: 12px/1.5 ${SOLID_SCRIPT_EDITOR_CODE_FONT}; white-space: pre-wrap; overflow-wrap: anywhere; user-select: text; cursor: text; box-sizing: border-box; }
.${c.formulaText}:focus { outline: none; border-color: ${ThemeCss.accentColor}; }
.${c.formulaText}.${c.formulaOff} { opacity: 0.5; }
.${c.codeTip} { position: fixed; z-index: ${UiStackLayers.modalPopup}; max-width: 560px; padding: 6px 9px; border-radius: 5px; border: 1px solid ${ThemeCss.inputBorderColor}; background: ${ThemeCss.inputBackground}; color: ${ThemeCss.inputTextColor}; box-shadow: 0 6px 18px rgba(0, 0, 0, 0.4); pointer-events: none; }
.${c.codeTip}[hidden] { display: none; }
.${c.codeTipHeading} { margin-bottom: 4px; font-size: 11px; color: ${ThemeCss.mutedTextColor}; }
.${c.codeTipText} { font: 12px/1.5 ${SOLID_SCRIPT_EDITOR_CODE_FONT}; white-space: pre-wrap; overflow-wrap: anywhere; }
.${c.formulaStatus} { min-height: 16px; margin-bottom: 8px; color: ${ThemeCss.mutedTextColor}; }
.${c.formulaStatus}.${c.formulaProblem} { color: #e5484d; }
.${c.shade} { position: absolute; inset: 0; z-index: 10; background: rgba(0, 0, 0, calc(0.45 * var(--aiworlded-shadow-strength, 1))); }
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
