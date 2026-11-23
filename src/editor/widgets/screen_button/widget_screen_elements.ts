import type { Vector3 } from 'three';
import type { EditorViewportPickContext } from '@/editor/window/editor_viewport_pick_context.js';
import { widgetScreenClip } from './widget_screen_clip.js';

/** Where a scene point lands on screen. */
export interface WidgetScreenPoint {
  /** Client X. */
  x: number;
  /** Client Y. */
  y: number;
  /** False when the point is outside the pane's view. */
  visible: boolean;
}

/**
 * Projects a scene point into a pane's client coordinates.
 *
 * @param position World point.
 * @param pane Pane camera and pick surface.
 * @returns Client point and whether it is in view.
 */
export function widgetScreenProject(position: Vector3, pane: EditorViewportPickContext): WidgetScreenPoint {
  const ndc = position.clone().project(pane.camera);
  const rect = pane.pickElement.getBoundingClientRect();
  return {
    x: rect.left + ((ndc.x + 1) / 2) * rect.width,
    y: rect.top + ((1 - ndc.y) / 2) * rect.height,
    visible: Math.abs(ndc.x) <= 1 && Math.abs(ndc.y) <= 1 && Math.abs(ndc.z) <= 1,
  };
}

/**
 * Elements drawn over the panes at scene points, one per pane and key, made on
 * first use in the pane's own document.
 */
export class WidgetScreenElements {
  /** Elements by pane pick surface, then by key. */
  private readonly elements = new Map<HTMLElement, Map<string, HTMLElement>>();

  /**
   * Creates the pool.
   *
   * @param create Makes a new element in a document, already in its body.
   */
  constructor(private readonly create: (doc: Document) => HTMLElement) {}

  /**
   * Returns the element of a key in a pane, creating it on first use.
   *
   * @param pick Pane pick surface.
   * @param key Key.
   * @returns Element.
   */
  get(pick: HTMLElement, key: string): HTMLElement {
    const pane = this.elements.get(pick) ?? new Map<string, HTMLElement>();
    this.elements.set(pick, pane);
    const element = pane.get(key) ?? this.create(pick.ownerDocument);
    pane.set(key, element);
    element.dataset['key'] = key;
    return element;
  }

  /**
   * Moves an element to a scene point, hidden when out of view.
   *
   * @param pane Pane camera and pick surface.
   * @param key Key.
   * @param position World point.
   * @returns The element.
   */
  place(pane: EditorViewportPickContext, key: string, position: Vector3): HTMLElement {
    const point = widgetScreenProject(position, pane);
    const element = this.get(pane.pickElement, key);
    element.hidden = !point.visible;
    element.style.left = `${point.x}px`;
    element.style.top = `${point.y}px`;
    return element;
  }

  /**
   * Lays an element as a line between two scene points: the part in view,
   * placed at its first end, as wide as it is on screen and turned toward its
   * other end; hidden only when no part is in view.
   *
   * @param pane Pane camera and pick surface.
   * @param key Key.
   * @param from World start.
   * @param to World end.
   * @returns The element.
   */
  line(pane: EditorViewportPickContext, key: string, from: Vector3, to: Vector3): HTMLElement {
    const segment = widgetScreenClip(from, to, pane);
    const element = this.get(pane.pickElement, key);
    element.hidden = segment === null;
    if (!segment) return element;
    const { x0, y0, x1, y1 } = segment;
    element.style.left = `${x0}px`;
    element.style.top = `${y0}px`;
    element.style.width = `${Math.hypot(x1 - x0, y1 - y0)}px`;
    element.style.transform = `rotate(${Math.atan2(y1 - y0, x1 - x0)}rad)`;
    return element;
  }

  /**
   * Returns every element of every pane.
   *
   * @returns Elements.
   */
  all(): HTMLElement[] {
    return [...this.elements.values()].flatMap((pane) => [...pane.values()]);
  }

  /**
   * Hides every element not shown this frame.
   *
   * @param shown Elements shown this frame.
   */
  hideOthers(shown: ReadonlySet<HTMLElement>): void {
    for (const element of this.all()) if (!shown.has(element)) element.hidden = true;
  }

  /** Removes every element from its document. */
  dispose(): void {
    for (const element of this.all()) element.remove();
    this.elements.clear();
  }
}
