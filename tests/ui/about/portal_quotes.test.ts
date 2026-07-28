import { describe, expect, it } from 'vitest';
import { PORTAL_QUOTES, selectPortalQuote } from '../../../src/ui/about/portal_quotes.js';

describe('portal_quotes', () => {
  it('should select a quote from the curated Portal collection', () => {
    const selectedQuote = selectPortalQuote(null, () => 0.5);
    expect(PORTAL_QUOTES).toContain(selectedQuote);
  });

  it('should exclude the previously displayed quote before selecting', () => {
    const previousQuote = PORTAL_QUOTES[0];
    const selectedQuote = selectPortalQuote(previousQuote, () => 0);
    expect(selectedQuote).toBe(PORTAL_QUOTES[1]);
  });

  it('should safely bound unexpected random source values', () => {
    expect(selectPortalQuote(null, () => -1)).toBe(PORTAL_QUOTES[0]);
    expect(selectPortalQuote(null, () => 1)).toBe(PORTAL_QUOTES.at(-1));
  });
});
