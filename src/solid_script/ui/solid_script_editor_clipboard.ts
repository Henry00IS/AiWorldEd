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
  const lines = blocks.map(({ command, values, off }) => ({ command, values: { ...values }, ...(off ? { off } : {}) }));
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
    const line = entry as { command?: unknown; values?: unknown; off?: unknown } | null;
    if (typeof line?.command !== 'string') return null;
    const values: Record<string, string> = {};
    if (line.values && typeof line.values === 'object')
      for (const [key, value] of Object.entries(line.values as Record<string, unknown>))
        if (typeof value === 'string') values[key] = value;
    lines.push({ command: line.command, values, ...(line.off === true ? { off: true } : {}) });
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
  return solidScriptEditorClipboardHeld?.map((line) => ({ ...line, values: { ...line.values } })) ?? null;
}

/**
 * Tells whether there are lines to paste in this editor session.
 *
 * @returns True after lines were copied.
 */
export function solidScriptEditorClipboardHas(): boolean {
  return solidScriptEditorClipboardHeld !== null;
}

/**
 * Runs a copy from a menu as if Ctrl+C was pressed: through a copy event, so it
 * reaches the system clipboard, or with a plain event where the browser fires
 * none.
 *
 * @param run Writes the clipboard of the event.
 */
export function solidScriptEditorClipboardRun(run: (event: Event) => void): void {
  let ran = false;
  const copy = (event: Event): void => {
    event.stopImmediatePropagation();
    ran = true;
    run(event);
  };
  document.addEventListener('copy', copy, { capture: true });
  try {
    document.execCommand('copy');
  } catch {
    ran = false;
  }
  document.removeEventListener('copy', copy, { capture: true });
  if (!ran) run(new Event('copy'));
}

/**
 * Copies text as plain text, and as HTML too when given, to the clipboard of a
 * copy event, or to the system clipboard where the browser allows it.
 *
 * @param text Plain text.
 * @param html HTML, or empty for plain text only.
 */
export function solidScriptEditorClipboardWriteText(text: string, html = ''): void {
  solidScriptEditorClipboardRun((event) => {
    const data = (event as ClipboardEvent).clipboardData ?? null;
    event.preventDefault();
    if (!data) return solidScriptEditorClipboardSystem(text, html);
    data.setData('text/plain', text);
    if (html) data.setData('text/html', html);
  });
}

/**
 * Writes text, and HTML when given and the browser takes it, to the system
 * clipboard.
 *
 * @param text Plain text.
 * @param html HTML, or empty.
 */
function solidScriptEditorClipboardSystem(text: string, html: string): void {
  const clipboard = globalThis.navigator?.clipboard;
  const Item = globalThis.ClipboardItem;
  if (html && Item && clipboard?.write) {
    const blob = (body: string, type: string) => new Blob([body], { type });
    const item = new Item({ 'text/plain': blob(text, 'text/plain'), 'text/html': blob(html, 'text/html') });
    void clipboard.write([item]).catch(() => undefined);
  } else void clipboard?.writeText?.(text).catch(() => undefined);
}
