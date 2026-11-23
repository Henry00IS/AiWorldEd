import { Box3, Vector3 } from 'three';
import { Widget } from './widget.js';
import { ThemeCss } from '@/ui/theme/theme_ui_css_variables.js';
import type { EditorViewportPickContext } from '@/editor/window/editor_viewport_pick_context.js';

/**
 * The Edit button at the center of a selected generator in the Bounds tool. It
 * never takes the pointer: drags pass through to the bounds and selection as
 * before, and it acts only when a left press and release both land on it at
 * exactly the same point.
 */
export class GeneratorEditButton extends Widget {
  /** Button element per pane pick surface. */
  private readonly buttons = new Map<HTMLElement, HTMLElement>();
  /** Documents whose pointer presses are watched. */
  private readonly watched = new Set<Document>();
  /** Client point of a left press on a button, or null. */
  private press: { x: number; y: number } | null = null;
  /** True between a click on the button and entering the Generator tool. */
  private pending = false;

  /**
   * Creates the button.
   *
   * @param onEdit Called after a click on the button.
   */
  constructor(private readonly onEdit: () => void) {
    super();
  }

  /** Places the button over the selected generator in every pane. */
  override onRender(): void {
    const services = this.editor?.getServices();
    const host = services?.getGeneratorEditHost?.() ?? null;
    const generator = this.visible && host && !services?.isEditModeActive() ? host.selectedGenerator() : null;
    const shown = new Set<HTMLElement>();
    if (host && generator) {
      const center = new Box3().setFromObject(generator).getCenter(new Vector3());
      for (const pane of host.panes()) {
        shown.add(pane.pickElement);
        this.place(pane, center);
      }
    }
    for (const [pick, button] of this.buttons) if (!shown.has(pick)) button.hidden = true;
  }

  /** Hides every button, as when the Bounds tool is left. */
  hide(): void {
    this.press = null;
    for (const button of this.buttons.values()) button.hidden = true;
  }

  /**
   * Returns whether a release at a client point is a click on the button, so
   * the Bounds tool does not also select what lies under it.
   *
   * @param clientX Release client X.
   * @param clientY Release client Y.
   * @returns True for a click on the button.
   */
  claimsClickAt(clientX: number, clientY: number): boolean {
    if (this.pending) return true;
    return this.press?.x === clientX && this.press.y === clientY && this.hitAt(clientX, clientY);
  }

  /**
   * Moves a pane's button to the projected center, hidden when off screen.
   *
   * @param pane Pane camera and pick surface.
   * @param center World center of the generator.
   */
  private place(pane: EditorViewportPickContext, center: Vector3): void {
    const ndc = center.clone().project(pane.camera);
    const rect = pane.pickElement.getBoundingClientRect();
    const button = this.buttonFor(pane.pickElement);
    button.hidden = Math.abs(ndc.x) > 1 || Math.abs(ndc.y) > 1 || Math.abs(ndc.z) > 1;
    button.style.left = `${rect.left + ((ndc.x + 1) / 2) * rect.width}px`;
    button.style.top = `${rect.top + ((1 - ndc.y) / 2) * rect.height}px`;
  }

  /**
   * Returns the button of a pane, creating it on first use.
   *
   * @param pick Pane pick surface.
   * @returns Button element.
   */
  private buttonFor(pick: HTMLElement): HTMLElement {
    const existing = this.buttons.get(pick);
    if (existing) return existing;
    const doc = pick.ownerDocument;
    const button = doc.createElement('div');
    button.textContent = 'Edit';
    button.title = 'Edit Generator';
    button.setAttribute('role', 'button');
    button.setAttribute('aria-label', 'Edit Generator');
    Object.assign(button.style, GENERATOR_EDIT_BUTTON_STYLE);
    doc.body.append(button);
    this.buttons.set(pick, button);
    this.watch(doc);
    return button;
  }

  /**
   * Watches left presses and releases in a document without consuming them.
   *
   * @param doc Document that owns a button.
   */
  private watch(doc: Document): void {
    if (this.watched.has(doc)) return;
    this.watched.add(doc);
    doc.addEventListener('pointerdown', (event) => this.pointerDown(event), true);
    doc.addEventListener('pointerup', (event) => this.pointerUp(event), true);
  }

  /**
   * Remembers a left press that lands on a button.
   *
   * @param event Pointer event.
   */
  private pointerDown(event: MouseEvent): void {
    const hit = event.button === 0 && this.hitAt(event.clientX, event.clientY);
    this.press = hit ? { x: event.clientX, y: event.clientY } : null;
  }

  /**
   * Turns a release at the press point into a click, acted on once the editor
   * has finished with the release.
   *
   * @param event Pointer event.
   */
  private pointerUp(event: MouseEvent): void {
    if (event.button !== 0 || !this.claimsClickAt(event.clientX, event.clientY)) return;
    this.press = null;
    this.pending = true;
    setTimeout(() => this.fire());
  }

  /** Enters the Generator tool for a pending click. */
  private fire(): void {
    if (!this.pending) return;
    this.pending = false;
    this.onEdit();
  }

  /**
   * Returns whether a client point lies on a shown button.
   *
   * @param clientX Client X.
   * @param clientY Client Y.
   * @returns True over a button.
   */
  private hitAt(clientX: number, clientY: number): boolean {
    for (const button of this.buttons.values()) {
      if (button.hidden) continue;
      const rect = button.getBoundingClientRect();
      if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) return true;
    }
    return false;
  }
}

/** Inline style of the Edit button; it never receives pointer events. */
const GENERATOR_EDIT_BUTTON_STYLE: Partial<CSSStyleDeclaration> = {
  position: 'fixed',
  transform: 'translate(-50%, -50%)',
  pointerEvents: 'none',
  zIndex: '5',
  padding: '3px 12px',
  borderRadius: '4px',
  border: `1px solid ${ThemeCss.inputBorderColor}`,
  background: ThemeCss.buttonBackground,
  color: ThemeCss.textColor,
  font: '12px sans-serif',
  userSelect: 'none',
};
