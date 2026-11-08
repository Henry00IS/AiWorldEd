import { clipboardStore } from '@/clipboard/clipboard_store.js';
import type { ClipboardPayloadType } from '@/clipboard/clipboard_payload.js';
import type { MenuContextItem } from '@/ui/menu/menu_context.js';
import { modifierStackKindFind } from '@/modifier/stack/modifier_stack_catalog.js';
import type { ModifierStackEntry, ModifierStackSettings } from '@/modifier/stack/modifier_stack_types.js';
import {
  modifierStackClipboardCopy,
  modifierStackClipboardPaste,
  modifierStackClipboardSettingsCopy,
  modifierStackClipboardSettingsPaste,
  type ModifierStackClipboardModifiers,
  type ModifierStackClipboardSettings,
} from '@/modifier/stack/clipboard/modifier_stack_clipboard.js';

/** What the clipboard menu entries need from the modifier panel. */
export interface ModifierStackClipboardMenuHost {
  /** Returns the bound volume's stack, or null. */
  read: () => ModifierStackSettings | null;
  /** Pushes one undoable stack edit. */
  edit: (change: (stack: ModifierStackSettings) => ModifierStackSettings) => void;
  /** Shows a short note in the panel status. */
  notice: (text: string) => void;
}

/**
 * Builds the volume menu's Copy all modifiers and Paste modifiers entries.
 *
 * @param host Modifier panel.
 * @returns Menu items.
 */
export function modifierStackClipboardVolumeItems(host: ModifierStackClipboardMenuHost): MenuContextItem[] {
  const stack = host.read();
  const copied = stack ? modifierStackClipboardCopy(stack) : { modifiers: [] };
  const count = copied.modifiers.length;
  return [
    {
      label: 'Copy all modifiers',
      disabled: count === 0,
      callback: () => modifierStackClipboardWrite(host, 'modifiers', copied, `Copied ${count} modifier(s)`),
    },
    { label: 'Paste modifiers', disabled: !stack, callback: () => void modifierStackClipboardPasteModifiers(host) },
  ];
}

/**
 * Builds a card menu's clipboard entries: Copy for a modifier, Copy settings
 * and Paste settings for a generator.
 *
 * @param host Modifier panel.
 * @param entry Card's entry.
 * @returns Menu items.
 */
export function modifierStackClipboardCardItems(
  host: ModifierStackClipboardMenuHost,
  entry: ModifierStackEntry,
): MenuContextItem[] {
  if (modifierStackKindFind(entry.kind)?.category !== 'generate') {
    const copied = { modifiers: [structuredClone(entry)] };
    return [
      { label: 'Copy', callback: () => modifierStackClipboardWrite(host, 'modifiers', copied, `Copied ${entry.name}`) },
    ];
  }
  const settings = modifierStackClipboardSettingsCopy(entry);
  return [
    {
      label: 'Copy settings',
      callback: () =>
        modifierStackClipboardWrite(host, 'generator-settings', settings, `Copied ${entry.name} settings`),
    },
    { label: 'Paste settings', callback: () => void modifierStackClipboardPasteSettings(host, entry) },
  ];
}

/**
 * Writes clipboard data and confirms it.
 *
 * @param host Modifier panel.
 * @param type Payload type.
 * @param data Payload data.
 * @param text Confirmation note.
 */
function modifierStackClipboardWrite(
  host: ModifierStackClipboardMenuHost,
  type: ClipboardPayloadType,
  data: unknown,
  text: string,
): void {
  void clipboardStore.write(type, data);
  host.notice(text);
}

/**
 * Appends copied modifiers to the bound stack as one undo step.
 *
 * @param host Modifier panel.
 * @returns Resolves once pasted.
 */
async function modifierStackClipboardPasteModifiers(host: ModifierStackClipboardMenuHost): Promise<void> {
  const data = await clipboardStore.read<ModifierStackClipboardModifiers>('modifiers');
  const stack = host.read();
  if (!data || !stack) return host.notice('Nothing to paste: copy a modifier first');
  const { stack: next, skipped } = modifierStackClipboardPaste(stack, data);
  const added = next.modifiers.length - stack.modifiers.length;
  host.edit(() => next);
  const left = skipped > 0 ? `, left out ${skipped} (generators, unknown kinds or a full stack)` : '';
  host.notice(`Pasted ${added} modifier(s)${left}`);
}

/**
 * Overrides a generator's fields with copied settings as one undo step.
 *
 * @param host Modifier panel.
 * @param entry Generator entry.
 * @returns Resolves once pasted.
 */
async function modifierStackClipboardPasteSettings(
  host: ModifierStackClipboardMenuHost,
  entry: ModifierStackEntry,
): Promise<void> {
  const data = await clipboardStore.read<ModifierStackClipboardSettings>('generator-settings');
  const stack = host.read();
  const next = data && stack ? modifierStackClipboardSettingsPaste(stack, entry.id, data) : null;
  if (!data) return host.notice('Nothing to paste: copy generator settings first');
  if (!next) return host.notice(`Copied settings are for ${modifierStackKindFind(data.kind)?.label ?? data.kind}`);
  host.edit(() => next);
  host.notice(`Pasted settings into ${entry.name}`);
}
