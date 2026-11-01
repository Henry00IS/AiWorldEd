import type { EntryCollaborationChat } from '@/collaboration/chat/entry_collaboration_chat.js';
import { memberCollaborationColor, memberCollaborationCss } from '@/collaboration/sync/member_collaboration_roster.js';
import { Theme } from '@/theme.js';

/** Avatar circle size in pixels. */
export const RENDER_COLLABORATION_CHAT_AVATAR_PX = 32;
/** Left indent of message text, past the avatar. */
const RENDER_COLLABORATION_CHAT_INDENT_PX = RENDER_COLLABORATION_CHAT_AVATAR_PX + 12;

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
 * Creates the message text block; line breaks are kept and long words wrap.
 *
 * @param text Message text.
 * @returns Text element.
 */
export function renderCollaborationChatText(text: string): HTMLElement {
  const body = renderCollaborationChatPlain(text, 'editor-chat-text');
  body.style.cssText += `;display:block;white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word;font-size:13px;line-height:18px;color:${Theme.buttonTextColor}`;
  return body;
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
  row.append(renderCollaborationChatText(entry.text));
  row.addEventListener('mouseenter', () => (row.style.background = 'rgba(255,255,255,0.035)'));
  row.addEventListener('mouseleave', () => (row.style.background = ''));
  return row;
}
