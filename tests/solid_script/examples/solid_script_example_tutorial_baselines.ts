import type { SolidScriptLine } from '@/solid_script/document/solid_script_document.js';

/**
 * Official example scripts as they were before the tutorial rewrite, used to
 * time new tutorials against the same work in one process.
 */
export const SOLID_SCRIPT_TUTORIAL_BASELINES: Readonly<Record<string, readonly SolidScriptLine[]>> = {
  doorway: [
    { command: 'cube', values: { size: '4, 3, 0.2', anchor: 'Center, Center, Center' } },
    { command: 'transform', values: { move: '0, -0.45, 0' } },
    { command: 'cube', values: { size: '1, 2.1, 0.4', anchor: 'Center, Center, Center', mode: 'Subtractive' } },
    { command: 'end' },
  ],
  columns: [
    { command: 'part', values: { name: 'Column' } },
    { command: 'cylinder', values: { h: '3', r1: '0.2', r2: '0.2', sides: '12', anchor: 'Center, Center, Center' } },
    { command: 'end' },
    { command: 'repeat', values: { variable: 'I', from: '0', to: '4' } },
    { command: 'transform', values: { move: '[=[I] * 1.5 - 3], 0, 0' } },
    { command: 'output', values: { of: '[Column]' } },
    { command: 'end' },
    { command: 'end' },
  ],
  steppingStones: [
    { command: 'note', values: { text: 'lerp walks from one vector to another; pos.Y changes one part' } },
    { command: 'input', values: { name: 'Stones', type: 'Count', default: '9', min: '2', max: '40', label: 'Stones' } },
    { command: 'variable', values: { name: 'Start', value: '-4, 0, 1' } },
    { command: 'variable', values: { name: 'Finish', value: '4, 0, -2' } },
    { command: 'repeat', values: { variable: 'I', from: '0', to: '[=[Stones] - 1]' } },
    { command: 'variable', values: { name: 'Pos', value: '[=Lerp([Start], [Finish], [I] / ([Stones] - 1))]' } },
    { command: 'variable', values: { name: 'Pos.Y', value: '[=Sin([I] * 40) * 0.15]' } },
    { command: 'transform', values: { move: '[Pos]' } },
    { command: 'transform', values: { rotate: '0, [=[I] * 23], 0' } },
    { command: 'cube', values: { size: '0.7, 0.15, 0.5', anchor: 'Center, Center, Center' } },
    { command: 'end' },
    { command: 'end' },
    { command: 'end' },
  ],
  pillarRing: [
    { command: 'note', values: { text: 'Each pillar has one position: a vector with x, y and z' } },
    { command: 'input', values: { name: 'Count', type: 'Count', default: '8', min: '3', max: '32', label: 'Pillars' } },
    {
      command: 'input',
      values: { name: 'Radius', type: 'Number', default: '3', min: '0.5', max: '20', label: 'Radius' },
    },
    { command: 'variable', values: { name: 'Center', value: '0, 1.5, 0' } },
    { command: 'repeat', values: { variable: 'I', from: '1', to: '[Count]' } },
    { command: 'variable', values: { name: 'Angle', value: '[=360 / [Count] * [I]]' } },
    {
      command: 'variable',
      values: { name: 'Pos', value: '[=[Center] + Vector(Cos([Angle]), 0, -Sin([Angle])) * [Radius]]' },
    },
    { command: 'transform', values: { move: '[Pos]' } },
    { command: 'cylinder', values: { h: '3', r1: '0.25', r2: '0.2', sides: '12', anchor: 'Center, Center, Center' } },
    { command: 'end' },
    { command: 'end' },
  ],

  taperedBox: [
    {
      command: 'note',
      values: { text: 'Scale Faces shrinks the top about its center, so the cube becomes a tapered block.' },
    },
    {
      command: 'input',
      values: { name: 'Factor', type: 'Number', default: '0.5', min: '0.1', max: '2', label: 'Factor' },
    },
    { command: 'cube', values: { size: '2, 2, 2' } },
    { command: 'select_brushes' },
    { command: 'select_faces', values: { which: 'Facing Up' } },
    { command: 'scale_faces', values: { factor: '[Factor]' } },
  ],
  irregularRock: [
    {
      command: 'note',
      values: {
        text: 'Scatter Points fills a box; Hull wraps the points in one lumpy solid. Change Seed for another rock.',
      },
    },
    { command: 'input', values: { name: 'Size', type: 'Number', default: '2', min: '0.5', max: '20', label: 'Size' } },
    {
      command: 'input',
      values: { name: 'Height', type: 'Number', default: '1.2', min: '0.2', max: '20', label: 'Height' },
    },
    { command: 'input', values: { name: 'Count', type: 'Count', default: '16', min: '4', max: '64', label: 'Points' } },
    { command: 'input', values: { name: 'Seed', type: 'Number', default: '4', label: 'Seed' } },
    {
      command: 'scatter_points',
      values: { where: 'In Box', count: '[Count]', seed: '[Seed]', size: '[Size], [Height], [Size]', into: 'Spots' },
    },
    { command: 'hull', values: { points: '[Spots]' } },
    { command: 'end' },
  ],
  knobs: [
    { command: 'note', values: { text: 'Name shapes, then Select Faces Of that name picks only theirs' } },
    { command: 'cube', values: { size: '4, 0.2, 1', label: 'Panel', anchor: 'Center, Center, Center' } },
    { command: 'for_each', values: { variable: 'X', list: '-1.5, -0.5, 0.5, 1.5' } },
    { command: 'transform', values: { move: '[X], 0.25, 0' } },
    { command: 'cube', values: { size: '0.3, 0.3, 0.3', label: 'Knob', anchor: 'Center, Center, Center' } },
    { command: 'end' },
    { command: 'end' },
    { command: 'select_faces', values: { which: 'Facing Up', of: 'Knob' } },
    { command: 'for_each', values: { variable: 'Face', list: '[$Selected.Faces]' } },
    { command: 'place_on_face', values: { of: '[Face]' } },
    { command: 'sphere', values: { r: '0.1', anchor: 'Center, Center, Center' } },
    { command: 'end' },
    { command: 'end' },
  ],
};
