import type { EntryCollaborationChatFile } from '@/collaboration/chat/entry_collaboration_chat.js';
import { TRANSFER_SIZE_MAXIMUM } from '@/collaboration/shared/protocol_definitions.js';
import { Theme } from '@/theme.js';
import { LightboxImage } from '@/ui/lightbox/lightbox_image.js';
import {
  saveCollaborationChatFileAs,
  saveCollaborationChatFilePicker,
} from '@/collaboration/chat/save_collaboration_chat_file.js';

/** Shared width for every chat embed (image, video, audio, file box). */
const RENDER_COLLABORATION_CHAT_FILE_MEDIA_PX = 320;

/** Tallest media height for extreme aspect ratios. */
const RENDER_COLLABORATION_CHAT_FILE_MEDIA_MAX_HEIGHT_PX = 320;

/** Smallest image frame width so hover actions always fit in the corner. */
const RENDER_COLLABORATION_CHAT_FILE_IMAGE_MIN_WIDTH_PX = 128;

/** Smallest image frame height so hover actions always fit in the corner. */
const RENDER_COLLABORATION_CHAT_FILE_IMAGE_MIN_HEIGHT_PX = 64;

/**
 * How long the hidden download frame stays, well after the download has
 * started.
 */
const RENDER_COLLABORATION_CHAT_FILE_FRAME_MS = 60_000;

/** Cards already built, so re-rendered rows do not download a file again. */
const renderCollaborationChatFileCards = new WeakMap<EntryCollaborationChatFile, HTMLElement>();

/** How long a copy button shows that the link was copied. */
const RENDER_COLLABORATION_CHAT_FILE_COPIED_MS = 1500;

/**
 * Formats a byte count for people, e.g. `65.20 MB`.
 *
 * @param bytes Byte count.
 * @returns Size text.
 */
export function renderCollaborationChatFileSize(bytes: number): string {
  const units = ['KB', 'MB', 'GB'];
  if (bytes < 1000) return `${bytes} B`;
  let value = bytes / 1000;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit += 1;
  }
  return `${value.toFixed(2)} ${units[unit]}`;
}

/**
 * Returns the reason shown when a download of a shared file failed.
 *
 * @param status HTTP status, or 0 when the relay could not be reached.
 * @returns Reason text.
 */
export function renderCollaborationChatFileReason(status: number): string {
  if (status === 413) return `This file exceeds the ${TRANSFER_SIZE_MAXIMUM / 1048576} MiB limit.`;
  if (status === 0 || status === 404)
    return 'File is no longer available (the sender went offline or the link expired).';
  return `Download failed (HTTP ${status}).`;
}

/**
 * Asks the relay whether a shared file can be downloaded, without its bytes.
 *
 * @param url Download URL.
 * @param fetcher Fetch function.
 * @returns Failure reason, or null when the file is available.
 */
export async function renderCollaborationChatFileProbe(
  url: string,
  fetcher: (url: string, init: RequestInit) => Promise<Response> = fetch,
): Promise<string | null> {
  try {
    const response = await fetcher(url, { method: 'HEAD' });
    return response.ok ? null : renderCollaborationChatFileReason(response.status);
  } catch {
    return renderCollaborationChatFileReason(0);
  }
}

/**
 * Asks the relay whether a file is available and replaces the card with the
 * failure state when it is not. A preview that failed although the file is
 * available falls back to the download box.
 *
 * @param card Current card.
 * @param file Shared file.
 * @param preview True when an embedded preview failed.
 */
async function renderCollaborationChatFileCheck(
  card: HTMLElement,
  file: EntryCollaborationChatFile,
  preview: boolean,
): Promise<void> {
  const reason = await renderCollaborationChatFileProbe(file.url);
  if (reason !== null) card.replaceWith(renderCollaborationChatFileFailed(file, reason));
  else if (preview) card.replaceWith(renderCollaborationChatFileCard(file, renderCollaborationChatFileBox(file)));
}

/**
 * Returns how a file is shown: embedded image, video or audio, or a download
 * box.
 *
 * @param mime MIME type.
 * @returns Display kind.
 */
export function renderCollaborationChatFileKind(mime: string): 'image' | 'video' | 'audio' | 'file' {
  if (mime.startsWith('image/') && mime !== 'image/svg+xml') return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'file';
}

/**
 * Returns the card of a shared file, building it on first use.
 *
 * @param file Shared file.
 * @returns Card element.
 */
