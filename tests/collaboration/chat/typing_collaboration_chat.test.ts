import { describe, expect, it } from 'vitest';
import {
  TypingCollaborationChatSignal,
  typingCollaborationChatCaption,
} from '@/collaboration/chat/typing_collaboration_chat.js';

describe('typing_collaboration_chat', () => {
  it('formats one, two and many names', () => {
    expect(typingCollaborationChatCaption([])).toBe('');
    expect(typingCollaborationChatCaption(['Scavy'])).toBe('Scavy is typing...');
    expect(typingCollaborationChatCaption(['Henry', 'Scavy'])).toBe('Henry and Scavy are typing...');
    expect(typingCollaborationChatCaption(['A', 'B', 'C'])).toBe('Multiple people are typing...');
  });

  it('throttles typing signals and can stop', () => {
    const sent: boolean[] = [];
    let now = 1000;
    const signal = new TypingCollaborationChatSignal(
      (stop) => sent.push(stop),
      () => now,
      3000,
    );
    signal.typed();
    signal.typed();
    now += 1000;
    signal.typed();
    expect(sent).toEqual([false]);
    now += 3000;
    signal.typed();
    expect(sent).toEqual([false, false]);
    signal.stop();
    expect(sent).toEqual([false, false, true]);
    signal.stop();
    expect(sent).toEqual([false, false, true]);
  });
});
