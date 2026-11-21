import { describe, expect, it } from 'vitest';
import { Object3D } from 'three';
import { SolidScriptEditorHistory } from '@/solid_script/ui/solid_script_editor_history.js';

describe('SolidScript editor history', () => {
  it('keeps one history per user for the same script, so undo only steps own edits', () => {
    const node = new Object3D();
    const owner = {};
    const peer = {};
    expect(SolidScriptEditorHistory.of(node, 'step', owner)).toBe(SolidScriptEditorHistory.of(node, 'step', owner));
    expect(SolidScriptEditorHistory.of(node, 'step', owner)).not.toBe(SolidScriptEditorHistory.of(node, 'step', peer));
    expect(SolidScriptEditorHistory.of(node, 'step', null)).toBe(SolidScriptEditorHistory.of(node, 'step', null));
  });
});
