import type { EntryCollaborationChat, EntryCollaborationChatFile } from '@/collaboration/chat/entry_collaboration_chat.js';
import { renderCollaborationChatFile } from '@/collaboration/chat/render_collaboration_chat_file.js';
import { memberCollaborationColor, memberCollaborationCss } from '@/collaboration/sync/member_collaboration_roster.js';
import { Theme } from '@/theme.js';

/** Avatar circle size in pixels. */
export const RENDER_COLLABORATION_CHAT_AVATAR_PX = 32;
/** Left indent of message text, past the avatar. */
const RENDER_COLLABORATION_CHAT_INDENT_PX = RENDER_COLLABORATION_CHAT_AVATAR_PX + 12;

/** Matches http(s) URLs in chat text (Discord-style link detection). */
const RENDER_COLLABORATION_CHAT_URL_RE = /https?:\/\/[^\s<>"'`]+/giu;

/** Image path extensions for URL embeds. */
const RENDER_COLLABORATION_CHAT_IMAGE_EXT_RE = /\.(?:png|jpe?g|gif|webp|bmp|avif)(?:$|[?#])/iu;

/** Generic downloadable file extensions for URL embeds (not html/js). */
const RENDER_COLLABORATION_CHAT_FILE_EXT_RE = /\.(?:pdf|zip|txt|csv|json|wasm|bin|7z|rar|gz|tar|doc|docx|xls|xlsx|ppt|pptx)(?:$|[?#])/iu;

/** Audio path extensions. */
const RENDER_COLLABORATION_CHAT_AUDIO_EXT_RE = /\.(?:mp3|wav|ogg|m4a|flac|aac|opus)(?:$|[?#])/iu;

/** Video path extensions for URL embeds. */
const RENDER_COLLABORATION_CHAT_VIDEO_EXT_RE = /\.(?:mp4|webm|mov|mkv|m4v)(?:$|[?#])/iu;

/**
 * Splits text into user-perceived characters, so an emoji or an accented letter
 * is never cut in half.
 *
 * @param text Text.
 * @returns Graphemes.
 */
export function renderCollaborationChatGraphemes(text: string): string[] {
  if (typeof Intl.Segmenter !== 'function') return Array.from(text);
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  return Array.from(segmenter.segment(text), (part) => part.segment);
}

/**
 * Returns the two characters shown in a member's avatar: the first letters of
 * the first two words, the first letter and last digit of a numbered name (so
 * `Henry2` reads `H2` next to `Henry`), or the first two letters of a single
 * word.
 *
 * @param name Display name.
 * @returns Initials, at most two graphemes.
 */
export function renderCollaborationChatInitials(name: string): string {
  const words = name.split(/[\s_.\-]+/u).filter((word) => word !== '');
  if (words.length > 1) {
    return words
      .slice(0, 2)
      .map((word) => (renderCollaborationChatGraphemes(word)[0] ?? '').toLocaleUpperCase())
      .join('');
  }
  const letters = renderCollaborationChatGraphemes(words[0] ?? '?');
  const digit = /\D\d+$/u.test(words[0] ?? '') ? letters.at(-1) : undefined;
  if (digit !== undefined) return `${(letters[0] ?? '?').toLocaleUpperCase()}${digit}`;
  return `${(letters[0] ?? '?').toLocaleUpperCase()}${letters[1] ?? ''}`;
}

/**
 * Returns the CSS color of a member's color slot.
 *
 * @param slot Color slot.
 * @returns CSS color.
 */
export function renderCollaborationChatColor(slot: number): string {
  return memberCollaborationCss(memberCollaborationColor(slot));
}

/**
 * Formats a message time in the user's locale and time zone: the time of day,
 * plus the date when it is not today.
 *
 * @param at Epoch ms.
 * @param now Current time (epoch ms).
 * @returns Short time text.
 */
export function renderCollaborationChatTime(at: number, now: number): string {
  const sameDay = new Date(at).toDateString() === new Date(now).toDateString();
  const options: Intl.DateTimeFormatOptions = sameDay
    ? { hour: '2-digit', minute: '2-digit' }
    : { dateStyle: 'short', timeStyle: 'short' };
  return new Intl.DateTimeFormat(undefined, options).format(at);
}

/**
 * Formats the full date and time shown when hovering a message.
 *
 * @param at Epoch ms.
 * @returns Long time text.
 */
export function renderCollaborationChatTimeFull(at: number): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'full', timeStyle: 'medium' }).format(at);
}

/**
 * Creates the round avatar with the member's initials in their color.
 *
 * @param name Display name.
 * @param color CSS color.
 * @returns Avatar element.
 */
export function renderCollaborationChatAvatar(name: string, color: string): HTMLElement {
  const avatar = document.createElement('div');
  avatar.className = 'editor-chat-avatar';
  avatar.textContent = renderCollaborationChatInitials(name);
  avatar.setAttribute('aria-hidden', 'true');
  const size = `${RENDER_COLLABORATION_CHAT_AVATAR_PX}px`;
  avatar.style.cssText = `position:absolute;left:0;top:2px;width:${size};height:${size};border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#141414;user-select:none;overflow:hidden;white-space:nowrap`;
  avatar.style.background = color;
  return avatar;
}

/**
 * Creates a plain text element. Text is assigned with textContent only, so
 * markup in a message is shown as typed and never parsed.
 *
 * @param text Text.
 * @param className Class name.
 * @returns Element.
 */
function renderCollaborationChatPlain(text: string, className: string): HTMLElement {
  const element = document.createElement('span');
  element.className = className;
  element.dir = 'auto';
  element.style.unicodeBidi = 'isolate';
  element.textContent = text;
  return element;
}

/**
 * Creates the header line: name in the member's color and the time.
 *
 * @param entry Message.
 * @param now Current time (epoch ms).
 * @returns Header element.
 */
export function renderCollaborationChatHeader(entry: EntryCollaborationChat, now: number): HTMLElement {
  const header = document.createElement('div');
  header.className = 'editor-chat-header';
  header.style.cssText = 'display:flex;align-items:baseline;gap:8px;line-height:18px;min-width:0';
  const name = renderCollaborationChatPlain(entry.name, 'editor-chat-name');
  name.style.cssText += ';font-weight:600;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
  name.style.color = renderCollaborationChatColor(entry.color);
  const time = document.createElement('time');
  time.className = 'editor-chat-time';
  time.dateTime = new Date(entry.at).toISOString();
  time.textContent = renderCollaborationChatTime(entry.at, now);
  time.style.cssText = `font-size:11px;color:${Theme.statusBarTextColor};flex:0 0 auto`;
  header.append(name, time);
  return header;
}

/**
 * Returns whether a URL pat/**
 * Returns whether a URL is a safe http(s) link (no javascript: etc.).
 *
 * @param url Candidate URL.
 * @returns True for http(s).
 */
export function renderCollaborationChatUrlIsSafe(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Classifies a URL for in-chat embeds from its path extension.
 *
 * @param url Absolute URL.
 * @returns Embed kind, or null when the URL should stay a plain link.
 */
export function renderCollaborationChatUrlKind(url: string): 'image' | 'video' | 'audio' | 'file' | null {
  if (!renderCollaborationChatUrlIsSafe(url)) return null;
  let path = url;
  try {
    path = new URL(url).pathname;
  } catch {
    /* keep url */
  }
  if (RENDER_COLLABORATION_CHAT_IMAGE_EXT_RE.test(path)) return 'image';
  if (RENDER_COLLABORATION_CHAT_VIDEO_EXT_RE.test(path)) return 'video';
  if (RENDER_COLLABORATION_CHAT_AUDIO_EXT_RE.test(path)) return 'audio';
  if (RENDER_COLLABORATION_CHAT_FILE_EXT_RE.test(path)) return 'file';
  return null;
}

/**
 * Returns whether a URL path looks like an image.
 *
 * @param url Absolute URL.
 * @returns True for common image extensions.
 */
export function renderCollaborationChatUrlIsImage(url: string): boolean {
  return renderCollaborationChatUrlKind(url) === 'image';
}

/**
 * Returns whether a URL path looks like audio or video.
 *
 * @param url Absolute URL.
 * @returns True for common audio/video extensions.
 */
export function renderCollaborationChatUrlIsMediaFile(url: string): boolean {
  const kind = renderCollaborationChatUrlKind(url);
  return kind === 'audio' || kind === 'video';
}

/**
 * Creates the message text block; line breaks are kept, long words wrap, and
 * http(s) URLs become links. Recognized image, video, audio and file URLs also
 * get the shared chat embed (with copy/download) under the text.
 *
 * @param text Message text.
 * @returns Text element (may contain link children and embeds).
 */
export function renderCollaborationChatText(text: string): HTMLElement {
  const body = document.createElement('div');
  body.className = 'editor-chat-text';
  body.dir = 'auto';
  body.style.cssText = `display:block;white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word;font-size:13px;line-height:18px;color:${Theme.buttonTextColor};unicode-bidi:isolate`;
  const embedUrls: string[] = [];
  let last = 0;
  for (const match of text.matchAll(RENDER_COLLABORATION_CHAT_URL_RE)) {
    const url = match[0] ?? '';
    const index = match.index ?? 0;
    if (index > last) body.append(text.slice(last, index));
    if (renderCollaborationChatUrlIsSafe(url)) body.append(renderCollaborationChatLink(url));
    else body.append(url);
    if (renderCollaborationChatUrlKind(url) !== null && !embedUrls.includes(url)) embedUrls.push(url);
    last = index + url.length;
  }
  if (last < text.length) body.append(text.slice(last));
  if (body.childNodes.length === 0) body.textContent = text;
  for (const url of embedUrls) {
    const embed = renderCollaborationChatUrlEmbed(url);
    if (embed !== null) body.append(embed);
  }
  return body;
}

/**
 * Builds a clickable http(s) link that opens in a new tab.
 *
 * @param url Absolute URL.
 * @returns Anchor element.
 */
function renderCollaborationChatLink(url: string): HTMLAnchorElement {
  const link = document.createElement('a');
  link.className = 'editor-chat-link';
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = url;
  link.style.cssText = 'color:#6cb6ff;text-decoration:underline;overflow-wrap:anywhere;word-break:break-word';
  return link;
}

/**
 * Builds a chat embed for a pasted URL using the shared file renderer.
 *
 * @param url Safe http(s) URL.
 * @returns Embed element, or null when the URL is not embeddable.
 */
export function renderCollaborationChatUrlEmbed(url: string): HTMLElement | null {
  const kind = renderCollaborationChatUrlKind(url);
  if (kind === null) return null;
  const file = renderCollaborationChatUrlFile(url, kind);
  const card = renderCollaborationChatFile(file);
  card.classList.add('editor-chat-link-embed');
  card.dataset['chatUrlPreview'] = '1';
  // Drop the card if the remote media cannot load (CORS / 404), leave the text link.
  const media = card.querySelector('img, video, audio');
  media?.addEventListener(
    'error',
    () => {
      card.remove();
    },
    { once: true },
  );
  return card;
}

/**
 * Builds a synthetic shared-file record for a pasted URL preview.
 *
 * @param url Absolute URL.
 * @param kind Embed kind.
 * @returns File record.
 */
function renderCollaborationChatUrlFile(
  url: string,
  kind: 'image' | 'video' | 'audio' | 'file',
): EntryCollaborationChatFile {
  let name = 'file';
  try {
    const path = new URL(url).pathname;
    const base = path.split('/').pop() ?? 'file';
    name = decodeURIComponent(base) || 'file';
  } catch {
    name = 'file';
  }
  const mime =
    kind === 'image'
      ? renderCollaborationChatUrlMime(url, 'image/png')
      : kind === 'video'
        ? renderCollaborationChatUrlMime(url, 'video/mp4')
        : kind === 'audio'
          ? renderCollaborationChatUrlMime(url, 'audio/mpeg')
          : 'application/octet-stream';
  // Unique link id so the file-card WeakMap treats each URL separately.
  return { link: `url-${kind}-${name}-${url.length}`, name, size: 0, mime, url };
}

/**
 * Guesses a MIME type from a URL path extension.
 *
 * @param url Absolute URL.
 * @param fallback Default MIME.
 * @returns MIME type.
 */
function renderCollaborationChatUrlMime(url: string, fallback: string): string {
  let path = url;
  try {
    path = new URL(url).pathname.toLowerCase();
  } catch {
    path = url.toLowerCase();
  }
  if (path.endsWith('.png')) return 'image/png';
  if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return 'image/jpeg';
  if (path.endsWith('.gif')) return 'image/gif';
  if (path.endsWith('.webp')) return 'image/webp';
  if (path.endsWith('.bmp')) return 'image/bmp';
  if (path.endsWith('.avif')) return 'image/avif';
  if (path.endsWith('.mp4')) return 'video/mp4';
  if (path.endsWith('.webm')) return 'video/webm';
  if (path.endsWith('.mov')) return 'video/quicktime';
  if (path.endsWith('.mp3')) return 'audio/mpeg';
  if (path.endsWith('.wav')) return 'audio/wav';
  if (path.endsWith('.ogg')) return 'audio/ogg';
  if (path.endsWith('.m4a')) return 'audio/mp4';
  if (path.endsWith('.flac')) return 'audio/flac';
  if (path.endsWith('.pdf')) return 'application/pdf';
  if (path.endsWith('.zip')) return 'application/zip';
  return fallback;
}

/**
 * Creates one message row: with avatar and header when it starts a group, tight
 * under the previous message otherwise.
 *
 * @param entry Message.
 * @param grouped True when it continues the previous sender's group.
 * @param now Current time (epoch ms).
 * @returns Row element.
 */
export function renderCollaborationChatRow(entry: EntryCollaborationChat, grouped: boolean, now: number): HTMLElement {
  const row = document.createElement('div');
  row.className = grouped ? 'editor-chat-row editor-chat-row-grouped' : 'editor-chat-row editor-chat-row-first';
  row.dataset['chatId'] = String(entry.id);
  row.title = `${entry.name} \u00b7 ${renderCollaborationChatTimeFull(entry.at)}`;
  row.style.cssText = `position:relative;padding:${grouped ? '1px' : '2px'} 12px 1px ${RENDER_COLLABORATION_CHAT_INDENT_PX + 12}px;margin-top:${grouped ? '0' : '14px'}`;
  if (!grouped) {
    const avatar = renderCollaborationChatAvatar(entry.name, renderCollaborationChatColor(entry.color));
    avatar.style.left = '12px';
    row.append(avatar, renderCollaborationChatHeader(entry, now));
  }
  row.append(
    entry.file === undefined ? renderCollaborationChatText(entry.text) : renderCollaborationChatFile(entry.file),
  );
  row.addEventListener('mouseenter', () => (row.style.background = 'rgba(255,255,255,0.035)'));
  row.addEventListener('mouseleave', () => (row.style.background = ''));
  return row;
}
