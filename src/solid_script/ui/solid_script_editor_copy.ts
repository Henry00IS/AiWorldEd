import { SOLID_SCRIPT_LISTING_INDENT } from '@/solid_script/document/solid_script_document_listing.js';
import { SOLID_SCRIPT_EDITOR_CLASSES } from './solid_script_editor_css.js';

/** One line to copy as it is shown: its block depth and its built row. */
export interface SolidScriptEditorShownLine {
  /** Block depth. */
  depth: number;
  /** Row as the code view builds it. */
  row: HTMLElement;
}

/** Lines copied as shown: plain text and the same text coloured as HTML. */
export interface SolidScriptEditorShownCopy {
  /** Plain text. */
  text: string;
  /** HTML with the colours of the code view. */
  html: string;
}

/**
 * Finds the line element of a row, or null for a blank line.
 *
 * @param row Row.
 * @returns Line element holding the listing.
 */
function solidScriptEditorShownChip(row: HTMLElement): HTMLElement | null {
  const chip = row.querySelector<HTMLElement>(`.${SOLID_SCRIPT_EDITOR_CLASSES.chip}`);
  return chip && !chip.classList.contains(SOLID_SCRIPT_EDITOR_CLASSES.blank) ? chip : null;
}

/**
 * Indents the lines by their depth less the smallest depth of the lines with
 * text, so the copy starts at the left and keeps the indent inside it.
 *
 * @param lines Lines.
 * @returns Indent per line, empty for a blank line.
 */
export function solidScriptEditorShownIndents(lines: readonly SolidScriptEditorShownLine[]): string[] {
  const filled = lines.filter((line) => solidScriptEditorShownChip(line.row));
  const least = Math.min(...filled.map((line) => line.depth));
  return lines.map((line) =>
    solidScriptEditorShownChip(line.row) ? SOLID_SCRIPT_LISTING_INDENT.repeat(line.depth - least) : '',
  );
}

/**
 * Writes lines as the code view shows them, as plain text.
 *
 * @param lines Lines.
 * @returns Text, one line per line.
 */
export function solidScriptEditorShownText(lines: readonly SolidScriptEditorShownLine[]): string {
  const indents = solidScriptEditorShownIndents(lines);
  return lines
    .map(
      (line, index) =>
        (indents[index] ?? '') + (solidScriptEditorShownChip(line.row)?.getAttribute('aria-label') ?? ''),
    )
    .join('\n');
}

/**
 * Escapes text for HTML.
 *
 * @param text Text.
 * @returns Escaped text.
 */
function solidScriptEditorShownEscape(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Writes the text of a line element as coloured spans, each piece in the colour
 * and weight it shows in, leaving out icons.
 *
 * @param chip Line element, on the page.
 * @returns HTML.
 */
function solidScriptEditorShownSpans(chip: HTMLElement): string {
  const walker = chip.ownerDocument.createTreeWalker(chip, NodeFilter.SHOW_TEXT);
  const spans: string[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement;
    if (!parent || parent.closest('[aria-hidden="true"], svg')) continue;
    const style = getComputedStyle(parent);
    const look = `color:${style.color};font-weight:${style.fontWeight};font-style:${style.fontStyle}`;
    spans.push(
      `<span style="${solidScriptEditorShownEscape(look)}">${solidScriptEditorShownEscape(node.textContent ?? '')}</span>`,
    );
  }
  return spans.join('');
}

/**
 * Writes lines as the code view shows them, in its colours, as HTML. The rows
 * are put on the page under the view for a moment, so they take its styles.
 *
 * @param lines Lines.
 * @param view Code view the rows belong under.
 * @returns HTML.
 */
export function solidScriptEditorShownHtml(lines: readonly SolidScriptEditorShownLine[], view: HTMLElement): string {
  const shelf = view.ownerDocument.createElement('div');
  Object.assign(shelf.style, { position: 'absolute', visibility: 'hidden', left: '-10000px', top: '0' });
  shelf.append(...lines.map((line) => line.row));
  view.append(shelf);
  const indents = solidScriptEditorShownIndents(lines);
  const body = lines.map((line, index) => {
    const chip = solidScriptEditorShownChip(line.row);
    return (indents[index] ?? '') + (chip ? solidScriptEditorShownSpans(chip) : '');
  });
  const style = getComputedStyle(view);
  shelf.remove();
  const look = `font-family:${style.fontFamily};background:${style.backgroundColor};color:${style.color}`;
  return `<pre style="${solidScriptEditorShownEscape(look)}">${body.join('\n')}</pre>`;
}

/**
 * Copies lines as the code view shows them.
 *
 * @param lines Lines.
 * @param view Code view the rows belong under.
 * @returns Plain text and HTML.
 */
export function solidScriptEditorShownCopy(
  lines: readonly SolidScriptEditorShownLine[],
  view: HTMLElement,
): SolidScriptEditorShownCopy {
  return { text: solidScriptEditorShownText(lines), html: solidScriptEditorShownHtml(lines, view) };
}
