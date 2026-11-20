import { PanelFloatingBoundsMemory } from '@/ui/floating_panel/panel_floating_bounds_memory.js';
import { createFloatingPanelResizeGrip } from '@/ui/floating_panel/panel_floating_resize.js';
import type { SettingsStorage } from '@/settings/storage/settings_storage.js';

/** A width and height in CSS pixels. */
export interface SolidScriptEditorFrameSize {
  /** Width. */
  width: number;
  /** Height. */
  height: number;
}

/** First size of the script editor and of the windows that look like it. */
export const SOLID_SCRIPT_EDITOR_SIZE: Readonly<SolidScriptEditorFrameSize> = { width: 940, height: 600 };

/** Smallest size of the script editor and of the windows that look like it. */
export const SOLID_SCRIPT_EDITOR_MIN_SIZE: Readonly<SolidScriptEditorFrameSize> = { width: 640, height: 360 };

/** What a frame moves and keeps on the screen. */
export interface SolidScriptEditorFrameWindow {
  /** Window element. */
  root: HTMLElement;
  /** Moves the window's top left corner. */
  place: (left: number, top: number) => void;
  /** Keeps the window on the screen. */
  clamp: () => void;
}

/**
 * The size and place of a window like the script editor: it opens where it was
 * last left at its remembered size, or near the top center the first time, and
 * remembers every move and resize under its own storage key.
 */
export class SolidScriptEditorFrame {
  private readonly bounds: PanelFloatingBoundsMemory;

  /**
   * Creates the frame of one window.
   *
   * @param window Window it sizes and places.
   * @param key Storage key of the window's position and size.
   * @param storage Storage; the browser's local storage when left out.
   */
  constructor(
    private readonly window: SolidScriptEditorFrameWindow,
    key: string,
    storage?: SettingsStorage,
  ) {
    this.bounds = new PanelFloatingBoundsMemory(key, storage);
    Object.assign(window.root.style, {
      width: `${SOLID_SCRIPT_EDITOR_SIZE.width}px`,
      height: `${SOLID_SCRIPT_EDITOR_SIZE.height}px`,
      minWidth: `${SOLID_SCRIPT_EDITOR_MIN_SIZE.width}px`,
      minHeight: `${SOLID_SCRIPT_EDITOR_MIN_SIZE.height}px`,
      maxWidth: 'none',
    });
  }

  /** Puts the window where it was last left, at its remembered size. */
  restore(): void {
    const remembered = this.bounds.read();
    const root = this.window.root;
    if (remembered) {
      root.style.width = `${remembered.width}px`;
      root.style.height = `${remembered.height}px`;
      this.window.place(remembered.left, remembered.top);
    } else {
      const view = root.ownerDocument.defaultView ?? globalThis.window;
      const left = Math.max(16, (view.innerWidth - SOLID_SCRIPT_EDITOR_SIZE.width) / 2);
      this.window.place(left, Math.max(56, (view.innerHeight - SOLID_SCRIPT_EDITOR_SIZE.height) / 3));
    }
    this.window.clamp();
  }

  /** Remembers the window's position and size. */
  remember(): void {
    const rect = this.window.root.getBoundingClientRect();
    this.bounds.write({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });
  }

  /**
   * Builds the resize grip of the window's corner.
   *
   * @returns Grip.
   */
  grip(): HTMLElement {
    return createFloatingPanelResizeGrip(this.window.root, {
      minWidth: SOLID_SCRIPT_EDITOR_MIN_SIZE.width,
      minHeight: SOLID_SCRIPT_EDITOR_MIN_SIZE.height,
      place: (left, top) => this.window.place(left, top),
      done: () => {
        this.window.clamp();
        this.remember();
      },
    });
  }
}
