import { describe, expect, it } from 'vitest';
import type { EntryCollaborationChat } from '@/collaboration/chat/entry_collaboration_chat.js';
import {
  REACTION_COLLABORATION_CHAT_USERS_MAXIMUM,
  ReactionCollaborationChatLimiter,
  reactionCollaborationChatApply,
  reactionCollaborationChatCaption,
  reactionCollaborationChatParse,
  type ReactionCollaborationChat,
} from '@/collaboration/chat/reaction_collaboration_chat.js';
import {
  CHAT_REACTION_EMOJIS_PER_MESSAGE_MAXIMUM,
  CHAT_REACTION_WINDOW_MS,
  CHAT_REACTIONS_PER_MEMBER_MAXIMUM,
  CHAT_REACTIONS_PER_MESSAGE_MAXIMUM,
  CHAT_REACTIONS_PER_WINDOW,
} from '@/collaboration/shared/chat_text_policy.js';
import { EMOJI_COLLABORATION_CHAT_SET } from '@/collaboration/chat/emoji_collaboration_chat.js';

/**
 * Builds a message.
 *
 * @returns Entry.
 */
function entry(): EntryCollaborationChat {
  return { id: 4, from: 2, name: 'Ann', color: 2, text: 'stairs', at: 500 };
}

/**
 * Builds a reaction.
 *
 * @param from Reacting member.
 * @param emoji Emoji.
 * @param on True to add.
 * @returns Reaction.
 */
function reaction(from: number, emoji: string, on: boolean = true): ReactionCollaborationChat {
  return { id: 4, from, emoji, on };
}

/**
 * Returns the emoji at an index of the picker set.
 *
 * @param index Index.
 * @returns Emoji.
 */
function emoji(index: number): string {
  return EMOJI_COLLABORATION_CHAT_SET[index] ?? '';
}

describe('reactionCollaborationChatParse', () => {
  it('reads a well-formed reaction', () => {
    expect(reactionCollaborationChatParse({ t: 'chat.reaction', id: 4, from: 2, emoji: '👍', on: true })).toEqual({
      id: 4,
      from: 2,
      emoji: '👍',
      on: true,
    });
  });

  it('drops malformed reactions and anything that is not one emoji', () => {
    for (const message of [
      { t: 'chat.reaction', id: -1, from: 2, emoji: '👍', on: true },
      { t: 'chat.reaction', id: 4, from: 2, emoji: '👍', on: 'yes' },
      { t: 'chat.reaction', id: 4, from: 2, emoji: 'lol', on: true },
      { t: 'chat.reaction', id: 4, from: 2, emoji: '👍👍', on: true },
      { t: 'chat.reaction', id: 4, from: 2, emoji: '<img src=x>', on: true },
      { t: 'chat', id: 4, from: 2, emoji: '👍', on: true },
    ])
      expect(reactionCollaborationChatParse(message)).toBeNull();
  });
});

describe('reactionCollaborationChatApply', () => {
  it('adds and removes reactions and reports changes only', () => {
    const message = entry();
    expect(reactionCollaborationChatApply(message, reaction(3, '👍'), 'Bob')).toBe(true);
    expect(reactionCollaborationChatApply(message, reaction(3, '👍'), 'Bob')).toBe(false);
    expect(reactionCollaborationChatApply(message, reaction(5, '👍'), 'Cat')).toBe(true);
    expect([...(message.reactions?.get('👍')?.values() ?? [])]).toEqual(['Bob', 'Cat']);
    expect(reactionCollaborationChatApply(message, reaction(3, '👍', false), 'Bob')).toBe(true);
    expect(reactionCollaborationChatApply(message, reaction(5, '👍', false), 'Cat')).toBe(true);
    expect(message.reactions?.size).toBe(0);
    expect(reactionCollaborationChatApply(message, reaction(5, '🎉', false), 'Cat')).toBe(false);
  });

  it('caps the reactions of one member', () => {
    const message = entry();
    for (let index = 0; index < CHAT_REACTIONS_PER_MEMBER_MAXIMUM; index++)
      expect(reactionCollaborationChatApply(message, reaction(3, emoji(index)), 'Bob')).toBe(true);
    expect(reactionCollaborationChatApply(message, reaction(3, emoji(30)), 'Bob')).toBe(false);
  });

  it('caps the different emoji on a message', () => {
    const message = entry();
    for (let index = 0; index < CHAT_REACTION_EMOJIS_PER_MESSAGE_MAXIMUM; index++)
      expect(reactionCollaborationChatApply(message, reaction(100 + index, emoji(index)), 'X')).toBe(true);
    expect(reactionCollaborationChatApply(message, reaction(300, emoji(40)), 'X')).toBe(false);
    expect(reactionCollaborationChatApply(message, reaction(300, emoji(0)), 'X')).toBe(true);
  });

  it('caps the reactions on a message', () => {
    const message = entry();
    for (let user = 0; user < CHAT_REACTIONS_PER_MESSAGE_MAXIMUM; user++)
      reactionCollaborationChatApply(message, reaction(user, '👍'), 'X');
    expect(reactionCollaborationChatApply(message, reaction(9999, '👍'), 'X')).toBe(false);
    expect(message.reactions?.get('👍')?.size).toBe(CHAT_REACTIONS_PER_MESSAGE_MAXIMUM);
  });
});

describe('ReactionCollaborationChatLimiter', () => {
  it('admits a burst per member per window and forgets after the window', () => {
    const limiter = new ReactionCollaborationChatLimiter();
    for (let index = 0; index < CHAT_REACTIONS_PER_WINDOW * 2; index++) expect(limiter.admit(3, 1000)).toBe(true);
    expect(limiter.admit(3, 1000)).toBe(false);
    expect(limiter.admit(4, 1000)).toBe(true);
    expect(limiter.admit(3, 1000 + CHAT_REACTION_WINDOW_MS)).toBe(true);
  });

  it('keeps a bounded number of members', () => {
    const limiter = new ReactionCollaborationChatLimiter();
    for (let user = 0; user < REACTION_COLLABORATION_CHAT_USERS_MAXIMUM * 3; user++) limiter.admit(user, 1000);
    expect(limiter.size()).toBeLessThanOrEqual(REACTION_COLLABORATION_CHAT_USERS_MAXIMUM);
  });
});

describe('reactionCollaborationChatCaption', () => {
  it('names who reacted with the own reaction last', () => {
    const users = new Map([
      [3, 'Bob'],
      [1, 'Me'],
      [5, 'Cat'],
    ]);
    expect(reactionCollaborationChatCaption('👍', users, 1)).toBe('Bob, Cat and You reacted with 👍');
    expect(reactionCollaborationChatCaption('👍', new Map([[3, 'Bob']]), 1)).toBe('Bob reacted with 👍');
  });

  it('shortens long lists', () => {
    const users = new Map(Array.from({ length: 30 }, (_, index) => [index + 10, `M${index}`] as const));
    expect(reactionCollaborationChatCaption('👍', users, 1)).toBe(
      'M0, M1, M2, M3, M4, M5, M6, M7, M8, M9 and 20 others reacted with 👍',
    );
  });
});
