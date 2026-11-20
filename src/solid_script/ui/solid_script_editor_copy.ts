import { SOLID_SCRIPT_LISTING_INDENT } from '@/solid_script/document/solid_script_document_listing.js';
import { SOLID_SCRIPT_EDITOR_CLASSES } from './solid_script_editor_css.js';

/** One line to copy as it is shown: its block depth and its built row. */
export interface SolidScriptEditorShownLine {
  /** Block depth. */
  depth: number;
  /** Row as the code view builds it. */
  row: HTMLElement;
}

/** Lines copied as shown: plain text, and the same text as Markdown. */
export interface SolidScriptEditorShownCopy {
  /** Plain text. */
  text: string;
  /**
   * Markdown: block names in bold, End lines too, and Note lines in italics,
   * one line per line.
   */
  markdown: string;
}

/** Indent of one block level in Markdown: spaces that never start a code block. */
const SOLID_SCRIPT_EDITOR_SHOWN_MARKDOWN_INDENT = '\u00a0'.repeat(4);

/** Markdown characters a listed value keeps as typed. */
const SOLID_SCRIPT_EDITOR_SHOWN_MARKDOWN_SPECIAL = /[\\*_`]/g;

/** Selector of the listing pieces of a line element. */
const SOLID_SCRIPT_EDITOR_SHOWN_PIECES = [
  SOLID_SCRIPT_EDITOR_CLASSES.listName,
  SOLID_SCRIPT_EDITOR_CLASSES.listWord,
  SOLID_SCRIPT_EDITOR_CLASSES.listValue,
  SOLID_SCRIPT_EDITOR_CLASSES.listVariable,
  SOLID_SCRIPT_EDITOR_CLASSES.listNote,
]
  .map((name) => `.${name}`)
  .join(', ');

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
 * Writes one listing piece of a line element as Markdown: a block name in bold,
 * a note in italics, anything else with its Markdown characters kept as typed.
 * The space after a name stays outside the bold.
 *
 * @param piece Listing piece element.
 * @returns Markdown.
 */
function solidScriptEditorShownMarkdownPiece(piece: Element): string {
  const text = piece.textContent ?? '';
  if (piece.classList.contains(SOLID_SCRIPT_EDITOR_CLASSES.listNote)) return `_${text}_`;
  const typed = text.replace(SOLID_SCRIPT_EDITOR_SHOWN_MARKDOWN_SPECIAL, '\\$&');
  if (!piece.classList.contains(SOLID_SCRIPT_EDITOR_CLASSES.listName)) return typed;
  const name = typed.trimEnd();
  return `**${name}**${typed.slice(name.length)}`;
}

/**
 * Writes lines as the code view shows them, as Markdown: each line ends in a
 * line break, and the indent is made of spaces that do not start a code block.
 *
 * @param lines Lines.
 * @returns Markdown.
 */
export function solidScriptEditorShownMarkdown(lines: readonly SolidScriptEditorShownLine[]): string {
  const least = Math.min(...lines.filter((line) => solidScriptEditorShownChip(line.row)).map((line) => line.depth));
  const marked = lines.map((line) => {
    const chip = solidScriptEditorShownChip(line.row);
    if (!chip) return '';
    const pieces = [...chip.querySelectorAll(SOLID_SCRIPT_EDITOR_SHOWN_PIECES)].filter(
      (piece) => !piece.parentElement?.closest(SOLID_SCRIPT_EDITOR_SHOWN_PIECES),
    );
    const indent = SOLID_SCRIPT_EDITOR_SHOWN_MARKDOWN_INDENT.repeat(line.depth - least);
    return indent + pieces.map(solidScriptEditorShownMarkdownPiece).join('');
  });
  return marked.join('  \n');
}

/**
 * Copies lines as the code view shows them.
 *
 * @param lines Lines.
 * @returns Plain text and Markdown.
 */
export function solidScriptEditorShownCopy(lines: readonly SolidScriptEditorShownLine[]): SolidScriptEditorShownCopy {
  return { text: solidScriptEditorShownText(lines), markdown: solidScriptEditorShownMarkdown(lines) };
}
