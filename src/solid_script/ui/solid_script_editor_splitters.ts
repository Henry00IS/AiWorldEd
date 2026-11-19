import { LocalSettingsStorage, type SettingsStorage } from '@/settings/storage/settings_storage.js';
import { SOLID_SCRIPT_EDITOR_CLASSES } from './solid_script_editor_css.js';

/** Sizes of the script editor's areas in pixels, kept between sessions. */
export interface SolidScriptEditorSizes {
  /** Width of the command palette. */
  palette: number;
  /** Width of the help column. */
  help: number;
  /** Height of the output area. */
  output: number;
}

/** Storage key of the area sizes. */
export const SOLID_SCRIPT_EDITOR_SIZES_KEY = 'aiworlded.solidScriptEditor.sizes';

/** Storage key of the window's own position and size. */
export const SOLID_SCRIPT_EDITOR_BOUNDS_KEY = 'aiworlded.solidScriptEditor.bounds';

/** Sizes before the user drags a splitter. */
export const SOLID_SCRIPT_EDITOR_SIZES_DEFAULT: Readonly<SolidScriptEditorSizes> = {
  palette: 176,
  help: 220,
  output: 140,
};

/** Smallest and largest size of each area. */
const SOLID_SCRIPT_EDITOR_SIZES_LIMITS: Readonly<Record<keyof SolidScriptEditorSizes, readonly [number, number]>> = {
  palette: [120, 480],
  help: [140, 560],
  output: [60, 640],
};

/**
 * Keeps a size within the limits of its area.
 *
 * @param area Area.
 * @param size Size in pixels.
 * @returns Size within the limits.
 */
function solidScriptEditorSizeClamp(area: keyof SolidScriptEditorSizes, size: number): number {
  const [min, max] = SOLID_SCRIPT_EDITOR_SIZES_LIMITS[area];
  return Math.round(Math.min(max, Math.max(min, size)));
}

/**
 * Reads the stored sizes; missing or broken values fall back to the defaults.
 *
 * @param storage Storage.
 * @returns Sizes.
 */
export function solidScriptEditorSizesRead(
  storage: SettingsStorage = new LocalSettingsStorage(),
): SolidScriptEditorSizes {
  let stored: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(storage.getItem(SOLID_SCRIPT_EDITOR_SIZES_KEY) ?? '{}');
    if (typeof parsed === 'object' && parsed !== null) stored = parsed as Record<string, unknown>;
  } catch {
    stored = {};
  }
  const sizes = { ...SOLID_SCRIPT_EDITOR_SIZES_DEFAULT };
  for (const area of Object.keys(sizes) as (keyof SolidScriptEditorSizes)[]) {
    const value = stored[area];
    if (typeof value === 'number' && Number.isFinite(value)) sizes[area] = solidScriptEditorSizeClamp(area, value);
  }
  return sizes;
}

/**
 * Stores the sizes.
 *
 * @param sizes Sizes.
 * @param storage Storage.
 */
export function solidScriptEditorSizesWrite(
  sizes: SolidScriptEditorSizes,
  storage: SettingsStorage = new LocalSettingsStorage(),
): void {
  storage.setItem(SOLID_SCRIPT_EDITOR_SIZES_KEY, JSON.stringify(sizes));
}

/**
 * Sets the size of one area on its element.
 *
 * @param element Area element.
 * @param area Area.
 * @param size Size in pixels.
 */
function solidScriptEditorSizeApply(element: HTMLElement, area: keyof SolidScriptEditorSizes, size: number): void {
  if (area === 'output') element.style.height = `${size}px`;
  else element.style.width = `${size}px`;
}

/**
 * Builds a splitter that resizes one area by dragging and stores the new size.
 * The palette grows to the right, the help column to the left and the output
 * upwards.
 *
 * @param element Area element.
 * @param area Area.
 * @param sizes Current sizes, changed in place.
 * @returns Splitter element, to place beside the area.
 */
export function solidScriptEditorSplitter(
  element: HTMLElement,
  area: keyof SolidScriptEditorSizes,
  sizes: SolidScriptEditorSizes,
): HTMLElement {
  solidScriptEditorSizeApply(element, area, sizes[area]);
  const splitter = document.createElement('div');
  const across = area === 'output';
  splitter.className = across ? SOLID_SCRIPT_EDITOR_CLASSES.splitterRow : SOLID_SCRIPT_EDITOR_CLASSES.splitterColumn;
  splitter.dataset['solidScriptSplitter'] = area;
  splitter.setAttribute('role', 'separator');
  splitter.setAttribute('aria-orientation', across ? 'horizontal' : 'vertical');
  splitter.title = 'Drag To Resize';
  const sign = area === 'palette' ? 1 : -1;
  splitter.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const start = across ? event.clientY : event.clientX;
    const from = sizes[area];
    const move = (next: PointerEvent): void => {
      const delta = (across ? next.clientY : next.clientX) - start;
      sizes[area] = solidScriptEditorSizeClamp(area, from + sign * delta);
      solidScriptEditorSizeApply(element, area, sizes[area]);
    };
    const up = (): void => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      solidScriptEditorSizesWrite(sizes);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });
  return splitter;
}
