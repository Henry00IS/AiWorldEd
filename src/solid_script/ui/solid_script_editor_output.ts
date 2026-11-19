import { solidScriptScrollerWrap } from './solid_script_editor_scroll.js';
import { solidScriptKindCheck } from '@/solid_script/document/solid_script_document_kind_check.js';
import type { SolidScriptDocument } from '@/solid_script/document/solid_script_document.js';
import { solidScriptErrorLine, solidScriptErrorText } from '@/solid_script/language/solid_script_error.js';
import { solidScriptProgramRun, type SolidScriptProgramOptions } from '@/solid_script/language/solid_script_program.js';
import type { SolidScriptLineProfile, SolidScriptWarning } from '@/solid_script/language/solid_script_machine_types.js';
import { SolidScriptEditorExplorer, type SolidScriptExplorerRun } from './solid_script_editor_explorer.js';
import {
  solidScriptDocumentDefines,
  solidScriptDocumentNamesUnknown,
} from '@/solid_script/document/solid_script_document_names.js';
import { solidScriptNameKey } from '@/solid_script/language/solid_script_name_key.js';
import { solidScriptMistakeCheck, solidScriptUseCheck } from '@/solid_script/language/solid_script_use_check.js';
import type { SolidScriptEditorSettings } from './solid_script_editor_settings.js';
import { SOLID_SCRIPT_EDITOR_CLASSES } from './solid_script_editor_css.js';
import { solidScriptSelectFix, solidScriptSelectFixLabel } from '@/solid_script/language/solid_script_select.js';

/** Pause after the last edit before the idle check runs, in milliseconds. */
export const SOLID_SCRIPT_EDITOR_CHECK_DELAY_MS = 400;

/**
 * Longest wait for an idle moment before the check runs anyway, in
 * milliseconds.
 */
