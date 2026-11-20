import { describe, expect, it } from 'vitest';
import {
  solidScriptEditorShownIndents,
  solidScriptEditorShownText,
  type SolidScriptEditorShownLine,
} from '@/solid_script/ui/solid_script_editor_copy.js';
import { SOLID_SCRIPT_EDITOR_CLASSES } from '@/solid_script/ui/solid_script_editor_css.js';

/**
 * Builds a row the way the code view shows a line.
 *
 * @param depth Block depth.
 * @param text Line text, or empty for a blank line.
 * @returns Line to copy.
 */
function line(depth: number, text: string): SolidScriptEditorShownLine {
  const row = document.createElement('div');
  const chip = document.createElement('div');
  chip.className = SOLID_SCRIPT_EDITOR_CLASSES.chip;
  if (text === '') chip.classList.add(SOLID_SCRIPT_EDITOR_CLASSES.blank);
  else chip.setAttribute('aria-label', text);
  row.append(chip);
  return { depth, row };
}

describe('SolidScript editor copy as shown', () => {
  it('takes off the indent every line with text shares, keeps the rest and leaves blank lines empty', () => {
    const lines = [line(2, 'Cube'), line(0, ''), line(3, 'Sphere'), line(2, 'End If')];
    expect(solidScriptEditorShownIndents(lines)).toEqual(['', '', '    ', '']);
    expect(solidScriptEditorShownText(lines)).toBe('Cube\n\n    Sphere\nEnd If');
  });

  it('copies one line without indent, and a blank line alone as an empty line', () => {
    expect(solidScriptEditorShownText([line(4, "*** It's [here]")])).toBe("*** It's [here]");
    expect(solidScriptEditorShownText([line(1, '')])).toBe('');
  });
});
