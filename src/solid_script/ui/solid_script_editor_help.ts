import { solidScriptScrollerWrap } from './solid_script_editor_scroll.js';
import type { SolidScriptCommand, SolidScriptCommandParameter } from '@/solid_script/commands/solid_script_command.js';
import { solidScriptParameterApplies } from '@/solid_script/commands/solid_script_command_parameters.js';
import {
  SOLID_SCRIPT_COMMAND_EACH_ICON,
  solidScriptEachNote,
  solidScriptEachSentence,
  solidScriptParameterEachActive,
} from '@/solid_script/commands/solid_script_command_each.js';
import type { SolidScriptBlock } from '@/solid_script/document/solid_script_document.js';
import { SOLID_SCRIPT_EDITOR_CATEGORY_COLORS, SOLID_SCRIPT_EDITOR_CLASSES } from './solid_script_editor_css.js';
import { solidScriptEditorLinked, type SolidScriptEditorLinkOpen } from './solid_script_editor_links.js';
import { solidScriptSentence } from '@/solid_script/language/solid_script_sentence.js';

/** What the help panel shows when nothing is selected. */
const SOLID_SCRIPT_EDITOR_HELP_EMPTY =
  'Select a command or a script line to read what it does and what each of its values means.';

/** How to use a palette command. */
const SOLID_SCRIPT_EDITOR_HELP_PALETTE =
  'Drag it into the script, or double-click it to add it below the current line. A blank current line is filled instead.';

/** How to use a script line. */
const SOLID_SCRIPT_EDITOR_HELP_LINE =
  'Double-click a line or press Enter to change it. Shift+click or Shift+↑/↓ selects more lines, Ctrl+click picks single lines, and Ctrl+A selects all. Drag selected lines to move them; picked lines land together. Delete removes the selected lines. Ctrl+C copies, Ctrl+X cuts and Ctrl+V pastes above the selection. Ctrl+Shift+↑/↓ moves the selected lines. F4, Ctrl+/, Off / On in the toolbar or the right-click menu turns them off and on: they stay but do not run, and the script saves them so. Only the selected lines change: a block line takes its End and Else along, and the lines inside keep running without it. Space adds an empty line above and stays on its line, Shift+Enter or Insert adds one below and moves onto it. Ctrl+V pastes above the selection. Every line moves on its own, End lines too.';

/** How field text is read, shown under the values of every command with fields. */
const SOLID_SCRIPT_EDITOR_HELP_FIELDS =
  'Fields are plain text without quotes. [Name] puts in a variable, [=formula] a calculation such as [=[I] * 2]. Write $[ and $] for brackets, $$ for a dollar sign, $, for a comma inside a list item.';

/** What the help panel says about using the editor it is in. */
export interface SolidScriptEditorHelpTexts {
  /** Shown when nothing is selected. */
  empty: string;
  /** How to use a palette entry. */
  palette: string;
  /** How to use a line. */
  line: string;
}

/** Help texts of the script editor. */
export const SOLID_SCRIPT_EDITOR_HELP_SCRIPT: Readonly<SolidScriptEditorHelpTexts> = {
  empty: SOLID_SCRIPT_EDITOR_HELP_EMPTY,
  palette: SOLID_SCRIPT_EDITOR_HELP_PALETTE,
  line: SOLID_SCRIPT_EDITOR_HELP_LINE,
};

/**
 * The help panel beside the script: a short summary of the selected palette
 * command or script line and its values with their current text, and the full
 * manual, the mistakes that stop it and how to use it under More Details. Every
 * mention of another command is a link that opens it in the palette.
 */
export class SolidScriptEditorHelp {
  /** Panel element. */
  readonly element = document.createElement('aside');
  /** Host with the custom scrollbar, placed in the window. */
  readonly host: HTMLElement;
  /** True while More Details is open; it stays so for the next command. */
  private moreOpen = false;

  /**
   * Builds the panel.
   *
   * @param open Opens a mentioned command in the palette, or null for plain
   *   text.
   * @param texts What it says about using the editor it is in.
   */
  constructor(
    private readonly open: SolidScriptEditorLinkOpen | null = null,
    private readonly texts: Readonly<SolidScriptEditorHelpTexts> = SOLID_SCRIPT_EDITOR_HELP_SCRIPT,
  ) {
    this.element.className = SOLID_SCRIPT_EDITOR_CLASSES.help;
    this.element.setAttribute('aria-label', 'Command help');
    this.host = solidScriptScrollerWrap(this.element, '0 0 auto', 12);
    this.clear();
  }

