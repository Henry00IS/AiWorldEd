import type { EditorSettingsStore } from '@/settings/store/editor_settings_store.js';
import { createSettingsCategory, createSettingsControlRow } from '@/ui/settings/settings_form_controls.js';
import { getActiveUiThemePalette } from '@/ui/theme/theme_ui_palette.js';
import { discordRichPresenceBridge } from './discord_rich_presence_protocol.js';

/**
 * Builds the Discord settings category when the desktop presence bridge is
 * present, or returns null in a browser build.
 *
 * @param store Shared editor settings store.
 * @returns Category element, or null when Discord presence is unavailable.
 */
export function discordRichPresenceSettingsCategory(store: EditorSettingsStore): HTMLElement | null {
  if (discordRichPresenceBridge() === null) return null;
  const { section, body } = createSettingsCategory('Discord');
  const discord = store.getDiscordSettings();
  body.appendChild(discordRichPresenceEnabledRow(store, discord.richPresenceEnabled));
  body.appendChild(discordRichPresenceHideNameRow(store, discord.hideProjectName, discord.richPresenceEnabled));
  return section;
}

/**
 * Creates the Discord Rich Presence enable row.
 *
 * @param store Shared editor settings store.
 * @param enabled Current presence preference.
 * @returns Control row.
 */
function discordRichPresenceEnabledRow(store: EditorSettingsStore, enabled: boolean): HTMLElement {
  const { toggle, state } = discordRichPresenceToggle(
    'discord-rich-presence',
    'Discord Rich Presence',
    enabled,
    (checked) => store.setDiscordRichPresenceEnabled(checked),
  );
  return createSettingsControlRow('Discord Rich Presence', discordRichPresenceToggleControl(toggle, state));
}

/**
 * Creates the Hide Project Name row.
 *
 * @param store Shared editor settings store.
 * @param hidden Current hide-name preference.
 * @param presenceEnabled Whether Rich Presence itself is enabled.
 * @returns Control row.
 */
function discordRichPresenceHideNameRow(
  store: EditorSettingsStore,
  hidden: boolean,
  presenceEnabled: boolean,
): HTMLElement {
  const { toggle, state } = discordRichPresenceToggle(
    'discord-hide-project-name',
    'Hide Project Name',
    hidden,
    (checked) => store.setDiscordHideProjectName(checked),
  );
  toggle.disabled = !presenceEnabled;
  return createSettingsControlRow('Hide Project Name', discordRichPresenceToggleControl(toggle, state));
}

/**
 * Creates a settings switch and its On or Off label.
 *
 * @param field Settings field dataset value.
 * @param ariaLabel Accessible name of the switch.
 * @param checked Current value.
 * @param onChange Change handler receiving the new checked state.
 * @returns Toggle input and state label.
 */
function discordRichPresenceToggle(
  field: string,
  ariaLabel: string,
  checked: boolean,
  onChange: (checked: boolean) => void,
): { toggle: HTMLInputElement; state: HTMLElement } {
  const toggle = document.createElement('input');
  toggle.type = 'checkbox';
  toggle.checked = checked;
  toggle.dataset['settingsField'] = field;
  toggle.setAttribute('role', 'switch');
  toggle.setAttribute('aria-label', ariaLabel);
  toggle.setAttribute('aria-checked', String(checked));
  const state = document.createElement('span');
  state.style.fontSize = '12px';
  state.style.color = getActiveUiThemePalette().dialogSummaryTextColor;
  state.textContent = checked ? 'On' : 'Off';
  toggle.addEventListener('change', () => onChange(toggle.checked));
  return { toggle, state };
}

/**
 * Wraps a switch and its On or Off label in a compact control cluster.
 *
 * @param toggle Switch input.
 * @param state On or Off label.
 * @returns Control element.
 */
function discordRichPresenceToggleControl(toggle: HTMLInputElement, state: HTMLElement): HTMLElement {
  const control = document.createElement('div');
  control.style.display = 'flex';
  control.style.alignItems = 'center';
  control.style.gap = '6px';
  control.appendChild(toggle);
  control.appendChild(state);
  return control;
}
