import type { SolidScriptLine } from '@/solid_script/document/solid_script_document.js';

/** A wall with a doorway cut out of it. */
export const SOLID_SCRIPT_EXAMPLE_DOORWAY: readonly SolidScriptLine[] = [
  { command: 'difference' },
  { command: 'cube', values: { size: '4, 3, 0.2' } },
  { command: 'translate', values: { v: '0, -0.45, 0' } },
  { command: 'cube', values: { size: '1, 2.1, 0.4' } },
  { command: 'end' },
  { command: 'end' },
];

/** A row of five columns from one named part, centered on the origin. */
export const SOLID_SCRIPT_EXAMPLE_COLUMNS: readonly SolidScriptLine[] = [
  { command: 'part', values: { name: 'Column' } },
  { command: 'cylinder', values: { h: '3', r1: '0.2', r2: '0.2', sides: '12' } },
  { command: 'end' },
  { command: 'repeat', values: { variable: 'I', from: '0', to: '4' } },
  { command: 'translate', values: { v: '[=[I] * 1.5 - 3], 0, 0' } },
  { command: 'use_part', values: { name: 'Column' } },
  { command: 'end' },
  { command: 'end' },
];

/** Pillars on a circle, each placed with one position vector. */
export const SOLID_SCRIPT_EXAMPLE_PILLAR_RING: readonly SolidScriptLine[] = [
  { command: 'note', values: { text: 'Each pillar has one position: a vector with x, y and z' } },
  {
    command: 'input',
    values: { name: 'Count', type: 'Count', default: '8', min: '3', max: '32', label: 'Pillars' },
  },
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
  { command: 'translate', values: { v: '[Pos]' } },
  { command: 'cylinder', values: { h: '3', r1: '0.25', r2: '0.2', sides: '12' } },
  { command: 'end' },
  { command: 'end' },
];

/** Stepping stones from one point to another, along a gentle wave. */
export const SOLID_SCRIPT_EXAMPLE_STEPPING_STONES: readonly SolidScriptLine[] = [
  { command: 'note', values: { text: 'lerp walks from one vector to another; pos.Y changes one part' } },
  {
    command: 'input',
    values: { name: 'Stones', type: 'Count', default: '9', min: '2', max: '40', label: 'Stones' },
  },
  { command: 'variable', values: { name: 'Start', value: '-4, 0, 1' } },
  { command: 'variable', values: { name: 'Finish', value: '4, 0, -2' } },
  { command: 'repeat', values: { variable: 'I', from: '0', to: '[=[Stones] - 1]' } },
  { command: 'variable', values: { name: 'Pos', value: '[=Lerp([Start], [Finish], [I] / ([Stones] - 1))]' } },
  { command: 'variable', values: { name: 'Pos.Y', value: '[=Sin([I] * 40) * 0.15]' } },
  { command: 'translate', values: { v: '[Pos]' } },
  { command: 'rotate', values: { a: '0, [=[I] * 23], 0' } },
  { command: 'cube', values: { size: '0.7, 0.15, 0.5' } },
  { command: 'end' },
  { command: 'end' },
  { command: 'end' },
];

/** Pebbles scattered over the top of a slab, more where the face is bigger. */
export const SOLID_SCRIPT_EXAMPLE_PEBBLES: readonly SolidScriptLine[] = [
  { command: 'note', values: { text: 'Scatter pebbles on the top of a slab; change Seed for another layout' } },
  {
    command: 'input',
    values: { name: 'Pebbles', type: 'Count', default: '40', min: '1', max: '400', label: 'Pebbles' },
  },
  { command: 'cube', values: { size: '3, 0.4, 3' } },
  { command: 'select_faces', values: { which: 'Facing Up' } },
  { command: 'scatter_points', values: { count: '[Pebbles]', seed: '3', into: 'Spots' } },
  { command: 'for_each', values: { variable: 'Spot', list: '[Spots]', key: 'I' } },
  { command: 'translate', values: { v: '[Spot]' } },
  { command: 'sphere', values: { r: '[=Random(0.05, 0.12, [I])]' } },
  { command: 'end' },
  { command: 'end' },
];

