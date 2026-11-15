/** Settings storage surface of the MCP dialog. */
export type McpSettingsStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** Inline style of the MCP dialog menus. */
export const MCP_SETTINGS_SELECT_STYLE =
  'width:100%;box-sizing:border-box;padding:8px 10px;border-radius:6px;border:1px solid rgba(var(--aiworlded-ink-rgb, 255, 255, 255), 0.12);background:var(--aiworlded-gray-1b1b1b, #1b1b1b);color:var(--aiworlded-gray-e8e8e8, #e8e8e8);font-size:12px';

/**
 * Returns the browser storage when available.
 *
 * @returns Local storage, or null.
 */
export function mcpSettingsStorage(): McpSettingsStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
