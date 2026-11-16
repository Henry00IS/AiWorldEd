import { EditorOverlayId } from './editor_overlay_id.js';

/** Listener invoked when any overlay allowance changes. */
export type ListenerPolicyEditorOverlay = () => void;

/**
 * Opt-in registry for editor overlays (CAD rulers, transform gizmos, etc.).
 * Overlays are denied by default. Tools that need an overlay enable it with a
 * stable reason key and release on exit so multiple owners can stack without
 * case-by-case suppress hacks.
 */
export class PolicyEditorOverlay {
  private readonly enablers: Map<EditorOverlayId, Set<string>>;
  private readonly suppressions: Set<string>;
  private readonly listeners: ListenerPolicyEditorOverlay[];

  /** Creates an empty policy (all overlays denied until enabled). */
  constructor() {
    this.enablers = new Map();
    this.suppressions = new Set();
    this.listeners = [];
  }

  /**
   * Enables an overlay for the given owner. No-op when already enabled under
   * the same reason.
   *
   * @param overlayId Overlay to show when policy allows.
   * @param reasonKey Stable tool/session id (e.g. `object_tool`).
   */
  enable(overlayId: EditorOverlayId, reasonKey: string): void {
    const reasons = this.ensureReasonSet(overlayId);
    if (reasons.has(reasonKey)) {
      return;
    }
    reasons.add(reasonKey);
    this.notifyListeners();
  }

  /**
   * Releases one enable reason. The overlay becomes denied again when no
   * reasons remain.
   *
   * @param overlayId Overlay that was enabled.
   * @param reasonKey Reason previously passed to {@link enable}.
   */
  release(overlayId: EditorOverlayId, reasonKey: string): void {
    const reasons = this.enablers.get(overlayId);
    if (!reasons || !reasons.has(reasonKey)) {
      return;
    }
    reasons.delete(reasonKey);
    if (reasons.size === 0) {
      this.enablers.delete(overlayId);
    }
    this.notifyListeners();
  }

  /**
   * Returns whether the overlay may be shown (at least one enable reason).
   *
   * @param overlayId Overlay to query.
   * @returns True when a tool has opted into the overlay.
   */
  isAllowed(overlayId: EditorOverlayId): boolean {
    if (this.suppressions.size > 0) {
      return false;
    }
    const reasons = this.enablers.get(overlayId);
    return !!reasons && reasons.size > 0;
  }

  /**
   * Hides every overlay while this reason is held, even when tools have opted
   * in. Used for Play Mode so bounds labels and gizmos do not stay on screen.
   *
   * @param reasonKey Stable session id (e.g. `play_mode`).
   */
  suppress(reasonKey: string): void {
    if (this.suppressions.has(reasonKey)) {
      return;
    }
    this.suppressions.add(reasonKey);
    this.notifyListeners();
  }

  /**
   * Releases one suppress reason. Overlays return to their enabled state when
   * no suppress reasons remain.
   *
   * @param reasonKey Reason previously passed to {@link suppress}.
   */
  releaseSuppress(reasonKey: string): void {
    if (!this.suppressions.has(reasonKey)) {
      return;
    }
    this.suppressions.delete(reasonKey);
    this.notifyListeners();
  }

  /**
   * Registers a listener for allowance changes (e.g. rebuild CAD rulers).
   *
   * @param listener Callback with no arguments.
   */
  addChangeListener(listener: ListenerPolicyEditorOverlay): void {
    this.listeners.push(listener);
  }

  /**
   * Unregisters a change listener.
   *
   * @param listener Previously registered callback.
   */
  removeChangeListener(listener: ListenerPolicyEditorOverlay): void {
    const index = this.listeners.indexOf(listener);
    if (index >= 0) {
      this.listeners.splice(index, 1);
    }
  }

  /**
   * Ensures a mutable reason set exists for the overlay.
   *
   * @param overlayId Overlay id.
   * @returns Reason set for that overlay.
   */
  private ensureReasonSet(overlayId: EditorOverlayId): Set<string> {
    let reasons = this.enablers.get(overlayId);
    if (!reasons) {
      reasons = new Set();
      this.enablers.set(overlayId, reasons);
    }
    return reasons;
  }

  /** Notifies all listeners of a policy change. */
  private notifyListeners(): void {
    this.listeners.forEach((listener) => {
      listener();
    });
  }
}
