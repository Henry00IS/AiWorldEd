import { describe, expect, it } from 'vitest';
import {
  SOLID_SCRIPT_COMMAND_CATEGORIES,
  solidScriptCommandsOfCategory,
} from '@/solid_script/commands/solid_script_command_catalog.js';
import { solidScriptFormulaCatalog } from '@/solid_script/commands/solid_script_formula_commands.js';
import { SolidScriptEditorFavorites } from '@/solid_script/ui/solid_script_editor_favorites.js';
import {
  SOLID_SCRIPT_EDITOR_PALETTE_SCRIPT,
  SolidScriptEditorPalette,
} from '@/solid_script/ui/solid_script_editor_palette.js';

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
  it('lists the commands of each group in display-name order', () => {
    const palette = new SolidScriptEditorPalette(
      () => undefined,
      () => undefined,
    );
    const visible = palette.visible();
    for (const category of SOLID_SCRIPT_COMMAND_CATEGORIES) {
      const expected = solidScriptCommandsOfCategory(category).map((command) => command.id);
      expect(
        visible.filter((id) => expected.includes(id)),
        category,
      ).toEqual(expected);
    }
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
});
