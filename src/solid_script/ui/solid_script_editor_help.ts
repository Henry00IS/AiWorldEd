import type { SolidScriptCommand } from '@/solid_script/commands/solid_script_command.js';
import type { SolidScriptBlock } from '@/solid_script/document/solid_script_document.js';
import { SOLID_SCRIPT_EDITOR_CATEGORY_COLORS, SOLID_SCRIPT_EDITOR_CLASSES } from './solid_script_editor_css.js';
import { solidScriptEditorIcon } from './solid_script_editor_icons.js';

/** What the help panel shows when nothing is selected. */
const SOLID_SCRIPT_EDITOR_HELP_EMPTY =
  'Select a command or a script line to read what it does and what each of its values means.';

/** How to use a palette command. */
const SOLID_SCRIPT_EDITOR_HELP_PALETTE =
  'Drag it into the script, or double-click it to add it below the current line. A blank current line is filled instead.';

/** How to use a script line. */
const SOLID_SCRIPT_EDITOR_HELP_LINE =
  'Double-click or press Enter to configure. Delete removes the line, Ctrl+Shift+↑/↓ moves it with its block, Shift+Enter adds a blank line below.';

/**
 * The help panel beside the script: the manual of the selected palette command
 * or script line, with every value explained and, for a line, its current
 * value.
 */
export class SolidScriptEditorHelp {
  /** Panel element. */
  readonly element = document.createElement('aside');

  /** Builds the panel. */
  constructor() {
    this.element.className = SOLID_SCRIPT_EDITOR_CLASSES.help;
    this.element.setAttribute('aria-label', 'Command help');
    this.clear();
  }

  /** Shows the hint for an empty selection. */
  clear(): void {
    const text = document.createElement('p');
    text.className = SOLID_SCRIPT_EDITOR_CLASSES.helpText;
    text.textContent = SOLID_SCRIPT_EDITOR_HELP_EMPTY;
    this.element.replaceChildren(text);
  }

  /**
   * Shows the manual of a command.
   *
   * @param command Command.
   * @param block Script line using it, or null for a palette command.
   */
  show(command: SolidScriptCommand, block: SolidScriptBlock | null): void {
    const color = SOLID_SCRIPT_EDITOR_CATEGORY_COLORS[command.category] ?? 'currentColor';
    const title = document.createElement('div');
    title.className = SOLID_SCRIPT_EDITOR_CLASSES.helpTitle;
    title.style.color = color;
    const label = document.createElement('span');
    label.textContent = command.label;
    title.append(solidScriptEditorIcon(command.category, color), label);
    const category = document.createElement('div');
    category.className = SOLID_SCRIPT_EDITOR_CLASSES.helpCategory;
    category.textContent =
      command.nesting === 'open' ? `${command.category} · opens a block up to its End` : command.category;
    const text = document.createElement('p');
    text.className = SOLID_SCRIPT_EDITOR_CLASSES.helpText;
    text.textContent = command.description;
    const usage = document.createElement('p');
    usage.className = SOLID_SCRIPT_EDITOR_CLASSES.helpUsage;
    usage.textContent = block ? SOLID_SCRIPT_EDITOR_HELP_LINE : SOLID_SCRIPT_EDITOR_HELP_PALETTE;
    this.element.replaceChildren(title, category, text, ...this.parameters(command, block), usage);
  }

  /**
   * Lists the values of a command with their captions, hints and current
   * values.
   *
   * @param command Command.
   * @param block Script line, or null.
   * @returns Elements of the list.
   */
  private parameters(command: SolidScriptCommand, block: SolidScriptBlock | null): HTMLElement[] {
    if (command.parameters.length === 0) return [];
    const values = new Map(
      command.entries(block?.values ?? command.valuesDefault()).map((entry) => [entry.key, entry.value]),
    );
    return command.parameters.map((parameter) => {
      const item = document.createElement('div');
      item.className = SOLID_SCRIPT_EDITOR_CLASSES.helpParameter;
      const name = document.createElement('span');
      name.className = SOLID_SCRIPT_EDITOR_CLASSES.parameterName;
      name.textContent = parameter.label;
      const value = document.createElement('span');
      value.className = SOLID_SCRIPT_EDITOR_CLASSES.parameterValue;
      value.textContent = values.get(parameter.key) ?? parameter.default;
      const hint = document.createElement('div');
      hint.className = SOLID_SCRIPT_EDITOR_CLASSES.helpText;
      hint.textContent = parameter.hint;
      item.append(name, value, hint);
      return item;
    });
  }
}
