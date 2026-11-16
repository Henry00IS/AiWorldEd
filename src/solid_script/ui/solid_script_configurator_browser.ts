import { panelFloatingScopeMark } from '@/ui/floating_panel/panel_floating_scope.js';
import {
  solidScriptSuggestionPlace,
  solidScriptSuggestionRows,
  solidScriptSuggestionRowsHighlight,
} from './solid_script_configurator_names.js';
import { SOLID_SCRIPT_EDITOR_CLASSES } from './solid_script_editor_css.js';
import { solidScriptScrollerWrap } from './solid_script_editor_scroll.js';
import {
  solidScriptSuggestionWrite,
  solidScriptSuggestionsBrowse,
  type SolidScriptSuggestion,
  type SolidScriptSuggestionScope,
} from './solid_script_suggestions.js';

/** Width of the value browser. */
const SOLID_SCRIPT_BROWSER_WIDTH_PX = 520;

/** The field a browser pick goes into, with what that field may refer to. */
export interface SolidScriptConfiguratorBrowserTarget {
  /** Text input. */
  input: HTMLInputElement;
  /** What the field may refer to, with its words. */
  scope: SolidScriptSuggestionScope;
}

/**
 * Value browser of a configurator window, opened over the page from its title
 * bar: the words of the field edited last, then every variable, input, system
 * value and function by group with what each is, and a search. Double-click or
 * Enter writes the pick at the caret of that field.
 */
export class SolidScriptConfiguratorBrowser {
  private readonly host = document.createElement('div');
  private readonly search = document.createElement('input');
  private readonly list = document.createElement('div');
  private readonly empty = document.createElement('div');
  private shown: SolidScriptSuggestion[] = [];
  private active = 0;
  private target: SolidScriptConfiguratorBrowserTarget | null = null;
  private selection: [number, number] = [0, 0];

  /**
   * Builds the browser.
   *
   * @param field Returns the field edited last, or null when there is none.
   */
  constructor(private readonly field: () => SolidScriptConfiguratorBrowserTarget | null) {
    this.host.className = `${SOLID_SCRIPT_EDITOR_CLASSES.suggestionsHost} ${SOLID_SCRIPT_EDITOR_CLASSES.browser}`;
    this.host.setAttribute('role', 'dialog');
    this.host.setAttribute('aria-label', 'Browse Values');
    this.search.type = 'search';
    this.search.className = `${SOLID_SCRIPT_EDITOR_CLASSES.input} ${SOLID_SCRIPT_EDITOR_CLASSES.browserSearch}`;
    this.search.placeholder = 'Search Names and Descriptions';
    this.search.setAttribute('aria-label', 'Search Values');
    this.search.addEventListener('input', () => this.fill());
    this.search.addEventListener('keydown', (event) => this.key(event));
    this.list.className = SOLID_SCRIPT_EDITOR_CLASSES.suggestions;
    this.list.setAttribute('role', 'listbox');
    this.list.setAttribute('aria-label', 'Values');
    this.empty.className = SOLID_SCRIPT_EDITOR_CLASSES.browserEmpty;
    this.empty.textContent = 'Nothing matches the search.';
    this.host.append(this.search, solidScriptScrollerWrap(this.list, '1 1 auto', 0), this.empty);
    this.host.addEventListener('focusout', (event) => {
      if (!this.host.contains(event.relatedTarget as Node | null)) this.close();
    });
    panelFloatingScopeMark(this.host);
  }

  /**
   * Opens the browser under a button, or closes it when it is open.
   *
   * @param anchor Button it opens from.
   */
  toggle(anchor: HTMLElement): void {
    if (this.host.isConnected) return this.close();
    this.target = this.field();
    const input = this.target?.input;
    this.selection = [input?.selectionStart ?? input?.value.length ?? 0, input?.selectionEnd ?? 0];
    this.search.value = '';
    anchor.ownerDocument.body.append(this.host);
    solidScriptSuggestionPlace(this.host, anchor, SOLID_SCRIPT_BROWSER_WIDTH_PX, true);
    this.fill();
    this.search.focus();
  }

  /** Takes the browser off the page. */
  close(): void {
    this.host.remove();
  }

  /** Lists what matches the search. */
  private fill(): void {
    const scope = this.target?.scope ?? { names: [], extra: [], words: [] };
    this.shown = solidScriptSuggestionsBrowse(scope, this.search.value);
    this.active = 0;
    this.empty.hidden = this.shown.length > 0;
    solidScriptSuggestionRows(
      this.list,
      this.shown,
      (index) => {
        this.active = index;
        solidScriptSuggestionRowsHighlight(this.list, index);
      },
      (index) => this.insert(index),
    );
    solidScriptSuggestionRowsHighlight(this.list, this.active);
  }

  /**
   * Handles keys of the search: arrows pick, Enter inserts, Escape closes.
   *
   * @param event Key event.
   */
  private key(event: KeyboardEvent): void {
    const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
    if (step === 0 && event.key !== 'Enter' && event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === 'Escape') {
      this.close();
      this.target?.input.focus();
      return;
    }
    if (event.key === 'Enter') return this.insert(this.active);
    if (this.shown.length === 0) return;
    this.active = (this.active + step + this.shown.length) % this.shown.length;
    solidScriptSuggestionRowsHighlight(this.list, this.active);
  }

  /**
   * Writes a pick at the caret of the field edited last, then goes back to it.
   *
   * @param index Index of the pick.
   */
  private insert(index: number): void {
    const suggestion = this.shown[index];
    const input = this.target?.input;
    if (!suggestion || !input?.isConnected) return;
    const [start, end] = this.selection;
    const written = solidScriptSuggestionWrite(suggestion, input.value, start, Math.max(start, end));
    this.close();
    input.value = written.text;
    input.focus();
    input.setSelectionRange(written.caret, written.caret);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
}
