import { VirtualListScrollbar } from './virtual_list_scrollbar.js';

/** Style element id for hiding native bars under the custom scrollbar. */
const VIRTUAL_LIST_SCROLLBAR_BIND_STYLE_ID = 'editor-custom-scroller-style';

/** Class that hides a scroller's native bar so only the custom one shows. */
export const VIRTUAL_LIST_SCROLLBAR_BIND_SCROLLER_CLASS = 'editor-custom-scroller';

/** Width the custom scrollbar takes at the right edge of its host. */
export const VIRTUAL_LIST_SCROLLBAR_BIND_GUTTER_PX = 12;

/** A custom scrollbar bound to a native scroller. */
export interface VirtualListScrollbarBinding {
  /** The Outliner-style scrollbar. */
  scrollbar: VirtualListScrollbar;
  /** Pushes current scroller metrics into the scrollbar. */
  sync: () => void;
  /** Removes listeners and the scrollbar. */
  dispose: () => void;
}

/** Ensures elements with the scroller class hide their native scrollbar. */
export function virtualListScrollbarBindStylesEnsure(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById(VIRTUAL_LIST_SCROLLBAR_BIND_STYLE_ID) !== null) return;
  const style = document.createElement('style');
  style.id = VIRTUAL_LIST_SCROLLBAR_BIND_STYLE_ID;
  const selector = `.${VIRTUAL_LIST_SCROLLBAR_BIND_SCROLLER_CLASS}`;
  style.textContent = `${selector} { scrollbar-width: none; }\n${selector}::-webkit-scrollbar { width: 0; height: 0; display: none; }`;
  document.head.appendChild(style);
}

/**
 * Binds the Outliner-style custom scrollbar to a native scrollable element:
 * dragging, track clicks and arrows scroll it, and scrolling or resizing the
 * host, the scroller or any observed content moves the thumb.
 *
 * @param host Positioned host that receives the scrollbar element.
 * @param scroller Element that actually scrolls.
 * @param stepPx Arrow step in CSS pixels.
 * @param observed Extra elements whose size changes the content height.
 * @returns Binding.
 */
export function virtualListScrollbarBind(
  host: HTMLElement,
  scroller: HTMLElement,
  stepPx: number,
  observed: readonly HTMLElement[] = [],
): VirtualListScrollbarBinding {
  const scrollbar = new VirtualListScrollbar();
  host.appendChild(scrollbar.getElement());
  scrollbar.stepRowHeightPxSet(stepPx);
  scrollbar.onPercentChangeSet((percent) => {
    scroller.scrollTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight) * percent;
  });
  scrollbar.onStepSet((deltaPx) => (scroller.scrollTop += deltaPx));
  const sync = (): void => virtualListScrollbarSync(scrollbar, scroller);
  scroller.addEventListener('scroll', sync);
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(sync);
  for (const element of [host, scroller, ...observed]) observer?.observe(element);
  sync();
  const dispose = (): void => {
    observer?.disconnect();
    scroller.removeEventListener('scroll', sync);
    scrollbar.dispose();
  };
  return { scrollbar, sync, dispose };
}

/**
 * Reserves the scrollbar's gutter on the right of a scroller while its content
 * overflows, so the bar never covers content, and syncs the bar.
 *
 * @param scroller Native scroller.
 * @param binding Its custom scrollbar.
 * @param idlePaddingPx Right padding while nothing overflows.
 */
export function virtualListScrollbarGutterSync(
  scroller: HTMLElement,
  binding: VirtualListScrollbarBinding | null,
  idlePaddingPx: number,
): void {
  const overflow = scroller.scrollHeight > scroller.clientHeight + 1;
  const right = overflow ? VIRTUAL_LIST_SCROLLBAR_BIND_GUTTER_PX + 4 : idlePaddingPx;
  if (scroller.style.paddingRight !== `${right}px`) scroller.style.paddingRight = `${right}px`;
  binding?.sync();
}

/**
 * Pushes scroller metrics into a custom scrollbar.
 *
 * @param scrollbar Custom scrollbar.
 * @param scroller Native scroller.
 */
export function virtualListScrollbarSync(scrollbar: VirtualListScrollbar, scroller: HTMLElement): void {
  const viewport = scroller.clientHeight;
  const content = scroller.scrollHeight;
  const range = Math.max(0, content - viewport);
  scrollbar.metricsSync(viewport, content, range <= 0 ? 0 : scroller.scrollTop / range, content > viewport + 1);
}
