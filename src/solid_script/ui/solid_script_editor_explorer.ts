import type { SolidScriptDocument } from '@/solid_script/document/solid_script_document.js';
import { solidScriptSentence, solidScriptSentencePlain } from '@/solid_script/language/solid_script_sentence.js';
import {
  SOLID_SCRIPT_NAME_CATEGORIES,
  solidScriptDocumentNames,
  solidScriptNameShown,
  solidScriptDocumentOrigins,
  solidScriptNameKindsText,
  type SolidScriptNameCategory,
} from '@/solid_script/document/solid_script_document_names.js';
import { solidScriptInputTypeLabel } from '@/solid_script/language/solid_script_input.js';
import type { SolidScriptProgramOptions } from '@/solid_script/language/solid_script_program.js';
import type {
  SolidScriptFrameView,
  SolidScriptLineSeen,
  SolidScriptVariable,
} from '@/solid_script/language/solid_script_machine_types.js';
import { SOLID_SCRIPT_EDITOR_CLASSES } from './solid_script_editor_css.js';
import { solidScriptExplorerContextEntries } from './solid_script_editor_explorer_context.js';
import {
  solidScriptExplorerSort,
  solidScriptExplorerSystemEntries,
  solidScriptExplorerVariablesSorted,
} from './solid_script_editor_explorer_system.js';
import { solidScriptScrollerWrap } from './solid_script_editor_scroll.js';

/**
 * Categories of the explorer: everything, the names with a value now, then each
 * kind of name.
 */
export type SolidScriptExplorerCategory = 'All' | 'Current' | 'Context' | SolidScriptNameCategory | 'Call Stack';

/** Where the values of a run were captured. */
export interface SolidScriptExplorerRun {
  /** Where the values come from, such as "At the end of the run". */
  caption: string;
  /** 0-based line the run stopped just before, such as at a breakpoint, or null. */
  stoppedBefore: number | null;
  /** False when the script has nothing to run, so no values were captured. */
  ran: boolean;
}

/** System lists of a run and where it stopped, for the System names. */
export interface SolidScriptExplorerSystemRun {
  /** System lists such as $Selected.Faces where the values were captured. */
  system: readonly SolidScriptVariable[];
  /** 0-based line the run stopped just before, or null. */
  stoppedBefore: number | null;
  /** Options of the preview run, so $Box and $Script.Usage match it. */
  options?: SolidScriptProgramOptions;
}

/** Words after the caption of the System category. */
const SOLID_SCRIPT_EXPLORER_SYSTEM_NOW = 'built-in values as they read now';

/** Caption of the Context category when no line is focused. */
const SOLID_SCRIPT_EXPLORER_CONTEXT_NONE = 'No line is focused.';

/**
 * Where the values in Context come from: no run, the run stopped just before
 * the focused line, the last time the focused line ran, or where the values of
 * the run were captured because the focused line did not run or ran too often
 * to keep its values.
 */
export type SolidScriptExplorerContextSource = 'none' | 'stopped' | 'last' | 'captured' | 'often';

/** Values the focused line sees in Context, and where they come from. */
export interface SolidScriptExplorerContextValues {
  source: SolidScriptExplorerContextSource;
  /** Values by shown name, or null when there are none. */
  values: ReadonlyMap<string, SolidScriptVariable> | null;
}

/**
 * Picks the values Context shows for the focused line: where the run stopped
 * when it stopped just before that line, else as they were just before the line
 * last ran, else where the run's values were captured.
 *
 * @param line Focused 0-based line.
 * @param run Where the run values were captured.
 * @param live Values of the run by shown name where they were captured.
 * @param seen Variables and stack just before each 1-based line last ran.
 * @returns Values and where they come from.
 */
