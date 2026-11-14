/** No input for this long counts as idle. */
export const USER_IDLE_MS = 30 * 1000;

/** Input that ends idleness (hover and focus changes included). */
const USER_IDLE_EVENTS = [
  'pointermove',
  'pointerdown',
  'wheel',
  'keydown',
  'focusin',
  'dragstart',
  'dragover',
  'touchstart',
  'touchmove',
] as const;

/** What a background job needs from an idle detector. */
export interface UserIdleWatch {
  /**
   * Tells whether the user is idle now.
   *
   * @returns True after {@link USER_IDLE_MS} without input, or while the page is
   *   hidden.
   */
  idle(): boolean;
  /**
   * Waits until the user is idle.
   *
   * @param signal Stops waiting (the promise then rejects with the signal's
   *   reason).
   * @returns Resolves once idle.
   */
  idleWait(signal?: AbortSignal): Promise<void>;
}

/** Overrides for tests. */
export interface UserIdleOptions {
  /** Where input is listened for. */
  target?: EventTarget;
  /** Whether the page is hidden. */
  hidden?: () => boolean;
  /** Quiet time that counts as idle. */
  idleMs?: number;
  /** Clock in milliseconds. */
  now?: () => number;
}

/**
 * Tells background jobs whether the user is idle: no input for
 * {@link USER_IDLE_MS}, or the page is hidden (a background tab). Input is
 * listened for passively in the capture phase on the window and only updates a
 * timestamp, so it costs nothing while the user works. A job checks {@link idle}
 * between its slices and calls {@link idleWait} to pause, keeping its progress.
 */
export class UserIdle implements UserIdleWatch {
  private last: number;
  private readonly target: EventTarget | null;
  private readonly hidden: () => boolean;
  private readonly idleMs: number;
  private readonly now: () => number;
  private readonly listeners: Set<() => void>;
  private readonly onInput = () => {
    this.last = this.now();
    for (const listener of this.listeners) listener();
  };

  /**
   * Starts listening.
   *
   * @param options Test overrides.
   */
  constructor(options: UserIdleOptions = {}) {
    this.target = options.target ?? (typeof window === 'undefined' ? null : window);
    this.hidden = options.hidden ?? (() => typeof document !== 'undefined' && document.hidden);
    this.idleMs = options.idleMs ?? USER_IDLE_MS;
    this.now = options.now ?? Date.now;
    this.listeners = new Set();
    this.last = this.now();
    for (const type of USER_IDLE_EVENTS)
      this.target?.addEventListener(type, this.onInput, { capture: true, passive: true });
  }

  /**
   * Calls the listener on each input event that ends idleness.
   *
   * @param listener Called after the idle timestamp is updated.
   * @returns Function that unsubscribes the listener.
   */
  activitySubscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** @inheritdoc */
  idle(): boolean {
    return this.hidden() || this.now() - this.last >= this.idleMs;
  }

  /** @inheritdoc */
  async idleWait(signal?: AbortSignal): Promise<void> {
    while (!this.idle()) {
      signal?.throwIfAborted();
      const remaining = Math.max(50, this.idleMs - (this.now() - this.last));
      await new Promise<void>((resolve, reject) => {
        const page = typeof document === 'undefined' ? null : document;
        const finish = (error?: unknown) => {
          clearTimeout(timer);
          signal?.removeEventListener('abort', aborted);
          page?.removeEventListener('visibilitychange', shown);
          if (error === undefined) resolve();
          else reject(error);
        };
        const timer = setTimeout(() => finish(), remaining);
        const aborted = () => finish(signal?.reason ?? new Error('aborted'));
        // A tab going to the background counts as idle right away.
        const shown = () => finish();
        signal?.addEventListener('abort', aborted);
        page?.addEventListener('visibilitychange', shown);
      });
    }
    signal?.throwIfAborted();
  }

  /** Stops listening. */
  dispose(): void {
    this.listeners.clear();
    for (const type of USER_IDLE_EVENTS) this.target?.removeEventListener(type, this.onInput, { capture: true });
  }
}

let userIdleShared: UserIdle | null = null;

/**
 * Returns the idle detector shared by background jobs of this window.
 *
 * @returns Detector.
 */
export function userIdle(): UserIdle {
  userIdleShared ??= new UserIdle();
  return userIdleShared;
}
