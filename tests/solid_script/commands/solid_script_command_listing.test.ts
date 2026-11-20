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
    expect(listed('sphere', { r: '2' })).toBe("Sphere Radius '2'");
    expect(listed('transform', { move: '0, 0, 2.5' })).toBe("Transform Move '0, 0, 2.5'");
    expect(listed('move_by', { by: '1, 0, 0' })).toBe("Move By '1, 0, 0'");
    expect(listed('move_to', { to: '3, 1, 0' })).toBe("Move To '3, 1, 0'");
    expect(listed('rotate_by', { by: '0, 0, 90' })).toBe("Rotate By '0, 0, 90' Degrees");
    expect(listed('rotate_to', { to: '0, 90, 0' })).toBe("Rotate To '0, 90, 0' Degrees");
    expect(listed('scale_by', { by: '1, 1, 2' })).toBe("Scale By '1, 1, 2'");
    expect(listed('scale_to', { to: '4, 2, 1' })).toBe("Scale To '4, 2, 1'");
    expect(listed('mirror', { v: '1, 0, 0' })).toBe("Mirror Across '1, 0, 0'");
    expect(listed('circle', { r: '1' })).toBe("Circle Radius '1'");
  });

  it('only mentions an option when it differs from its default', () => {
    expect(listed('cube', { size: '1, 1, 1', anchor: 'Left, Bottom, Back' })).toBe(
      "Cube '1, 1, 1' (Anchor 'Left, Bottom, Back')",
    );
    expect(listed('cube', { size: '1, 1, 1', anchor: 'Center, Center, Center' })).toBe("Cube '1, 1, 1'");
    expect(listed('cube', { size: '1, 1, 1', mode: 'Additive' })).toBe("Cube '1, 1, 1'");
    expect(listed('cube', { size: '1, 1, 1', mode: 'additive' })).toBe("Cube '1, 1, 1'");
    expect(listed('cube', { size: '1, 1, 1', anchor: 'center,center,center' })).toBe("Cube '1, 1, 1'");
    expect(listed('cube', { size: '1, 1, 1', label: 'High' })).toBe("Cube '1, 1, 1' Named 'High'");
    expect(listed('cube', { size: '1, 1, 1', anchor: 'Center, Bottom, Center' })).toBe(
      "Cube '1, 1, 1' (Anchor 'Center, Bottom, Center')",
    );
    expect(listed('square', { size: '2, 1', anchor: 'Left, Front' })).toBe("Square '2, 1' (Anchor 'Left, Front')");
    expect(listed('linear_extrude', { height: '2', scale: '1, 1' })).toBe("Linear Extrude Height '2'");
    expect(listed('linear_extrude', { height: '2', anchor: 'Center', scale: '0.5, 0.5' })).toBe(
      "Linear Extrude Height '2' (Top Scale '0.5, 0.5')",
    );
    expect(listed('linear_extrude', { height: '2', anchor: 'Bottom', scale: '0.5, 0.5' })).toBe(
      "Linear Extrude Height '2' (Anchor 'Bottom', Top Scale '0.5, 0.5')",
    );
  });

  it('shows Textures on Input Brushes, and every Transform UVs field, only when it differs from its default', () => {
    expect(listed('input_brushes')).toBe('Input Brushes');
    expect(listed('input_brushes', { textures: 'Move With Shape' })).toBe('Input Brushes');
    expect(listed('input_brushes', { textures: 'World Aligned', into: 'Copy' })).toBe(
      "Input Brushes Textures 'World Aligned' (Into 'Copy')",
    );
    expect(listed('transform_uvs')).toBe('Transform UVs');
    expect(listed('transform_uvs', { offset: '0, 0, 0', scale: '2,2,2', rotate: '0', textures: '' })).toBe(
      "Transform UVs Scale '2,2,2'",
    );
    expect(listed('transform_uvs', { textures: 'Move With Shape', of: '[Top]' })).toBe('Transform UVs (Of [Top])');
    expect(listed('transform_uvs', { rotate: '90', textures: 'World Aligned' })).toBe(
      "Transform UVs Rotate '90' (Textures 'World Aligned')",
    );
  });

  it('shows the sides and rings of round shapes only when changed', () => {
    expect(listed('sphere', { r: '1', sides: '16', rings: '8' })).toBe("Sphere Radius '1'");
    expect(listed('sphere', { r: '1', sides: '8', rings: '4' })).toBe("Sphere Radius '1' (Sides '8', Rings '4')");
    expect(listed('cylinder', { h: '2', r1: '1', r2: '1', sides: '6' })).toBe(
      "Cylinder Height '2', Radius '1' (Sides '6')",
    );
    expect(listed('circle', { r: '1', sides: '6' })).toBe("Circle Radius '1' (Sides '6')");
  });

  it('reads differently depending on how the block is configured', () => {
    expect(listed('cylinder', { h: '2', r1: '0.5', r2: '0.5' })).toBe("Cylinder Height '2', Radius '0.5'");
    expect(listed('cylinder', { h: '2', r1: '0.5', r2: '0', anchor: 'Center, Center, Center' })).toBe(
      "Cylinder Height '2', Radius '0.5' To '0'",
    );
    expect(listed('repeat', { variable: 'i', from: '0', to: '3', step: '1' })).toBe(
      "Repeat 'i' From '0' To '3' (Exclusive)",
    );
    expect(listed('repeat', { variable: 'i', from: '0', to: '10', step: '2' })).toBe(
      "Repeat 'i' From '0' To '10' (Exclusive) (Step '2')",
    );
  });

  it('shows a lone variable as [name] and everything else as typed, in quotes', () => {
    expect(listed('variable', { name: 'width', value: '3' })).toBe("Set 'width': '3'");
    expect(listed('transform', { move: '[offset]' })).toBe('Transform Move [offset]');
    expect(listed('sphere', { r: '[radius]' })).toBe('Sphere Radius [radius]');
    expect(listed('transform', { move: '[=[i] * 2], 0, 0' })).toBe("Transform Move '[=[i] * 2], 0, 0'");
    expect(listed('if', { condition: '[width] > 2' })).toBe("If '[width] > 2'");
    expect(listed('echo', { value: 'Hello' })).toBe("@ Echo 'Hello'");
    expect(listed('echo', { value: '[width]' })).toBe('@ Echo [width]');
  });

  it('marks notes, parts and plain block lines with their own short forms', () => {
    expect(listed('note', { text: 'Two posts and a lintel' })).toBe('*** Two posts and a lintel');
    expect(listed('part', { name: 'post' })).toBe("Define Part 'post'");
    expect(listed('part', { name: 'post', mode: 'Subtractive' })).toBe("Define Part 'post' (Mode 'Subtractive')");
    expect(listed('group')).toBe('Group');
    expect(listed('group', { mode: 'Pass-Through' })).toBe("Group (Mode 'Pass-Through')");
    expect(listed('output', { of: '[post]' })).toBe('Output [post]');
    expect(listed('hull')).toBe('Hull');
    expect(listed('else')).toBe('Else');
    expect(listed('blank')).toBe('');
  });

  it.each([
    ['Hello', '*** Hello'],
    ['', '***'],
    ["it's 'quoted' and \"double\"", `*** it's 'quoted' and "double"`],
    ['[I] and [=1 + 2] $[ "q"', '*** [I] and [=1 + 2] $[ "q"'],
    ['a [ alone', '*** a [ alone'],
    ['  spaced out  ', '***   spaced out  '],
  ])('writes the Note %j as the rest of the line after ***, exactly as typed', (text, line) => {
    expect(listed('note', { text })).toBe(line);
    expect(line.slice(4)).toBe(text);
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
      "Function 'area' With Inputs 'w, d'",
      'End Function',
    ]);
    expect(lines('function', { name: 'area', parameters: '' })).toEqual(["Function 'area'", 'End Function']);
    expect(lines('when_button_pressed', { name: 'Reset' })).toEqual(["When Button Pressed 'Reset'", 'End When']);
    expect(lines('when_input_changes', { name: 'width' })).toEqual(["When Input Changes 'width'", 'End When']);
    expect(lines('part', { name: 'post' })).toEqual(["Define Part 'post'", 'End Part']);
    expect(lines('repeat', { variable: 'i', from: '0', to: '3' })).toEqual([
      "Repeat 'i' From '0' To '3' (Exclusive)",
      'End Repeat',
    ]);
    expect(lines('if', { condition: '[i] > 2' })).toEqual(["If '[i] > 2'", 'End If']);
  });

  it('writes calls, results and inspector lines in plain words', () => {
    expect(listed('call', { name: 'area', values: '2, 3', result: 'size' })).toBe(
      "Call 'area' With '2, 3', Result In 'size'",
    );
    expect(listed('call', { name: 'Thread', values: '4' })).toBe("Call 'Thread' With '4'");
    expect(listed('call', { name: 'tick', values: '', result: '' })).toBe("Call 'tick'");
    expect(listed('function', { name: 'Thread', parameters: 'N' })).toBe("Function 'Thread' With Input 'N'");
    expect(listed('function', { name: 'area', parameters: 'w, d' })).toBe("Function 'area' With Inputs 'w, d'");
    expect(solidScriptCommandFind('function')?.parameters.map((field) => field.key)).toEqual(['name', 'parameters']);
    expect(listed('return', { value: '[local.x]' })).toBe('Return [local.x]');
    expect(listed('set_input', { name: 'width', value: '2' })).toBe("Set Input 'width' To '2'");
    expect(listed('show_message', { text: 'Too thin' })).toBe("Show Message 'Too thin'");
    expect(listed('input', { name: 'width', type: 'Number', default: '1' })).toBe("Input 'width' ('Number') = '1'");
    expect(listed('remove_item', { target: 'points(1)' })).toBe("Remove Item 'points(1)'");
  });

  it('has no Detail command any more', () => {
    expect(solidScriptCommandFind('detail')).toBeUndefined();
  });

  it('tags every piece so values and variables can be shown in full colour', () => {
    const parts = solidScriptCommandFind('transform')?.listing({ move: '[=[i] * [width]], 0, 0' }) ?? [];
    expect(parts.map((part) => part.kind)).toEqual(['name', 'word', 'value']);
    expect(
      solidScriptCommandFind('repeat')
        ?.listing({ variable: 'i' })
        .map((part) => part.kind),
    ).toEqual(['name', 'value', 'word', 'value', 'word', 'value', 'word']);
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
