import { describe, it, expect } from 'vitest';
import {
  AI_CAPTURE_DEBUG_MAX_BYTES,
  AI_CAPTURE_DEBUG_MAX_ENTRIES,
  aiCaptureDebugEntryBytes,
  StoreAiCaptureDebug,
} from '@/ai/client/store_ai_capture_debug.js';
import { PanelDebugMenu } from '@/ui/debug_menu/panel_debug_menu.js';
import { ManagerImage } from '@/texture/image_manager/manager_image.js';

/**
 * Builds a minimal capture record for store tests.
 *
 * @param label Distinct base64 suffix.
 * @returns Record input.
 */
function makeRecord(label: string, base64 = btoa(label)) {
  return {
    mimeType: 'image/jpeg',
    base64,
    width: 64,
    height: 64,
    shading: 'solid',
    cameraSummary: 'cam (0, 0, 0) → (0, 0, 0)',
    framedBrushCount: 1,
    message: `Captured ${label}`,
  };
}

/** Unit tests for the AI capture debug store and floating panel list. */
describe('StoreAiCaptureDebug and the Debug Menu capture tab', () => {
  it('keeps the last 20 captures', () => {
    expect(AI_CAPTURE_DEBUG_MAX_ENTRIES).toBe(20);
  });

  it('measures captures by their decoded bytes', () => {
    expect(aiCaptureDebugEntryBytes({ base64: btoa('abc') })).toBe(3);
    expect(aiCaptureDebugEntryBytes({ base64: btoa('abcd') })).toBe(4);
    expect(aiCaptureDebugEntryBytes({ base64: btoa('abcde') })).toBe(5);
  });

  it('drops the oldest captures while over the byte limit, always keeping the newest', () => {
    const store = new StoreAiCaptureDebug();
    // Four characters of base64 per three bytes: each capture is a third of the limit.
    const third = 'A'.repeat(Math.floor(AI_CAPTURE_DEBUG_MAX_BYTES / 3 / 3) * 4);
    for (let index = 0; index < 5; index++) store.record(makeRecord(`big_${index}`, third));
    expect(store.count()).toBe(3);
    expect(store.list().map((entry) => entry.message)).toEqual(['Captured big_4', 'Captured big_3', 'Captured big_2']);
    expect(store.bytes()).toBeLessThanOrEqual(AI_CAPTURE_DEBUG_MAX_BYTES);
    const huge = 'A'.repeat(Math.ceil((AI_CAPTURE_DEBUG_MAX_BYTES * 2) / 3) * 4);
    store.record(makeRecord('huge', huge));
    expect(store.list().map((entry) => entry.message)).toEqual(['Captured huge']);
  });

  it('records captures newest first and trims to the max entry count', () => {
    const store = new StoreAiCaptureDebug();
    for (let index = 0; index < AI_CAPTURE_DEBUG_MAX_ENTRIES + 5; index++) {
      store.record(makeRecord(`img_${index}`));
    }
    expect(store.count()).toBe(AI_CAPTURE_DEBUG_MAX_ENTRIES);
    expect(store.list()[0]?.message).toContain(`img_${AI_CAPTURE_DEBUG_MAX_ENTRIES + 4}`);
  });

  it('notifies subscribers and clears all entries', () => {
    const store = new StoreAiCaptureDebug();
    let notifyCount = 0;
    const unsubscribe = store.subscribe(() => {
      notifyCount += 1;
    });
    store.record(makeRecord('a'));
    store.record(makeRecord('b'));
    store.clear();
    expect(store.count()).toBe(0);
    expect(notifyCount).toBe(3);
    unsubscribe();
    store.record(makeRecord('c'));
    expect(notifyCount).toBe(3);
  });

  it('renders list cards for stored captures and empty state after clear', () => {
    const store = new StoreAiCaptureDebug();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const panel = new PanelDebugMenu(host, null, store, new ManagerImage());
    expect(panel.isMountedInHost()).toBe(false);
    expect(host.contains(panel.getRootElement())).toBe(false);
    store.record(makeRecord('wall'));
    panel.show();
    expect(host.contains(panel.getRootElement())).toBe(true);
    const root = panel.getRootElement();
    expect(root.textContent).toContain('1 capture');
    expect(root.querySelectorAll('img').length).toBe(1);
    store.clear();
    expect(root.textContent).toContain('No AI captures yet');
    expect(root.querySelectorAll('img').length).toBe(0);
    store.record(makeRecord('floor'));
    expect(root.querySelectorAll('img').length).toBe(1);
    panel.hide();
    expect(host.contains(panel.getRootElement())).toBe(false);
    // Hidden: the images are gone and new captures build nothing.
    expect(root.querySelectorAll('img').length).toBe(0);
    store.record(makeRecord('ceiling'));
    expect(root.querySelectorAll('img').length).toBe(0);
    panel.dispose();
    host.remove();
  });
});
