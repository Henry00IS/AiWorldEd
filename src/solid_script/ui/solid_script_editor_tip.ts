import type { SolidScriptFieldTokenStart } from '@/solid_script/language/solid_script_field_tokens.js';
import { SOLID_SCRIPT_EDITOR_CLASSES } from './solid_script_editor_css.js';
import { solidScriptEditorViewRead } from './solid_script_editor_view.js';
import { solidScriptFieldHighlight } from './solid_script_field_highlight.js';

/** How long the pointer rests on a row before its tip shows, in milliseconds. */
export const SOLID_SCRIPT_EDITOR_TIP_DELAY_MS = 400;

/**
 * Returns code highlighted the way the script editor highlights it.
 *
 * @param text Code.
 * @param start How text outside brackets reads: 'formula' for a whole formula.
 * @returns Pieces to show.
 */
export function solidScriptEditorCodeHighlight(text: string, start: SolidScriptFieldTokenStart = 'text'): Node[] {
  const marks = {
    view: solidScriptEditorViewRead(),
    unknown: new Set<string>(),
    error: new Set<string>(),
    caret: null,
  };
  return solidScriptFieldHighlight(text, marks, start);
}

/**
 * A tip that shows the code of the row under the pointer, highlighted, with the
 * row's own tooltip above it, for example the formula a block makes.
 */
export class SolidScriptEditorTip {
  readonly element = document.createElement('div');
  private timer: ReturnType<typeof setTimeout> | null = null;
  private held: HTMLElement | null = null;
  private row: HTMLElement | null = null;

  /**
   * Creates the tip and watches the rows of a list.
   *
   * @param host List whose rows carry data-line.
   * @param code Code of a line, or null when it has none to show.
   */
  constructor(
    private readonly host: HTMLElement,
    private readonly code: (line: number) => string | null,
  ) {
    this.element.className = SOLID_SCRIPT_EDITOR_CLASSES.codeTip;
    this.element.setAttribute('role', 'tooltip');
    this.element.hidden = true;
    host.addEventListener('mouseover', (event) => this.over(event));
    host.addEventListener('mouseleave', () => this.hide());
    host.addEventListener('mousedown', () => this.hide());
  }

  /**
   * Waits for the pointer to rest on a row, then shows the row's tip.
   *
   * @param event Mouse event.
   */
  private over(event: MouseEvent): void {
    const target = event.target instanceof Element ? event.target : null;
    const row = target?.closest<HTMLElement>('[data-line]');
    if (!row || !this.host.contains(row)) return this.hide();
    if (row === this.row) return;
    this.hide();
    this.row = row;
    const titled = target?.closest<HTMLElement>('[title]') ?? null;
    this.timer = setTimeout(() => this.show(row, titled, event.clientX), SOLID_SCRIPT_EDITOR_TIP_DELAY_MS);
  }

  /**
   * Shows the tip of a row below it, taking over the hovered element's tooltip.
   *
   * @param row Row.
   * @param titled Hovered element with a tooltip, or null.
   * @param x Pointer x in CSS pixels.
   */
  private show(row: HTMLElement, titled: HTMLElement | null, x: number): void {
    const code = this.code(Number(row.dataset['line']));
    if (!code) return;
    const heading = document.createElement('div');
    heading.className = SOLID_SCRIPT_EDITOR_CLASSES.codeTipHeading;
    heading.textContent = titled && row.contains(titled) ? titled.title : '';
    const text = document.createElement('div');
    text.className = SOLID_SCRIPT_EDITOR_CLASSES.codeTipText;
    text.append(...solidScriptEditorCodeHighlight(code, 'formula'));
    this.element.replaceChildren(...(heading.textContent ? [heading] : []), text);
    this.titleHold(titled && row.contains(titled) ? titled : null);
    this.place(row, x);
  }

  /**
   * Puts the tip below a row near the pointer, kept on the screen.
   *
   * @param row Row.
   * @param x Pointer x in CSS pixels.
   */
  private place(row: HTMLElement, x: number): void {
    if (!this.element.isConnected) row.ownerDocument.body.append(this.element);
    this.element.hidden = false;
    const view = row.ownerDocument.defaultView ?? globalThis.window;
    const width = this.element.getBoundingClientRect().width;
    this.element.style.left = `${Math.max(4, Math.min(x, view.innerWidth - width - 4))}px`;
    this.element.style.top = `${row.getBoundingClientRect().bottom + 4}px`;
  }

  /**
   * Keeps the browser's own tooltip of an element from showing over the tip.
   *
   * @param element Element whose tooltip the tip shows, or null.
   */
  private titleHold(element: HTMLElement | null): void {
    this.held = element;
    if (!element) return;
    element.dataset['tipTitle'] = element.title;
    element.removeAttribute('title');
  }

  /** Hides the tip and gives the hovered element its tooltip back. */
  hide(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.row = null;
    this.element.hidden = true;
    const held = this.held;
    this.held = null;
    if (!held || held.dataset['tipTitle'] === undefined) return;
    held.title = held.dataset['tipTitle'];
    delete held.dataset['tipTitle'];
  }

  /** Removes the tip from the page. */
  dispose(): void {
    this.hide();
    this.element.remove();
  }
}
