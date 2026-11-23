import type { Vector3 } from 'three';
import { Widget } from '../widget.js';
import { ThemeCss } from '@/ui/theme/theme_ui_css_variables.js';
import type { EditorViewportPickContext } from '@/editor/window/editor_viewport_pick_context.js';
import { WidgetScreenElements } from './widget_screen_elements.js';

/** One button pinned to a point in the scene. */
export interface WidgetScreenButtonAnchor {
  /** Stable key, passed back when the button is clicked. */
  key: string;
  /** Visible caption in Title Case. */
  label: string;
  /** Hover text and accessible name. */
  title: string;
  /** World point the button is centered on. */
  position: Vector3;
}

/** Buttons to show this frame and the panes to show them in. */
export interface WidgetScreenButtonFrame {
  /** Interactive panes. */
  panes: readonly EditorViewportPickContext[];
  /** Buttons shown in every pane. */
  anchors: readonly WidgetScreenButtonAnchor[];
}

/**
 * Flat buttons drawn over the panes at scene points. They never take the
 * pointer, so drags and picks under them work as before; a button acts only
 * when a left press and release both land on it at exactly the same point, with
 * no pointer move in between.
 */
export abstract class WidgetScreenButton extends Widget {
  /** Button elements by pane and anchor key. */
  private readonly elements = new WidgetScreenElements((doc) => this.elementCreate(doc));
  /** Documents whose pointer presses are watched. */
  private readonly watched = new Set<Document>();
  /** Client point and key of a left press on a button, or null. */
  private press: { doc: Document; x: number; y: number; key: string } | null = null;
  /** Key of a click waiting until the editor has finished with the release. */
  private pending: string | null = null;

  /**
   * Returns the buttons to show this frame.
   *
   * @returns Panes and anchors; no anchors hides every button.
   */
  protected abstract frameRead(): WidgetScreenButtonFrame;

  /**
   * Acts on a click on a button.
   *
   * @param key Key of the clicked button.
   */
  protected abstract clicked(key: string): void;

  /** Places every button of this frame and hides the rest. */
  override onRender(): void {
    const frame = this.visible ? this.frameRead() : { panes: [], anchors: [] };
    const shown = new Set<HTMLElement>();
    for (const pane of frame.panes) {
      for (const anchor of frame.anchors) shown.add(this.place(pane, anchor));
    }
    this.elements.hideOthers(shown);
  }

  /** Hides every button, as when the owning tool is left. */
  hide(): void {
    this.press = null;
    this.elements.hideOthers(new Set());
  }

  /**
   * Returns whether a release at a client point is a click on a button, so the
   * tool does not also act on what lies under it.
   *
   * @param clientX Release client X.
   * @param clientY Release client Y.
   * @returns True for a click on a button.
   */
  override claimsClickAt(clientX: number, clientY: number): boolean {
    if (this.pending !== null) return true;
    const press = this.press;
    if (press === null || press.x !== clientX || press.y !== clientY) return false;
    return this.keyAt(press.doc, clientX, clientY) === press.key;
  }

  /**
   * Moves one button to its projected point, hidden when off screen.
   *
   * @param pane Pane camera and pick surface.
   * @param anchor Button to place.
   * @returns The button element.
   */
  private place(pane: EditorViewportPickContext, anchor: WidgetScreenButtonAnchor): HTMLElement {
    const element = this.elements.place(pane, anchor.key, anchor.position);
    element.textContent = anchor.label;
    element.title = anchor.title;
    element.setAttribute('aria-label', anchor.title);
    return element;
  }

  /**
   * Creates a button element in a document and watches that document.
   *
   * @param doc Document of the pane.
   * @returns New button element.
   */
  private elementCreate(doc: Document): HTMLElement {
    const element = doc.createElement('div');
    element.setAttribute('role', 'button');
    Object.assign(element.style, WIDGET_SCREEN_BUTTON_STYLE);
    doc.body.append(element);
    this.watch(doc);
    return element;
  }

  /**
   * Watches left presses and releases in a document without consuming them.
   *
   * @param doc Document that owns buttons.
   */
  private watch(doc: Document): void {
    if (this.watched.has(doc)) return;
    this.watched.add(doc);
    doc.addEventListener('pointerdown', (event) => this.pointerDown(doc, event), true);
    doc.addEventListener('pointermove', (event) => this.pointerMove(event), true);
    doc.addEventListener('pointerup', (event) => this.pointerUp(event), true);
  }

  /**
   * Remembers a left press that lands on a button.
   *
   * @param doc Document the press happened in.
   * @param event Pointer event.
   */
  private pointerDown(doc: Document, event: MouseEvent): void {
    const key = event.button === 0 ? this.keyAt(doc, event.clientX, event.clientY) : null;
    this.press = key === null ? null : { doc, x: event.clientX, y: event.clientY, key };
  }

  /**
   * Forgets a press once the pointer moves at all, even if it comes back.
   *
   * @param event Pointer event.
   */
  private pointerMove(event: MouseEvent): void {
    const press = this.press;
    if (press && (event.clientX !== press.x || event.clientY !== press.y)) this.press = null;
  }

  /**
   * Turns a release at the press point into a click, acted on once the editor
   * has finished with the release.
   *
   * @param event Pointer event.
   */
  private pointerUp(event: MouseEvent): void {
    const press = this.press;
    if (event.button !== 0 || !press || !this.claimsClickAt(event.clientX, event.clientY)) return;
    this.press = null;
    this.pending = press.key;
    setTimeout(() => this.fire());
  }

  /** Acts on a pending click. */
  private fire(): void {
    const key = this.pending;
    this.pending = null;
    if (key !== null) this.clicked(key);
  }

  /**
   * Returns the key of the shown button of a document under a client point.
   *
   * @param doc Document of the pointer.
   * @param clientX Client X.
   * @param clientY Client Y.
   * @returns Key, or null over no button.
   */
  private keyAt(doc: Document, clientX: number, clientY: number): string | null {
    for (const element of this.elements.all()) {
      if (element.hidden || element.ownerDocument !== doc) continue;
      const rect = element.getBoundingClientRect();
      const inside = clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
      if (inside) return element.dataset['key'] ?? null;
    }
    return null;
  }
}

/** Inline style of a screen button; it never receives pointer events. */
const WIDGET_SCREEN_BUTTON_STYLE: Partial<CSSStyleDeclaration> = {
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
