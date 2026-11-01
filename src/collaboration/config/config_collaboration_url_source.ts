/**
 * Link query parameter that points the editor at another relay for this page
 * load.
 */
export const CONFIG_COLLABORATION_URL_LINK_PARAMETER = 'relay';

/**
 * Returns whether a value is a usable WebSocket URL.
 *
 * @param value Candidate URL.
 * @returns True for ws:// or wss:// URLs.
 */
export function configCollaborationUrlValid(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'ws:' || url.protocol === 'wss:';
  } catch {
    return false;
  }
}

/**
 * Returns the relay URL given by a `?relay=` link parameter, so a link such as
 * `https://editor.example/?relay=wss://relay.example:8443` opens the editor
 * against a self-hosted relay without changing any saved setting.
 *
 * @param search Query string of the page; defaults to the running page.
 * @returns Valid ws:// or wss:// URL, or null when absent or invalid.
 */
export function configCollaborationUrlFromLink(search: string = configCollaborationPageSearch()): string | null {
  const linkedUrl = new URLSearchParams(search).get(CONFIG_COLLABORATION_URL_LINK_PARAMETER)?.trim() ?? '';
  return configCollaborationUrlValid(linkedUrl) ? linkedUrl : null;
}

/**
 * Returns the relay URL baked in at build time through the
 * `VITE_COLLABORATION_SERVER_URL` environment variable.
 *
 * @param buildValue Raw build value; defaults to the value of this build.
 * @returns Valid ws:// or wss:// URL, or null when unset or invalid.
 */
export function configCollaborationUrlFromBuild(buildValue: string = configCollaborationBuildValue()): string | null {
  const builtUrl = buildValue.trim();
  return configCollaborationUrlValid(builtUrl) ? builtUrl : null;
}

/**
 * Reads the query string of the running page.
 *
 * @returns Query string, or an empty string outside a browser.
 */
function configCollaborationPageSearch(): string {
  return typeof location === 'undefined' ? '' : location.search;
}

/**
 * Reads the build-time relay URL; bundlers without `import.meta.env` yield an
 * empty value.
 *
 * @returns Raw build value, or an empty string.
 */
function configCollaborationBuildValue(): string {
  try {
    return import.meta.env?.VITE_COLLABORATION_SERVER_URL ?? '';
  } catch {
    return '';
  }
}
