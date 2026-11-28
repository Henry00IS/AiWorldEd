import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptGeometryLeaves } from '@/solid_script/language/solid_script_geometry.js';
import { SOLID_SCRIPT_REPEAT_ROUNDS_MAX } from '@/solid_script/language/solid_script_limits.js';

const END: SolidScriptLine = { command: 'end' };
const STOP: SolidScriptLine = { command: 'stop_loop' };
const NEXT: SolidScriptLine = { command: 'next_round' };

/**
 * Runs script lines.
 *
 * @param lines Lines.
 * @returns Run result.
 */
function run(...lines: SolidScriptLine[]) {
  return solidScriptProgramRun(solidScriptDocumentCreate(lines));
}

/**
 * Makes an Echo line.
 *
 * @param value Message.
 * @returns Line.
 */
function echo(value: string): SolidScriptLine {
  return { command: 'echo', values: { value } };
}

/**
 * Makes a Set line.
 *
 * @param name Variable.
 * @param value Value.
 * @returns Line.
 */
function set(name: string, value: string): SolidScriptLine {
  return { command: 'variable', values: { name, value } };
}

/**
 * Makes a Repeat line from 0 up to, not including, a count.
 *
 * @param variable Counter.
 * @param to Rounds.
 * @returns Line.
 */
function repeat(variable: string, to: number): SolidScriptLine {
  return { command: 'repeat', values: { variable, from: '0', to: String(to) } };
}

/**
 * Wraps lines in an If.
 *
 * @param condition Condition.
 * @param inside Lines inside.
 * @returns Lines.
 */
function when(condition: string, ...inside: SolidScriptLine[]): SolidScriptLine[] {
  return [{ command: 'if', values: { condition } }, ...inside, END];
}

/**
 * Makes a Stop Loop or Next Round line with Levels.
 *
 * @param line Stop Loop or Next Round.
 * @param levels Levels.
 * @returns Line.
 */
function levels(line: SolidScriptLine, levels: string): SolidScriptLine {
  return { ...line, values: { levels } };
}

describe('SolidScript While', () => {
  it('runs while the condition holds, checked before each round', () => {
    const result = run(
      set('H', '0'),
      { command: 'while', values: { condition: '[H] < 3' } },
      echo('[H]'),
      set('H', '[=[H] + 1]'),
      END,
      echo('After [H]'),
    );
    expect(result.error).toBeNull();
    expect(result.messages).toEqual(['0', '1', '2', 'After 3']);
  });

  it('runs no round when the condition is false at the start', () => {
    const result = run(
      set('H', '5'),
      { command: 'while', values: { condition: '[H] < 3' } },
      echo('[H]'),
      END,
      echo('Done'),
    );
    expect(result.messages).toEqual(['Done']);
  });

  it('stops at the round limit with a message on the While line', () => {
    const result = run(echo('Start'), { command: 'while', values: { condition: '1 == 1' } }, END);
    expect(result.error?.line).toBe(2);
    expect(result.error?.message).toContain('While ran 10,000 rounds and its Condition is still Yes');
  });

  it('runs exactly the round limit when the condition turns false then', () => {
    const result = run(
      set('N', '0'),
      { command: 'while', values: { condition: `[N] < ${SOLID_SCRIPT_REPEAT_ROUNDS_MAX}` } },
      set('N', '[=[N] + 1]'),
      END,
      echo('[N]'),
    );
    expect(result.error).toBeNull();
    expect(result.messages).toEqual([String(SOLID_SCRIPT_REPEAT_ROUNDS_MAX)]);
  });

  it('counts its rounds from 0 in its Counter, which the condition reads', () => {
    const plain = run({ command: 'while', values: { condition: '[Round] < 2' } }, echo('[Round]'), END);
    expect(plain.messages).toEqual(['0', '1']);
    const named = run({ command: 'while', values: { variable: 'K', condition: '[K] * [K] < 10' } }, echo('[K]'), END);
    expect(named.messages).toEqual(['0', '1', '2', '3']);
    const placeholder = run({ command: 'while' }, echo('[Round]'), END);
    expect(placeholder.error).toBeNull();
    expect(placeholder.messages).toEqual(['0', '1', '2']);
  });

  it('builds the shapes of every round', () => {
    const result = run(
      set('H', '0'),
      { command: 'while', values: { condition: '[H] < 3' } },
      { command: 'cube' },
      set('H', '[=[H] + 1]'),
      END,
    );
    expect(result.error).toBeNull();
    expect(solidScriptGeometryLeaves(result.shapes)).toHaveLength(3);
  });
});