/** Spikes growing straight out of a ball at scattered points. */
export const SOLID_SCRIPT_EXAMPLE_SPIKY_BALL: readonly SolidScriptLine[] = [
  { command: 'note', values: { text: 'Align To turns each spike so its Y follows the face it stands on' } },
  {
    command: 'input',
    values: { name: 'Spikes', type: 'Count', default: '30', min: '1', max: '200', label: 'Spikes' },
  },
  { command: 'sphere', values: { r: '1' } },
  { command: 'select_faces', values: { which: 'All' } },
  { command: 'scatter_points', values: { count: '[Spikes]', seed: '5', into: 'Spots', normals: 'Ways' } },
  { command: 'for_each', values: { variable: 'Spot', list: '[Spots]', key: 'I' } },
  { command: 'translate', values: { v: '[Spot]' } },
  { command: 'align', values: { direction: '[Ways([I])]' } },
  { command: 'cylinder', values: { h: '0.5', r1: '0.08', r2: '0' } },
  { command: 'end' },
  { command: 'end' },
  { command: 'end' },
];

/**
 * A slab under a box: as a generator it builds the box too, as a modifier it
 * puts the slab under whatever it is added to.
 */
export const SOLID_SCRIPT_EXAMPLE_PEDESTAL: readonly SolidScriptLine[] = [
  { command: 'note', values: { text: 'Works as a generator and as a modifier on a brush, mesh or group' } },
  {
    command: 'input',
    values: { name: 'Margin', type: 'Number', default: '0.2', min: '0', max: '2', label: 'Margin' },
  },
  {
    command: 'input',
    values: { name: 'Thickness', type: 'Number', default: '0.2', min: '0.05', max: '2', label: 'Thickness' },
  },
  { command: 'variable', values: { name: 'Low', value: '-0.5' } },
  { command: 'variable', values: { name: 'Width', value: '1' } },
  { command: 'variable', values: { name: 'Depth', value: '1' } },
  { command: 'if_used_as', values: { use: 'Modifier' } },
  { command: 'variable', values: { name: 'Low', value: '[$Input.Min.Y]' } },
  { command: 'variable', values: { name: 'Width', value: '[$Input.Size.X]' } },
  { command: 'variable', values: { name: 'Depth', value: '[$Input.Size.Z]' } },
  { command: 'input_brushes', values: { textures: 'Move With Shape' } },
  { command: 'else' },
  { command: 'cube', values: { size: '1, 1, 1' } },
  { command: 'end' },
  { command: 'translate', values: { v: '0, [=[Low] - [Thickness] / 2], 0' } },
  { command: 'cube', values: { size: '[=[Width] + 2 * [Margin]], [Thickness], [=[Depth] + 2 * [Margin]]' } },
  { command: 'end' },
];

/**
 * A panel with knobs: only the shapes named Knob get a ball on top, picked with
 * Of.
 */
export const SOLID_SCRIPT_EXAMPLE_KNOBS: readonly SolidScriptLine[] = [
  { command: 'note', values: { text: 'Name shapes, then Select Faces Of that name picks only theirs' } },
  { command: 'cube', values: { size: '4, 0.2, 1', label: 'Panel' } },
  { command: 'for_each', values: { variable: 'X', list: '-1.5, -0.5, 0.5, 1.5' } },
  { command: 'translate', values: { v: '[X], 0.25, 0' } },
  { command: 'cube', values: { size: '0.3, 0.3, 0.3', label: 'Knob' } },
  { command: 'end' },
  { command: 'end' },
  { command: 'select_faces', values: { which: 'Facing Up', of: 'Knob' } },
  { command: 'for_each', values: { variable: 'Face', list: '[$Selected.Faces]' } },
  { command: 'place_on_face', values: { of: '[Face]' } },
  { command: 'sphere', values: { r: '0.1' } },
  { command: 'end' },
  { command: 'end' },
];
