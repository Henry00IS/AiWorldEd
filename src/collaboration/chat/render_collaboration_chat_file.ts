import type { EntryCollaborationChatFile } from '@/collaboration/chat/entry_collaboration_chat.js';
import { TRANSFER_SIZE_MAXIMUM } from '@/collaboration/shared/protocol_definitions.js';
import { Theme } from '@/theme.js';
import {
  saveCollaborationChatFileAs,
  saveCollaborationChatFilePicker,
} from '@/collaboration/chat/save_collaboration_chat_file.js';

/** Shared width for every chat embed (image, video, audio, file box). */
const RENDER_COLLABORATION_CHAT_FILE_MEDIA_PX = 320;

/** Tallest media height for extreme aspect ratios. */
const RENDER_COLLABORATION_CHAT_FILE_MEDIA_MAX_HEIGHT_PX = 320;

/** Below this rendered media size, hover actions sit under the media. */
const RENDER_COLLABORATION_CHAT_FILE_OVERLAY_MIN_PX = 96;

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
 * Builds an embedded audio player with the copy link and download buttons below
 * it.
 *
 * @param file Shared file.
 * @returns Card element.
 */
function renderCollaborationChatFileAudio(file: EntryCollaborationChatFile): HTMLElement {
  const card = document.createElement('div');
  card.className = 'editor-chat-file editor-chat-file-audio editor-chat-file-box';
  card.style.cssText = renderCollaborationChatFileBoxCss();
  card.style.colorScheme = 'dark';
  const icon = document.createElement('span');
  icon.textContent = '\u{1F3B5}';
  icon.style.cssText = 'font-size:26px;flex:0 0 auto';
  const details = document.createElement('div');
  details.style.cssText = 'flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:6px';
  const audio = document.createElement('audio');
  Object.assign(audio, { controls: true, preload: 'metadata', src: file.url, title: file.name });
  audio.style.cssText = 'display:block;width:100%;color-scheme:dark';
  audio.addEventListener('error', () => void renderCollaborationChatFileCheck(card, file, true), { once: true });
  details.append(
    renderCollaborationChatFileName(file.name),
    renderCollaborationChatFileSizeLine(file.size),
    audio,
    renderCollaborationChatFileActions(file, false, card),
  );
  card.append(icon, details);
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
  // Wrapper sized to the media; overlay actions are positioned against this, not
  // the outer card, so they stay in the media frame when the chat window widens.
  const frame = document.createElement('div');
  frame.className = 'editor-chat-file-media-frame';
  frame.style.cssText = 'position:relative;display:block;width:fit-content;max-width:100%;line-height:0';
  const media = kind === 'image' ? document.createElement('img') : document.createElement('video');
  if (media instanceof HTMLImageElement) media.alt = file.name;
  else Object.assign(media, { controls: true, preload: 'metadata' });
  media.src = file.url;
  const width = `${RENDER_COLLABORATION_CHAT_FILE_MEDIA_PX}px`;
  const height = `${RENDER_COLLABORATION_CHAT_FILE_MEDIA_MAX_HEIGHT_PX}px`;
  // Images keep width:auto so tiny shots are not stretched; video fills the
  // shared 320px width so the hover actions sit on the video frame itself.
  media.style.cssText =
    kind === 'video'
      ? `display:block;width:min(100%,${width});max-width:min(100%,${width});max-height:${height};height:auto;object-fit:contain;border-radius:6px;background:rgba(0,0,0,0.3)`
      : `display:block;width:auto;max-width:min(100%,${width});max-height:${height};height:auto;object-fit:contain;border-radius:6px;background:rgba(0,0,0,0.3)`;
  media.addEventListener('error', () => void renderCollaborationChatFileCheck(card, file, true), { once: true });
  const actions = renderCollaborationChatFileActions(file, true, card);
  frame.append(media);
  card.append(frame);
  renderCollaborationChatFileMediaActionsBind(card, frame, media, actions);
  return card;
}

/**
 * Places media action buttons over large media or under tiny media so they do
 * not cover a clickable image.
 *
 * @param card Media card.
 * @param media Image or video element.
 * @param actions Action row.
 */
