import { describe, expect, it } from 'vitest';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';

const LINES: SolidScriptLine[] = [
  { command: 'repeat', values: { variable: 'i', from: '1', to: '4' } },
  { command: 'cube', values: { size: '0.5, 0.5, 0.5' } },
  { command: 'end', values: {} },
  { command: 'cube', values: {} },
];

describe('SolidScript line profile', () => {
  it('counts how often each line ran and how long it took, inner lines included', () => {
    // Arrange
    const document = solidScriptDocumentCreate(LINES);

    // Act
    const run = solidScriptProgramRun(document, { profile: true });

    // Assert
    expect(run.error).toBeNull();
    expect(run.profile.get(1)?.count).toBe(1);
    expect(run.profile.get(2)?.count).toBe(4);
    expect(run.profile.get(4)?.count).toBe(1);
    expect(run.profile.has(3)).toBe(false);
    expect(run.profile.get(1)!.ms).toBeGreaterThanOrEqual(run.profile.get(2)!.ms);
  });

  it('keeps no profile unless it is asked for', () => {
    // Arrange
    const document = solidScriptDocumentCreate(LINES);

    // Act
    const run = solidScriptProgramRun(document);

    // Assert
    expect(run.profile.size).toBe(0);
  });

  it('times a line once while it calls itself', () => {
    // Arrange
    const document = solidScriptDocumentCreate([
      { command: 'function', values: { name: 'down', parameters: 'n' } },
      { command: 'if', values: { condition: '[local.n] > 0' } },
      { command: 'call', values: { name: 'down', values: '[=[local.n] - 1]' } },
      { command: 'end', values: {} },
      { command: 'end', values: {} },
      { command: 'call', values: { name: 'down', values: '3' } },
      { command: 'cube', values: {} },
    ]);

    // Act
    const run = solidScriptProgramRun(document, { profile: true });

    // Assert
    expect(run.error).toBeNull();
    expect(run.profile.get(3)?.count).toBe(3);
    expect(run.profile.get(6)?.count).toBe(1);
    expect(run.profile.get(3)!.ms).toBeLessThanOrEqual(run.profile.get(6)!.ms + 1e-9);
  });
});
