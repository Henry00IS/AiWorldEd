/** Format tag every editor clipboard payload carries. */
export const CLIPBOARD_PAYLOAD_FORMAT = 'aiworlded-clipboard';

/** Version of the clipboard payload layout. */
export const CLIPBOARD_PAYLOAD_VERSION = 1;

/** What a clipboard payload holds. */
export type ClipboardPayloadType = 'scene-objects' | 'modifiers' | 'generator-settings';

/** Versioned, typed JSON the editor puts on the clipboard. */
export interface ClipboardPayload<T> {
  /** Always CLIPBOARD_PAYLOAD_FORMAT. */
  format: typeof CLIPBOARD_PAYLOAD_FORMAT;
  /** Payload layout version. */
  version: typeof CLIPBOARD_PAYLOAD_VERSION;
  /** Content type. */
  type: ClipboardPayloadType;
  /** Content. */
  data: T;
}

/**
 * Writes clipboard content as tagged JSON text.
 *
 * @param type Content type.
 * @param data Content.
 * @returns JSON text.
 */
export function clipboardPayloadText<T>(type: ClipboardPayloadType, data: T): string {
  const payload: ClipboardPayload<T> = {
    format: CLIPBOARD_PAYLOAD_FORMAT,
    version: CLIPBOARD_PAYLOAD_VERSION,
    type,
    data,
  };
  return JSON.stringify(payload);
}

/**
 * Reads clipboard text when it is an editor payload of the wanted type.
 *
 * @param text Clipboard text, if any.
 * @param type Wanted content type.
 * @returns Content, or null for other text, versions or types.
 */
export function clipboardPayloadParse<T>(text: string | null | undefined, type: ClipboardPayloadType): T | null {
  if (!text) return null;
  try {
    const value = JSON.parse(text) as Partial<ClipboardPayload<T>> | null;
    const valid =
      value?.format === CLIPBOARD_PAYLOAD_FORMAT && value.version === CLIPBOARD_PAYLOAD_VERSION && value.type === type;
    return valid && value.data !== undefined ? value.data : null;
  } catch {
    return null;
  }
}