export function renderCollaborationChatFile(file: EntryCollaborationChatFile): HTMLElement {
  const known = renderCollaborationChatFileCards.get(file);
  if (known !== undefined) return known;
  const kind = renderCollaborationChatFileKind(file.mime);
  if (kind === 'file') return renderCollaborationChatFileCard(file, renderCollaborationChatFileBox(file));
  if (kind === 'audio') return renderCollaborationChatFileCard(file, renderCollaborationChatFileAudio(file));
  return renderCollaborationChatFileCard(file, renderCollaborationChatFileMedia(file, kind));
}

/**
 * Builds an embedded audio player: name/size beside the icon, full-width player
 * under the icon, and compact hover link/download buttons in the top-right.
 *
 * @param file Shared file.
 * @returns Card element.
 */
function renderCollaborationChatFileAudio(file: EntryCollaborationChatFile): HTMLElement {
  const card = document.createElement('div');
  card.className = 'editor-chat-file editor-chat-file-audio editor-chat-file-box';
  card.style.cssText = renderCollaborationChatFileBoxCss() + ';flex-direction:column;gap:8px';
  card.style.colorScheme = 'dark';
  const header = document.createElement('div');
  header.style.cssText = 'display:flex;align-items:flex-start;gap:10px;min-width:0;width:100%';
  const icon = document.createElement('span');
  icon.textContent = '\u{1F3B5}';
  icon.style.cssText = 'font-size:26px;flex:0 0 auto;line-height:1';
  const details = document.createElement('div');
  details.style.cssText = 'flex:1 1 auto;min-width:0;overflow:hidden';
  const name = renderCollaborationChatFileName(file.name);
  const sizeRow = document.createElement('div');
  sizeRow.style.cssText = 'display:flex;align-items:center;gap:8px;min-width:0;width:100%';
  const size = renderCollaborationChatFileSizeLine(file.size);
  size.style.cssText += ';margin:0;flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
  const actions = renderCollaborationChatFileActions(file, true, card);
  actions.dataset['chatOverlay'] = '1';
  actions.style.cssText =
    'display:flex;gap:6px;line-height:normal;flex:0 0 auto;margin-left:auto;opacity:0;transition:opacity 0.12s';
  sizeRow.append(size, actions);
  details.append(name, sizeRow);
  header.append(icon, details);
  const audio = document.createElement('audio');
  Object.assign(audio, { controls: true, preload: 'metadata', src: file.url, title: file.name });
  audio.style.cssText = 'display:block;width:100%;color-scheme:dark';
  audio.addEventListener('error', () => void renderCollaborationChatFileCheck(card, file, true), { once: true });
  card.addEventListener('mouseenter', () => {
    actions.style.opacity = '1';
  });
  card.addEventListener('mouseleave', () => {
    actions.style.opacity = '0';
  });
  card.append(header, audio);
  return card;
}

/**
 * Tags and remembers the current card of a file.
 *
 * @param file Shared file.
 * @param card Card element.
 * @returns The card.
 */
function renderCollaborationChatFileCard(file: EntryCollaborationChatFile, card: HTMLElement): HTMLElement {
  card.dataset['chatFile'] = file.link;
  renderCollaborationChatFileCards.set(file, card);
  return card;
}

/**
 * Builds an embedded image or video with download and copy buttons on hover.
 *
 * @param file Shared file.
 * @param kind Media kind.
 * @returns Card element.
 */
