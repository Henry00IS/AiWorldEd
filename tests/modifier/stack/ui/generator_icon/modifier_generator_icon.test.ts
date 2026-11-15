import { describe, expect, it } from 'vitest';
import { MODIFIER_GENERATOR_NODE_KINDS } from '@/modifier/stack/modifier_generator_node.js';
import {
  modifierGeneratorIconBrushSvg,
  modifierGeneratorIconSvg,
} from '@/modifier/stack/ui/generator_icon/modifier_generator_icon.js';

/**
 * Parses an icon into a document.
 *
 * @param markup SVG markup.
 * @returns Root SVG element.
 */
function parse(markup: string): SVGSVGElement {
  const root = new DOMParser().parseFromString(markup, 'image/svg+xml').documentElement;
  if (!(root instanceof SVGSVGElement) && root.tagName !== 'svg') throw new Error('Not an SVG');
  return root as unknown as SVGSVGElement;
}

describe('generator icons', () => {
  it('renders every generator kind from its own geometry as theme-coloured shaded faces', () => {
    const icons = MODIFIER_GENERATOR_NODE_KINDS.map((kind) => modifierGeneratorIconSvg(kind));
    for (const [index, icon] of icons.entries()) {
      const root = parse(icon);
      const faces = root.querySelectorAll('polygon');
      expect(faces.length, MODIFIER_GENERATOR_NODE_KINDS[index]).toBeGreaterThanOrEqual(2);
      expect(icon).toContain('currentColor');
      expect(icon).not.toMatch(/#[0-9a-f]{3,6}/i);
      expect(root.getAttribute('viewBox')).toBe('0 0 24 24');
    }
    expect(new Set(icons).size).toBe(icons.length);
  });

  it('keeps every face inside the icon frame', () => {
    for (const kind of MODIFIER_GENERATOR_NODE_KINDS) {
      for (const polygon of parse(modifierGeneratorIconSvg(kind)).querySelectorAll('polygon')) {
        const values = (polygon.getAttribute('points') ?? '').split(/[ ,]/).map(Number);
        for (const value of values) {
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(24);
        }
      }
    }
  });

  it('draws the box and wedge brushes the same way and returns the same markup every time', () => {
    expect(parse(modifierGeneratorIconBrushSvg('box')).querySelectorAll('polygon')).toHaveLength(3);
    expect(parse(modifierGeneratorIconBrushSvg('wedge')).querySelectorAll('polygon').length).toBeGreaterThanOrEqual(2);
    expect(modifierGeneratorIconBrushSvg('wedge')).not.toBe(modifierGeneratorIconBrushSvg('box'));
    expect(modifierGeneratorIconSvg('sphere')).toBe(modifierGeneratorIconSvg('sphere'));
    expect(modifierGeneratorIconSvg('unknownKind')).toBe(modifierGeneratorIconBrushSvg('box'));
  });
});
