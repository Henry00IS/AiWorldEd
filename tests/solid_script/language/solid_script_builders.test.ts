import { describe, expect, it } from 'vitest';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptCommands } from '@/solid_script/commands/solid_script_command_catalog.js';

const line = (command: string, values: Record<string, string> = {}): SolidScriptLine => ({ command, values });
const END = line('end');

/** Messages a run printed, one per Print line. */
function printed(...lines: SolidScriptLine[]): string[] {
  const result = solidScriptProgramRun(solidScriptDocumentCreate(lines), {});
  expect(result.error?.message ?? null).toBeNull();
  return result.messages;
}

/** Commands that build brushes or meshes. */
const BUILDERS = [
  'cube',
  'sphere',
  'cylinder',
  'polyhedron',
  'stairs',
  'mesh',
  'hull',
  'linear_extrude',
  'rotate_extrude',
];

describe('SolidScript builders', () => {
  it('gives every building block a Name and an Into', () => {
    const missing = solidScriptCommands
      .filter(
        (command) =>
          command.category === 'Solids' || command.category === 'Generators' || BUILDERS.includes(command.id),
      )
      .filter((command) => !['label', 'into'].every((key) => command.parameters.some((field) => field.key === key)))
      .map((command) => command.id);
    expect(missing).toEqual([]);
  });

  it('writes what a block builds Into a variable, with its Name', () => {
    expect(
      printed(
        line('cube', { size: '2, 2, 2', label: 'Crate', into: 'Box' }),
        line('echo', { value: '[Box.Name] [Box.Faces.Count] [Box.Size]' }),
      ),
    ).toEqual(['Crate 6 [2, 2, 2]']);
    expect(
      printed(
        line('hull', { label: 'Lump', into: 'L' }),
        line('cube'),
        line('translate', { v: '3, 0, 0' }),
        line('cube'),
        END,
        END,
        line('echo', { value: '[L.Name] [L.Size.x]' }),
      ),
    ).toEqual(['Lump 4']);
  });

  it('follows a brush moved by the block around it', () => {
    expect(
      printed(
        line('translate', { v: '0, 5, 0' }),
        line('cube', { into: 'C' }),
        END,
        line('echo', { value: '[C.Center]' }),
      ),
    ).toEqual(['[0, 5, 0]']);
  });

  it('adds what a block builds to [$Selected.Brushes], also after a Set narrowed it', () => {
    expect(
      printed(
        line('cube', { into: 'A' }),
        line('cube'),
        line('variable', { name: '$Selected.Brushes', value: '[A]' }),
        line('echo', { value: '[$Selected.Brushes.Count]' }),
        line('sphere', { into: 'S' }),
        line('echo', { value: '[$Selected.Brushes.Count] [$Selected.Brushes.Last.Name]' }),
      ),
    ).toEqual(['1', '2 sphere']);
  });
});
