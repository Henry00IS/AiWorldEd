import { solidScriptCommandFind } from '@/solid_script/commands/solid_script_command_catalog.js';
import { SOLID_SCRIPT_COMMAND_END } from '@/solid_script/commands/solid_script_commands_logic.js';
import type { SolidScriptBlock, SolidScriptBlockCommand } from '@/solid_script/document/solid_script_document.js';
import { SOLID_SCRIPT_EDITOR_CATEGORY_COLORS, SOLID_SCRIPT_EDITOR_CLASSES } from './solid_script_editor_css.js';
import { solidScriptEditorIcon } from './solid_script_editor_icons.js';

/** Drag data type carrying the index of a command line being moved. */
export const SOLID_SCRIPT_EDITOR_DRAG_LINE = 'application/x-aiworlded-solidscript-line';

/** Indentation per block depth in pixels. */
const SOLID_SCRIPT_EDITOR_INDENT_PX = 18;

/** What a script line reports back to the line list. */
export interface SolidScriptEditorRowHandlers {
  /** A key went down in a code line. */
  codeKey: (event: KeyboardEvent, input: HTMLInputElement, line: number) => void;
  /** A code line's text changed. */
  codeInput: (line: number, code: string) => void;
  /** A code line lost the focus. */
  codeBlur: () => void;
  /** A key went down on a command line. */
  chipKey: (event: KeyboardEvent, line: number) => void;
  /** A command line asks for its configurator. */
  configure: (line: number) => void;
  /** A line got the focus. */
  focus: (line: number) => void;
}

/** How one line is shown. */
export interface SolidScriptEditorRowLook {
  /** Line index. */
  line: number;
  /** Block depth. */
  depth: number;
  /** Name of the block an End line closes. */
  closes: string;
}

/**
 * Builds one script line: a text field for code, a chip for a command.
 *
 * @param block Line.
 * @param look Index, depth and closed block.
 * @param handlers Event callbacks.
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
  const gutter = document.createElement('div');
  gutter.className = SOLID_SCRIPT_EDITOR_CLASSES.gutter;
  gutter.textContent = String(look.line + 1);
  const content =
    block.type === 'code'
      ? solidScriptEditorCodeBuild(block.code, look.line, handlers)
      : solidScriptEditorChipBuild(block, look, handlers);
  content.style.marginLeft = `${look.depth * SOLID_SCRIPT_EDITOR_INDENT_PX}px`;
  row.append(gutter, content);
  return row;
}

/**
 * Builds the text field of a code line.
 *
 * @param code Line text.
 * @param line Line index.
 * @param handlers Event callbacks.
 * @returns Field.
 */
function solidScriptEditorCodeBuild(
  code: string,
  line: number,
  handlers: SolidScriptEditorRowHandlers,
): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'text';
  input.className = SOLID_SCRIPT_EDITOR_CLASSES.code;
  input.value = code;
  input.spellcheck = false;
  input.dataset['typing'] = 'false';
  input.setAttribute('aria-label', `Line ${line + 1}`);
  input.addEventListener('input', () => handlers.codeInput(line, input.value));
  input.addEventListener('keydown', (event) => handlers.codeKey(event, input, line));
  input.addEventListener('focus', () => handlers.focus(line));
  input.addEventListener('blur', () => handlers.codeBlur());
  return input;
}

/**
 * Builds the chip of a command line.
 *
 * @param block Command line.
 * @param look Index, depth and closed block.
 * @param handlers Event callbacks.
 * @returns Chip.
 */
function solidScriptEditorChipBuild(
  block: SolidScriptBlockCommand,
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
  chip.addEventListener('keydown', (event) => handlers.chipKey(event, look.line));
  chip.addEventListener('focus', () => handlers.focus(look.line));
  chip.addEventListener('dragstart', (event) => {
    event.dataTransfer?.setData(SOLID_SCRIPT_EDITOR_DRAG_LINE, String(look.line));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  });
  return chip;
}

/**
 * Writes a chip's icon, name and values.
 *
 * @param chip Chip element.
 * @param block Command line.
 * @param closes Name of the block an End line closes.
 */
function solidScriptEditorChipFill(chip: HTMLElement, block: SolidScriptBlockCommand, closes: string): void {
  const command = solidScriptCommandFind(block.command);
  const end = block.command === SOLID_SCRIPT_COMMAND_END;
  const color = command ? SOLID_SCRIPT_EDITOR_CATEGORY_COLORS[command.category] : '#e5484d';
  chip.style.setProperty('--solid-script-chip-color', color ?? 'currentColor');
  const label = document.createElement('span');
  label.className = SOLID_SCRIPT_EDITOR_CLASSES.chipLabel;
  label.textContent = !command ? `Unknown Command: ${block.command}` : end && closes ? `End ${closes}` : command.label;
  const summary = document.createElement('span');
  summary.className = SOLID_SCRIPT_EDITOR_CLASSES.chipSummary;
  summary.textContent = command && !end ? command.details(block.values) : '';
  chip.title = command
    ? `${command.summary(block.values)}\n${end ? 'Closes the block above.' : 'Double-click to configure.'}`
    : 'This editor does not know this command; it stops the script.';
  chip.append(solidScriptEditorIcon(command?.category ?? 'Logic', color), label, summary);
}
