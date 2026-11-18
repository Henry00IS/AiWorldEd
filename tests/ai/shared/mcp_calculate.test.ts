import { describe, it, expect } from 'vitest';
import { calculateExpression } from '@/ai/shared/mcp_calculate.js';

/** Unit tests for the safe MCP arithmetic helper. */
describe('calculateExpression', () => {
  it('evaluates addition and multiplication with parentheses', () => {
    const result = calculateExpression('20+(0.5*12)');
    expect(result.ok).toBe(true);
    expect((result.data as { value: number }).value).toBe(26);
  });

  it('handles unary minus and division', () => {
    const result = calculateExpression('-(4+2)/2');
    expect(result.ok).toBe(true);
    expect((result.data as { value: number }).value).toBe(-3);
  });

  it('rejects division by zero', () => {
    const result = calculateExpression('1/0');
    expect(result.ok).toBe(false);
  });

  it('rejects invalid characters without eval', () => {
    const result = calculateExpression('alert(1)');
    expect(result.ok).toBe(false);
  });

  it('rejects empty expression', () => {
    expect(calculateExpression('   ').ok).toBe(false);
  });

  it('shares the SolidScript formula language: functions, constants, comparisons and vectors', () => {
    const value = (text: string) => (calculateExpression(text).data as { value: unknown } | undefined)?.value;
    expect(value('sqrt(16) + abs(-2)')).toBe(6);
    expect(value('round($Math.Pi * 100) / 100')).toBe(3.14);
    expect(value('7 % 4')).toBe(3);
    expect(value('max(2, 9, 4)')).toBe(9);
    expect(value('[1, 2, 3] * 2')).toEqual([2, 4, 6]);
    expect(value('2 > 1 ? 10 : 20')).toBe(10);
  });

  it('keeps answering only with finite numbers or vectors', () => {
    expect(calculateExpression('"text"').ok).toBe(false);
    expect(calculateExpression('1'.repeat(201)).ok).toBe(false);
  });
});
