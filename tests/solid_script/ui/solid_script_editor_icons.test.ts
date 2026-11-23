import { describe, expect, it } from 'vitest';
import { SOLID_SCRIPT_COMMAND_CATEGORIES } from '@/solid_script/commands/solid_script_command_catalog.js';
import { SOLID_SCRIPT_EDITOR_CATEGORY_COLORS } from '@/solid_script/ui/solid_script_editor_css.js';
import { solidScriptEditorIcon } from '@/solid_script/ui/solid_script_editor_icons.js';

describe('SolidScript editor icons', () => {
  it('gives every palette category an icon and an accent colour, Widgets too', () => {
    for (const category of SOLID_SCRIPT_COMMAND_CATEGORIES) {
      expect(solidScriptEditorIcon(category).querySelector('svg')?.innerHTML, category).not.toBe('');
      expect(SOLID_SCRIPT_EDITOR_CATEGORY_COLORS[category], category).toBeDefined();
    }
  });
});
