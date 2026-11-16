import { LocalSettingsStorage, type SettingsStorage } from '@/settings/storage/settings_storage.js';

/**
 * How the script editor and the configurator fields show code, kept between
 * sessions.
 */
export interface SolidScriptEditorView {
  /** Colours functions, names, numbers, texts and operators. */
  highlight: boolean;
  /** Thin lines down each block level. */
  guides: boolean;
  /** Bold brackets around the caret. */
  brackets: boolean;
  /** The category icon in front of each command. */
  icons: boolean;
  /** Wavy lines under names and calls nothing defines, and under the error. */
  squiggles: boolean;
}

/** Storage key of the view switches. */
export const SOLID_SCRIPT_EDITOR_VIEW_KEY = 'aiworlded.solidScriptEditor.view';

/** Switches before the user changes them. */
export const SOLID_SCRIPT_EDITOR_VIEW_DEFAULT: Readonly<SolidScriptEditorView> = {
  highlight: true,
  guides: true,
  brackets: true,
  icons: false,
  squiggles: true,
};

/**
 * Caption and hover text of each switch, in the order the Settings tab lists
 * them.
 */
export const SOLID_SCRIPT_EDITOR_VIEW_LABELS: readonly (readonly [keyof SolidScriptEditorView, string, string])[] = [
  ['highlight', 'Syntax Highlighting', 'Colours functions, names, numbers, texts and operators'],
  ['guides', 'Indent Guides', 'Thin lines down each block level'],
  ['brackets', 'Bracket Highlighting', 'Bold brackets around the caret while typing a formula'],
  ['icons', 'Command Icons', 'Shows the category icon in front of each command'],
  ['squiggles', 'Error Squiggles', 'Wavy lines under names and functions nothing defines, and under the error'],
];

/**
 * Reads the stored switches; missing or broken values fall back to the
 * defaults.
 *
 * @param storage Storage.
 * @returns Switches.
 */
export function solidScriptEditorViewRead(
  storage: SettingsStorage = new LocalSettingsStorage(),
): SolidScriptEditorView {
  let stored: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(storage.getItem(SOLID_SCRIPT_EDITOR_VIEW_KEY) ?? '{}');
    if (typeof parsed === 'object' && parsed !== null) stored = parsed as Record<string, unknown>;
  } catch {
    stored = {};
  }
  const view = { ...SOLID_SCRIPT_EDITOR_VIEW_DEFAULT };
  for (const key of Object.keys(view) as (keyof SolidScriptEditorView)[]) {
    const value = stored[key];
    if (typeof value === 'boolean') view[key] = value;
  }
  return view;
}

/**
 * Stores the switches.
 *
 * @param view Switches.
 * @param storage Storage.
 */
export function solidScriptEditorViewWrite(
  view: SolidScriptEditorView,
  storage: SettingsStorage = new LocalSettingsStorage(),
): void {
  storage.setItem(SOLID_SCRIPT_EDITOR_VIEW_KEY, JSON.stringify(view));
}