  /** Shows the hint for an empty selection. */
  clear(): void {
    const text = document.createElement('p');
    text.className = SOLID_SCRIPT_EDITOR_CLASSES.helpText;
    text.textContent = this.texts.empty;
    this.element.replaceChildren(text);
  }

  /**
   * Shows the manual of a command.
   *
   * @param command Command.
   * @param block Script line using it, or null for a palette command.
   */
  show(command: SolidScriptCommand, block: SolidScriptBlock | null): void {
    const { title, category } = solidScriptEditorHelpHeading(command);
    const description = solidScriptEditorHelpBlocks(
      solidScriptSentence(command.description),
      this.open,
      command.id,
      true,
    );
    const more = solidScriptEditorHelpMore(
      command,
      block ? this.texts.line : this.texts.palette,
      this.open,
      this.moreOpen,
      (open) => (this.moreOpen = open),
    );
    this.element.replaceChildren(title, category, ...description, ...this.parameters(command, block), more);
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
    const stored = Object.fromEntries(
      command.entries(block?.values ?? command.valuesDefault()).map((entry) => [entry.key, entry.value]),
    );
    return command.parameters
      .filter((parameter) => solidScriptParameterApplies(parameter, stored, command.parameters))
      .map((parameter) =>
        solidScriptEditorHelpParameter(
          parameter,
          this.open,
          command.id,
          solidScriptEditorHelpValue(parameter, stored[parameter.key] ?? parameter.default),
          stored,
        ),
      );
  }
}

/**
 * Builds the title and category line of a help panel.
 *
 * @param command Command.
 * @returns Title and category elements.
 */
function solidScriptEditorHelpHeading(command: SolidScriptCommand): { title: HTMLElement; category: HTMLElement } {
  const title = document.createElement('div');
  title.className = SOLID_SCRIPT_EDITOR_CLASSES.helpTitle;
  title.style.color = SOLID_SCRIPT_EDITOR_CATEGORY_COLORS[command.category] ?? 'currentColor';
  title.textContent = command.label;
  const category = document.createElement('div');
  category.className = SOLID_SCRIPT_EDITOR_CLASSES.helpCategory;
  category.textContent =
    command.nesting === 'open' ? `${command.category} · holds the lines up to its End` : command.category;
  return { title, category };
}

/**
 * Splits help text on blank lines into paragraphs, keeping line breaks inside
 * each one, and optionally bolds the first paragraph.
 *
 * @param text Help text, with examples on their own lines when it has them.
 * @param open Opens a mentioned command, or null for plain text.
 * @param self Id of the command the text describes, or null.
 * @param lead True to show the first paragraph in bold.
 * @returns Paragraphs.
 */
function solidScriptEditorHelpBlocks(
  text: string,
  open: SolidScriptEditorLinkOpen | null,
  self: string | null,
  lead: boolean,
): HTMLElement[] {
  if (text.trim() === '') return [];
  return text.split(/\n\n+/).map((block, index) => {
    const paragraph = solidScriptEditorHelpText(block, open, self);
    if (lead && index === 0) paragraph.style.fontWeight = '600';
    return paragraph;
  });
}

/**
 * Builds the More Details section: the rest of the manual, how fields are read,
 * what stops the script, and how to use the editor.
 *
 * @param command Command.
 * @param usageText How to use a palette entry or a line.
 * @param open Opens a mentioned command, or null.
 * @param opened True when More Details is already open.
 * @param onToggle Remembers whether it is open.
 * @returns Details element.
 */
