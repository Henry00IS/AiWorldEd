import { describe, expect, it } from 'vitest';
import { MenuRegistry } from '@/ui/menu/menu_registry.js';

describe('MenuRegistry', () => {
  it('replaces a menu by path and only removes its own registration', () => {
    const registry = new MenuRegistry();
    const removeFirst = registry.add('Face', () => []);
    const removeSecond = registry.add('Face', () => [], false);
    removeFirst();
    expect(registry.list().map((menu) => [menu.path, menu.agentRunnable])).toEqual([['Face', false]]);
    removeSecond();
    expect(registry.list()).toEqual([]);
  });
});
