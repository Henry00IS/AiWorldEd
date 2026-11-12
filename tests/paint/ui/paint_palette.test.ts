import { describe, expect, it, vi } from 'vitest';
import { PaintToolSettings } from '@/paint/tool/paint_tool_settings.js';
import {
  PaintPalette,
  paintPaletteLength,
  paintPaletteLogStep,
  paintPaletteLogValue,
} from '@/paint/ui/paint_palette.js';

/**
 * Creates a palette in a fresh container.
 *
 * @returns Palette parts.
 */
function createPalette(): { palette: PaintPalette; settings: PaintToolSettings; onClear: ReturnType<typeof vi.fn> } {
  const container = document.createElement('div');
  document.body.append(container);
  const settings = new PaintToolSettings(null);
  const onClear = vi.fn();
  const palette = new PaintPalette(container, settings, {
    textureChoices: () => [{ value: 'grate.png', label: 'Grate' }],
    onClearPaint: onClear,
  });
  return { palette, settings, onClear };
}

/**
 * Finds a button by accessible label.
 *
 * @param root Root.
 * @param label Label.
 * @returns Button.
 */
function button(root: HTMLElement, label: string): HTMLButtonElement {
  const found = [...root.querySelectorAll('button')].find(
    (candidate) => candidate.getAttribute('aria-label') === label || candidate.textContent === label,
  );
  if (found === undefined) throw new Error(`No button ${label}`);
  return found;
}

describe('PaintPalette', () => {
  it('starts hidden and shows with texture choices', () => {
    const { palette } = createPalette();
    expect(palette.root.hidden).toBe(true);
    palette.setVisible(true);
    expect(palette.root.hidden).toBe(false);
    const stencil = palette.root.querySelector('select[aria-label="Stencil"]') as HTMLSelectElement;
    expect([...stencil.options].map((option) => option.textContent)).toEqual(['None', 'Grate']);
    palette.dispose();
  });

  it('switches modes and mirrors shortcut changes', () => {
    const { palette, settings } = createPalette();
    button(palette.root, 'Eraser').click();
    expect(settings.mode).toBe('erase');
    expect(button(palette.root, 'Eraser').getAttribute('aria-pressed')).toBe('true');
    settings.setMode('paint');
    expect(button(palette.root, 'Brush').getAttribute('aria-pressed')).toBe('true');
    palette.dispose();
  });

  it('sets size from the slider and shows it in centimeters', () => {
    const { palette, settings } = createPalette();
    const input = palette.root.querySelector('input[type="range"]') as HTMLInputElement;
    input.value = String(paintPaletteLogStep(0.5, 0.02, 4));
    input.dispatchEvent(new Event('input'));
    expect(settings.radius).toBeCloseTo(0.5, 2);
    expect((palette.root.querySelector('output') as HTMLOutputElement).value).toBe('50 cm');
    palette.dispose();
  });

  it('chooses shapes, stamp images and clears paint', () => {
    const { palette, settings, onClear } = createPalette();
    button(palette.root, 'Footsteps').click();
    expect(settings.shape).toBe('footprints');
    palette.setVisible(true);
    const stamp = palette.root.querySelector('select[aria-label="Stamp Image"]') as HTMLSelectElement;
    stamp.value = 'grate.png';
    stamp.dispatchEvent(new Event('change'));
    expect(settings.stampTextureId).toBe('grate.png');
    expect(button(palette.root, 'Footsteps').getAttribute('aria-pressed')).toBe('false');
    button(palette.root, 'Clear Paint').click();
    expect(onClear).toHaveBeenCalledTimes(1);
    palette.dispose();
  });

  it('uses recent colors as a quick palette', () => {
    const { palette, settings } = createPalette();
    settings.setMode('erase');
    const swatch = palette.root.querySelector('[aria-label^="Use Color"]') as HTMLButtonElement;
    swatch.click();
    expect(settings.color).toBe(settings.recentColors[0]);
    expect(settings.mode).toBe('paint');
    palette.dispose();
  });

  it('maps logarithmic slider steps both ways', () => {
    for (const value of [0.02, 0.15, 1, 4]) {
      expect(paintPaletteLogValue(paintPaletteLogStep(value, 0.02, 4), 0.02, 4)).toBeCloseTo(value, 2);
    }
    expect(paintPaletteLength(0.15)).toBe('15 cm');
    expect(paintPaletteLength(2.5)).toBe('2.5 m');
  });
});
