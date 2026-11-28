import { ThemeCss } from '@/ui/theme/theme_ui_css_variables.js';

/** One tab of the Debug Menu. */
export interface DebugMenuTab {
  /** Tab label. */
  readonly label: string;
  /** Content shown while the tab is selected. */
  readonly element: HTMLElement;
  /** The tab became visible: build and start updating. */
  show(): void;
  /** The tab was hidden: stop updating and let go of what it shows. */
  hide(): void;
  /** Called about once a second while visible. */
  refresh(): void;
  /** Stops everything. */
  dispose(): void;
}

/**
 * Creates a small muted line of text.
 *
 * @param text Text.
 * @returns Element.
 */
export function debugMenuNote(text: string): HTMLElement {
  const note = document.createElement('div');
  note.textContent = text;
  note.style.color = ThemeCss.mutedTextColor;
  note.style.fontSize = '11px';
  note.style.lineHeight = '1.4';
  return note;
}

/**
 * Creates a table with a header row; cells are filled by the caller.
 *
 * @param headers Column titles.
 * @param numeric Columns aligned right (numbers).
 * @returns Table and its body.
 */
export function debugMenuTable(
  headers: readonly string[],
  numeric: ReadonlySet<number> = new Set(),
): { table: HTMLTableElement; body: HTMLTableSectionElement } {
  const table = document.createElement('table');
  table.style.width = '100%';
  table.style.borderCollapse = 'collapse';
  table.style.fontSize = '11px';
  table.style.color = ThemeCss.textColor;
  table.style.fontVariantNumeric = 'tabular-nums';
  const head = table.createTHead().insertRow();
  headers.forEach((header, index) => {
    const cell = document.createElement('th');
    cell.textContent = header;
    cell.style.textAlign = numeric.has(index) ? 'right' : 'left';
    cell.style.fontWeight = '500';
    cell.style.color = ThemeCss.mutedTextColor;
    cell.style.padding = '3px 6px';
    cell.style.borderBottom = `1px solid ${ThemeCss.separatorColor}`;
    cell.style.position = 'sticky';
    cell.style.top = '0';
    cell.style.background = ThemeCss.panelBackground;
    cell.style.whiteSpace = 'nowrap';
    head.appendChild(cell);
  });
  return { table, body: table.createTBody() };
}

/**
 * Appends a row of text cells.
 *
 * @param body Table body.
 * @param cells Cell texts.
 * @param numeric Columns aligned right.
 * @returns Row.
 */
export function debugMenuRow(
  body: HTMLTableSectionElement,
  cells: readonly string[],
  numeric: ReadonlySet<number> = new Set(),
): HTMLTableRowElement {
  const row = body.insertRow();
  cells.forEach((text, index) => {
    const cell = row.insertCell();
    cell.textContent = text;
    cell.style.padding = '2px 6px';
    cell.style.textAlign = numeric.has(index) ? 'right' : 'left';
    cell.style.whiteSpace = 'nowrap';
    cell.style.borderBottom = `1px solid ${ThemeCss.separatorColor}`;
  });
  return row;
}
