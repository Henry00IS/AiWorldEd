import { curveFileNameIs } from '@/curve/model/curve_file.js';
import { renderCollaborationChatCurve } from '@/collaboration/chat/render_collaboration_chat_curve.js';
import type {
  EntryCollaborationChat,
  EntryCollaborationChatFile,
} from '@/collaboration/chat/entry_collaboration_chat.js';
import { renderCollaborationChatFile } from '@/collaboration/chat/render_collaboration_chat_file.js';
import { memberCollaborationColor, memberCollaborationCss } from '@/collaboration/sync/member_collaboration_roster.js';
import { Theme } from '@/theme.js';
import { jumboCollaborationChatIs } from '@/collaboration/chat/jumbo_collaboration_chat.js';

/** Avatar circle size in pixels. */
export const RENDER_COLLABORATION_CHAT_AVATAR_PX = 32;
/** Left indent of message text, past the avatar. */
const RENDER_COLLABORATION_CHAT_INDENT_PX = RENDER_COLLABORATION_CHAT_AVATAR_PX + 12;

/** Font size of a message made only of a few emoji. */
export const RENDER_COLLABORATION_CHAT_JUMBO_FONT_PX = 32;
/** Line height of a message made only of a few emoji. */
const RENDER_COLLABORATION_CHAT_JUMBO_LINE_PX = 40;