function renderCollaborationChatFileMedia(file: EntryCollaborationChatFile, kind: 'image' | 'video'): HTMLElement {
  const card = document.createElement('div');
  card.className = 'editor-chat-file editor-chat-file-media';
  card.style.cssText = `display:inline-block;margin-top:4px;max-width:min(100%,${RENDER_COLLABORATION_CHAT_FILE_MEDIA_PX}px);line-height:0`;
  const frame = document.createElement('div');
  frame.className = 'editor-chat-file-media-frame';
  const media = kind === 'image' ? document.createElement('img') : document.createElement('video');
  if (media instanceof HTMLImageElement) {
    media.alt = file.name;
    media.draggable = true;
  } else Object.assign(media, { controls: true, preload: 'metadata' });
  media.src = file.url;
  const maxW = `${RENDER_COLLABORATION_CHAT_FILE_MEDIA_PX}px`;
  const maxH = `${RENDER_COLLABORATION_CHAT_FILE_MEDIA_MAX_HEIGHT_PX}px`;
  if (kind === 'image' && media instanceof HTMLImageElement) {
    // Visible <img> inside an overflow frame with min 128×64 / max 320×320 so
    // hover actions always sit in the top-right and users keep the browser
    // context menu on the image.
    frame.style.cssText = `position:relative;display:block;overflow:hidden;border-radius:6px;line-height:0;background:rgba(0,0,0,0.3);min-width:${RENDER_COLLABORATION_CHAT_FILE_IMAGE_MIN_WIDTH_PX}px;min-height:${RENDER_COLLABORATION_CHAT_FILE_IMAGE_MIN_HEIGHT_PX}px;max-width:min(100%,${maxW});max-height:${maxH};width:fit-content`;
    media.style.cssText = `display:block;width:auto;height:auto;min-width:${RENDER_COLLABORATION_CHAT_FILE_IMAGE_MIN_WIDTH_PX}px;min-height:${RENDER_COLLABORATION_CHAT_FILE_IMAGE_MIN_HEIGHT_PX}px;max-width:min(100%,${maxW});max-height:${maxH};object-fit:cover`;
    media.addEventListener('load', () => renderCollaborationChatFileImageFrameSize(frame, media), { once: true });
    renderCollaborationChatFileImageLightboxBind(file, media);
  } else {
    frame.style.cssText = 'position:relative;display:block;width:fit-content;max-width:100%;line-height:0';
    media.style.cssText = `display:block;width:min(100%,${maxW});max-width:min(100%,${maxW});max-height:${maxH};height:auto;object-fit:contain;border-radius:6px;background:rgba(0,0,0,0.3)`;
  }
  media.addEventListener('error', () => void renderCollaborationChatFileCheck(card, file, true), { once: true });
  const actions = renderCollaborationChatFileActions(file, true, card);
  actions.dataset['chatOverlay'] = '1';
  actions.style.cssText =
    'display:flex;gap:6px;line-height:normal;position:absolute;top:6px;right:6px;opacity:0;transition:opacity 0.12s;z-index:1';
  frame.append(media, actions);
  card.append(frame);
  card.addEventListener('mouseenter', () => {
    actions.style.opacity = '1';
  });
  card.addEventListener('mouseleave', () => {
    actions.style.opacity = '0';
  });
  return card;
}

/**
 * Opens the image in the lightbox when it is clicked.
 *
 * @param file Shared image.
 * @param image Embedded image.
 */
function renderCollaborationChatFileImageLightboxBind(file: EntryCollaborationChatFile, image: HTMLImageElement): void {
  image.style.cursor = 'zoom-in';
  image.addEventListener('click', (event) => {
    event.preventDefault();
    const detail = file.size > 0 ? renderCollaborationChatFileSize(file.size) : undefined;
    LightboxImage.open(
      detail === undefined ? { url: file.url, name: file.name } : { url: file.url, name: file.name, detail },
    );
  });
}

/**
 * Sizes an image frame from intrinsic pixels under the shared min/max rules.
 *
 * @param frame Media frame.
 * @param image Loaded image.
 */
function renderCollaborationChatFileImageFrameSize(frame: HTMLElement, image: HTMLImageElement): void {
  const naturalW = image.naturalWidth || RENDER_COLLABORATION_CHAT_FILE_IMAGE_MIN_WIDTH_PX;
  const naturalH = image.naturalHeight || RENDER_COLLABORATION_CHAT_FILE_IMAGE_MIN_HEIGHT_PX;
  const ratio = naturalW / Math.max(1, naturalH);
  let width = Math.min(
    RENDER_COLLABORATION_CHAT_FILE_MEDIA_PX,
    Math.max(RENDER_COLLABORATION_CHAT_FILE_IMAGE_MIN_WIDTH_PX, naturalW),
  );
  let height = width / ratio;
  if (height > RENDER_COLLABORATION_CHAT_FILE_MEDIA_MAX_HEIGHT_PX) {
    height = RENDER_COLLABORATION_CHAT_FILE_MEDIA_MAX_HEIGHT_PX;
    width = height * ratio;
  }
  if (height < RENDER_COLLABORATION_CHAT_FILE_IMAGE_MIN_HEIGHT_PX) {
    height = RENDER_COLLABORATION_CHAT_FILE_IMAGE_MIN_HEIGHT_PX;
    width = Math.max(
      RENDER_COLLABORATION_CHAT_FILE_IMAGE_MIN_WIDTH_PX,
      Math.min(RENDER_COLLABORATION_CHAT_FILE_MEDIA_PX, height * ratio),
    );
  }
  if (width < RENDER_COLLABORATION_CHAT_FILE_IMAGE_MIN_WIDTH_PX) {
    width = RENDER_COLLABORATION_CHAT_FILE_IMAGE_MIN_WIDTH_PX;
    height = Math.max(
      RENDER_COLLABORATION_CHAT_FILE_IMAGE_MIN_HEIGHT_PX,
      Math.min(RENDER_COLLABORATION_CHAT_FILE_MEDIA_MAX_HEIGHT_PX, width / ratio),
    );
  }
  frame.style.width = `${Math.round(width)}px`;
  frame.style.height = `${Math.round(height)}px`;
  image.style.width = '100%';
  image.style.height = '100%';
  image.style.minWidth = '0';
  image.style.minHeight = '0';
  image.style.maxWidth = 'none';
  image.style.maxHeight = 'none';
  image.style.objectFit = 'cover';
}

