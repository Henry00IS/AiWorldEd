/** How often the client may send a typing signal while keys are pressed. */
export const TYPING_COLLABORATION_CHAT_THROTTLE_MS = 3000;

/**
 * Builds the chat status-bar typing caption from resolved member names.
 *
 * @param names Display names of members currently typing (already resolved).
 * @returns Caption, or empty when nobody is typing.
 */
export function typingCollaborationChatCaption(names: readonly string[]): string {
  if (names.length === 0) return '';
  if (names.length >= 3) return 'Multiple people are typing...';
  if (names.length === 1) return `${names[0]} is typing...`;
  return `${names[0]} and ${names[1]} are typing...`;
}

/**
 * Client-side typing signal throttle: sends at most once per throttle window
 * while typing, and can emit an optional stop.
 */
export class TypingCollaborationChatSignal {
  private readonly send: (stop: boolean) => void;
  private readonly clock: () => number;
  private readonly throttleMs: number;
  private lastAt: number;
  private active: boolean;

  /**
   * @param send Sends a typing (false) or stop (true) signal.
   * @param clock Returns epoch ms.
   * @param throttleMs Minimum gap between typing signals.
   */
  constructor(
    send: (stop: boolean) => void,
    clock: () => number = Date.now,
    throttleMs: number = TYPING_COLLABORATION_CHAT_THROTTLE_MS,
  ) {
    this.send = send;
    this.clock = clock;
    this.throttleMs = throttleMs;
    this.lastAt = Number.NEGATIVE_INFINITY;
    this.active = false;
  }

  /** Notes that the user typed; may emit a throttled typing signal. */
  typed(): void {
    const now = this.clock();
    if (now - this.lastAt < this.throttleMs) {
      this.active = true;
      return;
    }
    this.lastAt = now;
    this.active = true;
    this.send(false);
  }

  /** Clears the local typing flag and optionally tells the relay to stop. */
  stop(notify = true): void {
    if (!this.active) return;
    this.active = false;
    this.lastAt = Number.NEGATIVE_INFINITY;
    if (notify) this.send(true);
  }
}
