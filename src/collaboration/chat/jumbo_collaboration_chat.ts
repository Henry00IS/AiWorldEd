import { renderCollaborationChatGraphemes } from '@/collaboration/chat/render_collaboration_chat.js';

/** Most emoji a message may have to be shown large. */
export const JUMBO_COLLABORATION_CHAT_EMOJI_MAXIMUM = 3;
/** Most spaces a message may have to be shown large. */
export const JUMBO_COLLABORATION_CHAT_SPACES_MAXIMUM = 2;

/** Matches a flag made of two regional indicator letters. */
const JUMBO_COLLABORATION_CHAT_FLAG_RE = /^\p{Regional_Indicator}{2}$/u;
/** Matches a keycap such as 1️⃣. */
const JUMBO_COLLABORATION_CHAT_KEYCAP_RE = /^[0-9#*]\uFE0F?\u20E3$/u;
/** Matches a pictograph. */
const JUMBO_COLLABORATION_CHAT_PICTOGRAPH_RE = /\p{Extended_Pictographic}/u;
/** Matches what makes a pictograph show as an emoji rather than as text. */
const JUMBO_COLLABORATION_CHAT_PRESENTATION_RE = /\p{Emoji_Presentation}|\uFE0F|\p{Emoji_Modifier}|\u200D/u;

/**
 * Returns whether one user-perceived character is an emoji.
 *
 * @param grapheme One grapheme.
 * @returns True for an emoji.
 */
export function jumboCollaborationChatEmojiIs(grapheme: string): boolean {
  if (JUMBO_COLLABORATION_CHAT_FLAG_RE.test(grapheme) || JUMBO_COLLABORATION_CHAT_KEYCAP_RE.test(grapheme)) return true;
  return (
    JUMBO_COLLABORATION_CHAT_PICTOGRAPH_RE.test(grapheme) && JUMBO_COLLABORATION_CHAT_PRESENTATION_RE.test(grapheme)
  );
}

/**
 * Returns whether a message is shown in large type: it holds only one to three
 * emoji and at most two spaces.
 *
 * @param text Message text.
 * @returns True for an emoji-only message.
 */
export function jumboCollaborationChatIs(text: string): boolean {
  const graphemes = renderCollaborationChatGraphemes(text);
  const spaces = graphemes.filter((grapheme) => grapheme === ' ').length;
  const emoji = graphemes.filter((grapheme) => grapheme !== ' ');
  if (spaces > JUMBO_COLLABORATION_CHAT_SPACES_MAXIMUM || emoji.length === 0) return false;
  return emoji.length <= JUMBO_COLLABORATION_CHAT_EMOJI_MAXIMUM && emoji.every(jumboCollaborationChatEmojiIs);
}
