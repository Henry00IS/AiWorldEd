import { solidScriptScrollerWrap } from './solid_script_editor_scroll.js';
import type { SolidScriptDocument } from '@/solid_script/document/solid_script_document.js';
import { solidScriptErrorLine, solidScriptErrorText } from '@/solid_script/language/solid_script_error.js';
import {
  solidScriptProgramEvaluate,
  type SolidScriptProgramOptions,
} from '@/solid_script/language/solid_script_program.js';
import type { SolidScriptLineProfile, SolidScriptWarning } from '@/solid_script/language/solid_script_machine_types.js';
import { SolidScriptEditorExplorer } from './solid_script_editor_explorer.js';
import type { SolidScriptEditorSettings } from './solid_script_editor_settings.js';
import { SOLID_SCRIPT_EDITOR_CLASSES } from './solid_script_editor_css.js';

/** Tabs of the output area. */
type SolidScriptEditorOutputTab = 'output' | 'variables' | 'settings';

/** Captions of the output tabs. */
const SOLID_SCRIPT_EDITOR_OUTPUT_TABS: readonly [SolidScriptEditorOutputTab, string][] = [
  ['output', 'Output'],
  ['variables', 'Variables'],
  ['settings', 'Settings'],
];

/**
 * The area under the script: the Output tab shows what the script builds, its
 * Echo lines or its first error; the Variables tab is the variable explorer,
 * with every name the script uses and its value at the debugger's step, or
 * after the last solid; the Settings tab holds Can Be Used As and the author.
 */
export class SolidScriptEditorOutput {
  /** Output area element. */
  readonly element = document.createElement('div');
  private readonly tabs = new Map<SolidScriptEditorOutputTab, HTMLButtonElement>();
  private readonly output = document.createElement('div');
  private readonly explorer = new SolidScriptEditorExplorer();
  /** Output and variables, each with the custom scrollbar. */
  private readonly outputHost: HTMLElement;
  private readonly variablesHost: HTMLElement;
  private failed: number | null = null;
  private runs: ReadonlyMap<number, SolidScriptLineProfile> = new Map();
  private revealLine: (line: number) => void = () => undefined;
  private readonly settingsHost = document.createElement('div');
  private settings: SolidScriptEditorSettings | null = null;

  /** Shows a line of the script; set by the editor. */
  set reveal(reveal: (line: number) => void) {
    this.explorer.reveal = reveal;
    this.revealLine = reveal;
  }

  /** Adds an Input line through its configurator; set by the editor. */
  set inputAdd(inputAdd: () => void) {
    this.explorer.inputAdd = inputAdd;
  }

  /**
   * Fills the Settings tab; set by the editor.
   *
   * @param settings Settings tab.
   */
  settingsSet(settings: SolidScriptEditorSettings): void {
    this.settings = settings;
    this.settingsHost.replaceChildren(settings.element);
  }

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
    this.outputHost = solidScriptScrollerWrap(this.output, '1 1 0', 12);
    this.variablesHost = this.explorer.element;
    this.element.append(bar, this.outputHost, this.variablesHost, this.settingsHost);
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
    this.settings?.write(document);
    try {
      const result = solidScriptProgramEvaluate(document, { context: 'preview', ...options, profile: true });
      const count = result.steps.length;
      this.failed = null;
      this.runs = result.profile;
      const solids = `${count} ${count === 1 ? 'solid' : 'solids'}${result.paused ? ' so far' : ''}`;
      this.text([solids, ...result.messages].join('\n'), false);
      this.output.append(...result.warnings.map((warning) => this.warningRow(warning)));
      this.explorer.show(document, result.variables, options ? result.stack : [], caption);
    } catch (error) {
      const message = solidScriptErrorText(error);
      const failed = solidScriptErrorLine(message);
      this.failed = failed === null ? null : failed - 1;
      this.runs = new Map();
      this.text(message, true);
      this.explorer.show(document, [], [], 'The script stops with an error.');
    }
  }

  /**
   * Returns how often each line ran in the last run, and its time.
   *
   * @returns Count and time by 1-based line; empty after an error.
   */
  lineRuns(): ReadonlyMap<number, SolidScriptLineProfile> {
    return this.runs;
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
    this.settingsHost.hidden = id !== 'settings';
  }

  /**
   * Builds the row of a warning: the script still runs, the line link goes to
   * the line.
   *
   * @param warning Warning.
   * @returns Row.
   */
  private warningRow(warning: SolidScriptWarning): HTMLElement {
    const row = document.createElement('div');
    row.className = SOLID_SCRIPT_EDITOR_CLASSES.outputWarning;
    const link = document.createElement('button');
    link.type = 'button';
    link.className = SOLID_SCRIPT_EDITOR_CLASSES.helpLink;
    link.textContent = `Line ${warning.line}`;
    link.title = `Go To Line ${warning.line}`;
    link.addEventListener('click', () => this.revealLine(warning.line - 1));
    row.append('⚠️ ', link, `: ${warning.text}`);
    return row;
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
}
