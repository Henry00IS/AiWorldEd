import { VirtualListScrollbar } from '@/ui/virtual_list/virtual_list_scrollbar.js';

/** Style element id for chat native-scrollbar hiding. */
const SCROLL_COLLABORATION_CHAT_STYLE_ID = 'editor-chat-scrollbar-style';

/**
 * Ensures chat scrollers hide the native bar so the Outliner-style custom bar
 * is the only one visible.
 */
export function scrollCollaborationChatStylesEnsure(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById(SCROLL_COLLABORATION_CHAT_STYLE_ID) !== null) return;
  const style = document.createElement('style');
  style.id = SCROLL_COLLABORATION_CHAT_STYLE_ID;
  style.textContent = `
.editor-chat-scroller, .editor-chat-emoji {
  scrollbar-width: none;
}
.editor-chat-scroller::-webkit-scrollbar, .editor-chat-emoji::-webkit-scrollbar {
  width: 0;
  height: 0;
  display: none;
}`.trim();
  document.head.appendChild(style);
}

/**
 * Binds an Outliner-style custom scrollbar to a native scrollable element.
 *
 * @param host Positioned host that receives the scrollbar element.
 * @param scroller Element that actually scrolls.
 * @returns Bound scrollbar (call dispose when done).
 */
export function scrollCollaborationChatBind(host: HTMLElement, scroller: HTMLElement): VirtualListScrollbar {
  scrollCollaborationChatStylesEnsure();
  const scrollbar = new VirtualListScrollbar();
  host.appendChild(scrollbar.getElement());
  scrollbar.stepRowHeightPxSet(24);
  scrollbar.onPercentChangeSet((percent) => {
    const range = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    scroller.scrollTop = range * percent;
  });
  scrollbar.onStepSet((deltaPx) => {
    scroller.scrollTop += deltaPx;
  });
  const sync = () => scrollCollaborationChatSync(scrollbar, scroller);
  scroller.addEventListener('scroll', sync);
  if (typeof ResizeObserver !== 'undefined') {
    const observer = new ResizeObserver(sync);
    observer.observe(host);
    observer.observe(scroller);
  }
  sync();
  return scrollbar;
}

/**
 * Pushes scroller metrics into the custom scrollbar.
 *
 * @param scrollbar Custom scrollbar.
 * @param scroller Native scroller.
 */
export function scrollCollaborationChatSync(scrollbar: VirtualListScrollbar, scroller: HTMLElement): void {
  const viewport = scroller.clientHeight;
  const content = scroller.scrollHeight;
  const range = Math.max(0, content - viewport);
  const percent = range <= 0 ? 0 : scroller.scrollTop / range;
  scrollbar.metricsSync(viewport, content, percent, content > viewport + 1);
}
