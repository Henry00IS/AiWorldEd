import {
  solidScriptFieldBracketsAround,
  solidScriptFieldTokenKey,
  solidScriptFieldTokens,
  type SolidScriptFieldTokenKind,
  type SolidScriptFieldTokenStart,
} from '@/solid_script/language/solid_script_field_tokens.js';
import { SOLID_SCRIPT_EDITOR_CLASSES } from './solid_script_editor_css.js';
import type { SolidScriptEditorView } from './solid_script_editor_view.js';

/** What field text is shown with besides its colours. */
export interface SolidScriptFieldMarks {
  /** View switches. */
  view: SolidScriptEditorView;
  /** Keys of names and calls nothing defines, underlined as a warning. */
  unknown: ReadonlySet<string>;
  /** Keys of names the last error points at, underlined as an error. */
  error: ReadonlySet<string>;
  /** Caret index whose brackets are bold, or null. */
  caret: number | null;
}

/** Class of each kind of piece; plain text keeps the colour around it. */
const SOLID_SCRIPT_FIELD_TOKEN_CLASSES: Readonly<Record<SolidScriptFieldTokenKind, string>> = {
  text: '',
  bracket: SOLID_SCRIPT_EDITOR_CLASSES.tokenBracket,
  name: SOLID_SCRIPT_EDITOR_CLASSES.tokenName,
  local: SOLID_SCRIPT_EDITOR_CLASSES.tokenLocal,
  persistent: SOLID_SCRIPT_EDITOR_CLASSES.tokenPersistent,
  system: SOLID_SCRIPT_EDITOR_CLASSES.tokenSystem,
  function: SOLID_SCRIPT_EDITOR_CLASSES.tokenFunction,
  number: SOLID_SCRIPT_EDITOR_CLASSES.tokenNumber,
  string: SOLID_SCRIPT_EDITOR_CLASSES.tokenString,
  operator: SOLID_SCRIPT_EDITOR_CLASSES.tokenOperator,
  keyword: SOLID_SCRIPT_EDITOR_CLASSES.tokenKeyword,
};

/**
 * Builds the pieces of field text as spans, the same way in the script lines
 * and in the configurator fields: colours by kind when highlighting is on, wavy
 * lines under unknown names and the error, and bold brackets around the caret.
 * Bold is drawn with a text stroke, so no character moves.
 *
 * @param text Field text.
 * @param marks What to show.
 * @param start How the text outside brackets reads: plain text, or a formula.
 * @returns Spans covering the whole text.
 */
export function solidScriptFieldHighlight(
  text: string,
  marks: SolidScriptFieldMarks,
  start: SolidScriptFieldTokenStart = 'text',
): HTMLElement[] {
  const tokens = solidScriptFieldTokens(text, start);
  const bold = new Set(
    marks.view.brackets && marks.caret !== null ? solidScriptFieldBracketsAround(tokens, marks.caret) : [],
  );
  return tokens.map((token, index) => {
    const span = document.createElement('span');
    span.textContent = text.slice(token.from, token.to);
    const kind = marks.view.highlight ? SOLID_SCRIPT_FIELD_TOKEN_CLASSES[token.kind] : '';
    if (kind) span.classList.add(kind);
    if (bold.has(index)) span.classList.add(SOLID_SCRIPT_EDITOR_CLASSES.bracketAround);
    const key = marks.view.squiggles ? solidScriptFieldTokenKey(text, token) : null;
    if (key !== null && marks.error.has(key)) span.classList.add(SOLID_SCRIPT_EDITOR_CLASSES.squiggleError);
    else if (key !== null && marks.unknown.has(key)) {
      span.classList.add(SOLID_SCRIPT_EDITOR_CLASSES.squiggle);
      span.title = token.kind === 'function' ? 'No function has this name' : 'No line sets this name';
    }
    return span;
  });
}

/**
 * Draws a text input's text highlighted, over the input: the input's own text
 * turns clear and keeps the caret and selection, the drawn text follows its
 * scroll. Unknown names are looked up as the text changes. The input is wrapped
 * in place.
 *
 * @param input Text input already in its container.
 * @param view View switches.
 * @param unknown Returns the keys of names and calls nothing defines.
 */
export function solidScriptFieldMirrorAttach(
  input: HTMLInputElement,
  view: SolidScriptEditorView,
  unknown: (text: string) => ReadonlySet<string>,
): void {
  const wrap = document.createElement('span');
  wrap.className = SOLID_SCRIPT_EDITOR_CLASSES.fieldCode;
  const layer = document.createElement('span');
  layer.className = SOLID_SCRIPT_EDITOR_CLASSES.fieldCodeLayer;
  layer.setAttribute('aria-hidden', 'true');
  const drawn = document.createElement('span');
  layer.append(drawn);
  input.replaceWith(wrap);
  wrap.append(input, layer);
  const sync = (): void => {
    const focused = input.ownerDocument.activeElement === input;
    const caret = focused && input.selectionStart === input.selectionEnd ? input.selectionStart : null;
    const text = input.value;
    drawn.replaceChildren(
      ...solidScriptFieldHighlight(text, { view, unknown: unknown(text), error: new Set(), caret }),
    );
    drawn.style.transform = `translateX(${-input.scrollLeft}px)`;
  };
  for (const type of ['input', 'change', 'scroll', 'select', 'click', 'keyup', 'focus', 'blur'])
    input.addEventListener(type, sync);
  solidScriptFieldMirrorFollowWrites(input, sync);
  sync();
}

/**
 * Redraws a highlighted input whenever code writes its text, such as a Pick and
 * Type switch or the formula window, which fire no input event.
 *
 * @param input Text input.
 * @param sync Redraws the highlighted text.
 */
function solidScriptFieldMirrorFollowWrites(input: HTMLInputElement, sync: () => void): void {
  const own = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  if (!own?.get || !own.set) return;
  const { get, set } = own;
  Object.defineProperty(input, 'value', {
    configurable: true,
    get: () => get.call(input) as string,
    set: (text: string) => {
      set.call(input, text);
      sync();
    },
  });
}
