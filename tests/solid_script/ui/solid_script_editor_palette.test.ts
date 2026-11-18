import { describe, expect, it } from 'vitest';
import {
  SOLID_SCRIPT_COMMAND_CATEGORIES,
  solidScriptCommandsOfCategory,
} from '@/solid_script/commands/solid_script_command_catalog.js';
import { SolidScriptEditorPalette } from '@/solid_script/ui/solid_script_editor_palette.js';

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
});
