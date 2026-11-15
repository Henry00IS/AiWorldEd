import type { SolidScriptBlock, SolidScriptLine } from '@/solid_script/document/solid_script_document.js';

/** Marker of copied script lines in clipboard text. */
export const SOLID_SCRIPT_EDITOR_CLIPBOARD_FORMAT = 'aiworlded-solidscript-lines';

/** Lines copied last in this editor session, or null before the first copy. */
let solidScriptEditorClipboardHeld: SolidScriptLine[] | null = null;

/**
 * Copies script lines: kept for pasting into any script editor of this window,
 * and written to the system clipboard as JSON text where the browser allows
 * it.
 *
 * @param blocks Lines to copy.
 */
export function solidScriptEditorClipboardWrite(blocks: readonly SolidScriptBlock[]): void {
  const lines = blocks.map(({ command, values }) => ({ command, values: { ...values } }));
  solidScriptEditorClipboardHeld = lines;
  const text = JSON.stringify({ format: SOLID_SCRIPT_EDITOR_CLIPBOARD_FORMAT, lines }, null, 2);
  void globalThis.navigator?.clipboard?.writeText?.(text).catch(() => undefined);
}

/**
 * Returns copies of the lines copied last.
 *
 * @returns Lines, or null when nothing was copied.
 */
export function solidScriptEditorClipboardRead(): SolidScriptLine[] | null {
  return solidScriptEditorClipboardHeld?.map((line) => ({ command: line.command, values: { ...line.values } })) ?? null;
}
