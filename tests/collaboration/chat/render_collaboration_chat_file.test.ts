import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EntryCollaborationChatFile } from '@/collaboration/chat/entry_collaboration_chat.js';
import { saveCollaborationChatFileAs } from '@/collaboration/chat/save_collaboration_chat_file.js';
import {
  renderCollaborationChatFile,
  renderCollaborationChatFileCopy,
  renderCollaborationChatFileDownload,
  renderCollaborationChatFileKind,
  renderCollaborationChatFileProbe,
  renderCollaborationChatFileReason,
  renderCollaborationChatFileSize,
} from '@/collaboration/chat/render_collaboration_chat_file.js';
import { LightboxImage } from '@/ui/lightbox/lightbox_image.js';

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
    expect(renderCollaborationChatFileKind('audio/mpeg')).toBe('audio');
    expect(renderCollaborationChatFileKind('image/svg+xml')).toBe('file');
    expect(renderCollaborationChatFileKind('application/octet-stream')).toBe('file');
  });

  it('embeds an image inline with hover download and copy buttons', () => {
    const card = renderCollaborationChatFile(file('image/png', 'shot.png'));
    const frame = card.querySelector('.editor-chat-file-media-frame');
    const image = card.querySelector('img');
    expect(frame).not.toBeNull();
    expect(image?.getAttribute('src')).toMatch(/\/transfer\/b{43}$/);
    expect(image?.style.minWidth).toBe('128px');
    expect(image?.style.minHeight).toBe('64px');
    const actions = card.querySelector<HTMLElement>('.editor-chat-file-actions');
    expect(actions?.parentElement).toBe(frame);
    expect(actions?.dataset['chatOverlay']).toBe('1');
    expect(actions?.style.position).toBe('absolute');
    const buttons = card.querySelectorAll<HTMLAnchorElement>('.editor-chat-file-button');
    expect(buttons.length).toBe(2);
    expect(buttons[1]?.getAttribute('href')).toMatch(/\/transfer\/b{43}\?download$/);
  });

  it('anchors video hover actions to the media frame, not the outer card', () => {
    const card = renderCollaborationChatFile(file('video/webm', 'clip.webm'));
    const frame = card.querySelector('.editor-chat-file-media-frame');
    const video = card.querySelector('video');
    expect(frame).not.toBeNull();
    expect(video?.parentElement).toBe(frame);
    Object.defineProperty(video!, 'videoWidth', { configurable: true, value: 320 });
    Object.defineProperty(video!, 'videoHeight', { configurable: true, value: 180 });
    Object.defineProperty(video!, 'clientWidth', { configurable: true, value: 320 });
    Object.defineProperty(video!, 'clientHeight', { configurable: true, value: 180 });
    video?.dispatchEvent(new Event('loadedmetadata'));
    const actions = card.querySelector<HTMLElement>('.editor-chat-file-actions');
    expect(actions?.parentElement).toBe(frame);
    expect(actions?.dataset['chatOverlay']).toBe('1');
    expect(actions?.style.position).toBe('absolute');
    expect(actions?.style.top).toBe('6px');
    expect(actions?.style.right).toBe('6px');
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

  it('checks first and only shows the size limit when a download is refused', async () => {
    const fetcher = fetchAnswers(413);
    const clicks = vi.spyOn(HTMLAnchorElement.prototype, 'click');
    const shared = file('application/zip', 'huge.zip');
    const card = renderCollaborationChatFile(shared);
    document.body.appendChild(card);
    const download = card.querySelectorAll<HTMLAnchorElement>('.editor-chat-file-button')[1];
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    download?.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(download?.hasAttribute('target')).toBe(false);
    await vi.waitFor(() => expect(document.querySelector('.editor-chat-file-failed')).not.toBeNull());
    expect(fetcher).toHaveBeenCalledWith(shared.url, { method: 'HEAD' });
    expect(clicks).not.toHaveBeenCalled();
    expect(document.querySelector('.editor-chat-file-reason')?.textContent).toBe(
      'This file exceeds the 100 MiB limit.',
    );
    clicks.mockRestore();
  });

  it('starts the download in a hidden frame once the relay can serve the file', async () => {
    vi.useFakeTimers();
    const card = document.createElement('div');
    const shared = file('application/zip', 'ok.zip');
    const clicks = vi.spyOn(HTMLAnchorElement.prototype, 'click');
    await renderCollaborationChatFileDownload(card, shared, async () => new Response(null, { status: 200 }));
    const frame = document.querySelector<HTMLIFrameElement>('iframe');
    expect(frame?.hidden).toBe(true);
    expect(frame?.src).toBe(`${shared.url}?download`);
    expect(clicks).not.toHaveBeenCalled();
    vi.advanceTimersByTime(60_000);
    expect(document.querySelector('iframe')).toBeNull();
    clicks.mockRestore();
    vi.useRealTimers();
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

  it('embeds audio with a full-width player and size-row hover actions', () => {
    const card = renderCollaborationChatFile(file('audio/mpeg', 'My Song Is Great.mp3'));
    expect(card.className).toContain('box');
    const audio = card.querySelector('audio') as HTMLAudioElement | null;
    expect(audio?.controls).toBe(true);
    expect(audio?.getAttribute('style') ?? '').toContain('color-scheme');
    expect(audio?.style.width).toBe('100%');
    const name = card.querySelector<HTMLElement>('.editor-chat-file-name');
    expect(name?.style.textOverflow).toBe('ellipsis');
    expect(name?.style.minWidth).toBe('0px');
    const actions = card.querySelector<HTMLElement>('.editor-chat-file-actions');
    expect(actions?.dataset['chatOverlay']).toBe('1');
    expect(actions?.style.position).not.toBe('absolute');
    expect(actions?.parentElement?.querySelector('.editor-chat-file-size')).not.toBeNull();
    const buttons = [...card.querySelectorAll('.editor-chat-file-button')].map((b) => b.textContent);
    expect(buttons).not.toContain('COPY LINK');
    expect(buttons).not.toContain('DOWNLOAD');
    expect(buttons.length).toBe(2);
  });

  it('shows COPIED! briefly after a successful copy only', async () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('no'));
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const button = document.createElement('a');
    button.textContent = 'COPY LINK';
    await renderCollaborationChatFileCopy(button, 'https://x');
    expect(button.textContent).toBe('COPIED!');
    vi.advanceTimersByTime(1500);
    expect(button.textContent).toBe('COPY LINK');
    await renderCollaborationChatFileCopy(button, 'https://x');
    expect(button.textContent).toBe('COPY LINK');
    vi.useRealTimers();
  });

  it('streams a download to the file picked with Save as', async () => {
    const chunks: Uint8Array[] = [];
    const writable = new WritableStream<Uint8Array>({ write: (chunk) => void chunks.push(chunk) });
    const picker = vi.fn().mockResolvedValue({ createWritable: async () => writable });
    const fetcher = vi.fn().mockResolvedValue(new Response('abc'));
    expect(await saveCollaborationChatFileAs(picker, 'https://x/f', 'a.txt', fetcher)).toBeNull();
    expect(picker).toHaveBeenCalledWith({ suggestedName: 'a.txt' });
    expect(fetcher.mock.calls[0]?.[0]).toBe('https://x/f?download');
    expect(chunks.length).toBeGreaterThan(0);
    const cancelled = vi.fn().mockRejectedValue(new DOMException('abort', 'AbortError'));
    expect(await saveCollaborationChatFileAs(cancelled, 'https://x/f', 'a.txt', fetcher)).toBeNull();
    const refused = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
    expect(await saveCollaborationChatFileAs(picker, 'https://x/f', 'a.txt', refused)).toBe(404);
  });
});

describe('renderCollaborationChatFile image lightbox', () => {
  it('opens a shared image in the lightbox when clicked', () => {
    const shared = file('image/png', 'shot.png');
    const card = renderCollaborationChatFile(shared);
    document.body.append(card);
    const image = card.querySelector('img');
    expect(image?.style.cursor).toBe('zoom-in');
    image?.click();
    const lightbox = LightboxImage.active();
    expect(lightbox?.image.src).toBe(shared.url);
    expect(lightbox?.root.textContent).toContain('shot.png \u00b7 65.20 MB');
    lightbox?.close();
  });

  it('leaves videos to their own player', () => {
    const card = renderCollaborationChatFile(file('video/mp4', 'clip.mp4'));
    document.body.append(card);
    card.querySelector('video')?.click();
    expect(LightboxImage.active()).toBeNull();
  });
});
