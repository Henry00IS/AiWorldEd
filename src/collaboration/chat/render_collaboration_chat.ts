import type { EntryCollaborationChat } from '@/collaboration/chat/entry_collaboration_chat.js';
import { renderCollaborationChatFile } from '@/collaboration/chat/render_collaboration_chat_file.js';
import { memberCollaborationColor, memberCollaborationCss } from '@/collaboration/sync/member_collaboration_roster.js';
import { Theme } from '@/theme.js';

/** Avatar circle size in pixels. */
export const RENDER_COLLABORATION_CHAT_AVATAR_PX = 32;
/** Left indent of message text, past the avatar. */
const RENDER_COLLABORATION_CHAT_INDENT_PX = RENDER_COLLABORATION_CHAT_AVATAR_PX + 12;

/** Matches http(s) URLs in chat text (Discord-style link detection). */
const RENDER_COLLABORATION_CHAT_URL_RE = /https?:\/\/[^\s<>"'`]+/giu;

/** Image path extensions Discord-style embeds recognize. */
const RENDER_COLLABORATION_CHAT_IMAGE_EXT_RE = /\.(?:png|jpe?g|gif|webp|bmp|avif)(?:$|[?#])/iu;

/** Audio path extensions that stay plain links (never auto-embedded). */
const RENDER_COLLABORATION_CHAT_AUDIO_EXT_RE = /\.(?:mp3|wav|ogg|m4a|flac|aac|opus)(?:$|[?#])/iu;

/** Video path extensions that stay plain links (never auto-embedded). */
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
 * Returns whether a URL path looks like an image Discord would embed.
 *
 * @param url Absolute URL.
 * @returns True for common image extensions.
 */
export function renderCollaborationChatUrlIsImage(url: string): boolean {
  try {
    return RENDER_COLLABORATION_CHAT_IMAGE_EXT_RE.test(new URL(url).pathname);
  } catch {
    return RENDER_COLLABORATION_CHAT_IMAGE_EXT_RE.test(url);
  }
}

/**
 * Returns whether a URL path looks like audio or video (never auto-embedded).
 *
 * @param url Absolute URL.
 * @returns True for common audio/video extensions.
 */
export function renderCollaborationChatUrlIsMediaFile(url: string): boolean {
  try {
    const path = new URL(url).pathname;
    return RENDER_COLLABORATION_CHAT_AUDIO_EXT_RE.test(path) || RENDER_COLLABORATION_CHAT_VIDEO_EXT_RE.test(path);
  } catch {
    return RENDER_COLLABORATION_CHAT_AUDIO_EXT_RE.test(url) || RENDER_COLLABORATION_CHAT_VIDEO_EXT_RE.test(url);
  }
}

/**
 * Creates the message text block; line breaks are kept, long words wrap, and
 * http(s) URLs become links. Image URLs also get a Discord-style preview under
 * the text; audio, video and generic file URLs stay plain links only.
 *
 * @param text Message text.
 * @returns Text element (may contain link children and image embeds).
 */
export function renderCollaborationChatText(text: string): HTMLElement {
  const body = document.createElement('div');
  body.className = 'editor-chat-text';
  body.dir = 'auto';
  body.style.cssText = `display:block;white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word;font-size:13px;line-height:18px;color:${Theme.buttonTextColor};unicode-bidi:isolate`;
  const imageUrls: string[] = [];
  let last = 0;
  const matches = text.matchAll(RENDER_COLLABORATION_CHAT_URL_RE);
  for (const match of matches) {
    const url = match[0] ?? '';
    const index = match.index ?? 0;
    if (index > last) body.append(text.slice(last, index));
    body.append(renderCollaborationChatLink(url));
    if (renderCollaborationChatUrlIsImage(url) && !imageUrls.includes(url)) imageUrls.push(url);
    last = index + url.length;
  }
  if (last < text.length) body.append(text.slice(last));
  if (body.childNodes.length === 0) body.textContent = text;
  for (const url of imageUrls) body.append(renderCollaborationChatImageLinkEmbed(url));
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
 * Builds a Discord-style image preview for a posted image URL (not audio/video).
 *
 * @param url Image URL.
 * @returns Embed element with a real visible img.
 */
function renderCollaborationChatImageLinkEmbed(url: string): HTMLElement {
  const card = document.createElement('div');
  card.className = 'editor-chat-link-embed editor-chat-file-media';
  card.style.cssText = 'display:inline-block;margin-top:6px;max-width:min(100%,320px);line-height:0';
  const frame = document.createElement('div');
  frame.className = 'editor-chat-file-media-frame';
  frame.style.cssText =
    'position:relative;display:block;overflow:hidden;border-radius:6px;line-height:0;background:rgba(0,0,0,0.3);min-width:128px;min-height:64px;max-width:min(100%,320px);max-height:320px;width:fit-content';
  const image = document.createElement('img');
  image.alt = url;
  image.src = url;
  image.draggable = true;
  image.style.cssText =
    'display:block;width:auto;height:auto;min-width:128px;min-height:64px;max-width:min(100%,320px);max-height:320px;object-fit:cover';
  image.addEventListener(
    'load',
    () => {
      const naturalW = image.naturalWidth || 128;
      const naturalH = image.naturalHeight || 64;
      const ratio = naturalW / Math.max(1, naturalH);
      let width = Math.min(320, Math.max(128, naturalW));
      let height = width / ratio;
      if (height > 320) {
        height = 320;
        width = height * ratio;
      }
      if (height < 64) {
        height = 64;
        width = Math.max(128, Math.min(320, height * ratio));
      }
      if (width < 128) {
        width = 128;
        height = Math.max(64, Math.min(320, width / ratio));
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
    },
    { once: true },
  );
  image.addEventListener(
    'error',
    () => {
      card.remove();
    },
    { once: true },
  );
  const actions = document.createElement('div');
  actions.className = 'editor-chat-file-actions';
  actions.style.cssText =
    'display:flex;gap:6px;line-height:normal;position:absolute;top:6px;right:6px;opacity:0;transition:opacity 0.12s;z-index:1';
  const open = document.createElement('a');
  open.className = 'editor-chat-file-button';
  open.href = url;
  open.target = '_blank';
  open.rel = 'noopener noreferrer';
  open.title = 'Open link';
  open.setAttribute('aria-label', 'Open link');
  open.textContent = '\u{1F517}';
  open.style.cssText =
    'cursor:pointer;padding:3px 8px;border-radius:5px;background:rgba(20,20,20,0.85);border:1px solid rgba(255,255,255,0.15);color:#f2f2f2;font-size:11px;font-weight:700;text-decoration:none;user-select:none';
  actions.append(open);
  card.addEventListener('mouseenter', () => {
    actions.style.opacity = '1';
  });
  card.addEventListener('mouseleave', () => {
    actions.style.opacity = '0';
  });
  frame.append(image, actions);
  card.append(frame);
  return card;
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
