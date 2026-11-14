import { describe, expect, it } from 'vitest';
import {
  COLLABORATION_CHAT_UNREAD_SHOWN,
  collaborationChatUnreadLabel,
} from '@/collaboration/chat/unread_collaboration_chat.js';

describe('collaborationChatUnreadLabel', () => {
  it('hides a zero or negative count', () => {
    expect(collaborationChatUnreadLabel(0)).toBe('');
    expect(collaborationChatUnreadLabel(-1)).toBe('');
  });

  it('shows counts through 99, then 99+', () => {
    expect(collaborationChatUnreadLabel(1)).toBe('1');
    expect(collaborationChatUnreadLabel(9)).toBe('9');
    expect(collaborationChatUnreadLabel(23)).toBe('23');
    expect(collaborationChatUnreadLabel(COLLABORATION_CHAT_UNREAD_SHOWN)).toBe('99');
    expect(collaborationChatUnreadLabel(COLLABORATION_CHAT_UNREAD_SHOWN + 1)).toBe('99+');
  });
});
