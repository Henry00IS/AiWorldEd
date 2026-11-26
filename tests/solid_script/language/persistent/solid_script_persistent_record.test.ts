import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramHandle, solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import {
  solidScriptPersistentInputsWithoutLegacy,
  solidScriptPersistentParametersNormalize,
  solidScriptPersistentRecordApply,
  solidScriptPersistentRecordRead,
} from '@/solid_script/language/persistent/solid_script_persistent_record.js';
import { solidScriptValueText } from '@/solid_script/language/solid_script_value.js';

describe('SolidScript persistent record', () => {
  it('reads a structured record and older JSON text kept among the inputs', () => {
    const values = solidScriptPersistentRecordRead(
      { note: 'kept' },
      {
        Width: '2',
        '$persistent.count': '1',
        '$persistent.note': '"ignored"',
        '$persistent.history': '[1,2]',
        '$persistent.flag': 'true',
        '$persistent.words': '"He said \\"hello\\"\\nand then goodbye"',
      },
    );
    expect(values.get('note')).toBe('kept');
    expect(values.get('count')).toBe(1);
    expect(values.get('history')).toEqual([1, 2]);
    expect(values.get('flag')).toBe(true);
    expect(values.get('words')).toBe('He said "hello"\nand then goodbye');
    expect(values.has('width')).toBe(false);
  });

  it('reads an older Rotation object that kept its degrees, and skips a broken Dictionary', () => {
    const values = solidScriptPersistentRecordRead(
      {},
      {
        '$persistent.turn': '{"kind":"rotation","id":-1,"degrees":[0,90,0]}',
        '$persistent.prices': '{"kind":"data","id":-1,"name":"","mesh":false,"entries":{}}',
      },
    );
    expect(solidScriptValueText(values.get('turn'))).toBe('Rotation(0, 90, 0)');
    expect(values.has('prices')).toBe(false);
  });

  it('moves older persistent keys out of the inputs when a generator is normalized', () => {
    const kept = solidScriptPersistentParametersNormalize(
      {},
      { Width: '2', '$persistent.count': '3', '$persistent.history': '[1,2]' },
    );
    expect(kept.inputs).toEqual({ Width: '2' });
    expect(kept.persistent).toEqual({ count: 3, history: [1, 2] });
    expect(solidScriptPersistentInputsWithoutLegacy(kept.inputs)).toEqual({ Width: '2' });
  });

  it('applies values a handler set or deleted', () => {
    const next = solidScriptPersistentRecordApply({ count: 1, page: 'Shape' }, { count: 2 }, ['page']);
    expect(next).toEqual({ count: 2 });
  });

  it('loads older $persistent keys from a button press and a later run', () => {
    const script = solidScriptDocumentCreate([
      { command: 'input', values: { name: 'Add', type: 'Button' } },
      { command: 'when_button_pressed', values: { name: 'Add' } },
      { command: 'variable', values: { name: '$Persistent.Count', value: '[=[$Persistent.Count] + 1]' } },
      { command: 'end' },
      { command: 'echo', values: { value: '[$Persistent.Count]' } },
      { command: 'cube', values: {} },
    ]);
    const handled = solidScriptProgramHandle(script, { kind: 'button', name: 'Add' }, { '$persistent.count': '4' });
    expect(handled.error).toBeNull();
    expect(handled.persistent).toEqual({ count: 5 });
    const built = solidScriptProgramRun(script, { inputs: { '$persistent.count': '4' } });
    expect(built.messages).toEqual(['4']);
  });
});
