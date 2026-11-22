import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';

describe('Array copy numbers', () => {
  it('evaluates Count per object', () => {
    const result = solidScriptProgramRun(
      solidScriptDocumentCreate([
        { command: 'cube', values: { size: '1' } },
        { command: 'cube', values: { size: '2' } },
        { command: 'select_objects', values: {} },
        { command: 'array', values: { count: '[=[$Index] + 2]', offset: '3, 0, 0' } },
        { command: 'select_objects', values: { into: 'All' } },
        { command: 'echo', values: { value: '[All.Count]' } },
      ]),
    );
    expect(result.error?.message).toBeUndefined();
    expect(result.messages[0]).toBe('5');
  });

  it('numbers the original 0 and each copy from 1 under .Data.Copy, so later lines can vary by it', () => {
    const result = solidScriptProgramRun(
      solidScriptDocumentCreate([
        { command: 'cube', values: { size: '1' } },
        { command: 'select_objects', values: {} },
        { command: 'array', values: { count: '3', offset: '2, 0, 0' } },
        { command: 'select_objects', values: { into: 'All' } },
        { command: 'move_by', values: { by: '[=Vector(0, [$Item.Data.Copy], 0)]', of: '[All]' } },
        { command: 'select_objects', values: { into: 'Moved' } },
        {
          command: 'echo',
          values: { value: '[All.Count] [Moved(0).Data.Copy] [Moved(2).Data.Copy] [Moved(2).Center.Y]' },
        },
      ]),
    );
    expect(result.error?.message).toBeUndefined();
    expect(result.messages[0]).toBe('3 0 2 2');
  });
});
