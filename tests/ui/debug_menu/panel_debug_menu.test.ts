import { describe, expect, it } from 'vitest';
import { PanelDebugMenu } from '@/ui/debug_menu/panel_debug_menu.js';
import { StoreAiCaptureDebug } from '@/ai/client/store_ai_capture_debug.js';
import { ManagerImage } from '@/texture/image_manager/manager_image.js';
import { debugMenuImagesCells } from '@/ui/debug_menu/debug_menu_images.js';
import { debugMenuMemorySections, type DebugMenuMemoryInput } from '@/ui/debug_menu/debug_menu_memory.js';
import type { ImageManagerFullImage } from '@/texture/image_manager/image_manager_types.js';

/** A manager with one loaded full image. */
function managerWithImage(): ManagerImage {
  const manager = new ManagerImage({
    now: () => 10_000,
    fullLoad: (_source, done) =>
      done({ width: 2048, height: 1024, close: () => {} } as unknown as ImageManagerFullImage),
    thumbnailMake: () => Promise.resolve(null),
  });
  manager.sourceSet({
    name: 'brick.png',
    origin: 'project',
    blob: new Blob(['x']),
    url: 'blob:x/1234',
    hash: () => 'abcdef0123456789',
  });
  manager.acquireFull('blob:x/1234');
  return manager;
}

describe('PanelDebugMenu', () => {
  it('has three tabs and builds only the selected one while open', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const panel = new PanelDebugMenu(host, null, new StoreAiCaptureDebug(), managerWithImage());
    const root = panel.getRootElement();
    const tabs = [...root.querySelectorAll('[role="tab"]')].map((tab) => tab.textContent);
    expect(tabs).toEqual(['View capture', 'Image handles', 'Memory']);
    expect(root.textContent).toContain('Debug Menu');
    panel.show();
    panel.tabSelect(1);
    expect(panel.tabSelected()).toBe('Image handles');
    expect(root.querySelector('table')?.textContent).toContain('brick.png');
    expect(root.textContent).toContain('8.00 MiB');
    panel.tabSelect(2);
    expect(root.textContent).toContain('Image manager — RAM');
    expect(root.textContent).toContain('MiB');
    panel.hide();
    expect(root.querySelector('table')).toBeNull();
    panel.dispose();
    host.remove();
  });

  it('lists a handle row with users per level, binary sizes and state', () => {
    const manager = managerWithImage();
    const row = manager.entriesInfo()[0]!;
    expect(debugMenuImagesCells(row, 12_000)).toEqual([
      'brick.png',
      'project',
      '#abcdef012345',
      '2048×1024',
      '0 –',
      '1',
      '0 –',
      '8.00 MiB',
      'ready',
      '2 s ago',
    ]);
  });

  it('shows every memory size in binary units', () => {
    const input: DebugMenuMemoryInput = {
      ledger: {
        entries: 2,
        thumbnailBytes: 1536,
        thumbnailCacheBytes: 0,
        fullBytes: 3 * 1024 * 1024,
        gpuBytesPerContext: 4 * 1024 * 1024,
        contexts: 2,
        gpuBytes: 8 * 1024 * 1024,
        pooledRamBytes: 0,
        pooledGpuBytes: 0,
        ramBudgetBytes: 1024 ** 3,
        vramBudgetBytes: 2 * 1024 ** 3,
        evictions: 0,
      },
      renderers: [{ label: 'shared_workspace', textures: 3, geometries: 4, programs: 2 }],
      gridCache: { count: 1, bytes: 512 },
      captures: { count: 0, bytes: 0 },
      heap: { used: 50 * 1024 * 1024, total: 64 * 1024 * 1024, limit: 4 * 1024 ** 3 },
      storage: null,
    };
    const text = JSON.stringify(debugMenuMemorySections(input));
    expect(text).toContain('1.50 KiB');
    expect(text).toContain('3.00 MiB');
    expect(text).toContain('8.00 MiB');
    expect(text).toContain('2.00 GiB');
    expect(text).toContain('4.00 GiB');
    expect(text).toContain('512 B');
    expect(text).not.toMatch(/\d (KB|MB|GB)\b/);
    expect(text).toContain('shared_workspace');
  });
});
