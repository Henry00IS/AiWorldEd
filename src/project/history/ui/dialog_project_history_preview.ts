import { dialogProjectHistoryReducedMotion } from './dialog_project_history_style.js';

/** Wait before the enlarged preview of a hovered thumbnail shows. */
export const DIALOG_PROJECT_HISTORY_PREVIEW_DELAY_MS = 350;

/** Largest edge of the preview in CSS pixels (the thumbnail size). */
export const DIALOG_PROJECT_HISTORY_PREVIEW_PX = 256;

/** Gap between the preview and the list. */
const DIALOG_PROJECT_HISTORY_PREVIEW_GAP_PX = 12;

/** Smallest distance between the preview and the window edge. */
const DIALOG_PROJECT_HISTORY_PREVIEW_MARGIN_PX = 8;

/** Where the preview goes. */
export interface DialogProjectHistoryPreviewPlace {
  left: number;
  top: number;
  size: number;
}

/**
 * Places the preview beside the list, right of it, or left of it when the right
 * side has no room, so it never covers the rows (only a window too narrow for
 * either side pushes it in); vertically it centres on the thumbnail and stays
 * inside the window.
 *
 * @param thumb Hovered thumbnail.
 * @param list The list of saves.
 * @param width Window width.
 * @param height Window height.
 * @returns Position and edge.
 */
export function dialogProjectHistoryPreviewPlace(
  thumb: DOMRect,
  list: DOMRect,
  width: number,
  height: number,
): DialogProjectHistoryPreviewPlace {
  const margin = DIALOG_PROJECT_HISTORY_PREVIEW_MARGIN_PX;
  const gap = DIALOG_PROJECT_HISTORY_PREVIEW_GAP_PX;
  const size = Math.max(0, Math.min(DIALOG_PROJECT_HISTORY_PREVIEW_PX, width - 2 * margin, height - 2 * margin));
  const roomRight = width - margin - (list.right + gap);
  const roomLeft = list.left - gap - margin;
  let x: number;
  if (size <= roomRight) x = list.right + gap;
  else if (size <= roomLeft) x = list.left - gap - size;
  else x = roomRight >= roomLeft ? width - margin - size : margin;
  x = Math.min(Math.max(margin, x), width - margin - size);
  const y = Math.min(Math.max(margin, thumb.top + thumb.height / 2 - size / 2), height - margin - size);
  return { left: x, top: y, size };
}

/**
 * The enlarged picture of a hovered thumbnail. It never takes the pointer, it
 * shows after a short wait (at once when moving straight on from another
 * thumbnail) and hides the moment the pointer leaves.
 */
export class DialogProjectHistoryPreview {
  readonly element = document.createElement('div');
  private readonly list: () => HTMLElement;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private warmTimer: ReturnType<typeof setTimeout> | null = null;
  private target: HTMLElement | null = null;
  private warm = false;

  /**
   * Builds the hidden preview.
   *
   * @param list Returns the list the preview stays beside.
   */
  constructor(list: () => HTMLElement) {
    this.list = list;
    this.element.dataset['historyPreview'] = '';
    this.element.setAttribute('aria-hidden', 'true');
    this.element.hidden = true;
    Object.assign(this.element.style, {
      position: 'fixed',
      zIndex: '10',
      pointerEvents: 'none',
      borderRadius: '10px',
      border: '1px solid rgba(255,255,255,0.18)',
      boxShadow: '0 14px 36px rgba(0,0,0,0.6)',
      background: '#232323 center / cover no-repeat',
      opacity: '0',
      transition: dialogProjectHistoryReducedMotion() ? 'none' : 'opacity 120ms ease-out',
    });
  }

  /**
   * Shows the preview of a thumbnail while the pointer rests on it.
   *
   * @param thumb Thumbnail.
   * @param id Save id.
   * @param url Loads the picture.
   */
  bind(thumb: HTMLElement, id: string, url: () => Promise<string | null>): void {
    thumb.addEventListener('pointerenter', () => this.enter(thumb, id, url));
    thumb.addEventListener('pointerleave', () => this.leave(thumb));
  }

  /**
   * Starts showing the preview of a thumbnail.
   *
   * @param thumb Thumbnail.
   * @param id Save id.
   * @param url Loads the picture.
   */
  private enter(thumb: HTMLElement, id: string, url: () => Promise<string | null>): void {
    this.timerClear();
    this.target = thumb;
    const show = () => void this.show(thumb, id, url);
    if (this.warm) show();
    else this.timer = setTimeout(show, DIALOG_PROJECT_HISTORY_PREVIEW_DELAY_MS);
  }

  /**
   * Shows the picture once loaded, unless the pointer moved on.
   *
   * @param thumb Thumbnail.
   * @param id Save id.
   * @param url Loads the picture.
   */
  private async show(thumb: HTMLElement, id: string, url: () => Promise<string | null>): Promise<void> {
    this.timer = null;
    const src = await url();
    if (this.target !== thumb || src === null || !thumb.isConnected) return;
    const place = dialogProjectHistoryPreviewPlace(
      thumb.getBoundingClientRect(),
      this.list().getBoundingClientRect(),
      window.innerWidth,
      window.innerHeight,
    );
    Object.assign(this.element.style, {
      left: `${place.left}px`,
      top: `${place.top}px`,
      width: `${place.size}px`,
      height: `${place.size}px`,
      backgroundImage: `url("${src}")`,
    });
    this.element.dataset['historyPreview'] = id;
    this.element.hidden = false;
    this.element.style.opacity = '1';
    this.warmSet(true);
  }

  /**
   * Hides the preview when the pointer leaves its thumbnail.
   *
   * @param thumb Thumbnail.
   */
  private leave(thumb: HTMLElement): void {
    if (this.target !== thumb) return;
    const shown = !this.element.hidden;
    this.hide();
    if (shown) {
      this.warmSet(true);
      this.warmTimer = setTimeout(() => this.warmSet(false), DIALOG_PROJECT_HISTORY_PREVIEW_DELAY_MS);
    }
  }

  /** Hides the preview at once. */
  hide(): void {
    this.timerClear();
    this.target = null;
    this.element.hidden = true;
    this.element.style.opacity = '0';
    this.element.dataset['historyPreview'] = '';
  }

  /**
   * Sets whether the next thumbnail shows its preview at once.
   *
   * @param warm Whether it does.
   */
  private warmSet(warm: boolean): void {
    if (this.warmTimer !== null) clearTimeout(this.warmTimer);
    this.warmTimer = null;
    this.warm = warm;
  }

  /** Clears the show timer. */
  private timerClear(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  /** Stops every timer and removes the preview. */
  dispose(): void {
    this.hide();
    this.warmSet(false);
    this.element.remove();
  }
}
