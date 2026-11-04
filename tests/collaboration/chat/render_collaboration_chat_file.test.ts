import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EntryCollaborationChatFile } from '@/collaboration/chat/entry_collaboration_chat.js';
import {
  renderCollaborationChatFile,
  renderCollaborationChatFileKind,
  renderCollaborationChatFileSize,
} from '@/collaboration/chat/render_collaboration_chat_file.js';

/**
 * Builds a shared file.
 *
 * @param mime MIME type.
 * @param name File name.
 * @returns File.
 */
function file(mime: string, name = 'clip'): EntryCollaborationChatFile {
  return {
    link: 'b'.repeat(43),
    name,
    size: 65_200_000,
    mime,
    url: 'https://relay.test/ws/transfer/' + 'b'.repeat(43),
  };
}

afterEach(() => {
  document.body.innerHTML = '';
});

/** Chat file cards: media embeds, download boxes and the failure state. */
describe('render_collaboration_chat_file', () => {
  it('formats sizes for people', () => {
    expect(renderCollaborationChatFileSize(0)).toBe('0 B');
    expect(renderCollaborationChatFileSize(999)).toBe('999 B');
    expect(renderCollaborationChatFileSize(1500)).toBe('1.50 KB');
    expect(renderCollaborationChatFileSize(65_200_000)).toBe('65.20 MB');
    expect(renderCollaborationChatFileSize(2_000_000_000)).toBe('2.00 GB');
  });

  it('embeds images and videos but never SVG', () => {
    expect(renderCollaborationChatFileKind('image/png')).toBe('image');
    expect(renderCollaborationChatFileKind('video/mp4')).toBe('video');
    expect(renderCollaborationChatFileKind('image/svg+xml')).toBe('file');
    expect(renderCollaborationChatFileKind('application/octet-stream')).toBe('file');
  });

  it('embeds an image inline with hover download and copy buttons', () => {
    const card = renderCollaborationChatFile(file('image/png', 'shot.png'));
    const image = card.querySelector('img');
    expect(image?.getAttribute('src')).toMatch(/\/transfer\/b{43}\?inline$/);
    expect(image?.style.maxHeight).toBe('260px');
    const buttons = card.querySelectorAll<HTMLAnchorElement>('.editor-chat-file-button');
    expect(buttons.length).toBe(2);
    expect(buttons[1]?.getAttribute('href')).toMatch(/\/transfer\/b{43}$/);
  });

  it('shows other files as a box with name, size, copy link and download', () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const shared = file('application/zip', '<b>\u00fcbung</b>.zip');
    const card = renderCollaborationChatFile(shared);
    expect(card.querySelector('.editor-chat-file-name')?.textContent).toBe('<b>\u00fcbung</b>.zip');
    expect(card.querySelector('b')).toBeNull();
    expect(card.querySelector('.editor-chat-file-size')?.textContent).toBe('65.20 MB');
    const [copy, download] = Array.from(card.querySelectorAll<HTMLAnchorElement>('.editor-chat-file-button'));
    expect(copy?.textContent).toBe('COPY LINK');
    expect(download?.textContent).toBe('DOWNLOAD');
    copy?.click();
    expect(writeText).toHaveBeenCalledWith(shared.url);
    expect(renderCollaborationChatFile(shared)).toBe(card);
  });

  it('shows a failure state when the media cannot be loaded', () => {
    const shared = file('video/mp4');
    const card = renderCollaborationChatFile(shared);
    document.body.appendChild(card);
    card.querySelector('video')?.dispatchEvent(new Event('error'));
    expect(document.querySelector('.editor-chat-file-failed')?.textContent).toContain('no longer available');
    expect(renderCollaborationChatFile(shared).className).toContain('failed');
  });
});
