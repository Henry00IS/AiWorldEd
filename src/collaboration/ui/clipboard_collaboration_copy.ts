import { uiCollaborationButton } from '@/collaboration/ui/ui_collaboration_elements.js';

/** How long a copy button shows its result before reverting, in milliseconds. */
export const CLIPBOARD_COLLABORATION_FEEDBACK_MS = 1500;

/**
 * Copies text with the async clipboard API, falling back to a hidden text area.
 *
 * @param text Text to copy.
 * @returns True when the text was copied.
 */
export async function clipboardCollaborationCopy(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard === undefined) return clipboardCollaborationFallback(text);
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return clipboardCollaborationFallback(text);
  }
}

/**
 * Copies text through a temporary selected text area and execCommand.
 *
 * @param text Text to copy.
 * @returns True when the browser reported success.
 */
function clipboardCollaborationFallback(text: string): boolean {
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  try {
    return typeof document.execCommand === 'function' && document.execCommand('copy');
  } catch {
    return false;
  } finally {
    area.remove();
  }
}

/**
 * Creates a compact button that copies text and briefly shows the outcome.
 *
 * @param text Returns the text to copy at click time.
 * @param title Tooltip.
 * @returns Button element.
 */
export function clipboardCollaborationButton(text: () => string, title: string): HTMLButtonElement {
  const button = uiCollaborationButton('Copy', false, () => {
    void clipboardCollaborationCopy(text()).then((ok) => {
      button.textContent = ok ? 'Copied' : 'Copy failed';
      setTimeout(() => (button.textContent = 'Copy'), CLIPBOARD_COLLABORATION_FEEDBACK_MS);
    });
  });
  button.title = title;
  button.style.minWidth = '0';
  return button;
}
