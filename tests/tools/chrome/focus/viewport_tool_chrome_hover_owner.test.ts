import { describe, expect, it } from 'vitest';
import type { ViewportToolChromeHost } from '@/tools/chrome/host/viewport_tool_chrome_host.js';
import { ViewportToolChromeHoverOwner } from '@/tools/chrome/focus/viewport_tool_chrome_hover_owner.js';

/**
 * Builds a hover-host stub that records ownership without mounting chrome.
 *
 * @returns Stub host.
 */
function createHost(): ViewportToolChromeHost & { owned: boolean } {
  const host = {
    owned: false,
    setHoverOwned(owned: boolean) {
      this.owned = owned;
    },
    isHoverOwned() {
      return this.owned;
    },
  };
  return host as unknown as ViewportToolChromeHost & { owned: boolean };
}

describe('ViewportToolChromeHoverOwner', () => {
  it('hides hover-owned tool chrome while play mode is suspended and restores it after', () => {
    const owner = new ViewportToolChromeHoverOwner();
    const first = createHost();
    const second = createHost();
    owner.register(first);
    owner.register(second);
    owner.setOwner(first);
    expect(first.owned).toBe(true);
    expect(second.owned).toBe(false);

    owner.setSuspended(true);
    expect(first.owned).toBe(false);
    expect(second.owned).toBe(false);

    owner.setOwner(second);
    expect(first.owned).toBe(false);
    expect(second.owned).toBe(false);

    owner.setSuspended(false);
    expect(first.owned).toBe(false);
    expect(second.owned).toBe(true);
  });
});
