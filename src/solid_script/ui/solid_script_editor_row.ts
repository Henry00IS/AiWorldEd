import { solidScriptCommandFind } from '@/solid_script/commands/solid_script_command_catalog.js';
import type { SolidScriptCommand, SolidScriptCommandEntry } from '@/solid_script/commands/solid_script_command.js';
import type { SolidScriptBlock } from '@/solid_script/document/solid_script_document.js';
import { solidScriptBlockNesting } from '@/solid_script/document/solid_script_document_indent.js';
import { solidScriptBlockIsBlank } from '@/solid_script/document/solid_script_document_edit.js';
import { SOLID_SCRIPT_EDITOR_CATEGORY_COLORS, SOLID_SCRIPT_EDITOR_CLASSES } from './solid_script_editor_css.js';
import { solidScriptEditorIcon } from './solid_script_editor_icons.js';

/** Drag data type of a script line being moved. */
export const SOLID_SCRIPT_EDITOR_DRAG_LINE = 'application/x-aiworlded-solidscript-line';

/** Indent per block level in pixels. */
const SOLID_SCRIPT_EDITOR_INDENT_PX = 20;

/** Accent of lines whose command this editor does not know. */
const SOLID_SCRIPT_EDITOR_UNKNOWN_COLOR = '#e5484d';

/** What a row reports back. */
export interface SolidScriptEditorRowHandlers {
  /** Handles a key on the line. */
  key: (event: KeyboardEvent, line: number) => void;
  /** Opens the configurator of the line. */
  configure: (line: number) => void;
  /** The line got the keyboard focus. */
  focus: (line: number) => void;
}

/** How one row looks: its line, indent and the block an End closes. */
export interface SolidScriptEditorRowLook {
  /** Line index. */
  line: number;
  /** Block depth. */
  depth: number;
  /** Label of the block an End line closes, or empty. */
  closes: string;
}

/**
 * Builds one script row: the line number and the command line, which is
 * focusable, draggable and opens its configurator on double-click.
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
  const gutter = document.createElement('div');
  gutter.className = SOLID_SCRIPT_EDITOR_CLASSES.gutter;
  gutter.textContent = String(look.line + 1);
  const chip = solidScriptEditorChipBuild(block, look, handlers);
  chip.style.marginLeft = `${look.depth * SOLID_SCRIPT_EDITOR_INDENT_PX}px`;
  row.append(gutter, chip);
  return row;
}

/**
 * Builds the focusable, draggable command line of a row.
 *
 * @param block Line.
 * @param look Row look.
 * @param handlers Row callbacks.
 * @returns Line element.
 */
function solidScriptEditorChipBuild(
  block: SolidScriptBlock,
  look: SolidScriptEditorRowLook,
  handlers: SolidScriptEditorRowHandlers,
): HTMLElement {
  const chip = document.createElement('div');
  chip.className = SOLID_SCRIPT_EDITOR_CLASSES.chip;
  chip.tabIndex = 0;
  chip.draggable = true;
  chip.dataset['command'] = block.command;
  solidScriptEditorChipFill(chip, block, look.closes);
  chip.addEventListener('dblclick', () => handlers.configure(look.line));
  chip.addEventListener('keydown', (event) => handlers.key(event, look.line));
  chip.addEventListener('focus', () => handlers.focus(look.line));
  chip.addEventListener('dragstart', (event) => {
    event.dataTransfer?.setData(SOLID_SCRIPT_EDITOR_DRAG_LINE, String(look.line));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  });
  return chip;
}

/**
 * Fills a command line: a blank line stays empty, an End names its block, any
 * other line shows its icon, name and every parameter with its value.
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
  const color = command
    ? (SOLID_SCRIPT_EDITOR_CATEGORY_COLORS[command.category] ?? 'currentColor')
    : SOLID_SCRIPT_EDITOR_UNKNOWN_COLOR;
  chip.style.setProperty('--solid-script-chip-color', color);
  const nesting = solidScriptBlockNesting(block);
  chip.classList.toggle(SOLID_SCRIPT_EDITOR_CLASSES.chipClose, nesting === 'close');
  const label = document.createElement('span');
  label.className = SOLID_SCRIPT_EDITOR_CLASSES.chipLabel;
  label.textContent = solidScriptEditorChipLabel(command, block, closes);
  chip.append(solidScriptEditorIcon(command?.category ?? 'Logic', color), label);
  if (command) chip.append(...solidScriptEditorChipParameters(command, block));
  chip.title = solidScriptEditorChipTitle(command, nesting === 'close');
}

/**
 * Returns the name a command line shows: its command, "End" with the block it
 * closes, or the id of a command this editor does not know.
 *
 * @param command Command, or undefined when unknown.
 * @param block Line.
 * @param closes Label of the block an End closes.
 * @returns Name.
 */
function solidScriptEditorChipLabel(
  command: SolidScriptCommand | undefined,
  block: SolidScriptBlock,
  closes: string,
): string {
  if (!command) return `Unknown Command: ${block.command}`;
  return solidScriptBlockNesting(block) === 'close' && closes ? `End ${closes}` : command.label;
}

/**
 * Builds the parameter pills of a command line: every caption next to its
 * value, readable at a glance. A note shows its text as a comment instead.
 *
 * @param command Command.
 * @param block Line.
 * @returns Pill elements.
 */
function solidScriptEditorChipParameters(command: SolidScriptCommand, block: SolidScriptBlock): HTMLElement[] {
  const entries = command.entries(block.values);
  if (command.id === 'note') {
    const note = document.createElement('span');
    note.className = SOLID_SCRIPT_EDITOR_CLASSES.chipNote;
    note.textContent = entries[0]?.value ?? '';
    return [note];
  }
  return entries.map((entry) => solidScriptEditorParameterPill(entry, command));
}

/**
 * Builds one parameter pill.
 *
 * @param entry Parameter and value.
 * @param command Command, for the parameter type.
 * @returns Pill element.
 */
function solidScriptEditorParameterPill(entry: SolidScriptCommandEntry, command: SolidScriptCommand): HTMLElement {
  const pill = document.createElement('span');
  pill.className = SOLID_SCRIPT_EDITOR_CLASSES.parameter;
  pill.dataset['parameter'] = entry.key;
  const name = document.createElement('span');
  name.className = SOLID_SCRIPT_EDITOR_CLASSES.parameterName;
  name.textContent = entry.label;
  const value = document.createElement('span');
  value.className = SOLID_SCRIPT_EDITOR_CLASSES.parameterValue;
  value.textContent = solidScriptEditorValueText(command, entry.key, entry.value);
  pill.append(name, value);
  return pill;
}

/**
 * Returns how a stored value reads: Yes or No for a switch, the value itself
 * otherwise.
 *
 * @param command Command, for the parameter type.
 * @param key Parameter key.
 * @param value Stored value.
 * @returns Shown text.
 */
export function solidScriptEditorValueText(command: SolidScriptCommand, key: string, value: string): string {
  if (command.parameters.find((parameter) => parameter.key === key)?.type !== 'boolean') return value;
  return value === 'true' ? 'Yes' : value === 'false' ? 'No' : value;
}

/**
 * Returns the hover text of a command line.
 *
 * @param command Command, or undefined when unknown.
 * @param end True for an End line.
 * @returns Hover text.
 */
function solidScriptEditorChipTitle(command: SolidScriptCommand | undefined, end: boolean): string {
  if (!command) return 'This editor does not know this command; it stops the script.';
  if (end) return 'Closes the block above. Remove the line that opens the block to remove it.';
  return `${command.description}\nDouble-click or press Enter to configure.`;
}
