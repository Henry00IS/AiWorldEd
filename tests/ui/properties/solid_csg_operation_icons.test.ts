import { describe, it, expect } from 'vitest';
import { SolidCsgOperationIcons } from '@/ui/properties/solid_csg_operation_icons.js';

describe('SolidCsgOperationIcons', () => {
  it('returns SVG markup for additive, subtractive, and intersecting', () => {
    for (const markup of [
      SolidCsgOperationIcons.additive(),
      SolidCsgOperationIcons.subtractive(),
      SolidCsgOperationIcons.intersecting(),
    ]) {
      expect(markup.startsWith('<svg')).toBe(true);
      expect(markup).toContain('viewBox="0 0 18 18"');
      expect(markup).toContain('aria-hidden="true"');
    }
  });

  it('draws two light squares with outlines for additive', () => {
    const markup = SolidCsgOperationIcons.additive();
    expect(countFilledRects(markup)).toBe(2);
    expect(countOutlineRects(markup)).toBe(2);
    expect(markup).not.toContain('#1a1a1a');
    expect(markup).toContain('fill="currentColor"');
  });

  it('keeps the front square dark for subtractive', () => {
    const markup = SolidCsgOperationIcons.subtractive();
    expect(markup).toContain('#1a1a1a');
    expect(countFilledRects(markup)).toBe(2);
    expect(countOutlineRects(markup)).toBe(2);
  });

  it('themes every dark part so subtractive stays distinct from additive in light mode', () => {
    const markup = SolidCsgOperationIcons.subtractive();
    expect(markup).toContain(
      '<rect x="6.5" y="6.5" width="10.0" height="10.0" rx="1.2" fill="#1a1a1a" style="fill: var(--aiworlded-gray-1a1a1a, #1a1a1a)"',
    );
    expect(SolidCsgOperationIcons.additive()).not.toContain('style=');
    expect(SolidCsgOperationIcons.intersecting().match(/style="fill: var\(--aiworlded-gray-1a1a1a/g)).toHaveLength(2);
  });

  it('lights only the overlap for intersecting and darkens the exclusive parts', () => {
    const markup = SolidCsgOperationIcons.intersecting();
    expect(markup).toContain('#1a1a1a');
    expect(markup).toContain('fill="currentColor"');
    expect(countDarkPaths(markup)).toBe(2);
    expect(countFilledRects(markup)).toBe(1);
    expect(countOutlineRects(markup)).toBe(2);
  });
});

/**
 * Counts filled rectangle elements in icon SVG markup.
 *
 * @param markup SVG markup string.
 * @returns Number of filled rect elements.
 */
function countFilledRects(markup: string): number {
  const matches = markup.match(/<rect[^>]*fill="(?!none)[^"]*"/g);
  return matches?.length ?? 0;
}

/**
 * Counts outline-only rectangle elements in icon SVG markup.
 *
 * @param markup SVG markup string.
 * @returns Number of stroke-only rect elements.
 */
function countOutlineRects(markup: string): number {
  const matches = markup.match(/<rect[^>]*fill="none"/g);
  return matches?.length ?? 0;
}

/**
 * Counts dark filled path elements used for exclusive regions.
 *
 * @param markup SVG markup string.
 * @returns Number of dark path elements.
 */
function countDarkPaths(markup: string): number {
  const matches = markup.match(/<path fill="#1a1a1a"/g);
  return matches?.length ?? 0;
}
