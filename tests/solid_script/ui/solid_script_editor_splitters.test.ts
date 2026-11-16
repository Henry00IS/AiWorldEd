import { afterEach, describe, expect, it } from 'vitest';
import { MemorySettingsStorage } from '@/settings/storage/settings_storage.js';
import {
  SOLID_SCRIPT_EDITOR_SIZES_DEFAULT,
  SOLID_SCRIPT_EDITOR_SIZES_KEY,
  solidScriptEditorSizesRead,
  solidScriptEditorSplitter,
} from '@/solid_script/ui/solid_script_editor_splitters.js';

describe('script editor splitters', () => {
  afterEach(() => window.localStorage.removeItem(SOLID_SCRIPT_EDITOR_SIZES_KEY));

  it('starts with an output area 25% taller than before and reads stored sizes within limits', () => {
    expect(SOLID_SCRIPT_EDITOR_SIZES_DEFAULT.output).toBe(140);
    const storage = new MemorySettingsStorage();
    expect(solidScriptEditorSizesRead(storage)).toEqual(SOLID_SCRIPT_EDITOR_SIZES_DEFAULT);
    storage.setItem(SOLID_SCRIPT_EDITOR_SIZES_KEY, JSON.stringify({ palette: 9999, help: 'wide', output: 200 }));
    expect(solidScriptEditorSizesRead(storage)).toEqual({ palette: 480, help: 220, output: 200 });
    storage.setItem(SOLID_SCRIPT_EDITOR_SIZES_KEY, 'not json');
    expect(solidScriptEditorSizesRead(storage)).toEqual(SOLID_SCRIPT_EDITOR_SIZES_DEFAULT);
  });

  it('resizes an area by dragging and keeps the size for the next editor', () => {
    const sizes = { ...SOLID_SCRIPT_EDITOR_SIZES_DEFAULT };
    const output = document.createElement('div');
    const splitter = solidScriptEditorSplitter(output, 'output', sizes);
    expect(output.style.height).toBe('140px');
    splitter.dispatchEvent(new MouseEvent('pointerdown', { button: 0, clientY: 300 }));
    window.dispatchEvent(new MouseEvent('pointermove', { clientY: 250 }));
    expect(output.style.height).toBe('190px');
    window.dispatchEvent(new MouseEvent('pointerup'));
    expect(solidScriptEditorSizesRead().output).toBe(190);
    const palette = document.createElement('div');
    const grip = solidScriptEditorSplitter(palette, 'palette', sizes);
    grip.dispatchEvent(new MouseEvent('pointerdown', { button: 0, clientX: 100 }));
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 140 }));
    window.dispatchEvent(new MouseEvent('pointerup'));
    expect(palette.style.width).toBe('216px');
    expect(solidScriptEditorSizesRead()).toEqual({ ...SOLID_SCRIPT_EDITOR_SIZES_DEFAULT, output: 190, palette: 216 });
  });
});