export function solidScriptExplorerContextValues(
  line: number,
  run: SolidScriptExplorerRun,
  live: ReadonlyMap<string, SolidScriptVariable>,
  seen: ReadonlyMap<number, SolidScriptLineSeen | null>,
): SolidScriptExplorerContextValues {
  if (!run.ran) return { source: 'none', values: null };
  if (run.stoppedBefore === line) return { source: 'stopped', values: live };
  const last = seen.get(line + 1);
  if (last) return { source: 'last', values: solidScriptExplorerLive(last.variables, last.stack) };
  return { source: last === null ? 'often' : 'captured', values: live };
}

/**
 * Describes what a category of the explorer shows: the Context of the focused
 * line before it runs, the built-in values read now, or the values of the run
 * where they were captured.
 *
 * @param category Category shown.
 * @param run Where the run values were captured.
 * @param contextLine Focused 0-based line, or null when no line is focused.
 * @param source Where the values in Context come from.
 * @returns Caption.
 */
export function solidScriptExplorerCaption(
  category: SolidScriptExplorerCategory,
  run: SolidScriptExplorerRun,
  contextLine: number | null,
  source: SolidScriptExplorerContextSource = 'none',
): string {
  if (category === 'System') return `${run.caption}; ${SOLID_SCRIPT_EXPLORER_SYSTEM_NOW}`;
  if (category !== 'Context') return run.caption;
  if (contextLine === null) return SOLID_SCRIPT_EXPLORER_CONTEXT_NONE;
  const before = `Before line ${contextLine + 1} runs`;
  if (source === 'stopped') return `${before}, with the values where the run stopped`;
  if (source === 'last') return `${before}, with the values from the last time it ran`;
  if (source === 'none') return before;
  const where =
    run.stoppedBefore !== null
      ? 'where the run stopped'
      : `${run.caption.charAt(0).toLowerCase()}${run.caption.slice(1)}`;
  const why = source === 'often' ? 'ran too many times to keep its values' : 'has not run';
  return `Line ${contextLine + 1} ${why}, so these are the values ${where}`;
}

/** One name the explorer lists. */
export interface SolidScriptExplorerEntry {
  /** Name as fields read it, without brackets. */
  name: string;
  category: SolidScriptNameCategory;
  /** Value at the step shown, or null when the run has not set it there. */
  value: string | null;
  /** Friendly type, such as Whole Number or List of Numbers. */
  type: string;
  /** 0-based lines that set it, first the defining line. */
  lines: readonly number[];
  /**
   * 0-based lines of the writes that may reach the end of the script, when the
   * checks know them.
   */
  reachLines?: readonly number[];
  /** Items of a list, by number. */
  items: SolidScriptVariable[];
  /** True for inputs and built-in values, which lines read but never set. */
  readOnly: boolean;
  /** What a built-in value holds, or empty. */
  detail: string;
  /**
   * The writes that may reach the end of the script, each after its kinds;
   * empty when none is known.
   */
  reaches?: string;
  /** True in Context for a name the focused line sets. */
  setHere?: boolean;
  /** True when Value says why there is no value now, shown muted. */
  placeholder?: boolean;
  /**
   * True when its items are names it holds, such as $Local.X, not numbered list
   * items.
   */
  members?: boolean;
}

/** Friendly type of a name the run has not reached yet. */
const SOLID_SCRIPT_EXPLORER_TYPES_STATIC: Partial<Record<SolidScriptNameCategory, string>> = {
  Lists: 'List',
  Counters: 'Number',
  Functions: 'Function',
  Parts: 'Part',
  Objects: 'Object Name',
  Handlers: 'Handler',
};

/**
 * Collects every name a script uses for the variable explorer: what the lines
 * define, merged with the values of the step shown, the lines that set each
 * one, and names only the run made, such as part[i].
 *
 * @param script Script.
 * @param variables Variables at the step shown.
 * @param stack Running Functions and parts, outermost first.
 * @param run System lists of the run and where it stopped; none when nothing
 *   ran.
 * @returns Entries in category order, by letter within each category.
 */
