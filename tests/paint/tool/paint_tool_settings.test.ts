import { describe, expect, it, vi } from 'vitest';
import { MemorySettingsStorage } from '@/settings/storage/settings_storage.js';
import {
  PAINT_TOOL_RADIUS_MAX,
  PAINT_TOOL_SETTINGS_STORAGE_KEY,
  PaintToolSettings,
} from '@/paint/tool/paint_tool_settings.js';
import { PAINT_SHAPE_IMAGE_ID } from '@/paint/raster/paint_tile_raster.js';

describe('PaintToolSettings', () => {
  it('falls back to defaults for missing or broken saved values', () => {
    expect(PaintToolSettings.parse(null).shape).toBe('round');
    expect(PaintToolSettings.parse('{nope').radius).toBeCloseTo(0.15);
    const parsed = PaintToolSettings.parse(JSON.stringify({ radius: 99, opacity: 'x', mode: 'pick', color: 0x123456 }));
    expect(parsed.radius).toBe(PAINT_TOOL_RADIUS_MAX);
    expect(parsed.opacity).toBe(1);
    expect(parsed.mode).toBe('paint');
    expect(parsed.color).toBe(0x123456);
  });

  it('saves changes and notifies listeners once per real change', () => {
    const storage = new MemorySettingsStorage();
    const settings = new PaintToolSettings(storage);
    const listener = vi.fn();
    settings.listen(listener);
    settings.setRadius(0.5);
    settings.setRadius(0.5);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(new PaintToolSettings(storage).radius).toBeCloseTo(0.5);
    expect(storage.getItem(PAINT_TOOL_SETTINGS_STORAGE_KEY)).toContain('"radius":0.5');
  });

  it('returns from picking to the last draw mode and never saves pick', () => {
    const storage = new MemorySettingsStorage();
    const settings = new PaintToolSettings(storage);
    settings.setMode('erase');
    settings.setMode('pick');
    expect(settings.drawMode).toBe('erase');
    expect(new PaintToolSettings(storage).mode).toBe('erase');
  });

  it('keeps recent colors unique and newest first', () => {
    const settings = new PaintToolSettings(null);
    settings.rememberColor(0x111111);
    settings.rememberColor(0x222222);
    settings.rememberColor(0x111111);
    expect(settings.recentColors.slice(0, 2)).toEqual([0x111111, 0x222222]);
    expect(new Set(settings.recentColors).size).toBe(settings.recentColors.length);
  });

  it('builds erase and image stamp styles', () => {
    const settings = new PaintToolSettings(null);
    settings.setShape('heart');
    settings.setMode('erase');
    expect(settings.style()).toMatchObject({ mode: 'erase', shape: 'round' });
    settings.setMode('paint');
    settings.setStampTextureId('decal.png');
    expect(settings.style()).toMatchObject({ shape: PAINT_SHAPE_IMAGE_ID, stampTextureId: 'decal.png' });
    settings.setShape('star');
    expect(settings.style()).toMatchObject({ shape: 'star', stampTextureId: '' });
  });
});
