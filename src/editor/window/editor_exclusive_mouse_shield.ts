import { UiStackLayers } from '@/ui/stack/ui_stack_layers.js';
import { claimDomKeyboardFocus } from '@/utils/dom_focus.js';
import {
  findSmallestElementContainingClientPoint,
  isClientPointInsideElementBounds as clientPointIsInsideElementBounds,
} from '@/utils/pointer_client_hit.js';

/**
 * Full-screen pointer and keyboard shield used only while the active event
 * receiver is busy (Shape Editor exclusive mouse ownership). Covers chrome and
 * floating panels so they never receive the hit; hit-testing peeks under the
 * shield to decide whether the pointer is in the pinned viewport (local mouse)
 * or outside (global mouse). Also steals keyboard focus from chrome buttons so
 * tool keys are not swallowed by the control that activated the tool.
 *
 * One instance is bound to a single Document (main window or a detached popup).
 * Client coordinates are always interpreted in that document only.
 */
export class EditorExclusiveMouseShield {
  private readonly rootElement: HTMLDivElement;
  private readonly boundDocument: Document;
  private ownerDocument: Document | null;
  private isMounted: boolean;

  /**
   * Creates an unmounted full-screen shield element owned by the given
   * document.
   *
   * @param ownerDocument Document that will host the shield element.
   */
  constructor(ownerDocument: Document = document) {
    this.boundDocument = ownerDocument;
    this.rootElement = this.createRootElement(ownerDocument);
    this.ownerDocument = null;
    this.isMounted = false;
  }

  /**
   * Returns the shield DOM element that receives pointer events while busy.
   *
   * @returns Full-screen shield div.
   */
  getRootElement(): HTMLDivElement {
    return this.rootElement;
  }

  /**
   * Returns the document this shield was built for and must hit-test against.
   *
   * @returns Bound owner document.
   */
  getBoundDocument(): Document {
    return this.boundDocument;
  }

  /**
   * Returns the document this shield was built for.
   *
   * @returns Owner document of the shield element.
   */
  getElementOwnerDocument(): Document {
    return this.rootElement.ownerDocument;
  }

  /**
   * Mounts the shield on the document body and moves keyboard focus onto it.
   *
   * @param ownerDocument Document that owns the body (must match bound
   *   document).
   */
  mount(ownerDocument: Document): void {
    if (ownerDocument !== this.boundDocument) {
      return;
    }
    if (this.isMounted && this.ownerDocument === ownerDocument) {
      this.setBlocksPointerEvents(true);
      this.claimKeyboardFocus();
      return;
    }
    this.unmount();
    this.ownerDocument = ownerDocument;
    ownerDocument.body.appendChild(this.rootElement);
    this.isMounted = true;
    this.setBlocksPointerEvents(true);
    this.claimKeyboardFocus();
  }

  /**
   * Enables or disables hit-testing on the shield so navigation can pass real
   * pointer events through to the viewport content underneath.
   *
   * @param blocks True when the shield must capture pointer hits.
   */
  setBlocksPointerEvents(blocks: boolean): void {
    this.rootElement.style.pointerEvents = blocks ? 'auto' : 'none';
  }

  /** Removes the shield from the document. */
  unmount(): void {
    if (this.rootElement.parentElement) {
      this.rootElement.parentElement.removeChild(this.rootElement);
    }
    this.ownerDocument = null;
    this.isMounted = false;
  }

  /**
   * Blurs the active chrome control (e.g. a toolbar button that started the
   * tool) and focuses the shield so keyboard events reach the editor.
   */
  claimKeyboardFocus(): void {
    claimDomKeyboardFocus(this.rootElement);
  }

  /**
   * Returns whether the shield is currently mounted.
   *
   * @returns True when attached to the body.
   */
  isActive(): boolean {
    return this.isMounted;
  }

  /**
   * Peeks under the shield to find the topmost element at the client point.
   *
   * @param clientX Pointer client X in this shield's document.
   * @param clientY Pointer client Y in this shield's document.
   * @returns Element under the pointer, or null.
   */
  elementFromPointUnderShield(clientX: number, clientY: number): Element | null {
    const doc = this.ownerDocument ?? this.boundDocument;
    if (typeof doc.elementFromPoint !== 'function') {
      return null;
    }
    this.rootElement.style.pointerEvents = 'none';
    const under = doc.elementFromPoint(clientX, clientY);
    this.rootElement.style.pointerEvents = 'auto';
    return under;
  }

