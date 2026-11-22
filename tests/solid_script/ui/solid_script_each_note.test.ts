import { afterEach, describe, expect, it } from 'vitest';
import { solidScriptCommands } from '@/solid_script/commands/solid_script_command_catalog.js';
import {
  solidScriptEachNote,
  solidScriptEachSentence,
  type SolidScriptCommandEach,
} from '@/solid_script/commands/solid_script_command_each.js';
import { SolidScriptConfigurator } from '@/solid_script/ui/solid_script_configurator.js';
import { SOLID_SCRIPT_EDITOR_CLASSES } from '@/solid_script/ui/solid_script_editor_css.js';

const SOLID_SCRIPT_EACH_KINDS: readonly SolidScriptCommandEach[] = [
  'Object',
  'Face',
  'Edge',
  'Vertex',
  'Point',
  'Item',
];

/**
 * Splits a hint into its sentences.
 *
 * @param text Hint.
 * @returns Sentences.
 */
function sentences(text: string): string[] {
  return text
    .split(/(?<=[.;])\s+/)
    .map((part) => part.trim())
    .filter((part) => part !== '');
}

describe('SolidScript per-item note', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it.each(solidScriptCommands.map((command) => [command.id, command] as const))(
    'says what the per-item values mean once in the %s window, not in its field hints',
    (_id, command) => {
      new SolidScriptConfigurator(document.body, command, {}, () => undefined).show();
      const hints = [...document.querySelectorAll(`.${SOLID_SCRIPT_EDITOR_CLASSES.fieldHint}`)].map(
        (hint) => hint.textContent ?? '',
      );
      const explained = SOLID_SCRIPT_EACH_KINDS.map(solidScriptEachSentence);
      for (const hint of hints) for (const sentence of explained) expect(hint).not.toContain(sentence);
      const seen = new Map<string, number>();
      for (const hint of hints)
        for (const sentence of new Set(sentences(hint)))
          if (/\[\$[A-Z]/.test(sentence) && !/such as|or \[=/.test(sentence))
            seen.set(sentence, (seen.get(sentence) ?? 0) + 1);
      expect([...seen].filter(([, count]) => count > 1).map(([sentence]) => sentence)).toEqual([]);
      const notes = document.querySelectorAll('[data-solid-script-each-note]');
      const note = solidScriptEachNote(command.parameters);
      expect(notes.length).toBe(note ? 1 : 0);
      if (note) expect(notes[0]?.textContent).toBe(note);
    },
  );
});
