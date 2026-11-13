import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SOUND_COLLABORATION_CHAT_FILE,
  SoundCollaborationChat,
  soundCollaborationChatUrl,
} from '@/collaboration/chat/sound_collaboration_chat.js';

/**
 * Vite's production inline ceiling; public files are copied and must stay out
 * of it.
 */
const ASSETS_INLINE_LIMIT = 100_000;

afterEach(() => {
  vi.restoreAllMocks();
});

describe('soundCollaborationChatUrl', () => {
  it('resolves next to a GitHub Pages editor page with a relative base', () => {
    expect(soundCollaborationChatUrl('https://example.test/AiWorldEd/')).toBe(
      `https://example.test/AiWorldEd/${SOUND_COLLABORATION_CHAT_FILE}`,
    );
    expect(soundCollaborationChatUrl('https://example.test/AiWorldEd/index.html')).toBe(
      `https://example.test/AiWorldEd/${SOUND_COLLABORATION_CHAT_FILE}`,
    );
  });

  it('resolves next to the desktop main_ui view', () => {
    expect(soundCollaborationChatUrl('views://main_ui/index.html')).toBe(
      `views://main_ui/${SOUND_COLLABORATION_CHAT_FILE}`,
    );
  });
});

describe('SoundCollaborationChat', () => {
  it('does not create or fetch audio when constructed', () => {
    const createAudio = vi.fn();
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const sound = new SoundCollaborationChat({ createAudio, url: 'https://example.test/chatmsg.mp3' });
    expect(createAudio).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    sound.dispose();
  });

  it('loads once on play, reuses the element, and ignores autoplay refusal', async () => {
    const play = vi.fn(() => Promise.reject(new Error('NotAllowedError')));
    const audio = { play, pause: vi.fn(), currentTime: 1, src: '', preload: '' } as unknown as HTMLAudioElement;
    const createAudio = vi.fn(() => audio);
    const sound = new SoundCollaborationChat({ createAudio, url: 'https://example.test/chatmsg.mp3' });
    sound.play();
    sound.play();
    expect(createAudio).toHaveBeenCalledTimes(1);
    expect(createAudio).toHaveBeenCalledWith('https://example.test/chatmsg.mp3');
    expect(play).toHaveBeenCalledTimes(2);
    expect(audio.currentTime).toBe(0);
    await Promise.resolve();
    sound.dispose();
  });

  it('warms the cached element without playing', () => {
    const play = vi.fn();
    const audio = { play, pause: vi.fn(), currentTime: 0 } as unknown as HTMLAudioElement;
    const createAudio = vi.fn(() => audio);
    const sound = new SoundCollaborationChat({ createAudio });
    sound.warm();
    expect(createAudio).toHaveBeenCalledTimes(1);
    expect(play).not.toHaveBeenCalled();
    sound.play();
    expect(createAudio).toHaveBeenCalledTimes(1);
    expect(play).toHaveBeenCalledTimes(1);
    sound.dispose();
  });

  it('is a no-op when audio cannot be created', () => {
    const sound = new SoundCollaborationChat({ createAudio: () => null });
    expect(() => {
      sound.warm();
      sound.play();
      sound.dispose();
    }).not.toThrow();
  });
});

describe('chat sound public asset', () => {
  it('keeps the notification sound as a public file, not a source import', () => {
    const path = resolve(process.cwd(), 'public', SOUND_COLLABORATION_CHAT_FILE);
    expect(existsSync(path)).toBe(true);
    expect(statSync(path).size).toBeGreaterThan(0);
    expect(statSync(path).size).toBeLessThan(ASSETS_INLINE_LIMIT);
    const source = readFileSync(resolve(process.cwd(), 'src/collaboration/chat/sound_collaboration_chat.ts'), 'utf8');
    expect(source).not.toMatch(/\?url/);
    expect(source).not.toMatch(/data:/);
    expect(source).toContain(`'${SOUND_COLLABORATION_CHAT_FILE}'`);
  });
});
