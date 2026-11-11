import { describe, expect, it } from 'vitest';
import type { EntryCollaborationChatFile } from '@/collaboration/chat/entry_collaboration_chat.js';
import {
  renderCollaborationChatLevel,
  renderCollaborationChatLevelThumbnailUrl,
} from '@/collaboration/chat/render_collaboration_chat_level.js';

/**
 * Returns a shared .aiworld file.
 *
 * @returns Chat file.
 */
function shared(): EntryCollaborationChatFile {
  return {
    link: 'lvl123',
    name: 'Start.aiworld',
    size: 4096,
    mime: 'application/x-aiworld',
    url: 'http://relay/t/lvl123',
  };
}

describe('chat level card', () => {
  it('shows a preview image from the thumbnail URL and hover actions', () => {
    const file = shared();
    const card = renderCollaborationChatLevel(file);
    expect(renderCollaborationChatLevel(file)).toBe(card);
    expect(card.classList.contains('editor-chat-file-level')).toBe(true);
    const image = card.querySelector('img');
    expect(image?.src).toBe('http://relay/t/lvl123?thumbnail');
    expect(image?.alt).toBe('Preview of Start.aiworld');
    expect(card.querySelector('[aria-label="Copy link"]')).not.toBeNull();
    expect(card.querySelector('[aria-label="Download"]')).not.toBeNull();
  });

  it('falls back to the plain file card when the preview cannot be loaded', () => {
    const parent = document.createElement('div');
    const card = renderCollaborationChatLevel({ ...shared(), link: 'bad' });
    parent.append(card);
    card.querySelector('img')?.dispatchEvent(new Event('error'));
    expect(parent.querySelector('.editor-chat-file-level')).toBeNull();
    expect(parent.querySelector('.editor-chat-file')).not.toBeNull();
  });

  it('appends the thumbnail query without breaking an existing query string', () => {
    expect(renderCollaborationChatLevelThumbnailUrl('http://relay/t/a')).toBe('http://relay/t/a?thumbnail');
    expect(renderCollaborationChatLevelThumbnailUrl('http://relay/t/a?raw=1')).toBe('http://relay/t/a?raw=1&thumbnail');
  });
});
