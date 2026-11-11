import { describe, expect, it } from 'vitest';
import { jumboCollaborationChatIs } from '@/collaboration/chat/jumbo_collaboration_chat.js';

describe('jumboCollaborationChatIs', () => {
  it('accepts one to three emoji', () => {
    expect(jumboCollaborationChatIs('\u{1F600}')).toBe(true);
    expect(jumboCollaborationChatIs('\u{1F600}\u{1F44D}')).toBe(true);
    expect(jumboCollaborationChatIs('\u{1F600}\u{1F44D}\u{1F525}')).toBe(true);
  });

  it('accepts up to two spaces between them', () => {
    expect(jumboCollaborationChatIs('\u{1F600} \u{1F44D} \u{1F525}')).toBe(true);
    expect(jumboCollaborationChatIs('\u{1F600}  \u{1F44D}')).toBe(true);
    expect(jumboCollaborationChatIs('\u{1F600}   \u{1F44D}')).toBe(false);
  });

  it('refuses four or more emoji', () => {
    expect(jumboCollaborationChatIs('\u{1F600}\u{1F600}\u{1F600}\u{1F600}')).toBe(false);
  });

  it('refuses any text beside the emoji', () => {
    expect(jumboCollaborationChatIs('hi \u{1F600}')).toBe(false);
    expect(jumboCollaborationChatIs('\u{1F600}!')).toBe(false);
    expect(jumboCollaborationChatIs('1')).toBe(false);
    expect(jumboCollaborationChatIs('#')).toBe(false);
    expect(jumboCollaborationChatIs('\u00a9')).toBe(false);
  });

  it('refuses empty text, only spaces and line breaks', () => {
    expect(jumboCollaborationChatIs('')).toBe(false);
    expect(jumboCollaborationChatIs('  ')).toBe(false);
    expect(jumboCollaborationChatIs('\u{1F600}\n\u{1F600}')).toBe(false);
    expect(jumboCollaborationChatIs('\u{1F600}\t\u{1F600}')).toBe(false);
  });

  it('counts a composed emoji as one', () => {
    const family = '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}';
    const thumbsToned = '\u{1F44D}\u{1F3FD}';
    const flag = '\u{1F1E9}\u{1F1EA}';
    const keycap = '1\uFE0F\u20E3';
    const heart = '\u2764\uFE0F';
    expect(jumboCollaborationChatIs(`${family}${thumbsToned}${flag}`)).toBe(true);
    expect(jumboCollaborationChatIs(`${keycap} ${heart}`)).toBe(true);
    expect(jumboCollaborationChatIs(`${family}${thumbsToned}${flag}${heart}`)).toBe(false);
  });
});
