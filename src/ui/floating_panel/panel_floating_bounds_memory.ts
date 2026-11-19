import { LocalSettingsStorage, type SettingsStorage } from '@/settings/storage/settings_storage.js';
import type { FloatingPanelRect } from './panel_floating_screen_bounds.js';

/** Fields of a remembered window rectangle, in storage order. */
const PANEL_FLOATING_BOUNDS_FIELDS = ['left', 'top', 'width', 'height'] as const;

/**
 * Remembers where a floating window was and how big it was between sessions,
 * under one storage key.
 */
export class PanelFloatingBoundsMemory {
  /**
   * Creates the memory of one window.
   *
   * @param key Storage key.
   * @param storage Storage; the browser's local storage when left out.
   */
  constructor(
    private readonly key: string,
    private readonly storage: SettingsStorage = new LocalSettingsStorage(),
  ) {}

  /**
   * Reads the remembered rectangle.
   *
   * @returns Rectangle in CSS pixels, or null when none is stored or it is
   *   broken.
   */
  read(): FloatingPanelRect | null {
    let parsed: unknown;
    try {
      parsed = JSON.parse(this.storage.getItem(this.key) ?? 'null');
    } catch {
      return null;
    }
    return PanelFloatingBoundsMemory.rectValid(parsed) ? parsed : null;
  }

  /**
   * Remembers a rectangle; one without a size is ignored.
   *
   * @param rect Rectangle in CSS pixels.
   */
  write(rect: FloatingPanelRect): void {
    const stored: FloatingPanelRect = {
      left: Math.round(rect.left),
      top: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };
    if (PanelFloatingBoundsMemory.rectValid(stored)) this.storage.setItem(this.key, JSON.stringify(stored));
  }

  /**
   * Tells whether a value is a rectangle with finite numbers and a size.
   *
   * @param value Parsed value.
   * @returns True for a usable rectangle.
   */
  private static rectValid(value: unknown): value is FloatingPanelRect {
    if (typeof value !== 'object' || value === null) return false;
    const record = value as Record<string, unknown>;
    const finite = PANEL_FLOATING_BOUNDS_FIELDS.every(
      (field) => typeof record[field] === 'number' && Number.isFinite(record[field]),
    );
    return finite && (record['width'] as number) > 0 && (record['height'] as number) > 0;
  }
}
