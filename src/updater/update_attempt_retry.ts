/** Time limit per attempt and the waits between retries of a network step. */
export interface UpdateAttemptRetryPolicy {
  attemptTimeoutMs: number;
  retryDelaysMs: readonly number[];
}

/** Starts a timer that calls back once; returns a function that cancels it. */
export type UpdateAttemptTimeoutStart = (onTimeout: () => void, timeoutMs: number) => () => void;

/** Waits for the given number of milliseconds. */
export type UpdateAttemptWait = (milliseconds: number) => Promise<void>;

/** Raised when one attempt does not settle within its time limit. */
export class UpdateAttemptTimeoutError extends Error {
  /** @param timeoutMs Time limit that ran out. */
  constructor(timeoutMs: number) {
    super(`No answer within ${Math.round(timeoutMs / 1000)} s.`);
    this.name = 'UpdateAttemptTimeoutError';
  }
}

/**
 * Starts a real timer.
 *
 * @param onTimeout Called when the timer runs out.
 * @param timeoutMs Time limit in milliseconds.
 * @returns Function that cancels the timer.
 */
export function updateAttemptTimeoutStartReal(onTimeout: () => void, timeoutMs: number): () => void {
  const timer = setTimeout(onTimeout, timeoutMs);
  return () => clearTimeout(timer);
}

/**
 * Waits with a real timer.
 *
 * @param milliseconds Time to wait.
 * @returns Promise that resolves after the wait.
 */
export function updateAttemptWaitReal(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/**
 * Settles with the attempt, or rejects with UpdateAttemptTimeoutError when it
 * takes longer than the time limit. The attempt itself keeps running.
 *
 * @param attempt Running attempt.
 * @param timeoutMs Time limit in milliseconds.
 * @param timeoutStart Timer used for the limit.
 * @returns The attempt's result.
 */
export function updateAttemptWithTimeout<T>(
  attempt: Promise<T>,
  timeoutMs: number,
  timeoutStart: UpdateAttemptTimeoutStart = updateAttemptTimeoutStartReal,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutCancel = timeoutStart(() => reject(new UpdateAttemptTimeoutError(timeoutMs)), timeoutMs);
    attempt.then(resolve, reject).finally(timeoutCancel);
  });
}

/** Lets a running attempt report activity, or a step that reports none. */
export interface UpdateAttemptStallWatch {
  /** Restarts the stall limit. */
  activity(): void;
  /** Stops the stall limit until the next activity, for a silent step. */
  pause(): void;
}

/**
 * Settles with the attempt, or rejects with UpdateAttemptTimeoutError when it
 * shows no activity for the stall limit. Each activity restarts the limit, so a
 * slow attempt that keeps moving has no total time limit, and a paused limit
 * waits for the next activity. The attempt itself keeps running after a stall.
 *
 * @param attemptStart Starts the attempt; receives its stall watch.
 * @param stallMs Longest time without activity, in milliseconds.
 * @param timeoutStart Timer used for the limit.
 * @returns The attempt's result.
 */
export function updateAttemptWithStallLimit<T>(
  attemptStart: (watch: UpdateAttemptStallWatch) => Promise<T>,
  stallMs: number,
  timeoutStart: UpdateAttemptTimeoutStart = updateAttemptTimeoutStartReal,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    let timeoutCancel = () => undefined as void;
    const stalled = () => {
      settled = true;
      reject(new UpdateAttemptTimeoutError(stallMs));
    };
    const pause = () => timeoutCancel();
    const activity = () => {
      timeoutCancel();
      if (!settled) timeoutCancel = timeoutStart(stalled, stallMs);
    };
    activity();
    attemptStart({ activity, pause })
      .then(resolve, reject)
      .finally(() => {
        settled = true;
        timeoutCancel();
      });
  });
}

/**
 * Runs an attempt until it succeeds or every retry of the policy failed.
 *
 * @param runAttempt Runs one attempt; receives the zero-based attempt index.
 * @param policy Retry delays between attempts.
 * @param wait Waits between attempts.
 * @param onRetry Called before each retry with the failure and the next
 *   zero-based attempt index.
 * @returns The first successful result.
 * @throws The last failure when every attempt failed.
 */
export async function updateAttemptsWithRetry<T>(
  runAttempt: (attemptIndex: number) => Promise<T>,
  policy: Pick<UpdateAttemptRetryPolicy, 'retryDelaysMs'>,
  wait: UpdateAttemptWait,
  onRetry: (failure: unknown, nextAttemptIndex: number) => void = () => undefined,
): Promise<T> {
  for (let attemptIndex = 0; ; attemptIndex++) {
    try {
      return await runAttempt(attemptIndex);
    } catch (failure) {
      const retryDelayMs = policy.retryDelaysMs[attemptIndex];
      if (retryDelayMs === undefined) throw failure;
      onRetry(failure, attemptIndex + 1);
      await wait(retryDelayMs);
    }
  }
}
