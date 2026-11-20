import type { SolidScriptCommandCatalog } from '@/solid_script/commands/solid_script_command_catalog_base.js';
import type { SolidScriptCommand } from '@/solid_script/commands/solid_script_command.js';
import type { SolidScriptListingPart } from '@/solid_script/commands/solid_script_command_listing.js';
import type { SolidScriptBlock } from '@/solid_script/document/solid_script_document.js';
import { solidScriptBlockNesting } from '@/solid_script/document/solid_script_document_indent.js';
import { solidScriptBlockIsBlank } from '@/solid_script/document/solid_script_document_edit.js';
import { solidScriptBlockListing } from '@/solid_script/document/solid_script_document_listing.js';
import {
  SOLID_SCRIPT_EDITOR_CATEGORY_COLORS,
  SOLID_SCRIPT_EDITOR_CLASSES,
  SOLID_SCRIPT_EDITOR_INDENT_PX,
} from './solid_script_editor_css.js';
import { solidScriptEditorIcon } from './solid_script_editor_icons.js';
import { SOLID_SCRIPT_COMMAND_EACH_ICON } from '@/solid_script/commands/solid_script_command_each.js';
import type { SolidScriptEditorView } from './solid_script_editor_view.js';
import { solidScriptFieldHighlight } from './solid_script_field_highlight.js';

/** Drag data type of a script line being moved. */
export const SOLID_SCRIPT_EDITOR_DRAG_LINE = 'application/x-aiworlded-solidscript-line';

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
  /** Selects a line and scrolls it into view. */
  jump: (line: number) => void;
  /** The line got the keyboard focus. */
  focus: (line: number) => void;
  /**
   * The row was pressed with the left button; the event carries the modifier
   * keys.
   */
  press: (line: number, event: MouseEvent) => void;
  /** A press on the row ended without a drag. */
  release: (line: number) => void;
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
  /** Line that opens the block an End line closes, or -1. */
  opener: number;
  /** Command of that line, or empty. */
  openerCommand: string;
  /** True when the line is off, by itself or inside a block that is off. */
  off: boolean;
  /** View switches. */
  view: SolidScriptEditorView;
  /** Keys of names and calls on the line nothing defines. */
  unknown: ReadonlySet<string>;
  /** Keys of names the error on this line points at. */
  error: ReadonlySet<string>;
  /** Commands the line is found in. */
  catalog: SolidScriptCommandCatalog;
  /** True when the gutter sets breakpoints. */
  switches: boolean;
}

/**
 * Builds one script row across the full width: the line number and the line as
 * the listing reads. A press anywhere on the row selects the line (Shift adds
 * it, Ctrl toggles it), a right press leaves the selection and the focus to the
 * line menu, a double-click configures it (on an End line it selects the line
 * that opens the block), and the whole row can be dragged.
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
  if (look.switches) {
    gutter.title = 'Click to set or clear a breakpoint (F9)';
    gutter.addEventListener('click', () => handlers.breakpoint(look.line));
  }
  const chip = document.createElement('div');
  chip.className = SOLID_SCRIPT_EDITOR_CLASSES.chip;
  chip.tabIndex = 0;
  chip.dataset['command'] = block.command;
  chip.style.paddingLeft = `${8 + look.depth * SOLID_SCRIPT_EDITOR_INDENT_PX}px`;
  if (look.view.guides && look.depth > 0) {
    chip.classList.add(SOLID_SCRIPT_EDITOR_CLASSES.guides);
    chip.style.backgroundSize = `${look.depth * SOLID_SCRIPT_EDITOR_INDENT_PX}px 100%`;
  }
  solidScriptEditorChipFill(chip, block, look);
  row.append(gutter, chip);
  if (look.off) {
    row.classList.add(SOLID_SCRIPT_EDITOR_CLASSES.off);
    chip.title = block.off
      ? 'Turned off: it does not run. F4 turns it on again.'
      : 'Inside a block that is turned off.';
  }
  row.addEventListener('mousedown', (event) => solidScriptEditorRowMouseDown(event, chip, look.line, handlers));
  row.addEventListener('click', (event) => {
    if (!event.shiftKey && !event.ctrlKey && !event.metaKey) handlers.release(look.line);
  });
  row.addEventListener('dblclick', () =>
    look.opener >= 0 ? handlers.jump(look.opener) : handlers.configure(look.line),
  );
  chip.addEventListener('keydown', (event) => handlers.key(event, look.line));
  chip.addEventListener('focus', () => handlers.focus(look.line));
  row.addEventListener('dragstart', (event) => {
    event.dataTransfer?.setData(SOLID_SCRIPT_EDITOR_DRAG_LINE, String(look.line));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  });
  return row;
}

/**
 * Handles a press on a row. A right press is cancelled so the browser does not
 * move the focus, which would change the selection before the line menu opens.
 * A left press with a modifier, or outside the line text, is cancelled so it
 * starts no text selection or row drag.
 *
 * @param event Mouse down event.
 * @param chip Line element of the row.
 * @param line Line index.
 * @param handlers Row callbacks.
 */
