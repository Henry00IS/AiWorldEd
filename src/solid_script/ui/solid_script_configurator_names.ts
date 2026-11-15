import { SOLID_SCRIPT_FUNCTIONS_BUILTIN } from '@/solid_script/language/solid_script_functions_builtin.js';
import {
  SOLID_SCRIPT_NAME_CATEGORIES,
  type SolidScriptName,
} from '@/solid_script/document/solid_script_document_names.js';
import { SOLID_SCRIPT_EDITOR_CLASSES } from './solid_script_editor_css.js';

/** One suggestion: what it shows and what it writes. */
interface SolidScriptSuggestion {
  /** Shown name. */
  label: string;
  /** Kind and description, shown dimmed. */
  detail: string;
  /** Category heading it is listed under. */
  category: string;
  /** Text written in place of the typed start. */
  insert: string;
  /** Characters from the end of the inserted text to leave the caret at. */
  back: number;
}

/** What is being typed at the caret, and where it starts. */
interface SolidScriptSuggestionContext {
  /** Index of the first character replaced. */
  from: number;
  /** Typed start of the name. */
  prefix: string;
  /** True inside a [= formula, where functions are offered. */
  formula: boolean;
  /** True right after an opening [, where names are offered. */
  bracket: boolean;
}

/** Most suggestions listed at once. */
const SOLID_SCRIPT_SUGGESTIONS_MAX = 40;

/**
 * Reads what is being typed before the caret: a name after [ or, inside a
 * formula, the start of a function name.
 *
 * @param text Field text.
 * @param caret Caret index.
 * @returns Context, or null where nothing is suggested.
 */
export function solidScriptSuggestionContext(text: string, caret: number): SolidScriptSuggestionContext | null {
  const before = text.slice(0, caret);
  let depth = 0;
  let formula = false;
  const formulaDepths: boolean[] = [];
  for (let index = 0; index < before.length; index++) {
    const char = before[index];
    if (char === '$') {
      index += 1;
      continue;
    }
    if (char === '[') {
      depth += 1;
      formulaDepths.push(before[index + 1] === '=');
    }
    if (char === ']' && depth > 0) {
      depth -= 1;
      formulaDepths.pop();
    }
  }
  formula = formulaDepths.includes(true);
  const bracket = /\[([A-Za-z_][A-Za-z0-9_]*)?$/.exec(before);
  if (bracket && before[bracket.index - 1] !== '$')
    return { from: bracket.index, prefix: bracket[1] ?? '', formula, bracket: true };
  const word = /(^|[^A-Za-z0-9_\]])([A-Za-z_][A-Za-z0-9_]*)$/.exec(before);
  if (formula && word) {
    const prefix = word[2] ?? '';
    return { from: caret - prefix.length, prefix, formula, bracket: false };
  }
  return null;
}

/**
 * Lists the suggestions for a context: names after [, functions inside a
 * formula, or everything by category when nothing is typed yet.
 *
 * @param context Typing context, or null for the full list of the Insert Name
 *   button.
 * @param names Names the script defines.
 * @param extra Names the command fills in itself, such as x for Displace.
 * @returns Suggestions in category order.
 */
export function solidScriptSuggestions(
  context: SolidScriptSuggestionContext | null,
  names: readonly SolidScriptName[],
  extra: readonly string[],
): SolidScriptSuggestion[] {
  const prefix = context?.prefix.toLowerCase() ?? '';
  const starts = (label: string): boolean => label.toLowerCase().startsWith(prefix);
  const values = names.filter((entry) => !['Functions', 'Parts', 'Events'].includes(entry.category));
  const functions = names.filter((entry) => entry.category === 'Functions');
  const suggestions: SolidScriptSuggestion[] = [];
  const inFormula = context?.formula ?? false;
  if (!context || context.bracket) {
    for (const entry of values)
      if (starts(entry.name))
        suggestions.push({
          label: entry.name,
          detail: entry.detail,
          category: entry.category,
          insert: `[${entry.name}]`,
          back: 0,
        });
    for (const name of extra)
      if (starts(name))
        suggestions.push({
          label: name,
          detail: 'filled in per point',
          category: 'This Command',
          insert: `[${name}]`,
          back: 0,
        });
  }
  if (!context || (!context.bracket && inFormula)) {
    const call = (name: string): Pick<SolidScriptSuggestion, 'insert' | 'back'> =>
      context ? { insert: `${name}()`, back: 1 } : { insert: `[=${name}()]`, back: 2 };
    for (const entry of functions)
      if (starts(entry.name))
        suggestions.push({ label: entry.name, detail: entry.detail, category: 'Functions', ...call(entry.name) });
    for (const name of Object.keys(SOLID_SCRIPT_FUNCTIONS_BUILTIN).sort())
      if (starts(name))
        suggestions.push({ label: name, detail: 'built in', category: 'Built-In Functions', ...call(name) });
  }
  const order = [...SOLID_SCRIPT_NAME_CATEGORIES, 'This Command', 'Built-In Functions'] as string[];
  return suggestions
    .map((suggestion, index) => ({ suggestion, index }))
    .sort((a, b) => order.indexOf(a.suggestion.category) - order.indexOf(b.suggestion.category) || a.index - b.index)
    .map(({ suggestion }) => suggestion)
    .slice(0, SOLID_SCRIPT_SUGGESTIONS_MAX);
}