/**
 * Builds the dark download box of a file that is not embedded.
 *
 * @param file Shared file.
 * @returns Card element.
 */
function renderCollaborationChatFileBox(file: EntryCollaborationChatFile): HTMLElement {
  const card = document.createElement('div');
  card.className = 'editor-chat-file editor-chat-file-box';
  card.style.cssText = renderCollaborationChatFileBoxCss();
  const icon = document.createElement('span');
  icon.textContent = '\u{1F4C4}';
  icon.style.cssText = 'font-size:26px;flex:0 0 auto';
  const details = document.createElement('div');
  details.style.cssText = 'flex:1 1 auto;min-width:0';
  details.append(renderCollaborationChatFileName(file.name), renderCollaborationChatFileSizeLine(file.size));
  details.append(renderCollaborationChatFileActions(file, false, card));
  card.append(icon, details);
  return card;
}

/**
 * Returns the shared dark file/audio box chrome.
 *
 * @returns CSS text.
 */
export function renderCollaborationChatFileBoxCss(): string {
  return `display:flex;align-items:flex-start;gap:10px;margin-top:4px;padding:10px 12px;border-radius:8px;background:#151515;border:1px solid rgba(255,255,255,0.08);width:min(100%,${RENDER_COLLABORATION_CHAT_FILE_MEDIA_PX}px);max-width:100%;box-sizing:border-box`;
}

/**
 * Builds the failure state shown when a file cannot be downloaded.
 *
 * @param file Shared file.
 * @param text Reason.
 * @returns Card element.
 */
function renderCollaborationChatFileFailed(file: EntryCollaborationChatFile, text: string): HTMLElement {
  const card = document.createElement('div');
  card.className = 'editor-chat-file editor-chat-file-failed';
  card.style.cssText =
    'margin-top:4px;padding:8px 12px;border-radius:8px;background:#1a1212;border:1px solid rgba(255,107,107,0.35);font-size:12px;color:#ff8a8a;max-width:320px';
  const name = renderCollaborationChatFileName(file.name);
  const reason = document.createElement('div');
  reason.className = 'editor-chat-file-reason';
  reason.textContent = text;
  card.append(name, reason);
  return renderCollaborationChatFileCard(file, card);
}

/**
 * Builds the file name line; plain text only.
 *
 * @param text File name.
 * @returns Element.
 */
export function renderCollaborationChatFileName(text: string): HTMLElement {
  const name = document.createElement('div');
  name.className = 'editor-chat-file-name';
  name.dir = 'auto';
  name.textContent = text;
  name.title = text;
  name.style.cssText = `font-size:13px;font-weight:600;color:${Theme.buttonTextColor};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;max-width:100%`;
  return name;
}

/**
 * Builds the size line.
 *
 * @param bytes File size.
 * @returns Element.
 */
export function renderCollaborationChatFileSizeLine(bytes: number): HTMLElement {
  const line = document.createElement('div');
  line.className = 'editor-chat-file-size';
  line.textContent = bytes > 0 ? renderCollaborationChatFileSize(bytes) : 'Link';
  line.style.cssText = `font-size:11px;color:${Theme.statusBarTextColor};margin:2px 0 6px`;
  return line;
}

/**
 * Asks the relay whether a file is available, then either shows the reason in
 * the card or starts the download: through the "Save as" picker in the desktop
 * app, otherwise in a hidden frame. `?download` makes the relay send an
 * attachment, so no tab opens; a frame (unlike a link, whose `download`
 * attribute browsers ignore across origins) never navigates the editor, so its
 * unsaved-changes guard stays quiet.
 *
 * @param card Current card.
 * @param file Shared file.
 * @param fetcher Fetch function.
 */
