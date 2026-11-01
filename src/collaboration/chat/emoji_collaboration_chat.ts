import { Theme } from '@/theme.js';

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
  '\u{2705}',
  '\u{274C}',
  '\u{26A0}\u{FE0F}',
  '\u{2753}',
  '\u{1F3AE}',
  '\u{1F3D7}\u{FE0F}',
  '\u{1F9F1}',
  '\u{1F528}',
  '\u{1F527}',
  '\u{1F4D0}',
  '\u{1F3A8}',
  '\u{1F5FA}\u{FE0F}',
  '\u{1F3E0}',
  '\u{1F332}',
  '\u{26F0}\u{FE0F}',
  '\u{1F30A}',
  '\u{2600}\u{FE0F}',
  '\u{1F319}',
  '\u{2615}',
  '\u{1F355}',
];

/**
 * Inserts text at the caret of a text area, replacing the selection, and leaves
 * the caret after it.
 *
 * @param field Text area.
 * @param text Text to insert.
 */
export function emojiCollaborationChatInsert(field: HTMLTextAreaElement, text: string): void {
  const start = field.selectionStart ?? field.value.length;
  const end = field.selectionEnd ?? start;
  field.setRangeText(text, start, end, 'end');
  field.dispatchEvent(new Event('input', { bubbles: true }));
  field.focus();
}

/** Static emoji grid that pops up above the message field. */
export class EmojiCollaborationChatPicker {
  readonly element: HTMLElement;
  private readonly onPick: (emoji: string) => void;

  /**
   * Creates the hidden grid.
   *
   * @param onPick Receives the chosen emoji.
   */
  constructor(onPick: (emoji: string) => void) {
    this.onPick = onPick;
    this.element = document.createElement('div');
    this.element.className = 'editor-chat-emoji';
    this.element.setAttribute('role', 'grid');
    this.element.style.cssText = `position:absolute;right:10px;bottom:100%;margin-bottom:6px;display:none;grid-template-columns:repeat(8,30px);gap:2px;padding:6px;border-radius:8px;border:1px solid rgba(255,255,255,0.12);background:rgba(28,28,28,0.98);box-shadow:0 10px 30px rgba(0,0,0,0.6);z-index:2;font-family:${Theme.uiFontFamily}`;
    this.element.append(...EMOJI_COLLABORATION_CHAT_SET.map((emoji) => this.cell(emoji)));
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
    this.element.style.display = open ? 'grid' : 'none';
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