/**
 * Suggestions under a configurator text input: typing [ lists the names the
 * script defines, a name inside a [= formula lists functions, and the Insert
 * Name button lists everything by category. Arrows pick, Enter or Tab insert,
 * Escape closes.
 */
export class SolidScriptConfiguratorNames {
  private readonly list = document.createElement('div');
  private shown: SolidScriptSuggestion[] = [];
  private from = 0;
  private active = 0;

  /**
   * Binds suggestions to an input.
   *
   * @param input Text input.
   * @param names Names the script defines.
   * @param extra Names the command fills in itself.
   */
  constructor(
    private readonly input: HTMLInputElement,
    private readonly names: readonly SolidScriptName[],
    private readonly extra: readonly string[],
  ) {
    this.list.className = SOLID_SCRIPT_EDITOR_CLASSES.suggestions;
    this.list.setAttribute('role', 'listbox');
    this.list.setAttribute('aria-label', 'Names');
    this.list.hidden = true;
    input.addEventListener('input', () => this.update());
    input.addEventListener('keydown', (event) => this.key(event));
    input.addEventListener('blur', () => this.close());
  }

  /**
   * Returns the list element, to place after the input.
   *
   * @returns List.
   */
  element(): HTMLElement {
    return this.list;
  }

  /** Lists every name and function by category, for the Insert Name button. */
  openAll(): void {
    this.input.focus();
    const caret = this.input.selectionStart ?? this.input.value.length;
    const context = solidScriptSuggestionContext(this.input.value, caret);
    this.from = context?.bracket ? context.from : caret;
    this.open(solidScriptSuggestions(context?.bracket ? context : null, this.names, this.extra));
  }

  /** Lists the suggestions for what is typed at the caret. */
  private update(): void {
    const caret = this.input.selectionStart ?? this.input.value.length;
    const context = solidScriptSuggestionContext(this.input.value, caret);
    if (!context) return this.close();
    this.from = context.from;
    this.open(solidScriptSuggestions(context, this.names, this.extra));
  }

  /**
   * Shows suggestions.
   *
   * @param suggestions Suggestions; none closes the list.
   */
  private open(suggestions: SolidScriptSuggestion[]): void {
    this.shown = suggestions;
    this.active = 0;
    if (suggestions.length === 0) return this.close();
    const rows: HTMLElement[] = [];
    let category = '';
    suggestions.forEach((suggestion, index) => {
      if (suggestion.category !== category) {
        category = suggestion.category;
        const heading = document.createElement('div');
        heading.className = SOLID_SCRIPT_EDITOR_CLASSES.suggestionHeading;
        heading.textContent = category;
        rows.push(heading);
      }
      const row = document.createElement('div');
      row.className = SOLID_SCRIPT_EDITOR_CLASSES.suggestion;
      row.setAttribute('role', 'option');
      row.dataset['index'] = String(index);
      const name = document.createElement('span');
      name.textContent = suggestion.label;
      const detail = document.createElement('span');
      detail.className = SOLID_SCRIPT_EDITOR_CLASSES.suggestionDetail;
      detail.textContent = suggestion.detail;
      row.append(name, detail);
      row.addEventListener('mousedown', (event) => {
        event.preventDefault();
        this.accept(index);
      });
      rows.push(row);
    });
    this.list.replaceChildren(...rows);
    this.list.hidden = false;
    this.highlight();
  }

  /** Hides the list. */
  private close(): void {
    this.list.hidden = true;
    this.shown = [];
  }

  /** Marks the picked suggestion. */
  private highlight(): void {
    for (const row of this.list.querySelectorAll<HTMLElement>('[role="option"]')) {
      const picked = Number(row.dataset['index']) === this.active;
      row.setAttribute('aria-selected', String(picked));
      if (picked) row.scrollIntoView?.({ block: 'nearest' });
    }
  }

  /**
   * Handles keys while the list is open; other keys go on to the dialog.
   *
   * @param event Key event.
   */
  private key(event: KeyboardEvent): void {
    if (this.list.hidden || this.shown.length === 0) return;
    const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
    if (step === 0 && !['Enter', 'Tab', 'Escape'].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === 'Escape') return this.close();
    if (step !== 0) {
      this.active = (this.active + step + this.shown.length) % this.shown.length;
      return this.highlight();
    }
    this.accept(this.active);
  }

  /**
   * Writes a suggestion in place of what was typed.
   *
   * @param index Suggestion index.
   */
  private accept(index: number): void {
    const suggestion = this.shown[index];
    if (!suggestion) return;
    const value = this.input.value;
    const caret = this.input.selectionStart ?? value.length;
    let after = value.slice(caret);
    if (suggestion.insert.endsWith(']') && after.startsWith(']')) after = after.slice(1);
    const text = value.slice(0, this.from) + suggestion.insert;
    this.input.value = text + after;
    const at = text.length - suggestion.back;
    this.input.setSelectionRange(at, at);
    this.input.dispatchEvent(new Event('input', { bubbles: true }));
    this.close();
  }
}
