import type { Camera } from 'three';
import {
  isOrthographicViewport,
  isPerspectiveViewport,
  type ViewportEditor,
} from '@/viewports/core/viewport_editor.js';

/** Spatial playback mode derived from the last interacted viewport. */
export type AudioSpatialMode = 'mono' | 'spatial3d';

/**
 * Tracks real viewport input for creation placement and spatial audio. Focus
 * follows pointer presses, wheel input, and handled keyboard tools (G/R/S),
 * never pointermove hover.
 */
export class AudioViewportFocus {
  private readonly interactionUnsubscribers: Array<() => void> = [];
  private lastViewport: ViewportEditor | null;
  private readonly contentElementToViewport: Map<HTMLElement, ViewportEditor>;

  /** Creates an empty focus tracker. */
  constructor() {
    this.lastViewport = null;
    this.contentElementToViewport = new Map();
  }

  /**
   * Records a viewport as the most recent interaction target.
   *
   * @param viewport Viewport that received pointer or tool focus.
   */
  record(viewport: ViewportEditor): void {
    this.lastViewport = viewport;
  }

  /**
   * Records focus from a pinned viewport content element (input-bridge hit).
   *
   * @param contentElement Exclusive viewport content root under the pointer.
   */
  recordFromContentElement(contentElement: HTMLElement): void {
    const viewport = this.contentElementToViewport.get(contentElement);
    if (!viewport) {
      return;
    }
    this.record(viewport);
  }

  /**
   * Registers live viewport content elements so exclusive-root hits can resolve
   * back to a viewport. Replaces the previous registry.
   *
   * @param viewports Interactive viewports currently in the domain.
   */
  registerViewports(viewports: readonly ViewportEditor[]): void {
    this.clearInteractionListeners();
    this.contentElementToViewport.clear();
    for (let index = 0; index < viewports.length; index++) {
      const viewport = viewports[index];
      if (!viewport) {
        continue;
      }
      const contentElement = viewport.getContentElement();
      if (!contentElement) {
        continue;
      }
      this.contentElementToViewport.set(contentElement, viewport);
      this.bindInteractionListeners(contentElement, viewport);
    }
  }

  /**
   * Records presses on viewport content/chrome and wheel input on content.
   *
   * @param contentElement Drawable viewport input root, including pop-out
   *   documents.
   * @param viewport Viewport that owns the input roots.
   */
  private bindInteractionListeners(contentElement: HTMLElement, viewport: ViewportEditor): void {
    const pressElement = contentElement.parentElement ?? contentElement;
    const record = () => this.record(viewport);
    pressElement.addEventListener('pointerdown', record, true);
    contentElement.addEventListener('wheel', record, { passive: true });
    this.interactionUnsubscribers.push(() => {
      pressElement.removeEventListener('pointerdown', record, true);
      contentElement.removeEventListener('wheel', record);
    });
  }

  /** Removes interaction listeners from the previous live viewport domain. */
  private clearInteractionListeners(): void {
    this.interactionUnsubscribers.splice(0).forEach((unsubscribe) => unsubscribe());
  }

  /** Clears the last-viewport focus (e.g. tests or dispose). */
  clear(): void {
    this.lastViewport = null;
  }

  /** Clears focus and the content-element registry. */
  clearAll(): void {
    this.clearInteractionListeners();
    this.lastViewport = null;
    this.contentElementToViewport.clear();
  }

  /**
   * Returns the last interacted viewport, if any.
   *
   * @returns Viewport or null.
   */
  getLastViewport(): ViewportEditor | null {
    return this.lastViewport;
  }

  /**
   * Returns mono for 2D/unknown and spatial3d for perspective viewports.
   *
   * @returns Spatial mode for the next sound.
   */
  getSpatialMode(): AudioSpatialMode {
    const viewport = this.lastViewport;
    if (!viewport) {
      return 'mono';
    }
    if (isPerspectiveViewport(viewport)) {
      return 'spatial3d';
    }
    if (isOrthographicViewport(viewport)) {
      return 'mono';
    }
    return 'mono';
  }

  /**
   * Returns the camera of the last interacted viewport when available.
   *
   * @returns Camera or null.
   */
  getCamera(): Camera | null {
    const viewport = this.lastViewport;
    if (!viewport) {
      return null;
    }
    return viewport.getCamera();
  }

  /**
   * Returns a perspective camera to hear the world from: the last interacted
   * viewport when it is a perspective one, otherwise the first registered
   * perspective viewport (so world sounds such as other players are placed in
   * 3D even before the user clicked a viewport or while working in a 2D one).
   *
   * @returns Camera or null when no perspective viewport exists.
   */
  getPerspectiveCamera(): Camera | null {
    const last = this.lastViewport;
    if (last && isPerspectiveViewport(last)) {
      return last.getCamera();
    }
    for (const viewport of this.contentElementToViewport.values()) {
      if (isPerspectiveViewport(viewport)) {
        return viewport.getCamera();
      }
    }
    return null;
  }
}

/** Shared real-input viewport focus for placement and spatial audio. */
export const audioViewportFocus = new AudioViewportFocus();
