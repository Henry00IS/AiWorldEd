import { panelFloatingScopeMark } from '@/ui/floating_panel/panel_floating_scope.js';
import { SOLID_SCRIPT_EDITOR_CLASSES } from './solid_script_editor_css.js';
import { solidScriptScrollerWrap } from './solid_script_editor_scroll.js';
import {
  solidScriptSuggestionContext,
  solidScriptSuggestionSignature,
  solidScriptSuggestionWrite,
  solidScriptSuggestions,
  type SolidScriptSuggestion,
  type SolidScriptSuggestionScope,
} from './solid_script_suggestions.js';

/** Narrowest suggestion list, wider than most fields. */
const SOLID_SCRIPT_SUGGESTIONS_WIDTH_PX = 480;

/** Room the list needs below a field before it opens above it instead. */
const SOLID_SCRIPT_SUGGESTIONS_ROOM_PX = 260;

/**
 * Fills a list with suggestions under group headings.
 *
 * @param list List element.
 * @param suggestions Suggestions in group order.
 * @param press Runs when a row is pressed, with its index.
 * @param pick Runs when a row is picked with a double click, or null.
 */
export function solidScriptSuggestionRows(
  list: HTMLElement,
  suggestions: readonly SolidScriptSuggestion[],
  press: (index: number) => void,
  pick: ((index: number) => void) | null,
): void {
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
    row.title = `${suggestion.label}: ${suggestion.detail}`;
    const name = document.createElement('span');
    name.textContent = suggestion.label;
    const detail = document.createElement('span');
    detail.className = SOLID_SCRIPT_EDITOR_CLASSES.suggestionDetail;
    detail.textContent = suggestion.detail;
    row.append(name, detail);
    row.addEventListener('mousedown', (event) => {
      event.preventDefault();
      press(index);
    });
    if (pick) row.addEventListener('dblclick', () => pick(index));
    rows.push(row);
  });
  list.replaceChildren(...rows);
}

/**
 * Marks the picked row of a suggestion list and scrolls it into view.
 *
 * @param list List element.
 * @param active Picked index.
 */
export function solidScriptSuggestionRowsHighlight(list: HTMLElement, active: number): void {
  for (const row of list.querySelectorAll<HTMLElement>('[role="option"]')) {
    const picked = Number(row.dataset['index']) === active;
    row.setAttribute('aria-selected', String(picked));
    if (picked) row.scrollIntoView?.({ block: 'nearest' });
  }
}

/**
 * Places a popup over the page next to an anchor, opening above it when there
 * is no room below.
 *
 * @param popup Popup with fixed position.
 * @param anchor Element it belongs to.
 * @param width Popup width.
 * @param alignRight True to line up the right edges.
 */
export function solidScriptSuggestionPlace(
  popup: HTMLElement,
  anchor: HTMLElement,
  width: number,
  alignRight: boolean,
): void {
  const box = anchor.getBoundingClientRect();
  const view = anchor.ownerDocument.defaultView;
  const viewWidth = view?.innerWidth ?? width;
  const viewHeight = view?.innerHeight ?? 0;
  const left = Math.max(4, Math.min(alignRight ? box.right - width : box.left, viewWidth - width - 4));
  popup.style.left = `${left}px`;
  popup.style.width = `${width}px`;
  const below = viewHeight - box.bottom >= SOLID_SCRIPT_SUGGESTIONS_ROOM_PX || box.top < viewHeight - box.bottom;
  popup.style.top = below ? `${box.bottom + 2}px` : '';
  popup.style.bottom = below ? '' : `${viewHeight - box.top + 2}px`;
}

/**
 * Autocomplete of a configurator text input, opened over the page so it is
 * never cut off. It follows the caret with the formula tokenizer: a field's
 * words outside brackets, names, system values and functions after [, values
 * and functions inside a [= formula with the call being typed shown on top.
 * Arrows pick, Enter or Tab insert, Escape closes.
 */
export class SolidScriptConfiguratorNames {
  private readonly host = document.createElement('div');
  private readonly signature = document.createElement('div');
  private readonly list = document.createElement('div');
  private shown: SolidScriptSuggestion[] = [];
  private active = 0;

  /**
   * Binds suggestions to an input.
   *
   * @param input Text input.
   * @param scope What the field may refer to.
   */
  constructor(
    private readonly input: HTMLInputElement,
    private readonly scope: SolidScriptSuggestionScope,
  ) {
    this.list.className = SOLID_SCRIPT_EDITOR_CLASSES.suggestions;
    this.list.setAttribute('role', 'listbox');
    this.list.setAttribute('aria-label', 'Suggestions');
    this.signature.className = SOLID_SCRIPT_EDITOR_CLASSES.suggestionSignature;
    this.host.className = SOLID_SCRIPT_EDITOR_CLASSES.suggestionsHost;
    this.host.append(this.signature, solidScriptScrollerWrap(this.list, '1 1 auto', 0));
    panelFloatingScopeMark(this.host);
    input.addEventListener('input', () => this.update());
    input.addEventListener('focus', () => {
      if (scope.words.length > 0) this.update();
    });
    input.addEventListener('keydown', (event) => this.key(event));
    input.addEventListener('blur', () => this.close());
  }

  /** Lists what fits at the caret, with the call being typed on top. */
  private update(): void {
    const caret = this.input.selectionStart ?? this.input.value.length;
    const context = solidScriptSuggestionContext(this.input.value, caret, this.scope.words.length > 0);
    this.shown = solidScriptSuggestions(context, this.scope);
    this.active = 0;
    const signature = solidScriptSuggestionSignature(context, this.scope);
    if (this.shown.length === 0 && signature === '') return this.close();
    this.signature.textContent = signature;
    this.signature.hidden = signature === '';
    solidScriptSuggestionRows(this.list, this.shown, (index) => this.accept(index), null);
    if (!this.host.isConnected) this.input.ownerDocument.body.append(this.host);
    solidScriptSuggestionPlace(
      this.host,
      this.input,
      Math.max(this.input.getBoundingClientRect().width, SOLID_SCRIPT_SUGGESTIONS_WIDTH_PX),
      false,
    );
    solidScriptSuggestionRowsHighlight(this.list, this.active);
  }

  /** Takes the list off the page. */
  close(): void {
    this.host.remove();
    this.shown = [];
  }

  /**
   * Handles keys while the list is open; other keys go on to the dialog.
   *
   * @param event Key event.
   */
  private key(event: KeyboardEvent): void {
    if (!this.host.isConnected || this.shown.length === 0) return;
    const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
    if (step === 0 && !['Enter', 'Tab', 'Escape'].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === 'Escape') return this.close();
    if (step !== 0) {
      this.active = (this.active + step + this.shown.length) % this.shown.length;
      return solidScriptSuggestionRowsHighlight(this.list, this.active);
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
    const caret = this.input.selectionStart ?? this.input.value.length;
    const written = solidScriptSuggestionWrite(suggestion, this.input.value, caret, caret);
    this.input.value = written.text;
    this.input.setSelectionRange(written.caret, written.caret);
    this.close();
    this.input.dispatchEvent(new Event('input', { bubbles: true }));
  }
}
