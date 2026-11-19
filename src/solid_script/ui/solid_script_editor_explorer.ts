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
import { solidScriptSystemValues } from '@/solid_script/language/solid_script_system.js';
import { SOLID_SCRIPT_SYSTEM_CATALOG } from '@/solid_script/language/solid_script_system_names.js';
import { solidScriptValueText } from '@/solid_script/language/solid_script_value.js';
import type { SolidScriptFrameView, SolidScriptVariable } from '@/solid_script/language/solid_script_machine_types.js';
import { SOLID_SCRIPT_EDITOR_CLASSES } from './solid_script_editor_css.js';
import { solidScriptScrollerWrap } from './solid_script_editor_scroll.js';

/**
 * Categories of the explorer: everything, the names with a value now, then each
 * kind of name.
 */
export type SolidScriptExplorerCategory = 'All' | 'Current' | SolidScriptNameCategory | 'Call Stack';

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
}

/** Friendly type of a name the run has not reached yet. */
const SOLID_SCRIPT_EXPLORER_TYPES_STATIC: Partial<Record<SolidScriptNameCategory, string>> = {
  Lists: 'List',
  Counters: 'Number',
  Functions: 'Function',
  Parts: 'Part',
  Brushes: 'Brush Name',
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
 * @returns Entries in category order.
 */
export function solidScriptExplorerEntries(
  script: SolidScriptDocument,
  variables: readonly SolidScriptVariable[],
  stack: readonly SolidScriptFrameView[],
): SolidScriptExplorerEntry[] {
  const origins = solidScriptDocumentOrigins(script);
  const live = new Map(variables.map((variable) => [solidScriptNameShown(variable.name), variable]));
  for (const frame of stack) for (const local of frame.locals) live.set(solidScriptNameShown(local.name), local);
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
    if (listed.has(name) || name.startsWith('Local.')) continue;
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
  const system = solidScriptSystemValues('preview', null, false);
  for (const value of SOLID_SCRIPT_SYSTEM_CATALOG) {
    const current = system.get(value.name.slice(1));
    entries.push({
      name: value.name,
      category: 'System',
      value: current === undefined ? value.absent : solidScriptValueText(current),
      type: value.type,
      lines: [],
      items: [],
      readOnly: true,
      detail: value.detail,
    });
  }
  const order = (entry: SolidScriptExplorerEntry): number => SOLID_SCRIPT_NAME_CATEGORIES.indexOf(entry.category);
  return entries.sort((left, right) => order(left) - order(right));
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
  private stack: readonly SolidScriptFrameView[] = [];
  private captionText = '';

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
   * @param caption Where the values come from, such as "Paused at line 4".
   */
  show(
    script: SolidScriptDocument,
    variables: readonly SolidScriptVariable[],
    stack: readonly SolidScriptFrameView[],
    caption: string,
  ): void {
    this.entries = solidScriptExplorerEntries(script, variables, stack);
    this.stack = stack;
    this.captionText = caption;
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
    for (const entry of matching) counts.set(entry.category, (counts.get(entry.category) ?? 0) + 1);
    if (this.stack.length > 0) counts.set('Call Stack', this.stack.length);
    const shown: SolidScriptExplorerCategory[] = [
      'All',
      'Current',
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
    this.caption.textContent = this.captionText;
    const rows: HTMLElement[] = [this.headerRow()];
    if (this.category === 'Call Stack') rows.push(...this.stackRows(query));
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
    const label = `${isList ? (open ? '▾ ' : '▸ ') : ''}${entry.name}${isList ? '()' : ''}`;
    const row = this.row(
      entry.name,
      label,
      entry.value ?? '—',
      entry.readOnly ? `${entry.type} · Read Only` : entry.type,
      entry.lines,
      entry.reachLines?.at(-1),
    );
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
      for (const local of frame.locals) {
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
