import { panelFloatingScopeMark } from '@/ui/floating_panel/panel_floating_scope.js';
import { SOLID_SCRIPT_EDITOR_CLASSES } from './solid_script_editor_css.js';
import { solidScriptScrollerWrap } from './solid_script_editor_scroll.js';
import {
  solidScriptSuggestionActive,
  solidScriptSuggestionContext,
  type SolidScriptSuggestionHint,
  solidScriptSuggestionHint,
  solidScriptSuggestionHintInput,
  solidScriptSuggestionWrite,
  solidScriptSuggestions,
  type SolidScriptSuggestion,
  type SolidScriptSuggestionScope,
} from './solid_script_suggestions.js';

/** Narrowest suggestion list, wider than most fields. */
const SOLID_SCRIPT_SUGGESTIONS_WIDTH_PX = 560;

/** Keys that move the caret, after which an open list follows it. */
const SOLID_SCRIPT_SUGGESTIONS_CARET_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'Home', 'End']);

/** Room the list needs below a field before it opens above it instead. */
const SOLID_SCRIPT_SUGGESTIONS_ROOM_PX = 260;

/**
 * Fills a list with suggestions under group headings.
 *
 * @param list List element.
 * @param suggestions Suggestions in group order.
 * @param press Runs when a row is pressed, with its index.
 */
function solidScriptSuggestionRows(
  list: HTMLElement,
  suggestions: readonly SolidScriptSuggestion[],
  press: (index: number) => void,
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
function solidScriptSuggestionRowsHighlight(list: HTMLElement, active: number): void {
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
 */
function solidScriptSuggestionPlace(popup: HTMLElement, anchor: HTMLElement, width: number): void {
  const box = anchor.getBoundingClientRect();
  const view = anchor.ownerDocument.defaultView;
  const viewWidth = view?.innerWidth ?? width;
  const viewHeight = view?.innerHeight ?? 0;
  const fitted = Math.min(width, viewWidth - 8);
  const left = Math.max(4, Math.min(box.left, viewWidth - fitted - 4));
  popup.style.left = `${left}px`;
  popup.style.width = `${fitted}px`;
  const below = viewHeight - box.bottom >= SOLID_SCRIPT_SUGGESTIONS_ROOM_PX || box.top < viewHeight - box.bottom;
  popup.style.top = below ? `${box.bottom + 2}px` : '';
  popup.style.bottom = below ? '' : `${viewHeight - box.top + 2}px`;
  // Never past the edge of the page: the list scrolls inside instead.
  popup.style.maxHeight = `${Math.max(0, (below ? viewHeight - box.bottom : box.top) - 8)}px`;
}

/**
 * Autocomplete of a configurator text input, opened over the page so it is
 * never cut off, opened by typing or clicking. It follows the caret with the
 * formula tokenizer, starting on the suggestion the field already holds: a
 * field's words outside brackets, names, system values and functions after [,
 * values and functions inside a [= formula with the call being typed shown on
 * top. Arrows pick, Enter or Tab insert, Escape closes.
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
    // Only the user opens the list, by typing or clicking; a field that gets the focus does not.
    input.addEventListener('input', () => this.update());
    input.addEventListener('click', () => this.update());
    input.addEventListener('keyup', (event) => {
      if (this.host.isConnected && SOLID_SCRIPT_SUGGESTIONS_CARET_KEYS.has(event.key)) this.update();
    });
    input.addEventListener('keydown', (event) => this.key(event));
    input.addEventListener('blur', () => this.close());
  }

  /**
   * Shows the call the caret is in under the field: its signature with the
   * current input bold, that input's meaning and what the function does.
   *
   * @param hint Call, or null to hide.
   */
  private hintWrite(hint: SolidScriptSuggestionHint | null): void {
    this.signature.replaceChildren();
    this.signature.hidden = !hint;
    if (!hint) return;
    const line = (...parts: (string | Node)[]): void => {
      const row = document.createElement('div');
      row.append(...parts);
      this.signature.append(row);
    };
    const parts: (string | Node)[] = [`${hint.name}(`];
    hint.inputs.forEach((input, index) => {
      if (index > 0) parts.push(', ');
      const text = solidScriptSuggestionHintInput(input);
      const strong = document.createElement('strong');
      strong.textContent = text;
      parts.push(index === hint.current ? strong : text);
    });
    parts.push(`) -> ${hint.gives}`);
    line(...parts);
    const current = hint.inputs[hint.current];
    if (current) line(`${solidScriptSuggestionHintInput(current)}. ${current.about}`);
    line(hint.summary);
  }

  /** Lists what fits at the caret, with the call being typed on top. */
  private update(): void {
    const caret = this.input.selectionStart ?? this.input.value.length;
    const context = solidScriptSuggestionContext(this.input.value, caret, this.scope.words.length > 0);
    this.shown = solidScriptSuggestions(context, this.scope);
    this.active = solidScriptSuggestionActive(this.shown, context);
    const hint = solidScriptSuggestionHint(context, this.scope);
    if (this.shown.length === 0 && !hint) return this.close();
    this.hintWrite(hint);
    solidScriptSuggestionRows(this.list, this.shown, (index) => this.accept(index));
    const opening = !this.host.isConnected;
    if (opening) this.input.ownerDocument.body.append(this.host);
    this.place();
    if (opening) this.follow();
    solidScriptSuggestionRowsHighlight(this.list, this.active);
  }

  /** Places the list at its input. */
  private place(): void {
    solidScriptSuggestionPlace(
      this.host,
      this.input,
      Math.max(this.input.getBoundingClientRect().width, SOLID_SCRIPT_SUGGESTIONS_WIDTH_PX),
    );
  }

  /**
   * Keeps the open list at its input every frame, so it moves along when the
   * window around the input changes size, such as when a message goes away.
   */
  private follow(): void {
    const view = this.input.ownerDocument.defaultView;
    if (!view?.requestAnimationFrame) return;
    const frame = (): void => {
      if (!this.host.isConnected) return;
      this.place();
      view.requestAnimationFrame(frame);
    };
    view.requestAnimationFrame(frame);
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
    // A change, not typing, so the list stays closed until the next click or key.
    this.input.dispatchEvent(new Event('change', { bubbles: true }));
  }
}
