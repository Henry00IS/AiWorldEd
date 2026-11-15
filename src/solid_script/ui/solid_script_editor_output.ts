import { solidScriptScrollerWrap } from './solid_script_editor_scroll.js';
import type { SolidScriptDocument } from '@/solid_script/document/solid_script_document.js';
import type { SolidScriptFrameView, SolidScriptVariable } from '@/solid_script/language/solid_script_machine.js';
import { solidScriptErrorLine, solidScriptErrorText } from '@/solid_script/language/solid_script_error.js';
import {
  solidScriptProgramEvaluate,
  type SolidScriptProgramOptions,
} from '@/solid_script/language/solid_script_program.js';
import {
  SOLID_SCRIPT_NAME_CATEGORIES,
  solidScriptDocumentNames,
} from '@/solid_script/document/solid_script_document_names.js';
import { SOLID_SCRIPT_EDITOR_CLASSES } from './solid_script_editor_css.js';

/** Tabs of the output area. */
type SolidScriptEditorOutputTab = 'output' | 'variables';

/** Captions of the output tabs. */
const SOLID_SCRIPT_EDITOR_OUTPUT_TABS: readonly [SolidScriptEditorOutputTab, string][] = [
  ['output', 'Output'],
  ['variables', 'Variables'],
];

/**
 * The area under the script: the Output tab shows what the script builds, its
 * Echo lines or its first error; the Variables tab shows every variable and its
 * value at the debugger's step, or after the last solid, and below them every
 * name the script defines by category, whose line a click shows.
 */
export class SolidScriptEditorOutput {
  /** Output area element. */
  readonly element = document.createElement('div');
  private readonly tabs = new Map<SolidScriptEditorOutputTab, HTMLButtonElement>();
  private readonly output = document.createElement('div');
  private readonly variables = document.createElement('div');
  /** Output and variables, each with the custom scrollbar. */
  private readonly outputHost: HTMLElement;
  private readonly variablesHost: HTMLElement;
  private failed: number | null = null;
  /** Shows a line of the script; set by the editor. */
  reveal: (line: number) => void = () => undefined;

  /** Builds the area. */
  constructor() {
    this.element.className = SOLID_SCRIPT_EDITOR_CLASSES.output;
    const bar = document.createElement('div');
    bar.className = SOLID_SCRIPT_EDITOR_CLASSES.outputTabs;
    bar.setAttribute('role', 'tablist');
    for (const [id, label] of SOLID_SCRIPT_EDITOR_OUTPUT_TABS) bar.append(this.tabButton(id, label));
    this.output.className = SOLID_SCRIPT_EDITOR_CLASSES.outputText;
    this.output.setAttribute('role', 'status');
    this.output.setAttribute('aria-live', 'polite');
    this.variables.className = SOLID_SCRIPT_EDITOR_CLASSES.variables;
    this.outputHost = solidScriptScrollerWrap(this.output, '1 1 0', 12);
    this.variablesHost = solidScriptScrollerWrap(this.variables, '1 1 0', 12);
    this.element.append(bar, this.outputHost, this.variablesHost);
    this.tabShow('output');
  }

  /**
   * Runs a script and shows its result.
   *
   * @param document Script.
   * @param options How the debugger runs it to the state shown, or null for the
   *   whole script.
   * @param caption What the variables show, such as "At step 2, line 4".
   */
  show(document: SolidScriptDocument, options: SolidScriptProgramOptions | null, caption: string): void {
    try {
      const result = solidScriptProgramEvaluate(document, options ?? {});
      const count = result.steps.length;
      this.failed = null;
      const solids = `${count} ${count === 1 ? 'solid' : 'solids'}${result.paused ? ' so far' : ''}`;
      this.text([solids, ...result.messages].join('\n'), false);
      this.variablesShow(result.variables, caption, document, options ? result.stack : []);
    } catch (error) {
      const message = solidScriptErrorText(error);
      const failed = solidScriptErrorLine(message);
      this.failed = failed === null ? null : failed - 1;
      this.text(message, true);
      this.variablesShow([], 'The script stops with an error.', document);
    }
  }

  /**
   * Returns the line of the last error.
   *
   * @returns 0-based line index, or null.
   */
  failedLine(): number | null {
    return this.failed;
  }

  /**
   * Builds one tab button.
   *
   * @param id Tab.
   * @param label Caption.
   * @returns Button.
   */
  private tabButton(id: SolidScriptEditorOutputTab, label: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = SOLID_SCRIPT_EDITOR_CLASSES.outputTab;
    button.textContent = label;
    button.setAttribute('role', 'tab');
    button.dataset['tab'] = id;
    button.addEventListener('click', () => this.tabShow(id));
    this.tabs.set(id, button);
    return button;
  }

  /**
   * Shows one tab.
   *
   * @param id Tab.
   */
  private tabShow(id: SolidScriptEditorOutputTab): void {
    for (const [tab, button] of this.tabs) button.setAttribute('aria-selected', String(tab === id));
    this.outputHost.hidden = id !== 'output';
    this.variablesHost.hidden = id !== 'variables';
  }

