/**
 * Copies text with the async clipboard API, falling back to a hidden text area.
 *
 * @param text Text to copy.
 * @returns True when the text was copied.
 */
export async function clipboardTextCopy(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard === undefined) return clipboardTextCopyFallback(text);
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return clipboardTextCopyFallback(text);
  }
}

/**
 * Copies text through a temporary selected text area and execCommand.
 *
 * @param text Text to copy.
 * @returns True when the browser reported success.
 */
function clipboardTextCopyFallback(text: string): boolean {
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