  /**
   * Peeks under the shield for the full top-to-bottom element stack.
   *
   * @param clientX Pointer client X in this shield's document.
   * @param clientY Pointer client Y in this shield's document.
   * @returns Elements under the pointer, topmost first.
   */
  elementsFromPointUnderShield(clientX: number, clientY: number): Element[] {
    const doc = this.ownerDocument ?? this.boundDocument;
    if (typeof doc.elementsFromPoint !== 'function') {
      const single = this.elementFromPointUnderShield(clientX, clientY);
      return single ? [single] : [];
    }
    this.rootElement.style.pointerEvents = 'none';
    const stack = doc.elementsFromPoint(clientX, clientY);
    this.rootElement.style.pointerEvents = 'auto';
    return stack;
  }

  /**
   * Returns whether the client point lies inside any exclusive viewport root
   * that belongs to this shield's document.
   *
   * @param clientX Pointer client X.
   * @param clientY Pointer client Y.
   * @param exclusiveRoots Pinned viewport content elements (any documents).
   * @returns True when the point is over any exclusive viewport in this
   *   document.
   */
  isClientPointInExclusiveViewport(clientX: number, clientY: number, exclusiveRoots: readonly HTMLElement[]): boolean {
    return this.findExclusiveRootAtClientPoint(clientX, clientY, exclusiveRoots) !== null;
  }

  /**
   * Finds which exclusive viewport content owns a client point in this
   * document. Roots from other documents are ignored so multi-window client
   * coordinates never cross-match. When several same-document panes contain the
   * point, the smallest (most specific) pane wins.
   *
   * @param clientX Pointer client X in this document.
   * @param clientY Pointer client Y in this document.
   * @param exclusiveRoots Pinned viewport content elements (any documents).
   * @returns Matching root, or null when over chrome.
   */
  findExclusiveRootAtClientPoint(
    clientX: number,
    clientY: number,
    exclusiveRoots: readonly HTMLElement[],
  ): HTMLElement | null {
    const sameDocumentRoots = this.filterRootsForThisDocument(exclusiveRoots);
    if (sameDocumentRoots.length === 0) {
      return this.findViewportContentUnderShield(clientX, clientY);
    }
    if (sameDocumentRoots.length === 1) {
      return this.resolveSingleRootAtClientPoint(clientX, clientY, sameDocumentRoots[0]!);
    }
    const fromStack = this.findExclusiveRootFromElementStack(clientX, clientY, sameDocumentRoots);
    if (fromStack) {
      return fromStack;
    }
    return this.findSmallestRootContainingClientPointByBounds(clientX, clientY, sameDocumentRoots);
  }

  /**
   * Resolves a navigation/wheel target for this shield document. Prefers an
   * exclusive root hit; for a single-pane window (typical detached viewport)
   * falls back to that sole root so RMB/scroll always reach the pane.
   *
   * @param clientX Pointer client X.
   * @param clientY Pointer client Y.
   * @param exclusiveRoots Pinned viewport content elements (any documents).
   * @returns Navigation target, or null.
   */
  findNavigationRootAtClientPoint(
    clientX: number,
    clientY: number,
    exclusiveRoots: readonly HTMLElement[],
  ): HTMLElement | null {
    const hit = this.findExclusiveRootAtClientPoint(clientX, clientY, exclusiveRoots);
    if (hit) {
      return hit;
    }
    const sameDocumentRoots = this.filterRootsForThisDocument(exclusiveRoots);
    if (sameDocumentRoots.length === 1) {
      return sameDocumentRoots[0] ?? null;
    }
    return this.findViewportContentUnderShield(clientX, clientY);
  }

  /**
   * Resolves hit for a document that has only one exclusive pane.
   *
   * @param clientX Pointer client X.
   * @param clientY Pointer client Y.
   * @param root Sole exclusive root in this document.
   * @returns Root when the point is over it, otherwise null.
   */
  private resolveSingleRootAtClientPoint(clientX: number, clientY: number, root: HTMLElement): HTMLElement | null {
    if (clientPointIsInsideElementBounds(clientX, clientY, root)) {
      return root;
    }
    const under = this.elementFromPointUnderShield(clientX, clientY);
    if (under && (root === under || root.contains(under))) {
      return root;
    }
    return null;
  }

