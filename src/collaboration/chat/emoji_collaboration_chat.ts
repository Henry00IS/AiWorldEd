import { scrollCollaborationChatBind } from '@/collaboration/chat/scroll_collaboration_chat.js';
import { Theme } from '@/theme.js';
import type { VirtualListScrollbar } from '@/ui/virtual_list/virtual_list_scrollbar.js';

/** Emoji offered by the picker: a fixed, small set that needs no data files. */
export const EMOJI_COLLABORATION_CHAT_SET: readonly string[] = [
  '\u{1F600}',
  '\u{1F601}',
  '\u{1F602}',
  '\u{1F923}',
  '\u{1F60A}',
  '\u{1F607}',
  '\u{1F642}',
  '\u{1F609}',
  '\u{1F60D}',
  '\u{1F618}',
  '\u{1F60E}',
  '\u{1F914}',
  '\u{1F928}',
  '\u{1F610}',
  '\u{1F644}',
  '\u{1F62C}',
  '\u{1F634}',
  '\u{1F62E}',
  '\u{1F631}',
  '\u{1F622}',
  '\u{1F62D}',
  '\u{1F621}',
  '\u{1F92F}',
  '\u{1F973}',
  '\u{1F44D}',
  '\u{1F44E}',
  '\u{1F44C}',
  '\u{270C}\u{FE0F}',
  '\u{1F44F}',
  '\u{1F64C}',
  '\u{1F64F}',
  '\u{1F44B}',
  '\u{1F4AA}',
  '\u{1F440}',
  '\u{1F9E0}',
  '\u{2764}\u{FE0F}',
  '\u{1F494}',
  '\u{1F525}',
  '\u{2728}',
  '\u{2B50}',
  '\u{1F389}',
  '\u{1F680}',
  '\u{1F4A1}',
  '\u{1F4AF}',
];

/** Gap from the popup to the scrollbar / bottom edge. */
const EMOJI_COLLABORATION_CHAT_EDGE_GAP_PX = 18;
/** Outliner-style scrollbar width reserved on the right of the chat. */
const EMOJI_COLLABORATION_CHAT_SCROLLBAR_PX = 12;

/**
 * Inserts text at the caret of a field.
 *
 * @param field Target field.
 * @param text Text to insert.
 */
export function emojiCollaborationChatInsert(field: HTMLTextAreaElement, text: string): void {
  const start = field.selectionStart;
  const end = field.selectionEnd;
  field.value = `${field.value.slice(0, start)}${text}${field.value.slice(end)}`;
  const caret = start + text.length;
  field.setSelectionRange(caret, caret);
  field.dispatchEvent(new Event('input', { bubbles: true }));
  field.focus();
}

/** Static emoji grid that pops up above the message field. */
export class EmojiCollaborationChatPicker {
  readonly element: HTMLElement;
  private readonly scroller: HTMLElement;
  private readonly onPick: (emoji: string) => void;
  private readonly outside: (event: MouseEvent) => void;
  private readonly toggleButton: HTMLElement | null;
  private scrollbar: VirtualListScrollbar | null;

  /**
   * Creates the hidden grid.
   *
   * @param onPick Receives the chosen emoji.
   * @param toggleButton Optional emoji toggle that must not count as outside.
   */
  constructor(onPick: (emoji: string) => void, toggleButton: HTMLElement | null = null) {
    this.onPick = onPick;
    this.toggleButton = toggleButton;
    this.element = document.createElement('div');
    this.element.className = 'editor-chat-emoji-host';
    const right = EMOJI_COLLABORATION_CHAT_SCROLLBAR_PX + EMOJI_COLLABORATION_CHAT_EDGE_GAP_PX;
    this.element.style.cssText = `position:absolute;right:${right}px;bottom:100%;margin-bottom:${EMOJI_COLLABORATION_CHAT_EDGE_GAP_PX}px;display:none;max-height:220px;border-radius:8px;border:1px solid rgba(255,255,255,0.12);background:rgba(28,28,28,0.98);box-shadow:0 10px 30px rgba(0,0,0,0.6);z-index:2;font-family:${Theme.uiFontFamily}`;
    this.scroller = document.createElement('div');
    this.scroller.className = 'editor-chat-emoji';
    this.scroller.setAttribute('role', 'grid');
    this.scroller.style.cssText =
      'display:grid;grid-template-columns:repeat(8,30px);gap:2px;padding:6px 12px 6px 6px;max-height:220px;overflow-y:auto;overflow-x:hidden';
    this.scroller.append(...EMOJI_COLLABORATION_CHAT_SET.map((emoji) => this.cell(emoji)));
    this.element.appendChild(this.scroller);
    this.outside = (event) => this.outsideHandle(event);
    this.scrollbar = null;
  }

  /**
   * Returns whether the grid is shown.
   *
   * @returns True when open.
   */
  isOpen(): boolean {
    return this.element.style.display !== 'none';
  }

  /**
   * Shows or hides the grid.
   *
   * @param open True to show.
   */
  openSet(open: boolean): void {
    this.element.style.display = open ? 'block' : 'none';
    if (open) {
      document.addEventListener('mousedown', this.outside, true);
      this.scrollbarEnsure();
    } else document.removeEventListener('mousedown', this.outside, true);
  }

  /** Attaches the Outliner-style scrollbar once the popup is shown. */
  private scrollbarEnsure(): void {
    if (this.scrollbar !== null) return;
    this.scrollbar = scrollCollaborationChatBind(this.element, this.scroller);
  }

  /**
   * Closes the picker when the pointer lands outside it and its toggle.
   *
   * @param event Pointer event.
   */
  private outsideHandle(event: MouseEvent): void {
    const target = event.target as Node;
    if (this.element.contains(target)) return;
    if (this.toggleButton?.contains(target)) return;
    this.openSet(false);
  }

  /**
   * Creates one emoji button.
   *
   * @param emoji Emoji.
   * @returns Button.
   */
  private cell(emoji: string): HTMLButtonElement {
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'editor-chat-emoji-cell';
    cell.textContent = emoji;
    cell.title = emoji;
    cell.style.cssText =
      'width:30px;height:30px;padding:0;border:none;border-radius:5px;background:transparent;cursor:pointer;font-size:18px;line-height:30px';
    cell.addEventListener('mouseenter', () => (cell.style.background = 'rgba(255,255,255,0.1)'));
    cell.addEventListener('mouseleave', () => (cell.style.background = 'transparent'));
    cell.addEventListener('mousedown', (event) => event.preventDefault());
    cell.addEventListener('click', () => this.onPick(emoji));
    return cell;
  }
}
