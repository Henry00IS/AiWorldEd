import type { EntryCollaborationChatFile } from '@/collaboration/chat/entry_collaboration_chat.js';
import { Theme } from '@/theme.js';

/** Largest shown size of an embedded image or video. */
const RENDER_COLLABORATION_CHAT_FILE_MEDIA_PX = 260;

/** Cards already built, so re-rendered rows do not download a file again. */
const renderCollaborationChatFileCards = new WeakMap<EntryCollaborationChatFile, HTMLElement>();

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
 * Returns how a file is shown: embedded image or video, or a download box.
 *
 * @param mime MIME type.
 * @returns Display kind.
 */
export function renderCollaborationChatFileKind(mime: string): 'image' | 'video' | 'file' {
  if (mime.startsWith('image/') && mime !== 'image/svg+xml') return 'image';
  if (mime.startsWith('video/')) return 'video';
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
  const card = kind === 'file' ? renderCollaborationChatFileBox(file) : renderCollaborationChatFileMedia(file, kind);
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
  card.style.cssText = 'position:relative;display:inline-block;margin-top:4px;max-width:100%;line-height:0';
  const media = kind === 'image' ? document.createElement('img') : document.createElement('video');
  if (media instanceof HTMLImageElement) media.alt = file.name;
  else Object.assign(media, { controls: true, preload: 'metadata' });
  media.src = `${file.url}?inline`;
  const size = `${RENDER_COLLABORATION_CHAT_FILE_MEDIA_PX}px`;
  media.style.cssText = `display:block;max-width:min(100%,${size});max-height:${size};width:auto;height:auto;object-fit:contain;border-radius:6px;background:rgba(0,0,0,0.3)`;
  media.addEventListener('error', () => card.replaceWith(renderCollaborationChatFileFailed(file)));
  const actions = renderCollaborationChatFileActions(file, true);
  actions.style.cssText += ';position:absolute;top:6px;right:6px;opacity:0;transition:opacity 0.12s';
  card.addEventListener('mouseenter', () => (actions.style.opacity = '1'));
  card.addEventListener('mouseleave', () => (actions.style.opacity = '0'));
  card.append(media, actions);
  return card;
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
  card.style.cssText =
    'display:flex;align-items:center;gap:10px;margin-top:4px;padding:10px 12px;border-radius:8px;background:#151515;border:1px solid rgba(255,255,255,0.08);max-width:320px';
  const icon = document.createElement('span');
  icon.textContent = '\u{1F4C4}';
  icon.style.cssText = 'font-size:26px;flex:0 0 auto';
  const details = document.createElement('div');
  details.style.cssText = 'flex:1 1 auto;min-width:0';
  details.append(renderCollaborationChatFileName(file.name), renderCollaborationChatFileSizeLine(file.size));
  details.append(renderCollaborationChatFileActions(file, false));
  card.append(icon, details);
  return card;
}

/**
 * Builds the failure state shown when a file can no longer be loaded.
 *
 * @param file Shared file.
 * @returns Card element.
 */
function renderCollaborationChatFileFailed(file: EntryCollaborationChatFile): HTMLElement {
  const card = document.createElement('div');
  card.className = 'editor-chat-file editor-chat-file-failed';
  card.style.cssText =
    'margin-top:4px;padding:8px 12px;border-radius:8px;background:#1a1212;border:1px solid rgba(255,107,107,0.35);font-size:12px;color:#ff8a8a;max-width:320px';
  const name = renderCollaborationChatFileName(file.name);
  const reason = document.createElement('div');
  reason.textContent = 'File is no longer available (the sender went offline or the link expired).';
  card.append(name, reason);
  renderCollaborationChatFileCards.set(file, card);
  return card;
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
 * Builds the copy link and download buttons.
 *
 * @param file Shared file.
 * @param compact True for small icon buttons over media.
 * @returns Button row.
 */
function renderCollaborationChatFileActions(file: EntryCollaborationChatFile, compact: boolean): HTMLElement {
  const row = document.createElement('div');
  row.className = 'editor-chat-file-actions';
  row.style.cssText = 'display:flex;gap:6px;line-height:normal';
  const copy = renderCollaborationChatFileButton(compact ? '\u{1F517}' : 'COPY LINK', 'Copy link');
  copy.addEventListener('click', () => void navigator.clipboard?.writeText(file.url));
  const download = renderCollaborationChatFileButton(compact ? '\u2B07' : 'DOWNLOAD', 'Download');
  download.href = file.url;
  download.download = file.name;
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
