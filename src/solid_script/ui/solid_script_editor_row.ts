import { solidScriptCommandFind } from '@/solid_script/commands/solid_script_command_catalog.js';
import type { SolidScriptCommand } from '@/solid_script/commands/solid_script_command.js';
import type { SolidScriptListingPart } from '@/solid_script/commands/solid_script_command_listing.js';
import type { SolidScriptBlock } from '@/solid_script/document/solid_script_document.js';
import { solidScriptBlockNesting } from '@/solid_script/document/solid_script_document_indent.js';
import { solidScriptBlockIsBlank } from '@/solid_script/document/solid_script_document_edit.js';
import { solidScriptBlockListing } from '@/solid_script/document/solid_script_document_listing.js';
import { SOLID_SCRIPT_EDITOR_CLASSES } from './solid_script_editor_css.js';

/** Drag data type of a script line being moved. */
export const SOLID_SCRIPT_EDITOR_DRAG_LINE = 'application/x-aiworlded-solidscript-line';

/** Indent per block level in pixels. */
const SOLID_SCRIPT_EDITOR_INDENT_PX = 20;

/** Class of each kind of listing piece. */
const SOLID_SCRIPT_EDITOR_LISTING_CLASSES: Readonly<Record<SolidScriptListingPart['kind'], string>> = {
  name: SOLID_SCRIPT_EDITOR_CLASSES.listName,
  word: SOLID_SCRIPT_EDITOR_CLASSES.listWord,
  value: SOLID_SCRIPT_EDITOR_CLASSES.listValue,
  variable: SOLID_SCRIPT_EDITOR_CLASSES.listVariable,
  note: SOLID_SCRIPT_EDITOR_CLASSES.listNote,
};

/** What a row reports back. */
export interface SolidScriptEditorRowHandlers {
  /** Handles a key on the line. */
  key: (event: KeyboardEvent, line: number) => void;
  /** Opens the configurator of the line. */
  configure: (line: number) => void;
  /** The line got the keyboard focus. */
  focus: (line: number) => void;
  /** The row was pressed; with Shift held the selection grows to it. */
  press: (line: number, extend: boolean) => void;
  /** Sets or clears the breakpoint of the line. */
  breakpoint: (line: number) => void;
}

/** How one row looks: its line, indent and the block an End closes. */
export interface SolidScriptEditorRowLook {
  /** Line index. */
  line: number;
  /** Block depth. */
  depth: number;
  /** Label of the block an End line closes, or empty. */
  closes: string;
  /** True when the line is off, by itself or inside a block that is off. */
  off: boolean;
}

/**
 * Builds one script row across the full width: the line number and the line as
 * the listing reads. A click anywhere on the row selects the line (Shift+click
 * selects every line up to it), a double-click configures it, and the whole row
 * can be dragged.
 *
 * @param block Line.
 * @param look Line index, indent and closed block.
 * @param handlers Row callbacks.
 * @returns Row element.
 */
export function solidScriptEditorRowBuild(
  block: SolidScriptBlock,
  look: SolidScriptEditorRowLook,
  handlers: SolidScriptEditorRowHandlers,
): HTMLElement {
  const row = document.createElement('div');
  row.className = SOLID_SCRIPT_EDITOR_CLASSES.row;
  row.dataset['line'] = String(look.line);
  row.setAttribute('role', 'listitem');
  row.draggable = true;
  const gutter = document.createElement('div');
  gutter.className = SOLID_SCRIPT_EDITOR_CLASSES.gutter;
  gutter.textContent = String(look.line + 1);
  gutter.title = 'Click to set or clear a breakpoint (F9)';
  gutter.addEventListener('click', () => handlers.breakpoint(look.line));
  const chip = document.createElement('div');
  chip.className = SOLID_SCRIPT_EDITOR_CLASSES.chip;
  chip.tabIndex = 0;
  chip.dataset['command'] = block.command;
  chip.style.paddingLeft = `${8 + look.depth * SOLID_SCRIPT_EDITOR_INDENT_PX}px`;
  solidScriptEditorChipFill(chip, block, look.closes);
  row.append(gutter, chip);
  if (look.off) {
    row.classList.add(SOLID_SCRIPT_EDITOR_CLASSES.off);
    chip.title = block.off
      ? 'Turned off: it does not run. F4 turns it on again.'
      : 'Inside a block that is turned off.';
  }
  row.addEventListener('mousedown', (event) => {
    if (event.button !== 0) return;
    handlers.press(look.line, event.shiftKey);
    if (event.shiftKey || (event.target !== chip && !chip.contains(event.target as Node))) {
      event.preventDefault();
      chip.focus();
    }
  });
  row.addEventListener('dblclick', () => handlers.configure(look.line));
  chip.addEventListener('keydown', (event) => handlers.key(event, look.line));
  chip.addEventListener('focus', () => handlers.focus(look.line));
  row.addEventListener('dragstart', (event) => {
    event.dataTransfer?.setData(SOLID_SCRIPT_EDITOR_DRAG_LINE, String(look.line));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  });
  return row;
}

/**
 * Fills a line with its listing: a blank line stays empty, an End names the
 * block it closes, and a command this editor does not know says so.
 *
 * @param chip Line element.
 * @param block Line.
 * @param closes Label of the block an End closes.
 */
function solidScriptEditorChipFill(chip: HTMLElement, block: SolidScriptBlock, closes: string): void {
  const command = solidScriptCommandFind(block.command);
  if (solidScriptBlockIsBlank(block)) {
    chip.classList.add(SOLID_SCRIPT_EDITOR_CLASSES.blank);
    chip.title = 'Blank line. Double-click a command in the palette, or drop one here, to fill it.';
    chip.setAttribute('aria-label', 'Blank line');
    return;
  }
  const parts = solidScriptBlockListing(block, closes);
  chip.append(
    ...parts.map((part) => {
      const span = document.createElement('span');
      span.className = SOLID_SCRIPT_EDITOR_LISTING_CLASSES[part.kind];
      span.textContent = part.text;
      return span;
    }),
  );
  chip.classList.toggle(SOLID_SCRIPT_EDITOR_CLASSES.unknown, !command);
  chip.setAttribute('aria-label', parts.map((part) => part.text).join(''));
  chip.title = solidScriptEditorChipTitle(command, solidScriptBlockNesting(block) === 'close');
}

/**
 * Returns the hover text of a line.
 *
 * @param command Command, or undefined when unknown.
 * @param end True for an End line.
 * @returns Hover text.
 */
function solidScriptEditorChipTitle(command: SolidScriptCommand | undefined, end: boolean): string {
  if (!command) return 'This editor does not know this command; it stops the script.';
  if (end) return 'Closes the block above. Remove the line that opens the block to remove it.';
  return `${command.description}.\nDouble-click or press Enter to configure.`;
}