export async function renderCollaborationChatFileDownload(
  card: HTMLElement,
  file: EntryCollaborationChatFile,
  fetcher: (url: string, init: RequestInit) => Promise<Response> = fetch,
): Promise<void> {
  const transferLike = !file.link.startsWith('url-');
  const reason = transferLike ? await renderCollaborationChatFileProbe(file.url, fetcher) : null;
  if (reason !== null) return void card.replaceWith(renderCollaborationChatFileFailed(file, reason));
  const picker = saveCollaborationChatFilePicker();
  if (picker !== null) return renderCollaborationChatFileSaveAs(card, file, picker, fetcher);
  if (!transferLike) {
    const anchor = document.createElement('a');
    anchor.href = file.url;
    anchor.download = file.name;
    anchor.rel = 'noopener noreferrer';
    anchor.target = '_blank';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    return;
  }
  const frame = document.createElement('iframe');
  frame.hidden = true;
  frame.src = `${file.url}?download`;
  document.body.appendChild(frame);
  setTimeout(() => frame.remove(), RENDER_COLLABORATION_CHAT_FILE_FRAME_MS);
}

/**
 * Saves a file through the "Save as" picker and shows the failure state when
 * the download breaks.
 *
 * @param card Current card.
 * @param file Shared file.
 * @param picker Save picker.
 * @param fetcher Fetch function.
 */
async function renderCollaborationChatFileSaveAs(
  card: HTMLElement,
  file: EntryCollaborationChatFile,
  picker: Parameters<typeof saveCollaborationChatFileAs>[0],
  fetcher: (url: string, init: RequestInit) => Promise<Response>,
): Promise<void> {
  const status = await saveCollaborationChatFileAs(picker, file.url, file.name, fetcher);
  if (status !== null)
    card.replaceWith(renderCollaborationChatFileFailed(file, renderCollaborationChatFileReason(status)));
}

/**
 * Copies a link and briefly shows on the button that it was copied: a check
 * mark and tooltip on icon buttons, COPIED! on labelled ones. A failed copy
 * leaves the button as it is.
 *
 * @param button Copy button.
 * @param url Link to copy.
 */
export async function renderCollaborationChatFileCopy(button: HTMLElement, url: string): Promise<void> {
  if (navigator.clipboard === undefined) return;
  const copied = await navigator.clipboard.writeText(url).then(
    () => true,
    () => false,
  );
  if (!copied) return;
  const label = button.textContent ?? '';
  const title = button.title;
  button.textContent = label === 'COPY LINK' ? 'COPIED!' : '\u2713';
  button.title = 'Copied!';
  setTimeout(() => {
    button.textContent = label;
    button.title = title;
  }, RENDER_COLLABORATION_CHAT_FILE_COPIED_MS);
}

/**
 * Builds the copy link and download buttons. Download checks the file first and
 * starts only when the relay can serve it.
 *
 * @param file Shared file.
 * @param compact True for small icon buttons over media.
 * @param card Card holding the buttons.
 * @returns Button row.
 */
export function renderCollaborationChatFileActions(
  file: EntryCollaborationChatFile,
  compact: boolean,
  card: HTMLElement,
): HTMLElement {
  const row = document.createElement('div');
  row.className = 'editor-chat-file-actions';
  row.style.cssText = 'display:flex;gap:6px;line-height:normal';
  const copy = renderCollaborationChatFileButton(compact ? '\u{1F517}' : 'COPY LINK', 'Copy link');
  copy.addEventListener('click', () => void renderCollaborationChatFileCopy(copy, file.url));
  const download = renderCollaborationChatFileButton(compact ? '\u2B07' : 'DOWNLOAD', 'Download');
  const transferLike = !file.link.startsWith('url-');
  download.href = transferLike ? `${file.url}?download` : file.url;
  download.download = file.name;
  download.removeAttribute('target');
  download.addEventListener('click', (event) => {
    event.preventDefault();
    void renderCollaborationChatFileDownload(card, file);
  });
  row.append(copy, download);
  return row;
}

/**
 * Builds one small action button as a link element.
 *
 * @param label Visible label.
 * @param title Tooltip and accessible name.
 * @returns Button element.
 */
function renderCollaborationChatFileButton(label: string, title: string): HTMLAnchorElement {
  const button = document.createElement('a');
  button.className = 'editor-chat-file-button';
  button.textContent = label;
  button.title = title;
  button.setAttribute('aria-label', title);
  button.setAttribute('role', 'button');
  button.target = '_blank';
  button.rel = 'noopener noreferrer';
  button.style.cssText =
    'cursor:pointer;padding:3px 8px;border-radius:5px;background:rgba(20,20,20,0.85);border:1px solid rgba(255,255,255,0.15);color:#f2f2f2;font-size:11px;font-weight:700;text-decoration:none;user-select:none';
  return button;
}
