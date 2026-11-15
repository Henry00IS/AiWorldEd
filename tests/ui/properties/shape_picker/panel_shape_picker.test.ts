import { describe, expect, it, vi } from 'vitest';
import { PanelShapePicker } from '@/ui/properties/shape_picker/panel_shape_picker.js';
import { MODIFIER_GENERATOR_NODE_KINDS } from '@/modifier/stack/modifier_generator_node.js';
import { modifierStackKindFind } from '@/modifier/stack/modifier_stack_catalog.js';

/**
 * Builds a picker with spy handlers.
 *
 * @returns Picker element and handlers.
 */
function picker() {
  const onAddBoxBrush = vi.fn();
  const onAddGenerator = vi.fn();
  const element = new PanelShapePicker({ onAddBoxBrush, onAddGenerator }).getElement();
  document.body.replaceChildren(element);
  return { element, onAddBoxBrush, onAddGenerator };
}

describe('shape picker', () => {
  it('offers the box brush first, then one icon tile per generator kind', () => {
    const { element } = picker();
    const tiles = [...element.querySelectorAll<HTMLButtonElement>('button')];
    expect(tiles[0]?.getAttribute('aria-label')).toBe('Add Box Brush');
    const kinds = tiles.slice(1).map((tile) => tile.dataset['addGenerator']);
    expect(kinds).toEqual([...MODIFIER_GENERATOR_NODE_KINDS]);
    for (const tile of tiles) {
      expect(tile.querySelector('svg')).not.toBeNull();
      expect(tile.title.length).toBeGreaterThan(10);
    }
  });

  it('labels every tile in Title Case with the kind label and its description as tooltip', () => {
    const { element } = picker();
    for (const kind of MODIFIER_GENERATOR_NODE_KINDS) {
      const tile = element.querySelector<HTMLButtonElement>(`button[data-add-generator="${kind}"]`);
      const found = modifierStackKindFind(kind);
      expect(tile?.getAttribute('aria-label')).toBe(`Add ${found?.label}`);
      expect(tile?.title).toContain(found?.description ?? '?');
      for (const word of found?.label.split(' ') ?? []) expect(word[0]).toBe(word[0]?.toUpperCase());
    }
  });

  it('adds the clicked shape and names the hovered tile in the caption', () => {
    const { element, onAddBoxBrush, onAddGenerator } = picker();
    element.querySelector<HTMLButtonElement>('button[aria-label="Add Box Brush"]')?.click();
    expect(onAddBoxBrush).toHaveBeenCalledTimes(1);
    const sphere = element.querySelector<HTMLButtonElement>('button[data-add-generator="sphere"]');
    sphere?.click();
    expect(onAddGenerator).toHaveBeenCalledWith('sphere');
    sphere?.dispatchEvent(new MouseEvent('mouseenter'));
    expect(element.querySelector('[data-shape-picker-caption]')?.textContent).toBe('Sphere');
    sphere?.dispatchEvent(new MouseEvent('mouseleave'));
    expect(element.querySelector('[data-shape-picker-caption]')?.textContent).toBe('Add Shape');
  });

  it('lays the tiles out as a grid with room around every icon', () => {
    const { element } = picker();
    const grid = element.querySelector<HTMLElement>('[data-shape-picker-grid]');
    expect(grid?.style.display).toBe('grid');
    expect(grid?.style.gap).not.toBe('');
  });
});