  /**
   * Writes the output text.
   *
   * @param text Text.
   * @param error True marks it as an error.
   */
  private text(text: string, error: boolean): void {
    this.output.textContent = text;
    this.output.classList.toggle(SOLID_SCRIPT_EDITOR_CLASSES.outputError, error);
    this.tabs.get('output')?.classList.toggle(SOLID_SCRIPT_EDITOR_CLASSES.outputError, error);
  }

  /**
   * Writes the variables table.
   *
   * @param variables Variables and values.
   * @param caption Where in the script they were read.
   * @param script Script, for the names it defines.
   */
  private variablesShow(
    variables: readonly SolidScriptVariable[],
    caption: string,
    script: SolidScriptDocument,
    stack: readonly SolidScriptFrameView[] = [],
  ): void {
    const heading = document.createElement('div');
    heading.className = SOLID_SCRIPT_EDITOR_CLASSES.variablesCaption;
    heading.textContent = variables.length > 0 ? caption : `${caption} · no variables`;
    const rows = variables.map(({ name, value }) => {
      const row = document.createElement('div');
      row.className = SOLID_SCRIPT_EDITOR_CLASSES.variable;
      const key = document.createElement('span');
      key.className = SOLID_SCRIPT_EDITOR_CLASSES.parameterName;
      key.textContent = name;
      const shown = document.createElement('span');
      shown.className = SOLID_SCRIPT_EDITOR_CLASSES.parameterValue;
      shown.textContent = value;
      row.append(key, shown);
      return row;
    });
    this.variables.replaceChildren(heading, ...rows, ...this.stackRows(stack), this.definitions(script));
  }

  /**
   * Lists the Functions and parts running, innermost first, each with the line
   * that called it and its own variables.
   *
   * @param stack Frames, outermost first.
   * @returns Section, or nothing outside every Function and part.
   */
  private stackRows(stack: readonly SolidScriptFrameView[]): HTMLElement[] {
    if (stack.length === 0) return [];
    const section = document.createElement('div');
    section.className = SOLID_SCRIPT_EDITOR_CLASSES.stack;
    const heading = document.createElement('div');
    heading.className = SOLID_SCRIPT_EDITOR_CLASSES.variablesCaption;
    heading.textContent = 'Call Stack · innermost first';
    section.append(heading);
    for (const frame of [...stack].reverse()) {
      const row = document.createElement('div');
      row.className = SOLID_SCRIPT_EDITOR_CLASSES.stackFrame;
      row.title = `Called on line ${frame.line}: click to show it`;
      const name = document.createElement('span');
      name.textContent = frame.name;
      const where = document.createElement('span');
      where.className = SOLID_SCRIPT_EDITOR_CLASSES.parameterValue;
      where.textContent = `called on line ${frame.line}`;
      row.append(name, where);
      row.addEventListener('click', () => this.reveal(frame.line - 1));
      section.append(row);
      for (const local of frame.locals) {
        const entry = document.createElement('div');
        entry.className = SOLID_SCRIPT_EDITOR_CLASSES.stackLocal;
        const key = document.createElement('span');
        key.className = SOLID_SCRIPT_EDITOR_CLASSES.parameterName;
        key.textContent = local.name;
        const value = document.createElement('span');
        value.className = SOLID_SCRIPT_EDITOR_CLASSES.parameterValue;
        value.textContent = local.value;
        entry.append(key, value);
        section.append(entry);
      }
    }
    return [section];
  }

  /**
   * Lists the names a script defines by category, each with its line.
   *
   * @param script Script.
   * @returns List element.
   */
  private definitions(script: SolidScriptDocument): HTMLElement {
    const list = document.createElement('div');
    list.className = SOLID_SCRIPT_EDITOR_CLASSES.definitions;
    const names = solidScriptDocumentNames(script);
    const heading = document.createElement('div');
    heading.className = SOLID_SCRIPT_EDITOR_CLASSES.variablesCaption;
    heading.textContent = names.length > 0 ? 'Defined In The Script' : 'Defined In The Script · nothing yet';
    list.append(heading);
    for (const category of SOLID_SCRIPT_NAME_CATEGORIES) {
      const entries = names.filter((entry) => entry.category === category);
      if (entries.length === 0) continue;
      const title = document.createElement('div');
      title.className = SOLID_SCRIPT_EDITOR_CLASSES.suggestionHeading;
      title.textContent = category;
      list.append(title);
      for (const entry of entries) {
        const row = document.createElement('div');
        row.className = SOLID_SCRIPT_EDITOR_CLASSES.definition;
        row.title = `Line ${entry.line + 1}: click to show it`;
        const key = document.createElement('span');
        key.className = SOLID_SCRIPT_EDITOR_CLASSES.parameterName;
        key.textContent = entry.name;
        const detail = document.createElement('span');
        detail.className = SOLID_SCRIPT_EDITOR_CLASSES.parameterValue;
        detail.textContent = `${entry.detail} · line ${entry.line + 1}`;
        row.append(key, detail);
        row.addEventListener('click', () => this.reveal(entry.line));
        list.append(row);
      }
    }
    return list;
  }
}