describe('SolidScript Stop Loop and Next Round', () => {
  it('Stop Loop leaves the loop and skips the rest of its round', () => {
    const result = run(repeat('I', 5), ...when('[I] == 2', STOP), echo('[I]'), END, echo('After'));
    expect(result.error).toBeNull();
    expect(result.messages).toEqual(['0', '1', 'After']);
  });

  it('Next Round skips the rest of the round only', () => {
    const result = run(
      { command: 'for_each', values: { variable: 'V', list: '1, 2, 3, 4' } },
      ...when('[V] % 2 == 0', NEXT),
      echo('[V]'),
      END,
    );
    expect(result.messages).toEqual(['1', '3']);
  });

  it('Stop Loop Levels 2 leaves a Repeat inside a Repeat in one go', () => {
    const result = run(
      repeat('I', 3),
      repeat('J', 3),
      ...when('[I] == 1 && [J] == 1', levels(STOP, '2')),
      echo('[I][J]'),
      END,
      END,
      echo('After'),
    );
    expect(result.messages).toEqual(['00', '01', '02', '10', 'After']);
  });

  it('Next Round Levels 2 goes on with the next round of the outer loop', () => {
    const result = run(
      repeat('I', 3),
      repeat('J', 3),
      ...when('[J] == 1', levels(NEXT, '2')),
      echo('[I][J]'),
      END,
      echo('Outer [I]'),
      END,
    );
    expect(result.messages).toEqual(['00', '10', '20']);
  });

  it('Levels 1 inside nested loops only leaves the inner one', () => {
    const result = run(
      repeat('I', 2),
      repeat('J', 3),
      ...when('[J] == 1', STOP),
      echo('[I][J]'),
      END,
      echo('Outer [I]'),
      END,
    );
    expect(result.messages).toEqual(['00', 'Outer 0', '10', 'Outer 1']);
  });

  it('works through blocks inside the loop, such as If and Transform', () => {
    const result = run(
      repeat('I', 4),
      { command: 'transform', values: { move: '[I], 0, 0' } },
      ...when('[I] == 2', STOP),
      { command: 'cube' },
      END,
      END,
    );
    expect(result.error).toBeNull();
    expect(solidScriptGeometryLeaves(result.shapes)).toHaveLength(2);
  });

  it('stops a While that would never end', () => {
    const result = run(
      set('H', '0'),
      { command: 'while', values: { condition: '1 == 1' } },
      set('H', '[=[H] + 1]'),
      ...when('[H] >= 4', STOP),
      END,
      echo('[H]'),
    );
    expect(result.error).toBeNull();
    expect(result.messages).toEqual(['4']);
  });

  it('stops outside any loop with a clear message', () => {
    expect(run(STOP).error?.message).toContain('Stop Loop only works inside a Repeat, For Each or While');
    expect(run(NEXT).error?.message).toContain('Next Round only works inside a Repeat, For Each or While');
  });

  it('stops when Levels is more than the loops around it, or not a whole number of 1 or more', () => {
    expect(run(repeat('I', 2), levels(STOP, '2'), END).error?.message).toContain(
      'Levels is 2, but this line is inside only 1 loop',
    );
    expect(run(repeat('I', 2), levels(NEXT, '0'), END).error?.message).toContain(
      'Levels needs a whole number of 1 or more',
    );
  });

  it('does not leave a loop around the call of a Function', () => {
    const result = run(
      { command: 'function', values: { name: 'Leave' } },
      STOP,
      END,
      repeat('I', 2),
      { command: 'call', values: { name: 'Leave' } },
      END,
    );
    expect(result.error?.line).toBe(2);
    expect(result.error?.message).toContain('of the same Function or part');
  });

  it('leaves loops inside a Function and the loop around the call goes on', () => {
    const result = run(
      { command: 'function', values: { name: 'Count' } },
      repeat('J', 5),
      ...when('[J] == 2', STOP),
      echo('J[J]'),
      END,
      END,
      repeat('I', 2),
      { command: 'call', values: { name: 'Count' } },
      echo('I[I]'),
      END,
    );
    expect(result.error).toBeNull();
    expect(result.messages).toEqual(['J0', 'J1', 'I0', 'J0', 'J1', 'I1']);
  });
});
