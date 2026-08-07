import click001Url from '@/audio/raw/click001.wav?url';

/**
 * Loads, decodes, and caches the embedded click001.wav sample as an
 * AudioBuffer.
 */
export class AudioSampleClick001 {
  private readonly sampleUrl: string;
  private decodedBuffer: AudioBuffer | null;
  private decodePromise: Promise<AudioBuffer> | null;
  private decodeContext: AudioContext | null;

  /**
   * Creates a sample loader for the embedded click WAV.
   *
   * @param sampleUrl Optional override URL (tests / alternate assets).
   */
  constructor(sampleUrl: string = click001Url) {
    this.sampleUrl = sampleUrl;
    this.decodedBuffer = null;
    this.decodePromise = null;
    this.decodeContext = null;
  }

  /**
   * Returns the sample URL held by this loader.
   *
   * @returns Asset URL string.
   */
  getSampleUrl(): string {
    return this.sampleUrl;
  }

  /**
   * Decodes the embedded WAV for the given context, caching the AudioBuffer.
   *
   * @param context Live audio context used for decodeAudioData.
   * @returns Decoded mono/stereo buffer, or null when decode is unavailable.
   */
  async getDecodedBuffer(context: AudioContext): Promise<AudioBuffer | null> {
    if (this.decodedBuffer && this.decodeContext === context) {
      return this.decodedBuffer;
    }
    if (this.decodePromise && this.decodeContext === context) {
      return this.decodePromise;
    }
    this.decodeContext = context;
    this.decodedBuffer = null;
    this.decodePromise = this.decodeSample(context);
    try {
      this.decodedBuffer = await this.decodePromise;
      return this.decodedBuffer;
    } catch {
      this.decodePromise = null;
      return null;
    }
  }

  /**
   * Returns a cached buffer when already decoded for this context.
   *
   * @param context Live audio context.
   * @returns Cached buffer, or null when not ready.
   */
  getCachedBuffer(context: AudioContext): AudioBuffer | null {
    if (this.decodeContext !== context) {
      return null;
    }
    return this.decodedBuffer;
  }

  /**
   * Fetches sample bytes and decodes them into an AudioBuffer.
   *
   * @param context Live audio context.
   * @returns Decoded buffer.
   */
  private async decodeSample(context: AudioContext): Promise<AudioBuffer> {
    const bytes = await loadSampleBytes(this.sampleUrl);
    const copy = bytes.slice(0);
    return context.decodeAudioData(copy);
  }
}

/**
 * Loads WAV bytes from a data URL or network/file URL.
 *
 * @param sampleUrl Asset URL from Vite.
 * @returns ArrayBuffer of the WAV file.
 */
async function loadSampleBytes(sampleUrl: string): Promise<ArrayBuffer> {
  if (sampleUrl.startsWith('data:')) {
    return decodeDataUrlToArrayBuffer(sampleUrl);
  }
  const response = await fetch(sampleUrl);
  if (!response.ok) {
    throw new Error(`Failed to load click sample: ${response.status}`);
  }
  return response.arrayBuffer();
}

/**
 * Decodes a data URL into an ArrayBuffer without fetch (works in all contexts).
 *
 * @param dataUrl Data:audio/wav;base64,... URL.
 * @returns Decoded bytes.
 */
function decodeDataUrlToArrayBuffer(dataUrl: string): ArrayBuffer {
  const commaIndex = dataUrl.indexOf(',');
  if (commaIndex < 0) {
    throw new Error('Invalid data URL for click sample');
  }
  const base64 = dataUrl.slice(commaIndex + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

/** Shared AudioSampleClick001 instance for the embedded click001 sample. */
export const audioSampleClick001 = new AudioSampleClick001();
