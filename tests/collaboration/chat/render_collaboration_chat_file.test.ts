import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EntryCollaborationChatFile } from '@/collaboration/chat/entry_collaboration_chat.js';
import {
  renderCollaborationChatFile,
  renderCollaborationChatFileKind,
  renderCollaborationChatFileProbe,
  renderCollaborationChatFileReason,
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
  vi.unstubAllGlobals();
});

/**
 * Makes every fetch answer a status.
 *
 * @param status HTTP status.
 * @returns Fetch mock.
 */
function fetchAnswers(status: number): ReturnType<typeof vi.fn> {
  const fetcher = vi.fn(async () => new Response(null, { status }));
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}

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
    expect(image?.getAttribute('src')).toMatch(/\/transfer\/b{43}$/);
    expect(image?.style.maxHeight).toBe('260px');
    const buttons = card.querySelectorAll<HTMLAnchorElement>('.editor-chat-file-button');
    expect(buttons.length).toBe(2);
    expect(buttons[1]?.getAttribute('href')).toMatch(/\/transfer\/b{43}\?download$/);
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

  it('names the reason of a failed download', async () => {
    expect(renderCollaborationChatFileReason(413)).toBe('This file exceeds the 100 MiB limit.');
    expect(renderCollaborationChatFileReason(404)).toContain('no longer available');
    expect(renderCollaborationChatFileReason(0)).toContain('no longer available');
    expect(renderCollaborationChatFileReason(504)).toBe('Download failed (HTTP 504).');
    const ok = vi.fn(async () => new Response(null, { status: 200 }));
    expect(await renderCollaborationChatFileProbe('https://relay.test/x', ok)).toBeNull();
    expect(ok).toHaveBeenCalledWith('https://relay.test/x', { method: 'HEAD' });
    const down = vi.fn(async () => Promise.reject(new Error('offline')));
    expect(await renderCollaborationChatFileProbe('https://relay.test/x', down)).toContain('no longer available');
  });

  it('shows the relay\u2019s reason when the media cannot be loaded', async () => {
    fetchAnswers(404);
    const shared = file('video/mp4');
    const card = renderCollaborationChatFile(shared);
    document.body.appendChild(card);
    card.querySelector('video')?.dispatchEvent(new Event('error'));
    await vi.waitFor(() => expect(document.querySelector('.editor-chat-file-failed')).not.toBeNull());
    expect(document.querySelector('.editor-chat-file-failed')?.textContent).toContain('no longer available');
    expect(renderCollaborationChatFile(shared).className).toContain('failed');
  });

  it('shows the size limit instead of an oversized image', async () => {
    fetchAnswers(413);
    const card = renderCollaborationChatFile(file('image/png', 'huge.png'));
    document.body.appendChild(card);
    card.querySelector('img')?.dispatchEvent(new Event('error'));
    await vi.waitFor(() => expect(document.querySelector('.editor-chat-file-failed')).not.toBeNull());
    expect(document.querySelector('.editor-chat-file-reason')?.textContent).toBe(
      'This file exceeds the 100 MiB limit.',
    );
  });

  it('shows the size limit in the card when a download is refused', async () => {
    const fetcher = fetchAnswers(413);
    const shared = file('application/zip', 'huge.zip');
    const card = renderCollaborationChatFile(shared);
    document.body.appendChild(card);
    const download = card.querySelectorAll<HTMLAnchorElement>('.editor-chat-file-button')[1];
    download?.addEventListener('click', (event) => event.preventDefault());
    download?.click();
    await vi.waitFor(() => expect(document.querySelector('.editor-chat-file-failed')).not.toBeNull());
    expect(fetcher).toHaveBeenCalledWith(shared.url, { method: 'HEAD' });
    expect(document.querySelector('.editor-chat-file-reason')?.textContent).toBe(
      'This file exceeds the 100 MiB limit.',
    );
  });

  it('falls back to the download box when an available preview fails', async () => {
    fetchAnswers(200);
    const shared = file('video/mp4');
    const card = renderCollaborationChatFile(shared);
    document.body.appendChild(card);
    card.querySelector('video')?.dispatchEvent(new Event('error'));
    await vi.waitFor(() => expect(document.querySelector('.editor-chat-file-box')).not.toBeNull());
    expect(renderCollaborationChatFile(shared).className).toContain('box');
  });
});
