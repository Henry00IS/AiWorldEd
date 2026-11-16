import { describe, expect, it } from 'vitest';
import { SolidScriptScope } from '@/solid_script/language/solid_script_scope.js';

describe('SolidScriptScope', () => {
  it('keeps one variable and then many, in the order they were first set', () => {
    const scope = new SolidScriptScope(null);
    scope.variableDefine('first', 1);
    expect(scope.variableGet('first')).toBe(1);
    scope.variableDefine('first', 2);
    scope.variableDefine('second', 'two');
    scope.variableDefine('first', 3);
    expect([...scope.variablesVisible()]).toEqual([
      ['first', 3],
      ['second', 'two'],
    ]);
  });

  it('sets a variable where it lives and defines a new one in the innermost scope', () => {
    const outer = new SolidScriptScope(null);
    outer.variableDefine('count', 0);
    const inner = new SolidScriptScope(outer);
    inner.variableDefine('i', 4);
    inner.variableSet('count', 5);
    inner.variableSet('fresh', true);
    expect(outer.variableGet('count')).toBe(5);
    expect(outer.variableHas('fresh')).toBe(false);
    expect(inner.variableHome('fresh')).toBe(inner);
    expect(inner.variableOwn('i')).toBe(4);
    expect([...inner.variablesVisible().keys()]).toEqual(['count', 'i', 'fresh']);
  });

  it('forgets the only variable of a scope and tells a stored undefined from a missing name', () => {
    const outer = new SolidScriptScope(null);
    outer.variableDefine('shadowed', 'outer');
    const inner = new SolidScriptScope(outer);
    inner.variableDefine('shadowed', undefined);
    expect(inner.variableHas('shadowed')).toBe(true);
    expect(inner.variableGet('shadowed')).toBeUndefined();
    expect(inner.variableDelete('shadowed')).toBe(true);
    expect(inner.variableGet('shadowed')).toBe('outer');
    expect(inner.variableDelete('missing')).toBe(false);
    expect([...inner.variablesVisible()]).toEqual([['shadowed', 'outer']]);
  });
});