function solidScriptEditorRowMouseDown(
  event: MouseEvent,
  chip: HTMLElement,
  line: number,
  handlers: SolidScriptEditorRowHandlers,
): void {
  if (event.button === 2) return event.preventDefault();
  if (event.button !== 0) return;
  const modified = event.shiftKey || event.ctrlKey || event.metaKey;
  if (modified || (event.target !== chip && !chip.contains(event.target as Node))) event.preventDefault();
  handlers.press(line, event);
}

/**
 * Fills a line with its listing: a blank line stays empty, an End names the
 * block it closes unless that view switch is off, and a command this editor
 * does not know says so. Values are highlighted like configurator fields, and
 * the command's icon leads when switched on; an End line shows the icon of the
 * block it closes.
 *
 * @param chip Line element.
 * @param block Line.
 * @param look Closed block, view switches and marks.
 */
function solidScriptEditorChipFill(chip: HTMLElement, block: SolidScriptBlock, look: SolidScriptEditorRowLook): void {
  const command = look.catalog.find(block.command);
  if (solidScriptBlockIsBlank(block)) {
    chip.classList.add(SOLID_SCRIPT_EDITOR_CLASSES.blank);
    chip.title = 'Blank line. Double-click a command in the palette, or drop one here, to fill it.';
    chip.setAttribute('aria-label', 'Blank line');
    return;
  }
  const parts = solidScriptBlockListing(block, look.view.endNames ? look.closes : '', look.catalog);
  const marks = { view: look.view, unknown: look.unknown, error: look.error, caret: null };
  const shown = look.openerCommand ? look.catalog.find(look.openerCommand) : command;
  if (look.view.icons && shown)
    chip.append(solidScriptEditorIcon(shown.category, SOLID_SCRIPT_EDITOR_CATEGORY_COLORS[shown.category]));
  chip.append(...parts.map((part) => solidScriptEditorListingPart(part, marks)));
  chip.classList.toggle(SOLID_SCRIPT_EDITOR_CLASSES.unknown, !command);
  chip.setAttribute('aria-label', parts.map((part) => part.text).join(''));
  chip.title = solidScriptEditorChipTitle(
    command,
    solidScriptBlockNesting(block, look.catalog) === 'close',
    solidScriptEditorLineConfigurable(block, look.catalog),
  );
}

/**
 * Builds one listing piece, with the per-element icon and colour when the value
 * is worked out once per element.
 *
 * @param part Listing piece.
 * @param marks Highlight marks of the line.
 * @returns Element.
 */
function solidScriptEditorListingPart(
  part: SolidScriptListingPart,
  marks: Parameters<typeof solidScriptFieldHighlight>[1],
): HTMLElement {
  const span = document.createElement('span');
  span.className = SOLID_SCRIPT_EDITOR_LISTING_CLASSES[part.kind];
  if (part.kind === 'value' || part.kind === 'variable') span.append(...solidScriptFieldHighlight(part.text, marks));
  else span.textContent = part.text;
  if (!part.each) return span;
  const wrap = document.createElement('span');
  wrap.className = SOLID_SCRIPT_EDITOR_CLASSES.listEach;
  wrap.title = 'Worked out once per element';
  const icon = document.createElement('span');
  icon.className = SOLID_SCRIPT_EDITOR_CLASSES.listEachIcon;
  icon.textContent = SOLID_SCRIPT_COMMAND_EACH_ICON;
  icon.setAttribute('aria-hidden', 'true');
  wrap.append(icon, span);
  return wrap;
}

/**
 * Returns the hover text of a line; only a line with values to set tells how to
 * configure it.
 *
 * @param command Command, or undefined when unknown.
 * @param end True for an End line.
 * @param configurable True when the line has values to set.
 * @returns Hover text.
 */
function solidScriptEditorChipTitle(
  command: SolidScriptCommand | undefined,
  end: boolean,
  configurable: boolean,
): string {
  if (!command) return 'This editor does not know this command; it stops the script.';
  if (end)
    return 'Closes the block above. Double-click to go to the line that opens it; remove that line to remove the block.';
  return configurable
    ? `${command.description}.\nDouble-click or press Enter to configure.`
    : `${command.description}.`;
}

/**
 * Tells whether a line has values to set: a known command with fields, not an
 * End line. A blank or unknown line counts too, so configuring it still says
 * what to do instead.
 *
 * @param block Line.
 * @param catalog Commands the line is found in.
 * @returns False for a line with nothing to configure.
 */
export function solidScriptEditorLineConfigurable(
  block: SolidScriptBlock,
  catalog: SolidScriptCommandCatalog,
): boolean {
  const command = catalog.find(block.command);
  if (!command || solidScriptBlockIsBlank(block)) return true;
  return command.nesting !== 'close' && command.parameters.length > 0;
}
