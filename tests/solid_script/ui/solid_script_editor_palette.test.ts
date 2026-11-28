import { describe, expect, it } from 'vitest';
import type { SolidScriptCommandCategory } from '@/solid_script/commands/solid_script_command.js';
import {
  SOLID_SCRIPT_COMMAND_CATEGORIES,
  solidScriptCommandLabelCompare,
  solidScriptCommandsOfCategory,
} from '@/solid_script/commands/solid_script_command_catalog.js';
import {
  SOLID_SCRIPT_FORMULA_CATEGORIES,
  solidScriptFormulaCatalog,
} from '@/solid_script/commands/solid_script_formula_commands.js';
import { SolidScriptEditorFavorites } from '@/solid_script/ui/solid_script_editor_favorites.js';
import {
  SOLID_SCRIPT_EDITOR_PALETTE_SCRIPT,
  SolidScriptEditorPalette,
} from '@/solid_script/ui/solid_script_editor_palette.js';
import { SOLID_SCRIPT_EDITOR_CLASSES } from '@/solid_script/ui/solid_script_editor_css.js';

/**
 * Sentences of a tooltip said more than once.
 *
 * @param tip Tooltip.
 * @returns Repeated sentences.
 */
function repeated(tip: string): string[] {
  const sentences = tip.split(/(?<=\.)\s+/).map((sentence) => sentence.trim().replace(/\.$/, ''));
  return sentences.filter((sentence, index) => sentence !== '' && sentences.indexOf(sentence) !== index);
}

describe('SolidScript editor palette', () => {
  /**
   * Reads the displayed command names under one category caption in a palette.
   *
   * @param palette Palette.
   * @param category Group name.
   * @returns Labels in the order they are shown.
   */
  function shownIn(palette: SolidScriptEditorPalette, category: string): string[] {
    const labels: string[] = [];
    let inside = false;
    for (const child of palette.element.querySelectorAll<HTMLElement>(
      `.${SOLID_SCRIPT_EDITOR_CLASSES.paletteCaption}, [data-command]`,
    )) {
      if (child.classList.contains(SOLID_SCRIPT_EDITOR_CLASSES.paletteCaption)) {
        inside = child.textContent === category && !child.hidden;
        continue;
      }
      if (inside && !child.hidden) labels.push(child.lastElementChild?.textContent ?? '');
    }
    return labels;
  }

  /**
   * Checks that a palette lists every group alphabetically by displayed name.
   *
   * @param palette Palette.
   * @param categories Groups it shows, in group order.
   * @param ofCategory Commands of one group, already in display-name order.
   */
  function expectCategoryOrder(
    palette: SolidScriptEditorPalette,
    categories: readonly SolidScriptCommandCategory[],
    ofCategory: (category: SolidScriptCommandCategory) => readonly { label: string }[],
  ): void {
    for (const category of categories) {
      const shown = shownIn(palette, category);
      const expected = ofCategory(category).map((command) => command.label);
      expect(shown, category).toEqual(expected);
      expect(shown, category).toEqual([...shown].sort(solidScriptCommandLabelCompare));
    }
  }

  it('lists the commands of each group in display-name order, in the script and formula palettes, also after clearing a search', () => {
    const script = new SolidScriptEditorPalette(
      () => undefined,
      () => undefined,
    );
    expectCategoryOrder(script, SOLID_SCRIPT_COMMAND_CATEGORIES, solidScriptCommandsOfCategory);
    script.search.value = 'path';
    script.search.dispatchEvent(new Event('input'));
    script.search.value = '';
    script.search.dispatchEvent(new Event('input'));
    expectCategoryOrder(script, SOLID_SCRIPT_COMMAND_CATEGORIES, solidScriptCommandsOfCategory);
    const catalog = solidScriptFormulaCatalog();
    const formula = new SolidScriptEditorPalette(
      () => undefined,
      () => undefined,
      new SolidScriptEditorFavorites(undefined, catalog),
      { ...SOLID_SCRIPT_EDITOR_PALETTE_SCRIPT, catalog, target: 'the formula' },
    );
    expectCategoryOrder(formula, SOLID_SCRIPT_FORMULA_CATEGORIES, (category) => catalog.ofCategory(category));
  });

  it('says nothing twice in the tooltip of any entry, in the script and the formula palette', () => {
    const formula = solidScriptFormulaCatalog();
    const palettes = [
      SOLID_SCRIPT_EDITOR_PALETTE_SCRIPT,
      { ...SOLID_SCRIPT_EDITOR_PALETTE_SCRIPT, catalog: formula, target: 'the formula' },
    ];
    for (const options of palettes) {
      const favorites = new SolidScriptEditorFavorites(undefined, options.catalog);
      const palette = new SolidScriptEditorPalette(
        () => undefined,
        () => undefined,
        favorites,
        options,
      );
      const items = [...palette.element.querySelectorAll<HTMLElement>('[data-command]')];
      expect(items.length).toBeGreaterThan(10);
      for (const item of items) expect(repeated(item.title), item.dataset['command']).toEqual([]);
    }
  });

  it.each([
    ['add', 'formula_plus', 'Add'],
    ['plus', 'formula_plus', 'Add'],
    ['sum', 'formula_plus', 'Add'],
    ['multiply', 'formula_times', 'Multiply'],
    ['times', 'formula_times', 'Multiply'],
    ['product', 'formula_times', 'Multiply'],
    ['subtract', 'formula_minus', 'Subtract'],
    ['minus', 'formula_minus', 'Subtract'],
    ['divide', 'formula_divide', 'Divide'],
    ['modulo', 'formula_remainder', 'Remainder'],
    ['greater', 'formula_more', 'Greater Than'],
    ['not equal', 'formula_differs', 'Not Equal'],
    ['negate', 'formula_negate', 'Negate'],
    ['sine', 'formula_fn_sin', 'Sin'],
    ['upper', 'formula_fn_uppercase', 'Uppercase'],
    ['lerp', 'formula_fn_lerp', 'Blend'],
  ])('finds the block for %j in the formula palette, whatever its category: %s, named %s', (word, id, label) => {
    const catalog = solidScriptFormulaCatalog();
    const options = { ...SOLID_SCRIPT_EDITOR_PALETTE_SCRIPT, catalog, target: 'the formula' };
    const palette = new SolidScriptEditorPalette(
      () => undefined,
      () => undefined,
      new SolidScriptEditorFavorites(undefined, catalog),
      options,
    );
    palette.search.value = word;
    palette.search.dispatchEvent(new Event('input'));
    expect(palette.visible()).toContain(id);
    expect(catalog.find(id)?.label).toBe(label);
  });
});
