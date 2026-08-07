/** Optional Web Audio context factory for tests. */
export type AudioContextFactory = () => AudioContext | null;

/**
 * Owns the shared editor AudioContext lifecycle: create, unlock, resume, and a
 * near-silent keep-alive so Chrome is less likely to auto-suspend after idle.
 */
export class AudioContextHost {
  private context: AudioContext | null;
  private readonly contextFactory: AudioContextFactory;
  private resumeInFlight: Promise<void> | null;
  private keepAliveSource: AudioScheduledSourceNode | null;
  private keepAliveGain: GainNode | null;
  private hasUnlockedOnce: boolean;

  /**
   * Creates a context host.
   *
   * @param contextFactory Optional factory used instead of the browser default.
   */
  constructor(contextFactory: AudioContextFactory = createDefaultAudioContext) {
    this.context = null;
    this.contextFactory = contextFactory;
    this.resumeInFlight = null;
    this.keepAliveSource = null;
    this.keepAliveGain = null;
    this.hasUnlockedOnce = false;
  }

  /**
   * Ensures the audio context exists and is running. Call from a user gesture
   * so later RAF playback is unlocked.
   */
  unlock(): void {
    const context = this.ensureContext();
    if (!context) {
      return;
    }
    this.hasUnlockedOnce = true;
    void this.resumeContext(context);
  }

  /**
   * Returns whether the context exists and is currently running.
   *
   * @returns True when the context exists and its state is running.
   */
  isRunning(): boolean {
    return this.context !== null && this.context.state === 'running';
  }

  /**
   * Returns the shared context, creating it on first use.
   *
   * @returns Live AudioContext or null when unavailable.
   */
  ensureContext(): AudioContext | null {
    if (this.context) {
      return this.context;
    }
    this.context = this.contextFactory();
    if (this.context) {
      this.bindStateChangeResume(this.context);
    }
    return this.context;
  }

  /**
   * Resumes a suspended context so playback is audible after a user gesture.
   *
   * @param context Audio context to resume.
   * @returns Promise that settles when resume finishes or is unnecessary.
   */
  resumeContext(context: AudioContext): Promise<void> {
    if (context.state === 'running') {
      this.ensureSilentKeepAlive(context);
      return Promise.resolve();
    }
    if (this.resumeInFlight) {
      return this.resumeInFlight;
    }
    this.resumeInFlight = context
      .resume()
      .then(() => {
        this.ensureSilentKeepAlive(context);
      })
      .catch(() => undefined)
      .finally(() => {
        this.resumeInFlight = null;
      });
    return this.resumeInFlight;
  }

  /**
   * Starts a near-silent keep-alive source. Chrome treats pure digital silence
   * (gain 0) as idle and may suspend; a tiny DC offset keeps the graph "live".
   *
   * @param context Live audio context.
   */
  private ensureSilentKeepAlive(context: AudioContext): void {
    if (context.state !== 'running') {
      return;
    }
    if (this.keepAliveSource && this.keepAliveGain) {
      return;
    }
    this.clearKeepAliveNodes();
    const gain = this.createKeepAliveGain(context);
    if (!gain) {
      return;
    }
    const source = this.createKeepAliveSource(context);
    if (!source) {
      return;
    }
    source.connect(gain);
    gain.connect(context.destination);
    try {
      source.start();
    } catch {
      return;
    }
    this.keepAliveSource = source;
    this.keepAliveGain = gain;
  }

  /**
   * Creates a gain node with a near-silent gain value.
   *
   * @param context Live audio context.
   * @returns Gain node or null when createGain is unavailable.
   */
  private createKeepAliveGain(context: AudioContext): GainNode | null {
    if (typeof context.createGain !== 'function') {
      return null;
    }
    const gain = context.createGain();
    gain.gain.value = 0.00001;
    return gain;
  }

  /**
   * Creates a ConstantSource when available, otherwise a low-frequency
   * oscillator.
   *
   * @param context Live audio context.
   * @returns Source node or null when neither factory is available.
   */
  private createKeepAliveSource(context: AudioContext): AudioScheduledSourceNode | null {
    const withConstant = context as AudioContext & {
      createConstantSource?: () => ConstantSourceNode;
    };
    if (typeof withConstant.createConstantSource === 'function') {
      const constant = withConstant.createConstantSource();
      constant.offset.value = 1;
      return constant;
    }
    if (typeof context.createOscillator !== 'function') {
      return null;
    }
    const oscillator = context.createOscillator();
    oscillator.frequency.value = 20;
    return oscillator;
  }

  /** Drops keep-alive node references after suspend so resume can rebuild them. */
  private clearKeepAliveNodes(): void {
    this.keepAliveSource = null;
    this.keepAliveGain = null;
  }

  /**
   * Re-resumes after auto-suspend once the user has unlocked audio at least
   * once.
   *
   * @param context Live audio context.
   */
  private bindStateChangeResume(context: AudioContext): void {
    if (typeof context.addEventListener !== 'function') {
      return;
    }
    context.addEventListener('statechange', () => {
      if (context.state === 'suspended') {
        this.clearKeepAliveNodes();
        if (this.hasUnlockedOnce) {
          void this.resumeContext(context);
        }
      }
    });
  }
}

/**
 * Creates a browser AudioContext when the API exists.
 *
 * @returns New context or null in headless environments.
 */
function createDefaultAudioContext(): AudioContext | null {
  const globalScope = globalThis as typeof globalThis & {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  const ContextCtor = globalScope.AudioContext ?? globalScope.webkitAudioContext;
  if (!ContextCtor) {
    return null;
  }
  try {
    return new ContextCtor();
  } catch {
    return null;
  }
}

/** Shared audio context host for editor sounds and effects. */
export const audioContextHost = new AudioContextHost();
