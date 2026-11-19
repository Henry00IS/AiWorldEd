import { describe, expect, it } from 'vitest';
import { modifierStackKindFind } from '@/modifier/stack/modifier_stack_catalog.js';
import { modifierStackFieldsNormalize } from '@/modifier/stack/modifier_stack_fields.js';
import type { ModifierStackField } from '@/modifier/stack/modifier_stack_types.js';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';
import {
  solidScriptDocumentInputLayout,
  solidScriptInputRulesHold,
  type SolidScriptInputLayoutItem,
} from '@/solid_script/document/solid_script_document_inputs.js';
import { SOLID_SCRIPT_EXAMPLES } from '@/solid_script/examples/solid_script_examples.js';
import { solidScriptExampleChoiceWord } from '@/solid_script/examples/solid_script_example_choices.js';

/** Inspector groups the ports do not rebuild yet. */
const SOLID_SCRIPT_MODIFIER_SKIP_GROUPS = new Set(['Caps', 'Randomize']);

/**
 * Fields whose visibility the ports cannot match yet: Show Inputs When cannot
 * watch a vector's length, so Size From and Pivot stay visible on Transform
 * Array.
 */
const SOLID_SCRIPT_MODIFIER_VISIBILITY_GAPS = new Set([
  'transform:bounds',
  'transform:pivotX',
  'transform:pivotY',
  'transform:pivotZ',
]);

/** Fields the ports compare, in inspector order, without Caps or Randomize. */
function solidScriptModifierCompared(fields: readonly ModifierStackField[]): ModifierStackField[] {
  return fields.filter(
    (field) =>
      !SOLID_SCRIPT_MODIFIER_SKIP_GROUPS.has(field.group ?? '') &&
      field.type !== 'object' &&
      field.type !== 'action' &&
      field.type !== 'widget' &&
      !field.hidden,
  );
}

/**
 * Input type that matches a modifier field.
 *
 * @param field Modifier field.
 * @returns Input type.
 */
function solidScriptModifierInputType(field: ModifierStackField): string {
  if (field.type === 'boolean') return 'Switch';
  if (field.type === 'choice') return 'Choice';
  if (field.type === 'number' && field.integer) return 'Count';
  return 'Number';
}

/**
 * Default text of an Input that matches a modifier field.
 *
 * @param field Modifier field.
 * @returns Default as typed.
 */
function solidScriptModifierInputDefault(field: ModifierStackField): string {
  if (field.type === 'boolean') return field.default ? 'Yes' : 'No';
  if (field.type === 'choice') {
    const match = (field.choices ?? []).find((choice) => choice.value === field.default);
    if (match) return solidScriptExampleChoiceWord(match.label);
  }
  return String(field.default);
}

/**
 * Input rows of a modifier example, in inspector order.
 *
 * @param lines Example lines.
 * @returns Input rows.
 */
function solidScriptModifierLayout(lines: readonly { command: string; values?: Record<string, string> }[]) {
  return solidScriptDocumentInputLayout(solidScriptDocumentCreate([...lines])).filter(
    (item): item is Extract<SolidScriptInputLayoutItem, { kind: 'input' }> => item.kind === 'input',
  );
}

/**
 * Parameter snapshots used to compare visibility: the defaults, then each
 * compared choice and switch flipped on its own.
 *
 * @param fields Compared fields.
 * @returns Snapshots.
 */
function solidScriptModifierSnapshots(fields: readonly ModifierStackField[]): Record<string, unknown>[] {
  const defaults = modifierStackFieldsNormalize(fields, {});
  const snapshots = [defaults];
  for (const field of fields) {
    if (field.type === 'boolean') snapshots.push({ ...defaults, [field.key]: !defaults[field.key] });
    if (field.type === 'choice')
      for (const choice of field.choices ?? [])
        if (choice.value !== field.default) snapshots.push({ ...defaults, [field.key]: choice.value });
  }
  return snapshots;
}

/**
 * Text of an example input for a modifier parameter snapshot, by input name.
 *
 * @param rows Example inputs.
 * @param fields Compared fields, matched to rows by label.
 * @param parameters Snapshot.
 * @returns Lookup.
 */
function solidScriptModifierValueOf(
  rows: readonly Extract<SolidScriptInputLayoutItem, { kind: 'input' }>[],
  fields: readonly ModifierStackField[],
  parameters: Record<string, unknown>,
): (name: string) => string {
  const byLabel = new Map(fields.map((field) => [field.label, field]));
  return (name) => {
    const row = rows.find((item) => item.input.name === name);
    const field = row ? byLabel.get(row.input.label) : undefined;
    if (!field) return '';
    return solidScriptModifierInputDefault({ ...field, default: (parameters[field.key] ?? field.default) as never });
  };
}

describe('SolidScript modifier example inputs', () => {
  const ports = SOLID_SCRIPT_EXAMPLES.filter((entry) => entry.modifier);

  it('lists a port for every built-in array and Shear modifier', () => {
    expect(ports.map((entry) => entry.modifier)).toEqual(['shear', 'linear', 'radial', 'transform', 'mirror']);
  });

  for (const example of ports) {
    it(`${example.name} Inputs match the ${example.modifier} inspector, except Caps and Randomize`, () => {
      const kind = modifierStackKindFind(example.modifier ?? '');
      expect(kind, example.modifier).toBeDefined();
      const fields = solidScriptModifierCompared(kind?.fields ?? []);
      const rows = solidScriptModifierLayout(example.lines);
      expect(
        rows.map((row) => row.input.label),
        'labels and order',
      ).toEqual(fields.map((field) => field.label));
      for (const [index, field] of fields.entries()) {
        const input = rows[index]?.input;
        expect(input, field.label).toBeDefined();
        if (!input) continue;
        expect(input.type, field.label).toBe(solidScriptModifierInputType(field));
        expect(input.fallback.trim(), field.label).toBe(solidScriptModifierInputDefault(field));
        expect(input.min, `${field.label} min`).toBe(field.min ?? null);
        expect(input.max, `${field.label} max`).toBe(field.max ?? null);
        expect(input.choices, field.label).toEqual(
          (field.choices ?? []).map((choice) => solidScriptExampleChoiceWord(choice.label)),
        );
        expect(rows[index]?.group, field.label).toBe(field.group ?? '');
      }
      for (const parameters of solidScriptModifierSnapshots(kind?.fields ?? [])) {
        const valueOf = solidScriptModifierValueOf(rows, fields, parameters);
        for (const [index, field] of fields.entries()) {
          const key = `${example.modifier}:${field.key}`;
          if (SOLID_SCRIPT_MODIFIER_VISIBILITY_GAPS.has(key)) continue;
          const shown = field.visible ? field.visible(parameters) : true;
          expect(
            solidScriptInputRulesHold(rows[index]?.when ?? [], valueOf),
            `${key} ${JSON.stringify(parameters)}`,
          ).toBe(shown);
        }
      }
    });
  }
});
