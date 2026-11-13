import type { EntryCollaborationChat } from '@/collaboration/chat/entry_collaboration_chat.js';
import {
  RENDER_COLLABORATION_CHAT_AVATAR_PX,
  renderCollaborationChatTime,
  renderCollaborationChatTimeFull,
} from '@/collaboration/chat/render_collaboration_chat.js';
import { Theme } from '@/theme.js';

/** Color of a presence line's name, a little brighter than its sentence. */
const RENDER_COLLABORATION_CHAT_PRESENCE_NAME_COLOR = '#b4b4b4';

/**
 * Creates the gray line saying a member joined or left: an arrow where avatars
 * sit, the sentence with the member's name, and the time.
 *
 * @param entry Presence line.
 * @param now Current time (epoch ms).
 * @returns Row element.
 */
export function renderCollaborationChatPresenceRow(entry: EntryCollaborationChat, now: number): HTMLElement {
  const row = document.createElement('div');
  row.className = `editor-chat-row editor-chat-row-presence editor-chat-row-presence-${entry.presence ?? 'joined'}`;
  row.dataset['chatPresence'] = entry.presence ?? 'joined';
  row.title = renderCollaborationChatTimeFull(entry.at);
  row.style.cssText = `position:relative;display:flex;align-items:baseline;gap:8px;padding:3px 12px 3px ${RENDER_COLLABORATION_CHAT_AVATAR_PX + 24}px;margin-top:6px;font-size:13px;line-height:18px;color:${Theme.statusBarTextColor}`;
  row.append(
    renderCollaborationChatPresenceArrow(entry.presence === 'left'),
    renderCollaborationChatPresenceSentence(entry),
    renderCollaborationChatPresenceTime(entry.at, now),
  );
  return row;
}

/**
 * Creates the arrow in the avatar column: into the room for joined, out of it
 * for left.
 *
 * @param left True for a member who left.
 * @returns Arrow element.
 */
function renderCollaborationChatPresenceArrow(left: boolean): HTMLElement {
  const arrow = document.createElement('span');
  arrow.className = 'editor-chat-presence-arrow';
  arrow.setAttribute('aria-hidden', 'true');
  arrow.textContent = left ? '\u2190' : '\u2192';
  arrow.style.cssText = `position:absolute;left:12px;top:3px;width:${RENDER_COLLABORATION_CHAT_AVATAR_PX}px;text-align:center;font-size:15px;line-height:18px;color:${Theme.statusBarTextColor}`;
  return arrow;
}

/**
 * Creates the sentence; the name is plain text and never parsed as markup.
 *
 * @param entry Presence line.
 * @returns Sentence element.
 */
function renderCollaborationChatPresenceSentence(entry: EntryCollaborationChat): HTMLElement {
  const sentence = document.createElement('span');
  sentence.className = 'editor-chat-presence-text';
  sentence.style.cssText = 'min-width:0;overflow-wrap:anywhere';
  const name = document.createElement('span');
  name.className = 'editor-chat-presence-name';
  name.dir = 'auto';
  name.textContent = entry.name;
  name.style.cssText = `font-weight:600;color:${RENDER_COLLABORATION_CHAT_PRESENCE_NAME_COLOR};unicode-bidi:isolate`;
  sentence.append(name, entry.text.slice(entry.name.length));
  return sentence;
}

/**
 * Creates the time after the sentence.
 *
 * @param at Time the change was seen (epoch ms).
 * @param now Current time (epoch ms).
 * @returns Time element.
 */
function renderCollaborationChatPresenceTime(at: number, now: number): HTMLElement {
  const time = document.createElement('time');
  time.className = 'editor-chat-time';
  time.dateTime = new Date(at).toISOString();
  time.textContent = renderCollaborationChatTime(at, now);
  time.style.cssText = `flex:0 0 auto;font-size:11px;color:${Theme.statusBarTextColor}`;
  return time;
}
