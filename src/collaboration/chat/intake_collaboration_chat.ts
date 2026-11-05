/**
 * Extracts files from drag/drop and clipboard paste for chat sharing.
 * Files stay as client File/Blob objects (same path as the paperclip picker);
 * nothing is base64-encoded into chat history or uploaded to external hosts.
 */

/** Fallback stem for screenshot / unnamed image clipboard blobs. */
const INTAKE_COLLABORATION_CHAT_SCREENSHOT_NAME = 'screenshot.png';

/**
 * Returns whether the composer may accept a dropped/pasted file right now.
 *
 * @param enabled Chat enabled in a room.
 * @param sending True while a send awaits the relay.
 * @param remainingMs Cooldown remaining.
 * @returns True when a file can be shared.
 */
export function intakeCollaborationChatCanShare(
  enabled: boolean,
  sending: boolean,
  remainingMs: number,
): boolean {
  return enabled && !sending && remainingMs <= 0;
}

/**
 * Picks the first usable file from a DataTransfer (drop or paste).
 * Prefer `files`; fall back to `items` of kind `file`. Deduplicates overlapping
 * file/item arrays so one paste cannot enqueue the same blob twice. Multi-file
 * transfers yield only the first file (same as the single-file paperclip picker);
 * further files need another drop/paste after the send cooldown.
 *
 * @param data Transfer from a ClipboardEvent or DragEvent.
 * @returns First file, or null.
 */
export function intakeCollaborationChatFile(data: DataTransfer | null): File | null {
  if (data === null) return null;
  const seen = new Set<string>();
  const fromFiles = intakeCollaborationChatFromFileList(data.files, seen);
  if (fromFiles !== null) return fromFiles;
  if (data.items === undefined) return null;
  for (let index = 0; index < data.items.length; index += 1) {
    const item = data.items[index];
    if (item === undefined || item.kind !== 'file') continue;
    const file = item.getAsFile();
    if (file === null) continue;
    const named = intakeCollaborationChatNamed(file);
    const key = intakeCollaborationChatKey(named);
    if (seen.has(key)) continue;
    return named;
  }
  return null;
}

/**
 * True when the transfer carries at least one file (so text paste should not
 * also run for a screenshot paste that includes a spurious empty text item).
 *
 * @param data Transfer.
 * @returns True when a file is present.
 */
export function intakeCollaborationChatHasFile(data: DataTransfer | null): boolean {
  return intakeCollaborationChatFile(data) !== null;
}

/**
 * Reads the first file from a FileList, applying screenshot naming.
 *
 * @param files FileList or null.
 * @param seen Keys already taken.
 * @returns File or null.
 */
function intakeCollaborationChatFromFileList(files: FileList | null, seen: Set<string>): File | null {
  if (files === null || files.length === 0) return null;
  const file = files.item(0);
  if (file === null) return null;
  const named = intakeCollaborationChatNamed(file);
  seen.add(intakeCollaborationChatKey(named));
  return named;
}

/**
 * Ensures clipboard image blobs without a usable name get a safe fallback.
 *
 * @param file Raw file.
 * @returns File with a sensible name.
 */
export function intakeCollaborationChatNamed(file: File): File {
  const name = file.name.trim();
  if (name !== '' && name !== 'image.png' && name !== 'image.jpg' && name !== 'blob') return file;
  if (!file.type.startsWith('image/')) return file;
  const ext =
    file.type === 'image/jpeg'
      ? 'jpg'
      : file.type === 'image/webp'
        ? 'webp'
        : file.type === 'image/gif'
          ? 'gif'
          : 'png';
  const fallback = name === 'image.png' || name === 'image.jpg' ? `screenshot.${ext}` : INTAKE_COLLABORATION_CHAT_SCREENSHOT_NAME.replace(/\.png$/u, `.${ext}`);
  return new File([file], fallback, { type: file.type, lastModified: file.lastModified });
}

/**
 * Stable key for deduplicating overlapping files/items arrays.
 *
 * @param file File.
 * @returns Key.
 */
function intakeCollaborationChatKey(file: File): string {
  return `${file.name}\0${file.size}\0${file.type}\0${file.lastModified}`;
}
