import { describe, expect, it } from 'vitest';
import { solidScriptReference } from '@/solid_script/reference/solid_script_reference.js';

describe('the reference reads kinds from the declarations', () => {
  const text = solidScriptReference();

  it('says which kinds a field takes and what a variable field gives', () => {
    expect(text).toMatch(/- of \(Of,[^\n]*Takes a Brush, Face or Text, or a list of them/);
    expect(text).toMatch(/- variable \([^\n]*The variable it names gives Number: counter/);
  });

  it('says which kinds a built-in function gives and takes', () => {
    expect(text).toContain(
      'Abs(number: Number) gives Number: Drops the minus sign, so the number is always zero or more. -3 and 3 both become 3: that is just how far it is from zero.',
    );
  });

  it('no longer mentions a Type on Set', () => {
    expect(text).not.toMatch(/Set (may name|takes an optional) a? ?Type|A Type a Set declares/i);
  });
});