export function solidScriptExplorerEntries(
  script: SolidScriptDocument,
  variables: readonly SolidScriptVariable[],
  stack: readonly SolidScriptFrameView[],
  run: SolidScriptExplorerSystemRun = { system: [], stoppedBefore: null },
): SolidScriptExplorerEntry[] {
  const origins = solidScriptDocumentOrigins(script);
  const live = solidScriptExplorerLive(variables, stack);
  const entries: SolidScriptExplorerEntry[] = [];
  for (const known of solidScriptDocumentNames(script)) {
    const seen =
      SOLID_SCRIPT_EXPLORER_TYPES_STATIC[known.category] === undefined ||
      known.category === 'Lists' ||
      known.category === 'Counters';
    const found = seen ? live.get(known.name) : undefined;
    const input = known.category === 'Inputs';
    const block = script.blocks[known.line];
    entries.push({
      name: known.name,
      category: known.category,
      value: found?.value ?? null,
      type: input
        ? solidScriptInputTypeLabel(block?.values['type'] ?? '')
        : known.gives !== undefined
          ? `Function -> ${known.gives}`
          : (found?.type ??
            (solidScriptNameKindsText(known.kinds) ||
              (SOLID_SCRIPT_EXPLORER_TYPES_STATIC[known.category] ?? 'Not Set Yet'))),
      lines: origins.get(known.name) ?? [known.line],
      ...(known.reachLines ? { reachLines: known.reachLines } : {}),
      items: found?.items ?? [],
      readOnly: input,
      detail: '',
      reaches: known.reaches ?? '',
    });
  }
  const listed = new Set(entries.map((entry) => entry.name));
  for (const [name, variable] of live) {
    if (listed.has(name) || name.startsWith('$Local.')) continue;
    entries.push({
      name,
      category: variable.items.length > 0 ? 'Lists' : 'Variables',
      value: variable.value,
      type: variable.type,
      lines: origins.get(variable.name.replace(/\[.*$/, '')) ?? [],
      items: variable.items,
      readOnly: false,
      detail: '',
    });
  }
  entries.push(...solidScriptExplorerSystemEntries(script, live, run));
  return solidScriptExplorerSort(entries);
}

/**
 * Gathers the values of a run by shown name, the locals of running Functions
 * last so they win.
 *
 * @param variables Variables at the step shown.
 * @param stack Running Functions and parts, outermost first.
 * @returns Values by shown name.
 */
function solidScriptExplorerLive(
  variables: readonly SolidScriptVariable[],
  stack: readonly SolidScriptFrameView[],
): Map<string, SolidScriptVariable> {
  const live = new Map(variables.map((variable) => [solidScriptNameShown(variable.name), variable]));
  for (const frame of stack) for (const local of frame.locals) live.set(solidScriptNameShown(local.name), local);
  return live;
}

/**
 * Writes the Type column of an entry, with Read Only or Set Here after it.
 *
 * @param entry Entry.
 * @returns Type text.
 */
function solidScriptExplorerTypeText(entry: SolidScriptExplorerEntry): string {
  if (entry.readOnly) return `${entry.type} · Read Only`;
  return entry.setHere ? `${entry.type} · Set Here` : entry.type;
}

/**
 * Checks the name and detail of an entry against the search text.
 *
 * @param entry Entry.
 * @param query Search text.
 * @returns True when the search is not empty and either holds it.
 */
function solidScriptExplorerNames(entry: SolidScriptExplorerEntry, query: string): boolean {
  const needle = query.trim().toLowerCase();
  return needle !== '' && [entry.name, entry.detail].some((text) => text.toLowerCase().includes(needle));
}

/**
 * Checks an entry against the search text: its name, value or type.
 *
 * @param entry Entry.
 * @param query Search text.
 * @returns True when it matches or the search is empty.
 */
export function solidScriptExplorerMatches(entry: SolidScriptExplorerEntry, query: string): boolean {
  const wanted = query.trim().toLowerCase();
  if (wanted === '') return true;
  return [entry.name, entry.value ?? '', entry.type, entry.category, entry.detail].some((text) =>
    text.toLowerCase().includes(wanted),
  );
}

/**
 * The variable explorer of the editor: on the left the categories, as in a
 * browser of variables, on the right every name with its value at the step
 * shown, its type and the lines that set it. Lists open to show their items,
 * the call stack shows the variables of each running Function. It watches
 * values while a script runs or waits in Debug; a click shows the line that
 * sets a name.
 */
export class SolidScriptEditorExplorer {
  /** Explorer element. */
  readonly element = document.createElement('div');
  /** Shows a line of the script; set by the editor. */
  reveal: (line: number) => void = () => undefined;
  /** Adds an Input line; set by the editor. */
  inputAdd: () => void = () => undefined;
  private readonly search = document.createElement('input');
  private readonly categories = document.createElement('div');
  private readonly table = document.createElement('div');
  private readonly caption = document.createElement('div');
  private category: SolidScriptExplorerCategory = 'All';
  private readonly open = new Set<string>();
  private selected: string | null = null;
  private entries: SolidScriptExplorerEntry[] = [];
  private contextEntries: SolidScriptExplorerEntry[] = [];
  private stack: readonly SolidScriptFrameView[] = [];
  private script: SolidScriptDocument | null = null;
  private live: ReadonlyMap<string, SolidScriptVariable> = new Map();
  private run: SolidScriptExplorerRun = { caption: 'Nothing ran yet', stoppedBefore: null, ran: false };
  private contextLine: number | null = null;
  private seen: ReadonlyMap<number, SolidScriptLineSeen | null> = new Map();
  private contextSource: SolidScriptExplorerContextSource = 'none';

  /** Builds the explorer. */
  constructor() {
    const c = SOLID_SCRIPT_EDITOR_CLASSES;
    this.element.className = c.explorer;
    this.search.type = 'search';
    this.search.className = c.explorerSearch;
    this.search.placeholder = 'Search Variables';
    this.search.setAttribute('aria-label', 'Search Variables');
    this.search.spellcheck = false;
    this.search.addEventListener('input', () => this.render());
    this.search.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || this.search.value === '') return;
      event.stopPropagation();
      this.search.value = '';
      this.render();
    });
    this.categories.className = c.explorerCategories;
    this.categories.setAttribute('role', 'listbox');
    this.categories.setAttribute('aria-label', 'Variable Categories');
    this.table.className = c.explorerTable;
    this.table.setAttribute('role', 'grid');
    this.caption.className = c.variablesCaption;
    const top = document.createElement('div');
    top.className = c.explorerTop;
    top.append(this.search, this.inputAddButton());
    const body = document.createElement('div');
    body.className = c.explorerBody;
    const tableColumn = document.createElement('div');
    tableColumn.className = c.explorerColumn;
    tableColumn.append(this.caption, this.table);
    body.append(
      solidScriptScrollerWrap(this.categories, '0 0 auto', 8),
      solidScriptScrollerWrap(tableColumn, '1 1 0', 12),
    );
    this.element.append(top, body);
  }

  /**
   * Shows the names of a script with the values of one step.
   *
   * @param script Script.
   * @param variables Variables at the step shown.
   * @param stack Running Functions and parts, outermost first.
   * @param system System lists such as $Selected.Faces at the step shown.
   * @param run Where the values were captured.
   * @param seen Variables and stack just before each 1-based line last ran.
   */
  show(
    script: SolidScriptDocument,
    variables: readonly SolidScriptVariable[],
    stack: readonly SolidScriptFrameView[],
    system: readonly SolidScriptVariable[],
    run: SolidScriptExplorerRun,
    seen: ReadonlyMap<number, SolidScriptLineSeen | null> = new Map(),
    options?: SolidScriptProgramOptions,
  ): void {
    const lists = run.ran ? system : [];
    this.entries = solidScriptExplorerEntries(script, variables, stack, {
      system: lists,
      stoppedBefore: run.stoppedBefore,
      ...(options ? { options } : {}),
    });
    this.stack = stack;
    this.script = script;
    this.live = new Map([
      ...solidScriptExplorerLive(variables, stack),
      ...lists.map((list): [string, SolidScriptVariable] => [list.name, list]),
    ]);
    this.run = run;
    this.seen = seen;
    this.contextRefresh();
  }

  /**
   * Follows the focused line for the Context category.
   *
   * @param line Focused 0-based line, or null when no line is focused.
   */
  contextSet(line: number | null): void {
    if (line === this.contextLine) return;
    this.contextLine = line;
    this.contextRefresh();
  }

  /** Works out what the focused line can read, then redraws. */
  private contextRefresh(): void {
    const script = this.script;
    const line = this.contextLine;
    const inScript = script !== null && line !== null && line < script.blocks.length;
    if (!inScript) this.contextLine = null;
    const context = inScript
      ? solidScriptExplorerContextValues(line, this.run, this.live, this.seen)
      : { source: 'none' as const, values: null };
    this.contextSource = context.source;
    this.contextEntries = inScript ? solidScriptExplorerContextEntries(script, line, context.values) : [];
    this.render();
  }

  /**
   * Tells whether a category lists an entry. Built-in values are the same in
   * every script: they show under System and when a search names them, not in
   * All or Current.
   *
   * @param entry Entry that matches the search.
   * @param category Category.
   * @param query Search text.
   * @returns True when listed.
   */
  private listedIn(entry: SolidScriptExplorerEntry, category: SolidScriptExplorerCategory, query: string): boolean {
    const builtIn = entry.detail !== '';
    if (category === 'All') return !builtIn || solidScriptExplorerNames(entry, query);
    if (category === 'Current') return entry.value !== null && !builtIn;
    return entry.category === category;
  }

  /** Redraws the categories and the table for the search and category chosen. */
  private render(): void {
    const c = SOLID_SCRIPT_EDITOR_CLASSES;
    const query = this.search.value;
    const counts = new Map<SolidScriptExplorerCategory, number>();
    const matching = this.entries.filter((entry) => solidScriptExplorerMatches(entry, query));
    counts.set('All', matching.filter((entry) => this.listedIn(entry, 'All', query)).length);
    counts.set('Current', matching.filter((entry) => this.listedIn(entry, 'Current', query)).length);
    const contextMatching = this.contextEntries.filter((entry) => solidScriptExplorerMatches(entry, query));
    counts.set('Context', contextMatching.length);
    for (const entry of matching) counts.set(entry.category, (counts.get(entry.category) ?? 0) + 1);
    if (this.stack.length > 0) counts.set('Call Stack', this.stack.length);
    const shown: SolidScriptExplorerCategory[] = [
      'All',
      'Current',
      'Context',
      ...SOLID_SCRIPT_NAME_CATEGORIES.filter((category) => category === 'Inputs' || counts.has(category)),
      ...(this.stack.length > 0 ? (['Call Stack'] as const) : []),
    ];
    if (!shown.includes(this.category)) this.category = 'All';
    this.categories.replaceChildren(
      ...shown.map((category) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = c.explorerCategory;
        button.setAttribute('role', 'option');
        button.setAttribute('aria-selected', String(category === this.category));
        button.dataset['category'] = category;
        const label = document.createElement('span');
        label.textContent = category;
        const count = document.createElement('span');
        count.className = c.parameterValue;
        count.textContent = String(counts.get(category) ?? 0);
        button.append(label, count);
        button.addEventListener('click', () => {
          this.category = category;
          this.render();
        });
        return button;
      }),
    );
    this.caption.textContent = solidScriptExplorerCaption(
      this.category,
      this.run,
      this.contextLine,
      this.contextSource,
    );
    const rows: HTMLElement[] = [this.headerRow()];
    if (this.category === 'Call Stack') rows.push(...this.stackRows(query));
    else if (this.category === 'Context') rows.push(...this.contextRows(contextMatching, query));
    else {
      const listed = matching.filter((entry) => this.listedIn(entry, this.category, query));
      for (const entry of listed) rows.push(...this.entryRows(entry, query));
      if (this.category === 'All' && this.stack.length > 0) rows.push(...this.stackRows(query));
      if (listed.length === 0)
        rows.push(this.note(query.trim() === '' ? 'Nothing here yet.' : `Nothing matches "${query.trim()}".`));
    }
    this.table.replaceChildren(...rows);
  }

  /**
   * Lists what the focused line can read, or says how to pick a line.
   *
   * @param listed Context entries that match the search.
   * @param query Search text.
   * @returns Rows.
   */
  private contextRows(listed: readonly SolidScriptExplorerEntry[], query: string): HTMLElement[] {
    if (this.contextLine === null) return [this.note('Click a line to see what it can read.')];
    if (listed.length === 0)
      return [this.note(query.trim() === '' ? 'Nothing to read yet.' : `Nothing matches "${query.trim()}".`)];
    return listed.flatMap((entry) => this.entryRows(entry, query));
  }

  /**
   * Builds the column captions.
   *
   * @returns Row.
   */
  private headerRow(): HTMLElement {
    const row = document.createElement('div');
    row.className = `${SOLID_SCRIPT_EDITOR_CLASSES.explorerRow} ${SOLID_SCRIPT_EDITOR_CLASSES.explorerHeader}`;
    for (const text of ['Name', 'Value', 'Type', 'Set On']) row.append(this.cell(text));
    return row;
  }

  /**
   * Builds the rows of one name, and of its items when its list is open.
   *
   * @param entry Entry.
   * @param query Search text, which opens lists whose items match.
   * @returns Rows.
   */
  private entryRows(entry: SolidScriptExplorerEntry, query: string): HTMLElement[] {
    const isList = entry.items.length > 0;
    const open = this.open.has(entry.name);
    const label = `${isList ? (open ? '▾ ' : '▸ ') : ''}${entry.name}${isList && !entry.members ? '()' : ''}`;
    const row = this.row(
      entry.name,
      label,
      entry.value ?? '—',
      solidScriptExplorerTypeText(entry),
      entry.lines,
      entry.reachLines?.at(-1),
    );
    if (entry.placeholder) row.children[1]?.classList.add(SOLID_SCRIPT_EDITOR_CLASSES.explorerPlaceholder);
    const told = entry.reaches || entry.detail;
    const about = told === '' ? '' : `${solidScriptSentencePlain(solidScriptSentence(told))} `;
    const target = entry.reachLines?.at(-1) ?? entry.lines[0];
    row.title = target !== undefined ? `${about}Click to show line ${target + 1}` : about.trim();
    if (isList)
      row.firstElementChild?.addEventListener('click', (event) => {
        event.stopPropagation();
        if (open) this.open.delete(entry.name);
        else this.open.add(entry.name);
        this.selected = entry.name;
        this.render();
      });
    const rows = [row];
    if (isList && (open || query.trim() !== ''))
      for (const item of entry.items) {
        if (
          query.trim() !== '' &&
          !open &&
          !solidScriptExplorerMatches({ ...entry, name: item.name, value: item.value, type: item.type }, query)
        )
          continue;
        const child = this.row(item.name, item.name, item.value, item.type, entry.lines);
        child.classList.add(SOLID_SCRIPT_EDITOR_CLASSES.explorerItem);
        rows.push(child);
      }
    return rows;
  }

  /**
   * Lists the running Functions and parts, innermost first, each with its own
   * variables.
   *
   * @param query Search text.
   * @returns Rows.
   */
  private stackRows(query: string): HTMLElement[] {
    const rows: HTMLElement[] = [];
    if (this.stack.length === 0)
      return [this.note('Nothing is running. Pause the script inside a Function to see its variables.')];
    for (const frame of [...this.stack].reverse()) {
      const head = document.createElement('div');
      head.className = `${SOLID_SCRIPT_EDITOR_CLASSES.explorerRow} ${SOLID_SCRIPT_EDITOR_CLASSES.stackFrame}`;
      head.title = `Called on line ${frame.line}: click to show it`;
      head.append(this.cell(frame.name), this.cell(`called on line ${frame.line}`));
      head.addEventListener('click', () => this.reveal(frame.line - 1));
      rows.push(head);
      for (const local of solidScriptExplorerVariablesSorted(frame.locals)) {
        const name = solidScriptNameShown(local.name);
        const entry: SolidScriptExplorerEntry = {
          name,
          category: 'Locals',
          value: local.value,
          type: local.type,
          lines: [],
          items: local.items,
          readOnly: false,
          detail: '',
        };
        if (!solidScriptExplorerMatches(entry, query)) continue;
        const lines = this.entries.find((known) => known.name === name)?.lines ?? [];
        const row = this.row(name, name, local.value, local.type, lines);
        row.classList.add(SOLID_SCRIPT_EDITOR_CLASSES.explorerItem);
        rows.push(row);
      }
    }
    return rows;
  }

  /**
   * Builds one row: a click selects it and shows its first line, and each line
   * under Set On shows that line.
   *
   * @param name Name of the row.
   * @param label Name as shown.
   * @param value Value text.
   * @param type Type text.
   * @param lines 0-based lines that set it.
   * @param target 0-based line a click on the row shows; the first line when
   *   missing.
   * @returns Row.
   */
  private row(
    name: string,
    label: string,
    value: string,
    type: string,
    lines: readonly number[],
    target = lines[0],
  ): HTMLElement {
    const c = SOLID_SCRIPT_EDITOR_CLASSES;
    const row = document.createElement('div');
    row.className = c.explorerRow;
    row.setAttribute('role', 'row');
    row.dataset['name'] = name;
    if (this.selected === name) row.classList.add(c.selected);
    const where = document.createElement('span');
    where.className = c.explorerLines;
    for (const line of lines) {
      const link = document.createElement('button');
      link.type = 'button';
      link.className = c.explorerLine;
      link.textContent = String(line + 1);
      link.title = `Show line ${line + 1}`;
      link.addEventListener('click', (event) => {
        event.stopPropagation();
        this.reveal(line);
      });
      where.append(link);
    }
    const valueCell = this.cell(value);
    valueCell.classList.add(c.parameterValue);
    row.append(this.cell(label, c.parameterName), valueCell, this.cell(type), where);
    row.addEventListener('click', () => {
      this.selected = name;
      for (const other of this.table.querySelectorAll(`.${c.selected}`)) other.classList.remove(c.selected);
      row.classList.add(c.selected);
      if (target !== undefined) this.reveal(target);
    });
    return row;
  }

  /**
   * Builds one cell.
   *
   * @param text Text.
   * @param className Optional class.
   * @returns Cell.
   */
  private cell(text: string, className = ''): HTMLElement {
    const cell = document.createElement('span');
    if (className !== '') cell.className = className;
    cell.textContent = text;
    cell.setAttribute('role', 'gridcell');
    return cell;
  }

  /**
   * Builds a line of help text in the table.
   *
   * @param text Text.
   * @returns Element.
   */
  private note(text: string): HTMLElement {
    const note = document.createElement('div');
    note.className = SOLID_SCRIPT_EDITOR_CLASSES.variablesCaption;
    note.textContent = text;
    return note;
  }

  /**
   * Builds the button that adds a setting to the generator's inspector.
   *
   * @returns Button.
   */
  private inputAddButton(): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = SOLID_SCRIPT_EDITOR_CLASSES.inputAdd;
    button.textContent = 'Add Input';
    button.title = 'Adds an Input line after the other inputs: a value people set in the generator inspector.';
    button.addEventListener('click', () => this.inputAdd());
    return button;
  }
}
