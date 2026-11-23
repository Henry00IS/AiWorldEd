import { describe, expect, it } from 'vitest';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';

const BOX: SolidScriptLine = { command: 'input', values: { name: 'BoxSize', type: 'Vector', default: '2, 1, 4' } };
const SPOT: SolidScriptLine = { command: 'input', values: { name: 'Spot', type: 'Vector', default: '1, 2, 3' } };

/**
 * Runs lines and returns the widgets they made.
 *
 * @param lines Lines.
 * @returns Widgets and the error text.
 */
function run(lines: SolidScriptLine[]) {
  const result = solidScriptProgramRun(solidScriptDocumentCreate(lines), { inputs: {} });
  return { widgets: result.widgets, error: result.error?.message ?? '' };
}

describe('Widget Size', () => {
  it('puts a handle on each of the six faces, each changing one of x, y and z of the Vector Input', () => {
    const { widgets, error } = run([
      BOX,
      { command: 'widget_size', values: { shows: '[BoxSize]', writes: 'BoxSize' } },
    ]);
    expect(error).toBe('');
    expect(widgets).toHaveLength(6);
    expect(widgets[0]).toMatchObject({
      kind: 'Slider',
      label: 'Box Size X',
      value: 2,
      origin: [0, 0, 0],
      direction: [0.5, 0, 0],
      min: 0,
      component: { index: 0, vector: [2, 1, 4] },
      ruler: true,
    });
    expect(widgets[1]).toMatchObject({ direction: [-0.5, 0, 0], value: 2 });
    expect(widgets[5]).toMatchObject({ label: 'Box Size Z', direction: [0, 0, -0.5], value: 4 });
  });
});

describe('Widget Point', () => {
  it('puts three arrow handles beside the point, one per axis, without rulers', () => {
    const { widgets, error } = run([SPOT, { command: 'widget_point', values: { shows: '[Spot]', writes: 'Spot' } }]);
    expect(error).toBe('');
    expect(widgets).toHaveLength(3);
    expect(widgets[0]).toMatchObject({
      kind: 'Slider',
      label: 'Spot X',
      value: 1,
      direction: [1, 0, 0],
      component: { index: 0, vector: [1, 2, 3] },
      ruler: false,
    });
    const handle = (index: number) => {
      const slider = widgets[index] as { origin: readonly number[]; direction: readonly number[]; value: number };
      return slider.origin.map((value, axis) => value + slider.direction[axis]! * slider.value);
    };
    expect(handle(0)).toEqual([1.4, 2, 3]);
    expect(handle(1)).toEqual([1, 2.4, 3]);
    expect(handle(2)).toEqual([1, 2, 3.4]);
  });
});

describe('Widget Angle', () => {
  it('puts a dial handle on a circle about Axis, at the angle Shows gives, writing a Number Input in degrees', () => {
    const turn: SolidScriptLine = { command: 'input', values: { name: 'Turn', type: 'Number', default: '90' } };
    const { widgets, error } = run([
      turn,
      { command: 'widget_angle', values: { shows: '[Turn]', writes: 'Turn', radius: '2', min: '0', max: '180' } },
    ]);
    expect(error).toBe('');
    expect(widgets).toEqual([
      expect.objectContaining({
        kind: 'Slider',
        label: 'Turn',
        value: 90,
        origin: [0, 0, 0],
        direction: [2, 0, 0],
        axis: [0, 1, 0],
        min: 0,
        max: 180,
        component: null,
        ruler: true,
      }),
    ]);
  });

  it('starts the dial from a direction square to Axis', () => {
    const { widgets } = run([{ command: 'widget_angle', values: { shows: '0', axis: '1, 0, 0' } }]);
    expect(widgets[0]).toMatchObject({ direction: [0, 0, 1], axis: [1, 0, 0] });
  });
});

describe('Widget Direction', () => {
  it('puts an arrow from At along the direction Shows gives, writing a Vector Input', () => {
    const facing: SolidScriptLine = {
      command: 'input',
      values: { name: 'Facing', type: 'Vector', default: '0, 0, 2' },
    };
    const { widgets, error } = run([
      facing,
      { command: 'widget_direction', values: { shows: '[Facing]', writes: 'Facing', length: '2' } },
    ]);
    expect(error).toBe('');
    expect(widgets).toEqual([
      expect.objectContaining({
        kind: 'Aim',
        label: 'Facing',
        writes: 'Facing',
        origin: [0, 0, 0],
        value: [0, 0, 1],
        length: 2,
        frame: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      }),
    ]);
  });
});
