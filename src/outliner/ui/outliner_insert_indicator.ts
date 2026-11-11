import { Theme } from '@/theme.js';
import { hexToRgb } from '@/utils/utils_color.js';
import { resolveOutlinerInsertLineGeometry, type OutlinerDropPlacement } from './outliner_drop_placement.js';

/**
 * One-pixel-thick orange horizontal insert marker for vertical outliner drag
 * reorder (workspace tab strip equivalent, rotated to a vertical list). Line
 * length shortens with insert depth so nested drops read clearly.
 */
export class OutlinerInsertIndicator {
  private readonly element: HTMLElement;

  /** Creates a hidden insert marker ready to attach under a tree host. */
  constructor() {
    this.element = this.createElement();
  }

  /**
   * Returns the marker DOM node for tests and attachment.
   *
   * @returns Indicator element.
   */
  getElement(): HTMLElement {
    return this.element;
  }

  /**
   * Ensures the marker is a child of the given host.
   *
   * @param host Tree host that positions the marker (relative container).
   */
  attachTo(host: HTMLElement): void {
    if (this.element.parentElement === host) return;
    host.appendChild(this.element);
  }

  /**
   * Shows the marker on the top or bottom edge of a row, or hides it when the
   * placement is nesting into the row (no edge line). Nested lines start at the
   * name column; root lines span the full host width.
   *
   * @param host Tree host used for coordinate conversion and attachment.
   * @param rowRect Target row bounds in viewport coordinates.
   * @param placement Drop placement for the hovered row.
   * @param insertDepth Hierarchy depth of the insertion (0 = full-width root).
   * @param nameColumnLeftPx Measured name-label left in host coordinates, or
   *   null to use the depth fallback.
   */
  showForRow(
    host: HTMLElement,
    rowRect: DOMRect,
    placement: OutlinerDropPlacement,
    insertDepth: number,
    nameColumnLeftPx: number | null = null,
  ): void {
    if (placement === 'into') {
      this.hide();
      return;
    }
    this.attachTo(host);
    const hostRect = host.getBoundingClientRect();
    const y =
      placement === 'before'
        ? rowRect.top - hostRect.top + host.scrollTop
        : rowRect.bottom - hostRect.top + host.scrollTop;
    this.showAtHostLocalY(host, y, insertDepth, nameColumnLeftPx);
  }

  /**
   * Shows the marker at a precomputed host-local Y without measuring row rects.
   *
   * @param host Tree host that positions the marker.
   * @param hostLocalY Y relative to the host content box (includes scroll).
   * @param insertDepth Hierarchy depth of the insertion (0 = full-width root).
   * @param nameColumnLeftPx Measured or estimated name-column left, or null.
   */
  showAtHostLocalY(
    host: HTMLElement,
    hostLocalY: number,
    insertDepth: number,
    nameColumnLeftPx: number | null = null,
  ): void {
    this.attachTo(host);
    const geometry = resolveOutlinerInsertLineGeometry(host.clientWidth, insertDepth, nameColumnLeftPx);
    this.positionAt(hostLocalY, geometry.left);
  }

  /**
   * Positions and reveals the marker at a host-local Y. The right edge is
   * pinned to the host padding box so the line cannot widen scrollWidth by a
   * pixel when a vertical scrollbar is present.
   *
   * @param hostLocalY Y relative to the host content box (includes scroll).
   * @param left Left inset in CSS pixels.
   */
  positionAt(hostLocalY: number, left: number): void {
    this.element.style.display = 'block';
    this.element.style.top = `${Math.round(hostLocalY)}px`;
    this.element.style.left = `${Math.max(0, Math.round(left))}px`;
    this.element.style.right = '0px';
    this.element.style.width = 'auto';
  }

  /** Hides the insert marker. */
  hide(): void {
    this.element.style.display = 'none';
  }

  /**
   * Creates the absolute 1px selection-colored line element.
   *
   * @returns Indicator element (hidden until shown).
   */
  private createElement(): HTMLElement {
    const indicator = document.createElement('div');
    indicator.classList.add('editor-outliner-insert-indicator');
    indicator.style.position = 'absolute';
    indicator.style.left = '0px';
    indicator.style.right = '0px';
    indicator.style.height = '1px';
    indicator.style.width = 'auto';
    indicator.style.background = hexToRgb(Theme.selectionColor);
    indicator.style.pointerEvents = 'none';
    indicator.style.zIndex = '20';
    indicator.style.display = 'none';
    indicator.style.transform = 'translateY(-50%)';
    return indicator;
  }
}
