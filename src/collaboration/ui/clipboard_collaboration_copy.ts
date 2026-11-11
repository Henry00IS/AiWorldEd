import { uiCollaborationButton } from '@/collaboration/ui/ui_collaboration_elements.js';
import { clipboardTextCopy } from '@/clipboard/clipboard_text_copy.js';

/** How long a copy button shows its result before reverting, in milliseconds. */
export const CLIPBOARD_COLLABORATION_FEEDBACK_MS = 1500;

/**
 * Creates a compact button that copies text and briefly shows the outcome.
 *
 * @param text Returns the text to copy at click time.
 * @param title Tooltip.
 * @returns Button element.
 */
export function clipboardCollaborationButton(text: () => string, title: string): HTMLButtonElement {
  const button = uiCollaborationButton('Copy', false, () => {
    void clipboardTextCopy(text()).then((ok) => {
      button.textContent = ok ? 'Copied' : 'Copy failed';
      setTimeout(() => (button.textContent = 'Copy'), CLIPBOARD_COLLABORATION_FEEDBACK_MS);
    });
  });
  button.title = title;
  button.style.minWidth = '0';
  return button;
}