  /**
   * Finds a viewport content element under the shield when exclusive roots are
   * missing or miss the hit (detached single-pane ownership).
   *
   * @param clientX Pointer client X.
   * @param clientY Pointer client Y.
   * @returns Content element, or null.
   */
  private findViewportContentUnderShield(clientX: number, clientY: number): HTMLElement | null {
    const stack = this.elementsFromPointUnderShield(clientX, clientY);
    for (const under of stack) {
      const content = this.findViewportContentAncestor(under);
      if (content) {
        return content;
      }
    }
    return null;
  }

  /**
   * Walks ancestors for an editor viewport content hit target.
   *
   * @param start Element under the pointer.
   * @returns Content element, or null.
   */
  private findViewportContentAncestor(start: Element): HTMLElement | null {
    let current: Element | null = start;
    while (current) {
      if (current instanceof HTMLElement && current.classList.contains('editor-viewport-content')) {
        return current;
      }
      current = current.parentElement;
    }
    return null;
  }

  /**
   * Walks the element stack under the pointer and returns the topmost exclusive
   * root that owns a stack entry.
   *
   * @param clientX Pointer client X.
   * @param clientY Pointer client Y.
   * @param exclusiveRoots Same-document exclusive roots.
   * @returns Matching root, or null.
   */
  private findExclusiveRootFromElementStack(
    clientX: number,
    clientY: number,
    exclusiveRoots: readonly HTMLElement[],
  ): HTMLElement | null {
    const stack = this.elementsFromPointUnderShield(clientX, clientY);
    for (const under of stack) {
      const match = this.findDeepestRootContainingElement(under, exclusiveRoots);
      if (match) {
        return match;
      }
    }
    return null;
  }

  /**
   * Keeps only exclusive roots that live in this shield's bound document.
   *
   * @param exclusiveRoots Pinned viewport content elements.
   * @returns Roots owned by this document.
   */
  private filterRootsForThisDocument(exclusiveRoots: readonly HTMLElement[]): HTMLElement[] {
    const doc = this.boundDocument;
    const filtered: HTMLElement[] = [];
    for (const root of exclusiveRoots) {
      if (root.ownerDocument === doc) {
        filtered.push(root);
      }
    }
    return filtered;
  }

  /**
   * Finds the deepest exclusive root that contains the given element.
   *
   * @param under Element under the pointer.
   * @param exclusiveRoots Same-document exclusive roots.
   * @returns Matching root, or null.
   */
  private findDeepestRootContainingElement(under: Element, exclusiveRoots: readonly HTMLElement[]): HTMLElement | null {
    let best: HTMLElement | null = null;
    for (const root of exclusiveRoots) {
      if (root !== under && !root.contains(under)) {
        continue;
      }
      if (!best || best.contains(root)) {
        best = root;
      }
    }
    return best;
  }

  /**
   * Among exclusive roots whose bounds contain the client point, returns the
   * smallest area root so tiled multi-view panes do not always resolve to the
   * first (top-left) entry.
   *
   * @param clientX Pointer client X.
   * @param clientY Pointer client Y.
   * @param exclusiveRoots Same-document exclusive roots.
   * @returns Matching root, or null.
   */
  private findSmallestRootContainingClientPointByBounds(
    clientX: number,
    clientY: number,
    exclusiveRoots: readonly HTMLElement[],
  ): HTMLElement | null {
    return findSmallestElementContainingClientPoint(clientX, clientY, exclusiveRoots);
  }

  /**
   * Builds the full-screen transparent shield element in the given document.
   *
   * @param ownerDocument Document that owns the element.
   * @returns Configured div.
   */
  private createRootElement(ownerDocument: Document): HTMLDivElement {
    const element = ownerDocument.createElement('div');
    element.setAttribute('data-editor-exclusive-mouse-shield', 'true');
    element.setAttribute('role', 'presentation');
    element.tabIndex = -1;
    element.style.position = 'fixed';
    element.style.left = '0';
    element.style.top = '0';
    element.style.right = '0';
    element.style.bottom = '0';
    element.style.width = '100%';
    element.style.height = '100%';
    element.style.margin = '0';
    element.style.padding = '0';
    element.style.border = 'none';
    element.style.outline = 'none';
    element.style.zIndex = String(UiStackLayers.exclusiveShield);
    element.style.background = 'transparent';
    element.style.cursor = 'inherit';
    element.style.pointerEvents = 'auto';
    return element;
  }
}
