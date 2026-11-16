import { solidScriptScrollerWrap } from './solid_script_editor_scroll.js';
import type { SolidScriptCommand, SolidScriptCommandParameter } from '@/solid_script/commands/solid_script_command.js';
import type { SolidScriptBlock } from '@/solid_script/document/solid_script_document.js';
import { SOLID_SCRIPT_EDITOR_CATEGORY_COLORS, SOLID_SCRIPT_EDITOR_CLASSES } from './solid_script_editor_css.js';

/** What the help panel shows when nothing is selected. */
const SOLID_SCRIPT_EDITOR_HELP_EMPTY =
  'Select a command or a script line to read what it does and what each of its values means.';

/** How to use a palette command. */
const SOLID_SCRIPT_EDITOR_HELP_PALETTE =
  'Drag it into the script, or double-click it to add it below the current line. A blank current line is filled instead.';

/** How to use a script line. */
const SOLID_SCRIPT_EDITOR_HELP_LINE =
  'Double-click a line or press Enter to change it. Shift+click or Shift+↑/↓ selects more lines, and Ctrl+A selects all. Delete removes the selected lines. Ctrl+C copies, Ctrl+X cuts and Ctrl+V pastes. Ctrl+Shift+↑/↓ moves the selected lines. Space adds an empty line. Every line moves on its own, End lines too.';

/** How field text is read, shown under the values of every command with fields. */
const SOLID_SCRIPT_EDITOR_HELP_FIELDS =
  'Fields are plain text without quotes. [name] puts in a variable, [=formula] a calculation such as [=[i] * 2]. Write $[ and $] for brackets, $$ for a dollar sign.';

/**
 * The help panel beside the script: a short summary of the selected palette
 * command or script line and its values with their current text, and the full
 * manual, the mistakes that stop it and how to use it under More Details.
 */
export class SolidScriptEditorHelp {
  /** Panel element. */
  readonly element = document.createElement('aside');
  /** Host with the custom scrollbar, placed in the window. */
  readonly host: HTMLElement;
  /** True while More Details is open; it stays so for the next command. */
  private moreOpen = false;

  /** Builds the panel. */
  constructor() {
    this.element.className = SOLID_SCRIPT_EDITOR_CLASSES.help;
    this.element.setAttribute('aria-label', 'Command help');
    this.host = solidScriptScrollerWrap(this.element, '0 0 auto', 12);
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
    const title = document.createElement('div');
    title.className = SOLID_SCRIPT_EDITOR_CLASSES.helpTitle;
    title.style.color = SOLID_SCRIPT_EDITOR_CATEGORY_COLORS[command.category] ?? 'currentColor';
    title.textContent = command.label;
    const category = document.createElement('div');
    category.className = SOLID_SCRIPT_EDITOR_CLASSES.helpCategory;
    category.textContent =
      command.nesting === 'open' ? `${command.category} · holds the lines up to its End` : command.category;
    const description = solidScriptEditorHelpText(`${command.description}.`);
    description.style.fontWeight = '600';
    const manual = solidScriptEditorHelpText(command.manual);
    const fields = command.parameters.some((parameter) => parameter.type !== 'name' && parameter.type !== 'text')
      ? [solidScriptEditorHelpText(SOLID_SCRIPT_EDITOR_HELP_FIELDS)]
      : [];
    const usage = document.createElement('p');
    usage.className = SOLID_SCRIPT_EDITOR_CLASSES.helpUsage;
    usage.textContent = block ? SOLID_SCRIPT_EDITOR_HELP_LINE : SOLID_SCRIPT_EDITOR_HELP_PALETTE;
    const more = document.createElement('details');
    more.className = SOLID_SCRIPT_EDITOR_CLASSES.helpMore;
    more.open = this.moreOpen;
    more.addEventListener('toggle', () => (this.moreOpen = more.open));
    const moreTitle = document.createElement('summary');
    moreTitle.textContent = 'More Details';
    more.append(moreTitle, manual, ...fields, ...solidScriptEditorHelpStops(command), usage);
    this.element.replaceChildren(title, category, description, ...this.parameters(command, block), more);
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
    return command.parameters.map((parameter) =>
      solidScriptEditorHelpParameter(
        parameter,
        solidScriptEditorHelpValue(parameter, values.get(parameter.key) ?? parameter.default),
      ),
    );
  }
}

/**
 * Builds the help entry of one value: caption, current value and hint.
 *
 * @param parameter Parameter.
 * @param shown Value as shown.
 * @returns Entry element.
 */
function solidScriptEditorHelpParameter(parameter: SolidScriptCommandParameter, shown: string): HTMLElement {
  const item = document.createElement('div');
  item.className = SOLID_SCRIPT_EDITOR_CLASSES.helpParameter;
  const name = document.createElement('span');
  name.className = SOLID_SCRIPT_EDITOR_CLASSES.parameterName;
  name.textContent = parameter.label;
  const value = document.createElement('span');
  value.className = SOLID_SCRIPT_EDITOR_CLASSES.parameterValue;
  value.textContent = shown;
  const hint = document.createElement('div');
  hint.className = SOLID_SCRIPT_EDITOR_CLASSES.helpText;
  hint.textContent = parameter.hint;
  item.append(name, value, hint);
  return item;
}

/**
 * Builds a help paragraph.
 *
 * @param text Text.
 * @returns Paragraph.
 */
function solidScriptEditorHelpText(text: string): HTMLElement {
  const paragraph = document.createElement('p');
  paragraph.className = SOLID_SCRIPT_EDITOR_CLASSES.helpText;
  paragraph.textContent = text;
  return paragraph;
}

/**
 * Lists the mistakes that stop the script at a line of the command.
 *
 * @param command Command.
 * @returns Heading and list, or nothing.
 */
function solidScriptEditorHelpStops(command: SolidScriptCommand): HTMLElement[] {
  if (command.stops.length === 0) return [];
  const heading = document.createElement('div');
  heading.className = SOLID_SCRIPT_EDITOR_CLASSES.helpCategory;
  heading.textContent = 'Stops the script when';
  const list = document.createElement('ul');
  list.className = SOLID_SCRIPT_EDITOR_CLASSES.helpStops;
  list.append(
    ...command.stops.map((stop) => {
      const item = document.createElement('li');
      item.textContent = stop;
      return item;
    }),
  );
  return [heading, list];
}

/**
 * Returns how a value reads in the help: Yes or No for a switch, the field text
 * itself otherwise.
 *
 * @param parameter Parameter.
 * @param value Field text.
 * @returns Shown text.
 */
function solidScriptEditorHelpValue(parameter: SolidScriptCommandParameter, value: string): string {
  if (parameter.type !== 'boolean') return value;
  return value === 'true' ? 'Yes' : value === 'false' ? 'No' : value;
}