function solidScriptEditorHelpMore(
  command: SolidScriptCommand,
  usageText: string,
  open: SolidScriptEditorLinkOpen | null,
  opened: boolean,
  onToggle: (open: boolean) => void,
): HTMLElement {
  const usage = document.createElement('p');
  usage.className = SOLID_SCRIPT_EDITOR_CLASSES.helpUsage;
  usage.textContent = usageText;
  const more = document.createElement('details');
  more.className = SOLID_SCRIPT_EDITOR_CLASSES.helpMore;
  more.open = opened;
  more.addEventListener('toggle', () => onToggle(more.open));
  const moreTitle = document.createElement('summary');
  moreTitle.textContent = 'More Details';
  more.append(
    moreTitle,
    ...solidScriptEditorHelpBlocks(command.details, open, command.id, false),
    ...solidScriptEditorHelpFieldNotes(command, open),
    ...solidScriptEditorHelpStops(command, open),
    usage,
  );
  return more;
}

/**
 * The note on how fields are read, when the command has fields that use it, and
 * the one note on what its per-item fields may read.
 *
 * @param command Command.
 * @param open Opens a mentioned command, or null.
 * @returns Note paragraphs, or none.
 */
function solidScriptEditorHelpFieldNotes(
  command: SolidScriptCommand,
  open: SolidScriptEditorLinkOpen | null,
): HTMLElement[] {
  const each = solidScriptEditorHelpBlocks(solidScriptEachNote(command.parameters), open, command.id, false);
  if (!command.parameters.some((parameter) => parameter.type !== 'name' && parameter.type !== 'text')) return each;
  return [...solidScriptEditorHelpBlocks(SOLID_SCRIPT_EDITOR_HELP_FIELDS, open, command.id, false), ...each];
}

/**
 * Builds the help entry of one value: caption, current value and hint.
 *
 * @param parameter Parameter.
 * @param open Opens a mentioned command, or null.
 * @param self Id of the command the hint belongs to.
 * @param shown Value as shown.
 * @returns Entry element.
 */
function solidScriptEditorHelpParameter(
  parameter: SolidScriptCommandParameter,
  open: SolidScriptEditorLinkOpen | null,
  self: string,
  shown: string,
  values: Readonly<Record<string, string>>,
): HTMLElement {
  const item = document.createElement('div');
  item.className = SOLID_SCRIPT_EDITOR_CLASSES.helpParameter;
  const name = document.createElement('span');
  name.className = SOLID_SCRIPT_EDITOR_CLASSES.parameterName;
  if (solidScriptParameterEachActive(parameter, values)) {
    item.classList.add(SOLID_SCRIPT_EDITOR_CLASSES.helpEach);
    name.textContent = `${SOLID_SCRIPT_COMMAND_EACH_ICON} ${parameter.label}`;
    if (parameter.each) name.title = solidScriptEachSentence(parameter.each);
  } else name.textContent = parameter.label;
  const value = document.createElement('span');
  value.className = SOLID_SCRIPT_EDITOR_CLASSES.parameterValue;
  value.textContent = shown;
  const hint = document.createElement('div');
  hint.className = SOLID_SCRIPT_EDITOR_CLASSES.helpText;
  solidScriptEditorLinked(hint, parameter.hint, open, self);
  item.append(name, value, hint);
  return item;
}

/**
 * Builds a help paragraph.
 *
 * @param text Text.
 * @param open Opens a mentioned command, or null for plain text.
 * @param self Id of the command the text describes, or null.
 * @returns Paragraph.
 */
function solidScriptEditorHelpText(
  text: string,
  open: SolidScriptEditorLinkOpen | null = null,
  self: string | null = null,
): HTMLElement {
  const paragraph = document.createElement('p');
  paragraph.className = SOLID_SCRIPT_EDITOR_CLASSES.helpText;
  return solidScriptEditorLinked(paragraph, text, open, self);
}

/**
 * Lists the mistakes that stop the script at a line of the command.
 *
 * @param command Command.
 * @param open Opens a mentioned command, or null.
 * @returns Heading and list, or nothing.
 */
function solidScriptEditorHelpStops(
  command: SolidScriptCommand,
  open: SolidScriptEditorLinkOpen | null,
): HTMLElement[] {
  if (command.stops.length === 0) return [];
  const heading = document.createElement('div');
  heading.className = SOLID_SCRIPT_EDITOR_CLASSES.helpCategory;
  heading.textContent = 'Stops the script when';
  const list = document.createElement('ul');
  list.className = SOLID_SCRIPT_EDITOR_CLASSES.helpStops;
  list.append(
    ...command.stops.map((stop) => {
      return solidScriptEditorLinked(document.createElement('li'), stop, open, command.id);
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
