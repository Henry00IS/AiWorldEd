import { describe, expect, it } from 'vitest';
import { solidScriptCommandFind, solidScriptCommands } from '@/solid_script/commands/solid_script_command_catalog.js';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';
import { solidScriptDocumentListing } from '@/solid_script/document/solid_script_document_listing.js';

/**
 * Returns the listing text of one command line.
 *
 * @param command Command id.
 * @param values Stored values; missing ones use their defaults.
 * @returns Line as the script listing shows it.
 */
function listed(command: string, values: Record<string, string> = {}): string {
  const found = solidScriptCommandFind(command);
  if (!found) throw new Error(`unknown command ${command}`);
  return found.listingText(values);
}

describe('SolidScript listing', () => {
  it('writes the command name, two spaces and its configured values in quotes, without field captions', () => {
    expect(listed('cube', { size: '0.5, 0.5, 2.5' })).toBe("Cube '0.5, 0.5, 2.5'");
    expect(listed('sphere', { r: '2' })).toBe("Sphere radius '2'");
    expect(listed('translate', { v: '0, 0, 2.5' })).toBe("Translate by '0, 0, 2.5'");
    expect(listed('rotate', { a: '0, 0, 90' })).toBe("Rotate by '0, 0, 90' degrees");
    expect(listed('scale', { v: '1, 1, 2' })).toBe("Scale by '1, 1, 2'");
    expect(listed('mirror', { v: '1, 0, 0' })).toBe("Mirror across '1, 0, 0'");
    expect(listed('circle', { r: '1' })).toBe("Circle radius '1'");
  });

  it('only mentions an option when it differs from its default', () => {
    expect(listed('cube', { size: '1, 1, 1', anchor: 'Left, Bottom, Back' })).toBe(
      "Cube '1, 1, 1' (Anchor 'Left, Bottom, Back')",
    );
    expect(listed('cube', { size: '1, 1, 1', anchor: 'Center, Center, Center' })).toBe("Cube '1, 1, 1'");
    expect(listed('square', { size: '2, 1', anchor: 'Left, Front' })).toBe("Square '2, 1' (Anchor 'Left, Front')");
    expect(listed('linear_extrude', { height: '2', scale: '1, 1' })).toBe("Linear Extrude height '2'");
    expect(listed('linear_extrude', { height: '2', anchor: 'Bottom', scale: '0.5, 0.5' })).toBe(
      "Linear Extrude height '2' (Anchor 'Bottom', Top Scale '0.5, 0.5')",
    );
  });

  it('shows the sides and rings of round shapes only when changed', () => {
    expect(listed('sphere', { r: '1', sides: '16', rings: '8' })).toBe("Sphere radius '1'");
    expect(listed('sphere', { r: '1', sides: '8', rings: '4' })).toBe("Sphere radius '1' (Sides '8', Rings '4')");
    expect(listed('cylinder', { h: '2', r1: '1', r2: '1', sides: '6' })).toBe(
      "Cylinder height '2', radius '1' (Sides '6')",
    );
    expect(listed('circle', { r: '1', sides: '6' })).toBe("Circle radius '1' (Sides '6')");
  });

  it('reads differently depending on how the block is configured', () => {
    expect(listed('cylinder', { h: '2', r1: '0.5', r2: '0.5' })).toBe("Cylinder height '2', radius '0.5'");
    expect(listed('cylinder', { h: '2', r1: '0.5', r2: '0', anchor: 'Center, Bottom, Center' })).toBe(
      "Cylinder height '2', radius '0.5' to '0' (Anchor 'Center, Bottom, Center')",
    );
    expect(listed('repeat', { variable: 'i', from: '0', to: '3', step: '1' })).toBe("Repeat [i] from '0' to '3'");
    expect(listed('repeat', { variable: 'i', from: '0', to: '10', step: '2' })).toBe(
      "Repeat [i] from '0' to '10' (Step '2')",
    );
  });

  it('shows a lone variable as [name] and everything else as typed, in quotes', () => {
    expect(listed('variable', { name: 'width', value: '3' })).toBe("Set [width]: '3'");
    expect(listed('translate', { v: '[offset]' })).toBe('Translate by [offset]');
    expect(listed('sphere', { r: '[radius]' })).toBe('Sphere radius [radius]');
    expect(listed('translate', { v: '[=[i] * 2], 0, 0' })).toBe("Translate by '[=[i] * 2], 0, 0'");
    expect(listed('if', { condition: '[width] > 2' })).toBe("If '[width] > 2'");
    expect(listed('echo', { value: 'Hello' })).toBe("@ Echo 'Hello'");
    expect(listed('echo', { value: '[width]' })).toBe('@ Echo [width]');
  });

  it('marks notes, parts and plain block lines with their own short forms', () => {
    expect(listed('note', { text: 'Two posts and a lintel' })).toBe('*** Two posts and a lintel');
    expect(listed('part', { name: 'post' })).toBe('Define Part post');
    expect(listed('use_part', { name: 'post' })).toBe("Use Part 'post'");
    expect(listed('union')).toBe('Union');
    expect(listed('else')).toBe('Else');
    expect(listed('blank')).toBe('');
  });

  it('starts every line with its command label in Start Case, never a short code like fn', () => {
    const marks: Record<string, string> = { echo: '@ ', note: '***' };
    for (const command of solidScriptCommands) {
      if (command.id === 'blank' || command.id === 'note') continue;
      const text = command.listingText(command.valuesDefault());
      expect(text.startsWith((marks[command.id] ?? '') + command.label), command.id).toBe(true);
      for (const word of command.label.split(' ')) expect(word[0], command.label).toBe(word[0]?.toUpperCase());
    }
  });

  it('names a block in full on its first line and keeps its End line short', () => {
    const lines = (command: string, values: Record<string, string>) =>
      solidScriptDocumentListing(solidScriptDocumentCreate([{ command, values }, { command: 'end' }]));
    expect(lines('function', { name: 'area', parameters: 'w, d' })).toEqual([
      'Function area with inputs w, d',
      'End Function',
    ]);
    expect(lines('function', { name: 'area', parameters: '' })).toEqual(['Function area', 'End Function']);
    expect(lines('when_button_pressed', { name: 'Reset' })).toEqual(['When Button Pressed Reset', 'End When']);
    expect(lines('when_input_changes', { name: 'width' })).toEqual(['When Input Changes width', 'End When']);
    expect(lines('part', { name: 'post' })).toEqual(['Define Part post', 'End Part']);
    expect(lines('repeat', { variable: 'i', from: '0', to: '3' })).toEqual([
      "Repeat [i] from '0' to '3'",
      'End Repeat',
    ]);
    expect(lines('if', { condition: '[i] > 2' })).toEqual(["If '[i] > 2'", 'End If']);
  });

  it('writes calls, results and inspector lines in plain words', () => {
    expect(listed('call', { name: 'area', values: '2, 3', result: 'size' })).toBe(
      "Call area with '2, 3', result in [size]",
    );
    expect(listed('call', { name: 'Thread', values: '4' })).toBe("Call Thread with '4'");
    expect(listed('call', { name: 'tick', values: '', result: '' })).toBe('Call tick');
    expect(listed('function', { name: 'Thread', parameters: 'N' })).toBe('Function Thread with input N');
    expect(listed('function', { name: 'area', parameters: 'w, d' })).toBe('Function area with inputs w, d');
    expect(solidScriptCommandFind('function')?.parameters.map((field) => field.key)).toEqual(['name', 'parameters']);
    expect(listed('return', { value: '[local.x]' })).toBe('Return [local.x]');
    expect(listed('set_input', { name: 'width', value: '2' })).toBe("Set Input width to '2'");
    expect(listed('show_message', { text: 'Too thin' })).toBe("Show Message 'Too thin'");
    expect(listed('input', { name: 'width', type: 'Number', default: '1' })).toBe('Input width (Number) = 1');
    expect(listed('remove_item', { target: 'points(1)' })).toBe('Remove Item [points(1)]');
  });

  it('has no Detail command any more', () => {
    expect(solidScriptCommandFind('detail')).toBeUndefined();
  });

  it('tags every piece so values and variables can be shown in full colour', () => {
    const parts = solidScriptCommandFind('translate')?.listing({ v: '[=[i] * [width]], 0, 0' }) ?? [];
    expect(parts.map((part) => part.kind)).toEqual(['name', 'word', 'value']);
    expect(
      solidScriptCommandFind('repeat')
        ?.listing({ variable: 'i' })
        .map((part) => part.kind),
    ).toEqual(['name', 'variable', 'word', 'value', 'word', 'value']);
    expect(
      solidScriptCommandFind('note')
        ?.listing({ text: 'x' })
        .map((part) => part.kind),
    ).toEqual(['note']);
  });
});

describe('SolidScript listing spacing', () => {
  it('never shows two spaces in a row, with optional values empty or filled', () => {
    const doubled: string[] = [];
    for (const command of solidScriptCommands) {
      const filled = Object.fromEntries(
        command.parameters.map((parameter) => [
          parameter.key,
          parameter.words?.[0]?.word ?? (parameter.type === 'boolean' ? 'true' : 'A'),
        ]),
      );
      const empty = Object.fromEntries(command.parameters.map((parameter) => [parameter.key, '']));
      for (const values of [{}, empty, filled]) {
        const text = command.listingText(values);
        if (/ {2}/.test(text)) doubled.push(`${command.id}: ${text}`);
      }
    }
    expect(doubled).toEqual([]);
  });
});
