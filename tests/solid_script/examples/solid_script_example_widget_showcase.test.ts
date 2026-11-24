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

  it('acts as a menu: a pressed toggle stores its page in $Persistent.Page and turns the others off', () => {
    const place = solidScriptDocumentEvent(SCRIPT, { kind: 'button', name: 'PickPlace' }, {}, null).next;
    expect(shown(place)).toEqual({ on: ['Place'], others: ['Slider'] });
    const aim = solidScriptDocumentEvent(SCRIPT, { kind: 'button', name: 'PickAim' }, place, null).next;
    expect(shown(aim)).toEqual({ on: ['Aim'], others: ['Aim', 'Draw'] });
    const back = solidScriptDocumentEvent(SCRIPT, { kind: 'button', name: 'PickShape' }, aim, null).next;
    expect(shown(back).on).toEqual(['Shape']);
  });

  it('keeps every widget outside the box and lists the menu toggles at one point beside it', () => {
    const place = solidScriptDocumentEvent(SCRIPT, { kind: 'button', name: 'PickPlace' }, {}, null).next;
    const aim = solidScriptDocumentEvent(SCRIPT, { kind: 'button', name: 'PickAim' }, place, null).next;
    const within = (value: number, low: number, high: number): boolean => value > low + 0.01 && value < high - 0.01;
    const turned = ([x, y, z]: readonly number[], angle: number): number[] => [
      x! * Math.cos(angle) - z! * Math.sin(angle),
      y!,
      x! * Math.sin(angle) + z! * Math.cos(angle),
    ];
    const square = ([x, y, z]: readonly number[]): boolean =>
      within(x!, -1, 1) && within(z!, -1, 1) && (within(y!, -0.5, 0.5) || within(y!, 0.7, 0.8));
    const inside = (point: readonly number[]): boolean => square(turned(point, Math.PI / 6));
    for (const inputs of [{}, place, aim]) {
      const run = solidScriptProgramRun(SCRIPT, { inputs });
      const points = run.widgets.map((widget) => {
        const record = widget as unknown as Record<string, unknown>;
        const origin = (record['at'] ?? record['origin']) as number[];
        const direction = record['direction'] as number[] | undefined;
        const value = typeof record['value'] === 'number' ? record['value'] : 0;
        return widget.kind === 'Slider' && direction
          ? origin.map((each, index) => each + direction[index]! * value)
          : origin;
      });
      expect(points.filter(inside)).toEqual([]);
      const toggles = run.widgets.filter((widget) => widget.kind === 'Toggle');
      expect(new Set(toggles.map((widget) => JSON.stringify((widget as unknown as { at: number[] }).at))).size).toBe(1);
    }
  });
});