function renderCollaborationChatFileMediaActionsBind(
  card: HTMLElement,
  frame: HTMLElement,
  media: HTMLImageElement | HTMLVideoElement,
  actions: HTMLElement,
): void {
  const place = () => renderCollaborationChatFileMediaActionsPlace(card, frame, media, actions);
  media.addEventListener('load', place);
  media.addEventListener('loadedmetadata', place);
  place();
  card.addEventListener('mouseenter', () => {
    if (actions.dataset['chatOverlay'] === '1') actions.style.opacity = '1';
  });
  card.addEventListener('mouseleave', () => {
    if (actions.dataset['chatOverlay'] === '1') actions.style.opacity = '0';
  });
}

/**
 * Chooses overlay vs below layout from the media's rendered size.
 *
 * @param card Media card.
 * @param media Image or video element.
 * @param actions Action row.
 */
function renderCollaborationChatFileMediaActionsPlace(
  card: HTMLElement,
  frame: HTMLElement,
  media: HTMLImageElement | HTMLVideoElement,
  actions: HTMLElement,
): void {
  const intrinsicWidth = 'videoWidth' in media ? media.videoWidth : media.naturalWidth;
  const intrinsicHeight = 'videoHeight' in media ? media.videoHeight : media.naturalHeight;
  const width = media.clientWidth || intrinsicWidth || 0;
  const height = media.clientHeight || intrinsicHeight || 0;
  // Prefer the laid-out size; fall back to intrinsic so a not-yet-laid-out tiny
  // image still gets actions below it.
  const measure = Math.min(
    width > 0 ? width : Number.POSITIVE_INFINITY,
    height > 0 ? height : Number.POSITIVE_INFINITY,
    intrinsicWidth > 0 ? intrinsicWidth : Number.POSITIVE_INFINITY,
    intrinsicHeight > 0 ? intrinsicHeight : Number.POSITIVE_INFINITY,
  );
  const tiny = Number.isFinite(measure) && measure < RENDER_COLLABORATION_CHAT_FILE_OVERLAY_MIN_PX;
  if (tiny) {
    actions.dataset['chatOverlay'] = '0';
    actions.style.cssText =
      'display:flex;gap:6px;line-height:normal;position:static;margin-top:6px;opacity:1;transition:none';
    card.style.lineHeight = 'normal';
    if (actions.parentElement !== card) card.append(actions);
    return;
  }
  actions.dataset['chatOverlay'] = '1';
  actions.style.cssText =
    'display:flex;gap:6px;line-height:normal;position:absolute;top:6px;right:6px;opacity:0;transition:opacity 0.12s;z-index:1';
  card.style.lineHeight = '0';
  // Keep overlay actions inside the media frame so a wider chat cannot pull
  // them off the video/image.
  if (actions.parentElement !== frame) frame.append(actions);
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
function renderCollaborationChatFileBoxCss(): string {
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
function renderCollaborationChatFileName(text: string): HTMLElement {
  const name = document.createElement('div');
  name.className = 'editor-chat-file-name';
  name.dir = 'auto';
  name.textContent = text;
  name.title = text;
  name.style.cssText = `font-size:13px;font-weight:600;color:${Theme.buttonTextColor};overflow:hidden;text-overflow:ellipsis;white-space:nowrap`;
  return name;
}

/**
 * Builds the size line.
 *
 * @param bytes File size.
 * @returns Element.
 */
function renderCollaborationChatFileSizeLine(bytes: number): HTMLElement {
  const line = document.createElement('div');
  line.className = 'editor-chat-file-size';
  line.textContent = renderCollaborationChatFileSize(bytes);
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
  const reason = await renderCollaborationChatFileProbe(file.url, fetcher);
  if (reason !== null) return void card.replaceWith(renderCollaborationChatFileFailed(file, reason));
  const picker = saveCollaborationChatFilePicker();
  if (picker !== null) return renderCollaborationChatFileSaveAs(card, file, picker, fetcher);
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
function renderCollaborationChatFileActions(
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
  download.href = `${file.url}?download`;
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