/** Matches http(s) URLs in chat text for link detection. */
const RENDER_COLLABORATION_CHAT_URL_RE = /https?:\/\/[^\s<>"'`]+/giu;

/** Image path extensions for URL embeds. */
const RENDER_COLLABORATION_CHAT_IMAGE_EXT_RE = /\.(?:png|jpe?g|gif|webp|bmp|avif)(?:$|[?#])/iu;

/** Generic downloadable file extensions for URL embeds (not html/js). */
const RENDER_COLLABORATION_CHAT_FILE_EXT_RE =
  /\.(?:pdf|zip|txt|csv|json|aiworld|aicurve|wasm|bin|7z|rar|gz|tar|doc|docx|xls|xlsx|ppt|pptx)(?:$|[?#])/iu;

/** Audio path extensions. */
const RENDER_COLLABORATION_CHAT_AUDIO_EXT_RE = /\.(?:mp3|wav|ogg|m4a|flac|aac|opus)(?:$|[?#])/iu;

/** Max wait for a CORS HEAD used to classify extensionless URLs. */
const RENDER_COLLABORATION_CHAT_URL_HEAD_MS = 4000;

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
 * Returns whether a URL pat/** Returns whether a URL is a safe http(s) link (no
 * javascript: etc.).
 *
 * @param url Candidate URL.
 * @returns True for http(s).
 */
/**
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
 * Classifies a URL for in-chat embeds from its path extension only.
 * Extensionless transfer links return null and need a CORS HEAD.
 *
 * @param url Absolute URL.
 * @returns Embed kind, or null when the path has no usable extension.
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
 * Classifies a MIME type into an embed kind.
 *
 * @param mime Content-Type value.
 * @returns Embed kind, or null when unsupported / active.
 */
export function renderCollaborationChatUrlKindFromMime(mime: string): 'image' | 'video' | 'audio' | 'file' | null {
  const base = (mime.split(';')[0] ?? '').trim().toLowerCase();
  if (base === '' || base === 'application/octet-stream') return null;
  if (base.startsWith('image/') && base !== 'image/svg+xml') return 'image';
  if (base.startsWith('video/')) return 'video';
  if (base.startsWith('audio/')) return 'audio';
  if (
    base === 'application/pdf' ||
    base === 'application/zip' ||
    base === 'application/x-zip-compressed' ||
    base.startsWith('application/vnd.')
  )
    return 'file';
  return null;
}

/**
 * Returns whether a URL path looks like an image (extension only).
 *
 * @param url Absolute URL.
 * @returns True for common image extensions.
 */
export function renderCollaborationChatUrlIsImage(url: string): boolean {
  return renderCollaborationChatUrlKind(url) === 'image';
}

/**
 * Returns whether a URL path looks like audio or video (extension only).
 *
 * @param url Absolute URL.
 * @returns True for common audio/video extensions.
 */
export function renderCollaborationChatUrlIsMediaFile(url: string): boolean {
  const kind = renderCollaborationChatUrlKind(url);
  return kind === 'audio' || kind === 'video';
}

/** Metadata from a bounded CORS HEAD used for extensionless URL embeds. */
export interface RenderCollaborationChatUrlMeta {
  kind: 'image' | 'video' | 'audio' | 'file';
  mime: string;
  name: string;
  size: number;
}

/**
 * Performs a bounded CORS HEAD to classify an extensionless http(s) URL.
 * Client-side only (no server proxy). Uses Content-Type, Content-Length and
 * Content-Disposition when exposed (transfer links already expose them).
 *
 * @param url Safe http(s) URL.
 * @param fetcher Fetch implementation.
 * @returns Metadata, or null when the URL cannot be embedded.
 */
export async function renderCollaborationChatUrlHead(
  url: string,
  fetcher: typeof fetch = fetch,
  signal: AbortSignal | null = null,
): Promise<RenderCollaborationChatUrlMeta | null> {
  if (!renderCollaborationChatUrlIsSafe(url)) return null;
  if (signal?.aborted) return null;
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => controller.abort(), RENDER_COLLABORATION_CHAT_URL_HEAD_MS);
  try {
    const response = await fetcher(url, {
      method: 'HEAD',
      mode: 'cors',
      redirect: 'follow',
      signal: controller.signal,
    });
    if (!response.ok) return null;
    if (response.url !== '' && !renderCollaborationChatUrlIsSafe(response.url)) return null;
    const mime = (response.headers.get('content-type') ?? '').trim();
    const kind = renderCollaborationChatUrlKindFromMime(mime);
    if (kind === null) return null;
    const sizeHeader = response.headers.get('content-length');
    const size = sizeHeader !== null && /^\d+$/u.test(sizeHeader) ? Number(sizeHeader) : 0;
    const name =
      renderCollaborationChatUrlNameFromDisposition(response.headers.get('content-disposition')) ??
      renderCollaborationChatUrlNameFromPath(url);
    return { kind, mime: (mime.split(';')[0] ?? mime).trim().toLowerCase() || 'application/octet-stream', name, size };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

/**
 * Creates the message text block; line breaks are kept, long words wrap, and
 * http(s) URLs become links. Recognized media URLs get the shared chat embed
 * (with copy/download). Extensionless URLs (e.g. transfer links) are classified
 * with a bounded CORS HEAD and enriched asynchronously.
 *
 * @param text Message text.
 * @param signal Cancels pending embed lookups when the row goes away.
 * @param edited Time of the last edit (epoch ms), or null when never edited.
 * @returns Text element (may contain link children and embeds).
 */
export function renderCollaborationChatText(
  text: string,
  signal: AbortSignal | null = null,
  edited: number | null = null,
): HTMLElement {
  const body = document.createElement('div');
  body.className = 'editor-chat-text';
  body.dir = 'auto';
  body.style.cssText = `display:block;white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word;font-size:13px;line-height:18px;color:${Theme.buttonTextColor};unicode-bidi:isolate`;
  const syncEmbeds: string[] = [];
  const headEmbeds: string[] = [];
  let last = 0;
  for (const match of text.matchAll(RENDER_COLLABORATION_CHAT_URL_RE)) {
    const url = match[0] ?? '';
    const index = match.index ?? 0;
    if (index > last) body.append(text.slice(last, index));
    if (renderCollaborationChatUrlIsSafe(url)) body.append(renderCollaborationChatLink(url));
    else body.append(url);
    const kind = renderCollaborationChatUrlKind(url);
    if (kind !== null) {
      if (!syncEmbeds.includes(url)) syncEmbeds.push(url);
    } else if (renderCollaborationChatUrlIsSafe(url) && !headEmbeds.includes(url) && !syncEmbeds.includes(url)) {
      headEmbeds.push(url);
    }
    last = index + url.length;
  }
  if (last < text.length) body.append(text.slice(last));
  if (body.childNodes.length === 0) body.textContent = text;
  if (edited !== null) body.append(renderCollaborationChatEdited(edited));
  for (const url of syncEmbeds) {
    const embed = renderCollaborationChatUrlEmbed(url);
    if (embed !== null) body.append(embed);
  }
  for (const url of headEmbeds) renderCollaborationChatUrlEmbedAsync(body, url, signal);
  if (jumboCollaborationChatIs(text)) renderCollaborationChatTextJumbo(body);
  return body;
}

/**
 * Shows a message made only of a few emoji in large type.
 *
 * @param body Message text block.
 */
function renderCollaborationChatTextJumbo(body: HTMLElement): void {
  body.classList.add('editor-chat-text-jumbo');
  body.style.fontSize = `${RENDER_COLLABORATION_CHAT_JUMBO_FONT_PX}px`;
  body.style.lineHeight = `${RENDER_COLLABORATION_CHAT_JUMBO_LINE_PX}px`;
}

/**
 * Creates the marker after the text of an edited message.
 *
 * @param edited Time of the last edit (epoch ms).
 * @returns Marker element.
 */
export function renderCollaborationChatEdited(edited: number): HTMLElement {
  const marker = document.createElement('span');
  marker.className = 'editor-chat-edited';
  marker.textContent = ' (edited)';
  marker.title = renderCollaborationChatTimeFull(edited);
  marker.style.cssText = `font-size:10px;line-height:18px;color:${Theme.statusBarTextColor};user-select:none`;
  return marker;
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
 * @param meta Optional HEAD metadata (mime, name, size, kind).
 * @returns Embed element, or null when the URL is not embeddable yet.
 */
export function renderCollaborationChatUrlEmbed(
  url: string,
  meta: RenderCollaborationChatUrlMeta | null = null,
): HTMLElement | null {
  const kind = meta?.kind ?? renderCollaborationChatUrlKind(url);
  if (kind === null) return null;
  const file = renderCollaborationChatUrlFile(url, kind, meta);
  const card = renderCollaborationChatFile(file);
  card.classList.add('editor-chat-link-embed');
  card.dataset['chatUrlPreview'] = '1';
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
 * Classifies an extensionless URL with HEAD and appends an embed when possible.
 *
 * @param host Message body that receives the embed.
 * @param url Safe http(s) URL.
 */
function renderCollaborationChatUrlEmbedAsync(host: HTMLElement, url: string, signal: AbortSignal | null = null): void {
  void renderCollaborationChatUrlHead(url, fetch, signal).then((meta) => {
    if (meta === null || signal?.aborted || !host.isConnected) return;
    const embed = renderCollaborationChatUrlEmbed(url, meta);
    if (embed !== null) host.append(embed);
  });
}

/**
 * Builds a synthetic shared-file record for a pasted URL preview.
 *
 * @param url Absolute URL.
 * @param kind Embed kind.
 * @param meta Optional HEAD metadata.
 * @returns File record.
 */
function renderCollaborationChatUrlFile(
  url: string,
  kind: 'image' | 'video' | 'audio' | 'file',
  meta: RenderCollaborationChatUrlMeta | null = null,
): EntryCollaborationChatFile {
  const name = meta?.name ?? renderCollaborationChatUrlNameFromPath(url);
  const mime =
    meta?.mime ??
    (kind === 'image'
      ? renderCollaborationChatUrlMime(url, 'image/png')
      : kind === 'video'
        ? renderCollaborationChatUrlMime(url, 'video/mp4')
        : kind === 'audio'
          ? renderCollaborationChatUrlMime(url, 'audio/mpeg')
          : 'application/octet-stream');
  const size = meta?.size ?? 0;
  return { link: `url-${kind}-${name}-${url.length}`, name, size, mime, url };
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
 * Reads a file name from a Content-Disposition header.
 *
 * @param header Header value, or null.
 * @returns File name, or null.
 */
export function renderCollaborationChatUrlNameFromDisposition(header: string | null): string | null {
  if (header === null || header === '') return null;
  const star = /filename\*\s*=\s*UTF-8''([^;]+)/iu.exec(header);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].trim().replace(/^"|"$/gu, '')) || null;
    } catch {
      /* fall through */
    }
  }
  const plain = /filename\s*=\s*"((?:\\.|[^"])*)"|filename\s*=\s*([^;]+)/iu.exec(header);
  const raw = (plain?.[1] ?? plain?.[2] ?? '').trim().replace(/^"|"$/gu, '');
  return raw === '' ? null : raw;
}

/**
 * Falls back to the last path segment of a URL as a file name.
 *
 * @param url Absolute URL.
 * @returns File name.
 */
function renderCollaborationChatUrlNameFromPath(url: string): string {
  try {
    const base = new URL(url).pathname.split('/').pop() ?? 'file';
    return decodeURIComponent(base) || 'file';
  } catch {
    return 'file';
  }
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
export function renderCollaborationChatRow(
  entry: EntryCollaborationChat,
  grouped: boolean,
  now: number,
  signal: AbortSignal | null = null,
): HTMLElement {
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
    entry.file === undefined
      ? renderCollaborationChatText(entry.text, signal, entry.edited ?? null)
      : curveFileNameIs(entry.file.name)
        ? renderCollaborationChatCurve(entry.file)
        : renderCollaborationChatFile(entry.file),
  );
  row.addEventListener('mouseenter', () => (row.style.background = 'rgba(255,255,255,0.035)'));
  row.addEventListener('mouseleave', () => (row.style.background = ''));
  return row;
}
