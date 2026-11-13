/**
 * Public asset filename, copied next to the editor page in web and desktop
 * builds.
 */
export const SOUND_COLLABORATION_CHAT_FILE = 'chatmsg.mp3';

/** Overrides for tests and environments without Audio. */
export interface SoundCollaborationChatOptions {
  /** Absolute or relative URL of the public sound file. */
  url?: string;
  /**
   * Creates the audio element. Called only when the sound is first played or
   * warmed, never at construction.
   *
   * @param url Resolved sound URL.
   * @returns Audio element, or null when playback is unavailable.
   */
  createAudio?: (url: string) => HTMLAudioElement | null;
}

/**
 * Resolves the chat notification sound against a page base, so GitHub Pages
 * (`./`) and the desktop `views://` scheme both find the copied public file.
 *
 * @param base Page URL or directory; defaults to the document base.
 * @returns Absolute URL of {@link SOUND_COLLABORATION_CHAT_FILE}.
 */
export function soundCollaborationChatUrl(base: string = soundCollaborationChatBase()): string {
  try {
    return new URL(SOUND_COLLABORATION_CHAT_FILE, base).href;
  } catch {
    return SOUND_COLLABORATION_CHAT_FILE;
  }
}

/**
 * Incoming-chat sound loaded from a public asset. The file is not fetched,
 * decoded or turned into an Audio element until the first play or warm call.
 */
export class SoundCollaborationChat {
  private readonly url: string;
  private readonly createAudio: (url: string) => HTMLAudioElement | null;
  private audio: HTMLAudioElement | null;
  private loaded: boolean;
  private disposed: boolean;

  /** @param options Test and environment overrides. */
  constructor(options: SoundCollaborationChatOptions = {}) {
    this.url = options.url ?? soundCollaborationChatUrl();
    this.createAudio = options.createAudio ?? defaultCreateAudio;
    this.audio = null;
    this.loaded = false;
    this.disposed = false;
  }

  /**
   * Starts loading the public file and caches the element, without playing.
   * Safe to call after a user gesture so a later play is not blocked.
   */
  warm(): void {
    if (this.disposed || this.loaded) return;
    this.ensure();
  }

  /**
   * Plays the sound. Failures from autoplay limits or a missing Audio API are
   * ignored. The public file is loaded on the first call, then reused.
   */
  play(): void {
    if (this.disposed) return;
    const audio = this.ensure();
    if (audio === null) return;
    try {
      audio.currentTime = 0;
      const playing = audio.play();
      if (playing !== undefined && typeof playing.catch === 'function') {
        void playing.catch(() => undefined);
      }
    } catch {
      // Autoplay or a missing currentTime setter must not surface as an error.
    }
  }

  /** Releases the cached element. */
  dispose(): void {
    this.disposed = true;
    if (this.audio !== null) {
      try {
        this.audio.pause();
        this.audio.removeAttribute('src');
        this.audio.load();
      } catch {
        // Best-effort release.
      }
    }
    this.audio = null;
    this.loaded = false;
  }

  /**
   * Creates and caches the audio element on first use.
   *
   * @returns Audio element, or null when unavailable.
   */
  private ensure(): HTMLAudioElement | null {
    if (this.audio !== null) return this.audio;
    if (this.disposed) return null;
    this.loaded = true;
    this.audio = this.createAudio(this.url);
    return this.audio;
  }
}

/**
 * Returns the document or location base used to resolve the public sound.
 *
 * @returns Base URL.
 */
function soundCollaborationChatBase(): string {
  if (typeof document !== 'undefined' && document.baseURI) return document.baseURI;
  if (typeof location !== 'undefined' && location.href) return location.href;
  return './';
}

/**
 * Creates an HTML audio element for the public file, or null when Audio is
 * missing (some desktop shells or tests).
 *
 * @param url Resolved sound URL.
 * @returns Audio element, or null.
 */
function defaultCreateAudio(url: string): HTMLAudioElement | null {
  if (typeof Audio === 'undefined') return null;
  try {
    const audio = new Audio();
    audio.preload = 'auto';
    audio.src = url;
    return audio;
  } catch {
    return null;
  }
}
