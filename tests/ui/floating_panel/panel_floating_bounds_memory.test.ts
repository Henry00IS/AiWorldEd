import { describe, expect, it } from 'vitest';
import { MemorySettingsStorage } from '@/settings/storage/settings_storage.js';
import { PanelFloatingBoundsMemory } from '@/ui/floating_panel/panel_floating_bounds_memory.js';

/** Storage key used by the tests. */
const KEY = 'test.window.bounds';

describe('PanelFloatingBoundsMemory', () => {
  it('reads nothing before a window was remembered', () => {
    expect(new PanelFloatingBoundsMemory(KEY, new MemorySettingsStorage()).read()).toBeNull();
  });

  it('remembers a rectangle in whole pixels', () => {
    const storage = new MemorySettingsStorage();
    new PanelFloatingBoundsMemory(KEY, storage).write({ left: 10.4, top: 20.6, width: 700.2, height: 480.9 });
    expect(new PanelFloatingBoundsMemory(KEY, storage).read()).toEqual({ left: 10, top: 21, width: 700, height: 481 });
  });

  it('ignores a rectangle without a size, such as a window that is not laid out', () => {
    const storage = new MemorySettingsStorage();
    const memory = new PanelFloatingBoundsMemory(KEY, storage);
    memory.write({ left: 5, top: 5, width: 300, height: 200 });
    memory.write({ left: 0, top: 0, width: 0, height: 0 });
    expect(memory.read()).toEqual({ left: 5, top: 5, width: 300, height: 200 });
  });

  it('reads broken or partial values as nothing', () => {
    const storage = new MemorySettingsStorage();
    const memory = new PanelFloatingBoundsMemory(KEY, storage);
    const brokenValues = [
      '{',
      '[]',
      '"wide"',
      '{"left":1,"top":2,"width":3}',
      '{"left":1,"top":2,"width":"3","height":4}',
      '{"left":1,"top":2,"width":-3,"height":4}',
    ];
    for (const broken of brokenValues) {
      storage.setItem(KEY, broken);
      expect(memory.read(), broken).toBeNull();
    }
  });
});
