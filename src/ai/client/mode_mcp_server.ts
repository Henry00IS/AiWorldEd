import { MCP_SETTINGS_SELECT_STYLE, mcpSettingsStorage } from './settings_mcp.js';

/** Where the desktop app hosts MCP: its local server or the online relay. */
export type McpServerMode = 'local' | 'online';

/** Settings key of the desktop MCP server mode. */
export const MCP_SERVER_MODE_KEY = 'aiworlded.mcp.serverMode';

/** Server modes with their labels, in menu order. */
export const MCP_SERVER_MODE_CHOICES: readonly { value: McpServerMode; label: string }[] = [
  { value: 'local', label: 'Local Server (This Computer)' },
  { value: 'online', label: 'Online Server (Relay)' },
];

/**
 * Returns the stored server mode; the local server when unset or unknown.
 *
 * @param storage Settings storage.
 * @returns Server mode.
 */
export function mcpServerModeGet(storage = mcpSettingsStorage()): McpServerMode {
  return storage?.getItem(MCP_SERVER_MODE_KEY) === 'online' ? 'online' : 'local';
}

/**
 * Stores the server mode.
 *
 * @param value Server mode.
 * @param storage Settings storage.
 */
export function mcpServerModeSet(value: McpServerMode, storage = mcpSettingsStorage()): void {
  storage?.setItem(MCP_SERVER_MODE_KEY, value);
}

/**
 * Creates the server mode menu; changes are stored and reported right away.
 *
 * @param onChange Receives the chosen mode.
 * @returns Select element.
 */
export function mcpServerModeSelect(onChange: (value: McpServerMode) => void): HTMLSelectElement {
  const select = document.createElement('select');
  select.dataset['mcpField'] = 'server-mode';
  for (const choice of MCP_SERVER_MODE_CHOICES) select.add(new Option(choice.label, choice.value));
  select.value = mcpServerModeGet();
  select.addEventListener('change', () => {
    const value: McpServerMode = select.value === 'online' ? 'online' : 'local';
    mcpServerModeSet(value);
    onChange(value);
  });
  select.style.cssText = MCP_SETTINGS_SELECT_STYLE;
  return select;
}
