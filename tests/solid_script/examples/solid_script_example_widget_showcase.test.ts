import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';
import { solidScriptDocumentEvent } from '@/solid_script/document/solid_script_document_event.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { SOLID_SCRIPT_EXAMPLES } from '@/solid_script/examples/solid_script_examples.js';

const SHOWCASE = SOLID_SCRIPT_EXAMPLES.find((example) => example.id === 'widgetShowcase');
const SCRIPT = solidScriptDocumentCreate([...(SHOWCASE?.lines ?? [])]);

/**
 * Runs the showcase with stored input values and lists its widgets.
 *
 * @param inputs Stored input values, Persistent ones too.
 * @returns Which toggles are on, and the kinds of the other widgets.
 */
function shown(inputs: Record<string, string>): { on: string[]; others: string[] } {
  const run = solidScriptProgramRun(SCRIPT, { inputs });
  expect(run.error).toBeNull();
  const toggles = run.widgets.filter((widget) => widget.kind === 'Toggle');
  return {
    on: toggles.filter((widget) => 'on' in widget && widget.on).map((widget) => widget.label),
    others: [...new Set(run.widgets.filter((widget) => widget.kind !== 'Toggle').map((widget) => widget.kind))],
  };
}

describe('Widget Showcase example', () => {
  it('is a Showcase example', () => {
    expect(SHOWCASE?.group).toBe('Showcase');
  });

  it('starts on the Shape page, with Widget Size and Widget Slider', () => {
    expect(shown({})).toEqual({ on: ['Shape'], others: ['Slider'] });
  });

  it('acts as a menu: a pressed toggle stores its page in Persistent.Page and turns the others off', () => {
    const place = solidScriptDocumentEvent(SCRIPT, { kind: 'button', name: 'PickPlace' }, {}, null).next;
    expect(shown(place)).toEqual({ on: ['Place'], others: ['Slider'] });
    const aim = solidScriptDocumentEvent(SCRIPT, { kind: 'button', name: 'PickAim' }, place, null).next;
    expect(shown(aim)).toEqual({ on: ['Aim'], others: ['Aim', 'Draw'] });
    const back = solidScriptDocumentEvent(SCRIPT, { kind: 'button', name: 'PickShape' }, aim, null).next;
    expect(shown(back).on).toEqual(['Shape']);
  });
});
