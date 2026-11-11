import type { EntryCollaborationChat } from '@/collaboration/chat/entry_collaboration_chat.js';
import { reactionCollaborationChatCaption } from '@/collaboration/chat/reaction_collaboration_chat.js';
import { Theme } from '@/theme.js';
import { hexToRgb } from '@/utils/utils_color.js';

/**
 * Creates the reaction pills under a message: emoji and count, highlighted when
 * the own reaction is among them; a click adds or removes the own reaction.
 *
 * @param entry Message.
 * @param self Relay user id of this connection.
 * @param toggle Adds (true) or removes (false) the own reaction.
 * @returns Pill row, or null without reactions.
 */
export function renderCollaborationChatReactions(
  entry: EntryCollaborationChat,
  self: number,
  toggle: (emoji: string, on: boolean) => void,
): HTMLElement | null {
  const reactions = entry.reactions;
  if (reactions === undefined || reactions.size === 0) return null;
  const row = document.createElement('div');
  row.className = 'editor-chat-reactions';
  row.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;margin:4px 0 2px';
  for (const [emoji, users] of reactions) {
    const own = users.has(self);
    row.append(renderCollaborationChatReactionPill(emoji, users, self, () => toggle(emoji, !own)));
  }
  return row;
}

/**
 * Creates one reaction pill.
 *
 * @param emoji Emoji.
 * @param users Display names of who reacted, by relay user id.
 * @param self Relay user id of this connection.
 * @param onClick Toggles the own reaction.
 * @returns Pill button.
 */
function renderCollaborationChatReactionPill(
  emoji: string,
  users: ReadonlyMap<number, string>,
  self: number,
  onClick: () => void,
): HTMLButtonElement {
  const own = users.has(self);
  const border = own ? hexToRgb(Theme.selectionColor) : 'transparent';
  const pill = document.createElement('button');
  pill.type = 'button';
  pill.className = own ? 'editor-chat-reaction is-own' : 'editor-chat-reaction';
  pill.title = reactionCollaborationChatCaption(emoji, users, self);
  pill.setAttribute('aria-pressed', String(own));
  pill.setAttribute('aria-label', pill.title);
  pill.style.cssText = `display:inline-flex;align-items:center;gap:5px;height:24px;padding:0 8px;border-radius:8px;cursor:pointer;font-family:${Theme.uiFontFamily};border:1px solid ${border};background:${own ? `color-mix(in srgb, ${border} 18%, transparent)` : 'rgba(255,255,255,0.06)'}`;
  pill.append(...renderCollaborationChatReactionParts(emoji, users.size, own));
  pill.addEventListener('mouseenter', () => (pill.style.borderColor = own ? border : 'rgba(255,255,255,0.22)'));
  pill.addEventListener('mouseleave', () => (pill.style.borderColor = border));
  pill.addEventListener('mousedown', (event) => event.preventDefault());
  pill.addEventListener('click', onClick);
  return pill;
}

/**
 * Creates the emoji and count of a pill.
 *
 * @param emoji Emoji.
 * @param count Number of reactions.
 * @param own True when the own reaction is among them.
 * @returns Emoji and count elements.
 */
function renderCollaborationChatReactionParts(emoji: string, count: number, own: boolean): HTMLElement[] {
  const glyph = document.createElement('span');
  glyph.textContent = emoji;
  glyph.style.cssText = 'font-size:15px;line-height:18px';
  const number = document.createElement('span');
  number.className = 'editor-chat-reaction-count';
  number.textContent = String(count);
  number.style.cssText = `font-size:12px;font-weight:600;line-height:18px;color:${own ? '#ffffff' : Theme.buttonTextColor}`;
  return [glyph, number];
}
