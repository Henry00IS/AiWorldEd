import { describe, expect, it } from 'vitest';
import { ModifierStackBudget } from '@/modifier/stack/evaluate/modifier_stack_budget.js';

describe('ModifierStackBudget', () => {
  it('grants whole copies and reports no limit while requests fit', () => {
    const budget = new ModifierStackBudget(10);
    expect(budget.takeCopies(2, 3)).toBe(3);
    expect(budget.remaining()).toBe(4);
    expect(budget.limited()).toBe(false);
  });

  it('reports a limit once a request gets fewer copies than it asked for', () => {
    const budget = new ModifierStackBudget(5);
    expect(budget.takeCopies(2, 3)).toBe(2);
    expect(budget.limited()).toBe(true);
    expect(budget.takeCopies(1, 1)).toBe(1);
    expect(budget.limited()).toBe(true);
  });
});
