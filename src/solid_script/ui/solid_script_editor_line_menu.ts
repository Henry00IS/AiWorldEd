import type { MenuContextItem } from '@/ui/menu/menu_context.js';
import {
  solidScriptEditorClipboardHas,
  solidScriptEditorClipboardRun,
  solidScriptEditorClipboardWriteText,
} from './solid_script_editor_clipboard.js';
import type { SolidScriptEditorShownCopy } from './solid_script_editor_copy.js';
import type { SolidScriptEditorLineKeys } from './solid_script_editor_line_keys.js';

/** What the line menu works on. */
export interface SolidScriptEditorLineMenuHost {
  /** True when lines can be turned off and get breakpoints. */
  switches: boolean;
  /** Tells whether a line is turned off. */
  off: (line: number) => boolean;
  /** Opens the configurator of a line. */
  configure: (line: number) => void;
  /** Sets or clears the breakpoint of a line. */
  breakpoint: (line: number) => void;
  /** Shows a short message. */
  notice: (text: string) => void;
  /** Keys and clipboard actions of the lines. */
  keys: SolidScriptEditorLineKeys;
  /** The selected lines as the code view shows them. */
  shown: () => SolidScriptEditorShownCopy;
}

/** Line between groups of the menu. */
const SOLID_SCRIPT_EDITOR_LINE_MENU_SEPARATOR: MenuContextItem = { kind: 'separator' };

/**
 * Lists the clipboard actions of the line menu, as Ctrl+X, Ctrl+C and Ctrl+V do
 * them; Paste waits for copied lines.
 *
 * @param host Lines.
 * @returns Menu items.
 */
function solidScriptEditorLineMenuClipboard(host: SolidScriptEditorLineMenuHost): MenuContextItem[] {
  return [
    { label: 'Cut', shortcut: 'Ctrl+X', callback: () => solidScriptEditorClipboardRun((e) => host.keys.copy(e, true)) },
    {
      label: 'Copy',
      shortcut: 'Ctrl+C',
      callback: () => solidScriptEditorClipboardRun((e) => host.keys.copy(e, false)),
    },
    {
      label: 'Paste',
      shortcut: 'Ctrl+V',
      disabled: !solidScriptEditorClipboardHas(),
      callback: () => host.keys.paste(new Event('paste')),
    },
  ];
}

/**
 * Copies the selected lines as they show, as plain text or coloured, and says
 * so.
 *
 * @param host Lines.
 * @param markup True adds the colours as HTML.
 */
function solidScriptEditorLineMenuCopyShown(host: SolidScriptEditorLineMenuHost, markup: boolean): void {
  const shown = host.shown();
  solidScriptEditorClipboardWriteText(shown.text, markup ? shown.html : '');
  const count = shown.text.split('\n').length;
  host.notice(`Copied ${count} ${count === 1 ? 'line' : 'lines'} ${markup ? 'with markup' : 'as plain text'}.`);
}

/**
 * Lists what the line menu offers, in groups: the clipboard, copying as shown,
 * then changing lines, with turning on and off and breakpoints only where lines
 * can be switched.
 *
 * @param host Lines.
 * @param line Line the menu opened on.
 * @returns Menu items.
 */
export function solidScriptEditorLineMenuItems(host: SolidScriptEditorLineMenuHost, line: number): MenuContextItem[] {
  const off = host.off(line);
  const breakpoint = { label: 'Toggle Breakpoint', callback: () => host.breakpoint(line) };
  return [
    ...solidScriptEditorLineMenuClipboard(host),
    SOLID_SCRIPT_EDITOR_LINE_MENU_SEPARATOR,
    { label: 'Copy as Plain Text', callback: () => solidScriptEditorLineMenuCopyShown(host, false) },
    { label: 'Copy with Markup', callback: () => solidScriptEditorLineMenuCopyShown(host, true) },
    SOLID_SCRIPT_EDITOR_LINE_MENU_SEPARATOR,
    { label: 'Change…', callback: () => host.configure(line) },
    ...(host.switches ? [{ label: off ? 'Turn On' : 'Turn Off', callback: () => host.keys.toggle(line) }] : []),
    { label: 'Duplicate', callback: () => host.keys.duplicate(line) },
    { label: 'Delete', callback: () => host.keys.remove(line) },
    ...(host.switches ? [SOLID_SCRIPT_EDITOR_LINE_MENU_SEPARATOR, breakpoint] : []),
  ];
}
