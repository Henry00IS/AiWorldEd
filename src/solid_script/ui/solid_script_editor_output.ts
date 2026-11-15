import type { SolidScriptDocument } from '@/solid_script/document/solid_script_document.js';
import type { SolidScriptVariable } from '@/solid_script/language/solid_script_machine.js';
import { solidScriptErrorLine, solidScriptErrorText } from '@/solid_script/language/solid_script_error.js';
import { solidScriptProgramEvaluate } from '@/solid_script/language/solid_script_program.js';
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
 * value at the debugger's step, or after the last solid.
 */
export class SolidScriptEditorOutput {
  /** Output area element. */
  readonly element = document.createElement('div');
  private readonly tabs = new Map<SolidScriptEditorOutputTab, HTMLButtonElement>();
  private readonly output = document.createElement('div');
  private readonly variables = document.createElement('div');
  private failed: number | null = null;

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
    this.element.append(bar, this.output, this.variables);
    this.tabShow('output');
  }

  /**
   * Runs a script and shows its result.
   *
   * @param document Script.
   * @param step Debugger step whose variables to show, or null after the last
   *   solid.
   * @param line Line of that step as a 0-based index, or null.
   */
  show(document: SolidScriptDocument, step: number | null, line: number | null): void {
    try {
      const result = solidScriptProgramEvaluate(document, step === null ? {} : { stepLimit: step });
      const count = result.steps.length;
      this.failed = null;
      this.text([`${count} ${count === 1 ? 'solid' : 'solids'}`, ...result.messages].join('\n'), false);
      this.variablesShow(
        result.variables,
        step === null ? 'After the last solid' : `At step ${step}, line ${(line ?? 0) + 1}`,
      );
    } catch (error) {
      const message = solidScriptErrorText(error);
      const failed = solidScriptErrorLine(message);
      this.failed = failed === null ? null : failed - 1;
      this.text(message, true);
      this.variablesShow([], 'The script stops with an error.');
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
    this.output.hidden = id !== 'output';
    this.variables.hidden = id !== 'variables';
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
   */
  private variablesShow(variables: readonly SolidScriptVariable[], caption: string): void {
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
    this.variables.replaceChildren(heading, ...rows);
  }
}
