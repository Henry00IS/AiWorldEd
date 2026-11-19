import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemorySettingsStorage } from '@/settings/storage/settings_storage.js';
import { solidScriptDebugStepLimit } from '@/solid_script/debug/solid_script_debug_steps.js';
import { solidScriptEditorCurrentGet } from '@/solid_script/ui/solid_script_editor_open.js';
import {
  SOLID_SCRIPT_EDITOR_DEBUG_SPEED_KEY,
  solidScriptEditorDebugSpeedMs,
  solidScriptEditorDebugSpeedRead,
  solidScriptEditorDebugSpeedWrite,
} from '@/solid_script/ui/solid_script_editor_debug_speed.js';
import { editorFixture, find, tool } from './solid_script_editor_fixture.js';

/** Five solids to step through. */
const FIVE = Array.from({ length: 5 }, () => ({ command: 'cube' }));

/**
 * The Debug Speed choice in the Settings tab.
 *
 * @returns Select element.
 */
function speedPicker(): HTMLSelectElement {
  return find<HTMLSelectElement>('select[aria-label="Debug Speed"]');
}

/**
 * Picks a Debug speed the way a click on the list does.
 *
 * @param speed Speed name.
 */
function speedPick(speed: string): void {
  const picker = speedPicker();
  picker.value = speed;
  picker.dispatchEvent(new Event('change', { bubbles: true }));
}

afterEach(() => {
  solidScriptEditorCurrentGet()?.close();
  document.body.replaceChildren();
  localStorage.clear();
  vi.useRealTimers();
});

describe('SolidScript editor: Debug speed', () => {
  it('keeps the speed on this computer, Normal by default, as fast as Debug always stepped', () => {
    const storage = new MemorySettingsStorage();
    expect(solidScriptEditorDebugSpeedRead(storage)).toBe('Normal');
    expect(solidScriptEditorDebugSpeedMs('Normal')).toBe(400);
    solidScriptEditorDebugSpeedWrite('Fast', storage);
    expect(solidScriptEditorDebugSpeedRead(storage)).toBe('Fast');
    storage.setItem(SOLID_SCRIPT_EDITOR_DEBUG_SPEED_KEY, 'Warp');
    expect(solidScriptEditorDebugSpeedRead(storage)).toBe('Normal');
    expect(solidScriptEditorDebugSpeedMs('Slow')).toBeGreaterThan(solidScriptEditorDebugSpeedMs('Normal'));
    expect(solidScriptEditorDebugSpeedMs('Fastest')).toBeLessThan(solidScriptEditorDebugSpeedMs('Fast'));
  });

  it('shows a Debug Speed choice in Settings, from Slow to Fastest, with examples in its tooltip', () => {
    editorFixture(FIVE);
    const picker = speedPicker();
    expect([...picker.options].map((option) => option.value)).toEqual(['Slow', 'Normal', 'Fast', 'Fastest']);
    expect(picker.value).toBe('Normal');
    expect(picker.closest('label')?.title).toMatch(/one solid per second/);
    expect(picker.closest('fieldset')?.querySelector('legend')?.textContent).toBe('Debug');
  });

  it('stores a picked speed and plays the next Debug run at it', () => {
    vi.useFakeTimers();
    const { node, stepId } = editorFixture(FIVE);
    speedPick('Slow');
    expect(localStorage.getItem(SOLID_SCRIPT_EDITOR_DEBUG_SPEED_KEY)).toBe('Slow');
    tool('Debug').click();
    vi.advanceTimersByTime(999);
    expect(solidScriptDebugStepLimit(node, stepId)).toBe(0);
    vi.advanceTimersByTime(1);
    expect(solidScriptDebugStepLimit(node, stepId)).toBe(1);
  });

  it('changes the pace of a Debug run that is playing at once', () => {
    vi.useFakeTimers();
    const { node, stepId } = editorFixture(FIVE);
    tool('Debug').click();
    vi.advanceTimersByTime(400);
    expect(solidScriptDebugStepLimit(node, stepId)).toBe(1);
    speedPick('Fast');
    vi.advanceTimersByTime(150);
    expect(solidScriptDebugStepLimit(node, stepId)).toBe(2);
    vi.advanceTimersByTime(150);
    expect(solidScriptDebugStepLimit(node, stepId)).toBe(3);
  });

  it('opens with the speed picked before', () => {
    localStorage.setItem(SOLID_SCRIPT_EDITOR_DEBUG_SPEED_KEY, 'Fastest');
    vi.useFakeTimers();
    const { node, stepId } = editorFixture(FIVE);
    expect(speedPicker().value).toBe('Fastest');
    tool('Debug').click();
    vi.advanceTimersByTime(40 * 2);
    expect(solidScriptDebugStepLimit(node, stepId)).toBe(2);
  });
});
