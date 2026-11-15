/**
 * Formats a script error for people, starting with a capital letter and ending
 * with a full stop, such as "Line 2: unexpected ...".
 *
 * @param error Thrown value.
 * @returns Message.
 */
export function solidScriptErrorText(error: unknown): string {
  const message = (error instanceof Error ? error.message : String(error)).trim();
  const ending = /[.!?]$/.test(message) ? '' : '.';
  return `${message.charAt(0).toUpperCase()}${message.slice(1)}${ending}`;
}

/**
 * Reads the line number an error message starts with.
 *
 * @param message Error message.
 * @returns 1-based line, or null when the message names no line.
 */
export function solidScriptErrorLine(message: string): number | null {
  const match = /^line (\d+)\b/i.exec(message);
  return match ? Number(match[1]) : null;
}
