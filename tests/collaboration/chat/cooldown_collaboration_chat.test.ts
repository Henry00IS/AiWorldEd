import { describe, expect, it } from 'vitest';
import { CooldownCollaborationChat } from '@/collaboration/chat/cooldown_collaboration_chat.js';

/** Client side of the relay's one message per interval rule. */
describe('cooldown_collaboration_chat', () => {
  it('blocks while sending and for the interval after acceptance', () => {
    const cooldown = new CooldownCollaborationChat(5000);
    expect(cooldown.ready(0)).toBe(true);
    cooldown.started();
    expect(cooldown.ready(0)).toBe(false);
    expect(cooldown.sending()).toBe(true);
    cooldown.accepted(1000);
    expect(cooldown.sending()).toBe(false);
    expect(cooldown.remaining(1000)).toBe(5000);
    expect(cooldown.ready(5999)).toBe(false);
    expect(cooldown.ready(6000)).toBe(true);
  });

  it('waits for the relay retry time, capped, after a rate limit', () => {
    const cooldown = new CooldownCollaborationChat(5000);
    cooldown.started();
    cooldown.limited(0, 1200);
    expect(cooldown.remaining(0)).toBe(1200);
    cooldown.limited(0, 'soon');
    expect(cooldown.remaining(0)).toBe(5000);
    cooldown.limited(0, 10 * 60 * 1000);
    expect(cooldown.remaining(0)).toBe(60000);
  });

  it('adds no wait after other failures and forgets on reset', () => {
    const cooldown = new CooldownCollaborationChat(5000);
    cooldown.started();
    cooldown.failed();
    expect(cooldown.ready(0)).toBe(true);
    cooldown.accepted(0);
    cooldown.reset();
    expect(cooldown.ready(0)).toBe(true);
  });
});