const SOLID_SCRIPT_EDITOR_CHECK_IDLE_MS = 1000;

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
  private failedKeys: ReadonlySet<string> = new Set();
  private unknownShow: (unknown: ReadonlyMap<number, ReadonlySet<string>>) => void = () => undefined;
  private runs: ReadonlyMap<number, SolidScriptLineProfile> = new Map();
  private passed: readonly number[] = [];
  private revealLine: (line: number) => void = () => undefined;
  /** Settings, scrolling inside the area like the other tabs. */
  private readonly settingsScroller = document.createElement('div');
  private readonly settingsHost: HTMLElement;
  /** Warnings of the check that runs while the editor is idle, below the output. */
  private readonly checks = document.createElement('div');
  private checkTimer: ReturnType<typeof setTimeout> | null = null;
  private settings: SolidScriptEditorSettings | null = null;

  /** Shows a line of the script; set by the editor. */
  set reveal(reveal: (line: number) => void) {
    this.explorer.reveal = reveal;
    this.revealLine = reveal;
  }

  /** Underlines what each line reads that nothing defines; set by the editor. */
  set unknown(show: (unknown: ReadonlyMap<number, ReadonlySet<string>>) => void) {
    this.unknownShow = show;
  }

  /** Adds an Input line through its configurator; set by the editor. */
  set inputAdd(inputAdd: () => void) {
    this.explorer.inputAdd = inputAdd;
  }

  /** Inserts a Select line above a failed tool, with no configurator. */
  selectAbove: (command: string, line: number) => void = () => undefined;

  /**
   * Fills the Settings tab; set by the editor.
   *
   * @param settings Settings tab.
   */
  settingsSet(settings: SolidScriptEditorSettings): void {
    this.settings = settings;
    this.settingsScroller.replaceChildren(settings.element);
  }

  /** Builds the area. */
  constructor() {
    this.element.className = SOLID_SCRIPT_EDITOR_CLASSES.output;
    const bar = document.createElement('div');
    bar.className = SOLID_SCRIPT_EDITOR_CLASSES.outputTabs;
    bar.setAttribute('role', 'tablist');
    for (const [id, label] of SOLID_SCRIPT_EDITOR_OUTPUT_TABS) bar.append(this.tabButton(id, label));
    this.output.className = SOLID_SCRIPT_EDITOR_CLASSES.outputText;
    // A read-only text box: what Echo printed and errors can be selected and copied.
    this.output.setAttribute('role', 'textbox');
    this.output.setAttribute('aria-readonly', 'true');
    this.output.setAttribute('aria-multiline', 'true');
    this.output.setAttribute('aria-label', 'Output');
    this.output.setAttribute('aria-live', 'polite');
    // Editable only so it shows a caret; every change is refused.
    this.output.tabIndex = 0;
    this.output.setAttribute('contenteditable', 'true');
    this.output.spellcheck = false;
    this.output.addEventListener('beforeinput', (event) => event.preventDefault());
    this.output.addEventListener('keydown', (event) => this.outputKey(event));
    // A selection left behind would keep Ctrl+C on the output once focus moves on.
    this.output.addEventListener('blur', () => {
      const selection = this.output.ownerDocument.getSelection();
      if (
        selection &&
        selection.rangeCount > 0 &&
        this.output.contains(selection.getRangeAt(0).commonAncestorContainer)
      )
        selection.removeAllRanges();
    });
    this.outputHost = solidScriptScrollerWrap(this.output, '1 1 0', 12);
    this.variablesHost = this.explorer.element;
    Object.assign(this.settingsScroller.style, { overflowY: 'auto', padding: '5px 12px' });
    this.settingsHost = solidScriptScrollerWrap(this.settingsScroller, '1 1 0', 12);
    this.element.append(bar, this.outputHost, this.variablesHost, this.settingsHost);
    this.tabShow('output');
  }

  /**
   * Runs a script and shows its result.
   *
   * @param document Script.
   * @param options How the debugger runs it to the state shown, or null for the
   *   whole script.
   * @param run Where the debugger captures the values, such as "At step 2, line
   *   4".
   */
  show(document: SolidScriptDocument, options: SolidScriptProgramOptions | null, run: SolidScriptExplorerRun): void {
    this.settings?.write(document);
    this.checkSchedule(document);
    const result = solidScriptProgramRun(document, { context: 'preview', ...options, profile: true });
    this.passed = result.passed;
    if (!result.error) {
      const count = result.steps.length;
      this.failed = null;
      this.failedKeys = new Set();
      this.runs = result.profile;
      const solids = `${count} ${count === 1 ? 'solid' : 'solids'}${result.paused ? ' so far' : ''}`;
      this.text([solids, ...result.messages].join('\n'), '');
      this.output.append(...result.warnings.map((warning) => this.warningRow(warning)), this.checks);
      this.explorer.show(document, result.variables, options ? result.stack : [], result.system, run, result.seen);
    } else {
      const message = solidScriptErrorText(new Error(result.error.message));
      const failed = solidScriptErrorLine(message);
      this.failed = failed === null ? null : failed - 1;
      // The [name] the error is about, underlined on its line.
      const named = /\[([A-Za-z_][\w.]*)\]/.exec(message)?.[1];
      this.failedKeys = new Set(named === undefined ? [] : [solidScriptNameKey(named)]);
      this.runs = new Map();
      // What ran before the error stays, to help find it.
      this.text(result.messages.join('\n'), message);
      this.output.append(...result.warnings.map((warning) => this.warningRow(warning)), this.checks);
      const caption =
        failed === null ? 'Where the error stopped the run' : `Where the error on line ${failed} stopped the run`;
      this.explorer.show(
        document,
        result.variables,
        options ? result.stack : [],
        result.system,
        {
          caption,
          stoppedBefore: null,
          ran: true,
        },
        result.seen,
      );
    }
  }

  /**
   * Follows the focused line for the Context of the variables.
   *
   * @param line Focused 0-based line, or null when no line is focused.
   */
  contextLineSet(line: number | null): void {
    this.explorer.contextSet(line);
  }

  /**
   * Keeps Ctrl+A inside the output: it selects only the output's text.
   *
   * @param event Key event.
   */
  private outputKey(event: KeyboardEvent): void {
    if (!(event.ctrlKey || event.metaKey) || event.altKey || event.key.toLowerCase() !== 'a') return;
    event.preventDefault();
    const selection = this.output.ownerDocument.getSelection();
    if (!selection) return;
    const range = this.output.ownerDocument.createRange();
    range.selectNodeContents(this.output);
    selection.removeAllRanges();
    selection.addRange(range);
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
   * Returns the lines the last run passed, up to the step or breakpoint shown,
   * or up to its error.
   *
   * @returns 0-based line indices.
   */
  linesPassed(): number[] {
    return this.passed.map((line) => line - 1);
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
   * Returns the keys of the names the last error is about.
   *
   * @returns Keys.
   */
  failedNames(): ReadonlySet<string> {
    return this.failedKeys;
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
   * Checks the script once typing pauses and the page is idle, without running
   * it, so typing never waits: lines a modifier would run that read Box values,
   * and names and calls the lines read that nothing defines.
   *
   * @param script Script.
   */
  private checkSchedule(script: SolidScriptDocument): void {
    if (this.checkTimer !== null) clearTimeout(this.checkTimer);
    this.checkTimer = setTimeout(() => {
      this.checkTimer = null;
      const write = (): void => {
        const checks = [
          ...solidScriptUseCheck(script),
          ...solidScriptMistakeCheck(script, solidScriptDocumentDefines(script)),
          ...solidScriptKindCheck(script),
        ];
        checks.sort((a, b) => (a.line ?? 0) - (b.line ?? 0));
        this.checks.replaceChildren(...checks.map((warning) => this.warningRow(warning)));
        this.unknownShow(solidScriptDocumentNamesUnknown(script));
      };
      const idle = this.element.ownerDocument.defaultView?.requestIdleCallback;
      if (idle) idle(write, { timeout: SOLID_SCRIPT_EDITOR_CHECK_IDLE_MS });
      else write();
    }, SOLID_SCRIPT_EDITOR_CHECK_DELAY_MS);
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
    const line = warning.line;
    if (line === null) {
      row.append(`⚠️ ${warning.text}`);
      return row;
    }
    const link = document.createElement('button');
    link.type = 'button';
    link.className = SOLID_SCRIPT_EDITOR_CLASSES.helpLink;
    link.textContent = `Line ${line}`;
    link.title = `Go To Line ${line}`;
    link.addEventListener('click', () => this.revealLine(line - 1));
    row.append('⚠️ ', link, `: ${warning.text}`);
    return row;
  }

  /**
   * Writes the output text.
   *
   * @param text Text.
   * @param failure Error the run stopped with, written after the text in red;
   *   empty when it ran through.
   */
  private text(text: string, failure: string): void {
    this.output.textContent = text;
    if (failure !== '') this.output.append(this.failureRow(failure));
    this.tabs.get('output')?.classList.toggle(SOLID_SCRIPT_EDITOR_CLASSES.outputError, failure !== '');
  }

  /**
   * The red stop text, and the one-click Select fix when Of was empty.
   *
   * @param failure Error the run stopped with.
   * @returns Row.
   */
  private failureRow(failure: string): HTMLElement {
    const row = document.createElement('div');
    row.className = SOLID_SCRIPT_EDITOR_CLASSES.outputFailure;
    row.append(failure);
    const fix = solidScriptSelectFix(failure);
    const line = this.failed;
    if (!fix || line === null) return row;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = SOLID_SCRIPT_EDITOR_CLASSES.tool;
    button.textContent = solidScriptSelectFixLabel(fix.label);
    button.addEventListener('click', () => this.selectAbove(fix.command, line));
    row.append(button);
    return row;
  }
}
