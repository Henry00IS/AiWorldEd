import type { SolidScriptBlock, SolidScriptLine } from '@/solid_script/document/solid_script_document.js';

/** Marker of copied script lines in clipboard text. */
export const SOLID_SCRIPT_EDITOR_CLIPBOARD_FORMAT = 'aiworlded-solidscript-lines';

/** Lines copied last in this editor session, or null before the first copy. */
let solidScriptEditorClipboardHeld: SolidScriptLine[] | null = null;

/**
 * Returns the clipboard text of script lines: JSON with a format marker, so
 * pasting works between editor windows, browser tabs and text files.
 *
 * @param lines Lines.
 * @returns Text.
 */
export function solidScriptEditorClipboardText(lines: readonly SolidScriptLine[]): string {
  return JSON.stringify({ format: SOLID_SCRIPT_EDITOR_CLIPBOARD_FORMAT, lines }, null, 2);
}

/**
 * Copies script lines: kept for pasting into any script editor of this window,
 * and written to the clipboard of a copy event, or to the system clipboard as
 * text where the browser allows it.
 *
 * @param blocks Lines to copy.
 * @param data Clipboard of a copy or cut event, when there is one.
 */
export function solidScriptEditorClipboardWrite(
  blocks: readonly SolidScriptBlock[],
  data: DataTransfer | null = null,
): void {
  const lines = blocks.map(({ command, values }) => ({ command, values: { ...values } }));
  solidScriptEditorClipboardHeld = lines;
  const text = solidScriptEditorClipboardText(lines);
  if (data) data.setData('text/plain', text);
  else void globalThis.navigator?.clipboard?.writeText?.(text).catch(() => undefined);
}

/**
 * Reads script lines from clipboard text: the editor's own format, or a plain
 * list of lines as the assistant tools write them.
 *
 * @param text Clipboard text.
 * @returns Lines, or null when the text holds none.
 */
export function solidScriptEditorClipboardParse(text: string): SolidScriptLine[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  const record = parsed as { format?: unknown; lines?: unknown } | null;
  const list = Array.isArray(parsed)
    ? parsed
    : record?.format === SOLID_SCRIPT_EDITOR_CLIPBOARD_FORMAT
      ? record.lines
      : null;
  if (!Array.isArray(list) || list.length === 0) return null;
  const lines: SolidScriptLine[] = [];
  for (const entry of list as unknown[]) {
    const line = entry as { command?: unknown; values?: unknown } | null;
    if (typeof line?.command !== 'string') return null;
    const values: Record<string, string> = {};
    if (line.values && typeof line.values === 'object')
      for (const [key, value] of Object.entries(line.values as Record<string, unknown>))
        if (typeof value === 'string') values[key] = value;
    lines.push({ command: line.command, values });
  }
  return lines;
}

/**
 * Returns copies of the lines to paste: the ones on the clipboard of a paste
 * event, or else the lines copied last in this window.
 *
 * @param data Clipboard of a paste event, when there is one.
 * @returns Lines, or null when nothing was copied.
 */
export function solidScriptEditorClipboardRead(data: DataTransfer | null = null): SolidScriptLine[] | null {
  const pasted = data ? solidScriptEditorClipboardParse(data.getData('text/plain')) : null;
  if (pasted) return pasted;
  return solidScriptEditorClipboardHeld?.map((line) => ({ command: line.command, values: { ...line.values } })) ?? null;
}
