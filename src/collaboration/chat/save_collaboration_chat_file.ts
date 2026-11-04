import { projectDesktopBridge } from '@/project/desktop/project_desktop_protocol.js';

/** Native "Save as" picker of the File System Access API. */
export type SaveCollaborationChatFilePicker = (options: { suggestedName: string }) => Promise<{
  createWritable(): Promise<WritableStream<Uint8Array>>;
}>;

/**
 * Returns the native "Save as" picker in the desktop app. The browser keeps its
 * own download handling, so it gets null, as does a webview without a picker.
 *
 * @returns Picker, or null.
 */
export function saveCollaborationChatFilePicker(): SaveCollaborationChatFilePicker | null {
  if (projectDesktopBridge() === null) return null;
  const picker = (window as unknown as { showSaveFilePicker?: SaveCollaborationChatFilePicker }).showSaveFilePicker;
  return typeof picker === 'function' ? picker.bind(window) : null;
}

/**
 * Asks where to save a file and streams the download there.
 *
 * @param picker Save picker.
 * @param url Download URL.
 * @param name Suggested file name.
 * @param fetcher Fetch function.
 * @returns HTTP status of a failed download (0 for network errors), or null
 *   when saved or cancelled.
 */
export async function saveCollaborationChatFileAs(
  picker: SaveCollaborationChatFilePicker,
  url: string,
  name: string,
  fetcher: (url: string, init: RequestInit) => Promise<Response> = fetch,
): Promise<number | null> {
  const handle = await picker({ suggestedName: name }).catch(() => null);
  if (handle === null) return null;
  try {
    const response = await fetcher(`${url}?download`, {});
    if (!response.ok || response.body === null) return response.status;
    await response.body.pipeTo(await handle.createWritable());
    return null;
  } catch {
    return 0;
  }
}
