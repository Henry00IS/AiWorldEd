/**
 * ShowCursor-style pointer lock: one integer counter. {@link lock} increments
 * and requests browser lock on 0→1. {@link unlock} decrements and exits browser
 * lock on 1→0. Browser success or failure never changes the counter.
 */
export class ManagerPointerLock {
  private lockCount: number;
  private element: HTMLElement | null;

  /** Creates an idle pointer-lock counter. */
  constructor() {
    this.lockCount = 0;
    this.element = null;
  }

  /**
   * Increments the lock counter. Requests browser lock when the count becomes
   * 1.
   *
   * @param element Element to lock the pointer to.
   */
  lock(element: HTMLElement): void {
    this.lockCount += 1;
    this.element = element;
    if (this.lockCount === 1) {
      this.requestBrowserLock(element);
    }
  }

  /** Decrements the lock counter. Exits browser lock when the count reaches 0. */
  unlock(): void {
    if (this.lockCount <= 0) {
      this.lockCount = 0;
      return;
    }
    this.lockCount -= 1;
    if (this.lockCount === 0) {
      this.exitBrowserLock();
      this.element = null;
    }
  }

  /**
   * Returns the lock counter (number of unpaired lock calls).
   *
   * @returns Current refcount.
   */
  getLockCount(): number {
    return this.lockCount;
  }

  /**
   * Returns whether the browser pointer is locked to the active element.
   *
   * @returns True when locked.
   */
  isBrowserLocked(): boolean {
    if (!this.element) {
      return false;
    }
    return this.element.ownerDocument.pointerLockElement === this.element;
  }

  /**
   * Returns the element last targeted by lock, if any.
   *
   * @returns Active element or null.
   */
  getActiveElement(): HTMLElement | null {
    return this.element;
  }

  /** Clears the counter (tests / teardown). Does not call exitPointerLock. */
  reset(): void {
    this.lockCount = 0;
    this.element = null;
  }

  /**
   * Requests browser pointer lock. Failures leave the counter unchanged.
   *
   * @param element Target element.
   */
  private requestBrowserLock(element: HTMLElement): void {
    if (typeof element.requestPointerLock !== 'function') {
      return;
    }
    if (element.ownerDocument.pointerLockElement === element) {
      return;
    }
    try {
      const requestWithOptions = element.requestPointerLock as (options?: PointerLockOptions) => void | Promise<void>;
      const result = requestWithOptions.call(element, { unadjustedMovement: true });
      this.swallowLockPromise(element, result);
    } catch {
      this.requestBrowserLockPlain(element);
    }
  }

  /**
   * Requests pointer lock without unadjusted movement options.
   *
   * @param element Target element.
   */
  private requestBrowserLockPlain(element: HTMLElement): void {
    try {
      const result = element.requestPointerLock() as void | Promise<void>;
      this.swallowLockPromise(element, result);
    } catch {
      return;
    }
  }

  /**
   * Swallows promise rejection and falls back without unadjusted movement.
   *
   * @param element Target element.
   * @param result Optional promise from requestPointerLock.
   */
  private swallowLockPromise(element: HTMLElement, result: void | Promise<void>): void {
    if (!result || typeof result.then !== 'function') {
      return;
    }
    void result.then(
      () => undefined,
      (error: unknown) => {
        if (this.isUnadjustedMovementUnsupportedError(error)) {
          this.requestBrowserLockPlain(element);
        }
      },
    );
  }

  /**
   * Returns whether unadjusted movement was rejected as unsupported.
   *
   * @param error Rejection value.
   * @returns True when a plain lock should be tried.
   */
  private isUnadjustedMovementUnsupportedError(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
      return false;
    }
    const name = 'name' in error ? String(error.name) : '';
    return name === 'NotSupportedError' || name === 'TypeError';
  }

  /** Exits browser pointer lock when held on the active element. */
  private exitBrowserLock(): void {
    if (!this.element) {
      return;
    }
    const ownerDocument = this.element.ownerDocument;
    if (ownerDocument.pointerLockElement !== this.element) {
      return;
    }
    if (typeof ownerDocument.exitPointerLock !== 'function') {
      return;
    }
    try {
      ownerDocument.exitPointerLock();
    } catch {
      return;
    }
  }
}

/** Shared editor pointer-lock refcount used by navigation and play mode. */
export const managerPointerLock = new ManagerPointerLock();
