import { describe, it, expect, afterEach } from 'vitest';
import {
  TEXTURE_BROWSER_THUMB_CLASS,
  TEXTURE_BROWSER_TILE_CLASS,
  TEXTURE_BROWSER_GRID_CLASS,
  TEXTURE_BROWSER_MIN_TRACK_PX,
  ensureTextureBrowserStylesheet
} from '../../src/ui/texture_browser_styles.js';

describe('texture_browser_styles', () => {
  afterEach(() => {
    const existing = document.getElementById('tb-browser-stylesheet');
    if (existing) existing.remove();
  });

  it('should inject a single stylesheet element', () => {
    ensureTextureBrowserStylesheet();
    ensureTextureBrowserStylesheet();
    const sheets = document.querySelectorAll('#tb-browser-stylesheet');
    expect(sheets).toHaveLength(1);
    expect(sheets[0].textContent).toContain(`.${TEXTURE_BROWSER_THUMB_CLASS}`);
    expect(sheets[0].textContent).toContain(`.${TEXTURE_BROWSER_GRID_CLASS}`);
  });

  it('should size thumbs with container-query height matching tile width', () => {
    ensureTextureBrowserStylesheet();
    const css = document.getElementById('tb-browser-stylesheet')!.textContent!;
    expect(css).toContain('height: 100cqi');
    expect(css).toContain('container-type: inline-size');
    expect(css).toContain('width: 100%');
    expect(css).toContain(
      `repeat(auto-fill, minmax(${TEXTURE_BROWSER_MIN_TRACK_PX}px, 1fr))`
    );
    expect(css).toContain('grid-auto-rows: max-content');
    expect(css).not.toContain('padding-top: 100%');
  });

  it('should not use overflow hidden on tiles (collapses grid min-size)', () => {
    ensureTextureBrowserStylesheet();
    const css = document.getElementById('tb-browser-stylesheet')!.textContent!;
    const tileBlock = extractRule(css, `.${TEXTURE_BROWSER_TILE_CLASS}`);
    expect(tileBlock).not.toMatch(/overflow:\s*hidden/);
  });
});

/**
 * Returns the body of the first CSS rule whose selector matches exactly.
 * @param css Full stylesheet text.
 * @param selector Selector including the leading dot.
 * @returns Rule body text without braces.
 */
function extractRule(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  return match?.[1] ?? '';
}
