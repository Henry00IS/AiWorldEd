import type { VirtualListScrollbar } from '@/ui/virtual_list/virtual_list_scrollbar.js';
import { virtualListScrollbarBind, virtualListScrollbarSync } from '@/ui/virtual_list/virtual_list_scrollbar_bind.js';

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
  return virtualListScrollbarBind(host, scroller, 24).scrollbar;
}

/**
 * Pushes scroller metrics into the custom scrollbar.
 *
 * @param scrollbar Custom scrollbar.
 * @param scroller Native scroller.
 */
export function scrollCollaborationChatSync(scrollbar: VirtualListScrollbar, scroller: HTMLElement): void {
  virtualListScrollbarSync(scrollbar, scroller);
}
