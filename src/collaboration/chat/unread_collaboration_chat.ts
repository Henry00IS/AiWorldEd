/** Highest unread count shown before "99+". */
export const COLLABORATION_CHAT_UNREAD_SHOWN = 99;

/**
 * Formats the unread count the way the status bar badge does.
 *
 * @param count Unread messages; 0 or less hides the badge.
 * @returns Decimal digits through 99, then "99+", or an empty string when
 *   hidden.
 */
export function collaborationChatUnreadLabel(count: number): string {
  if (count <= 0) return '';
  return count > COLLABORATION_CHAT_UNREAD_SHOWN ? `${COLLABORATION_CHAT_UNREAD_SHOWN}+` : String(count);
}
