import type { SolidScriptLine } from '@/solid_script/document/solid_script_document.js';

/** A wall with a doorway cut out of it. */
export const SOLID_SCRIPT_EXAMPLE_DOORWAY: readonly SolidScriptLine[] = [
  { command: 'difference' },
  { command: 'cube', values: { size: '4, 0.2, 3' } },
  { command: 'translate', values: { v: '0, 0, -0.45' } },
  { command: 'cube', values: { size: '1, 0.4, 2.1' } },
  { command: 'end' },
  { command: 'end' },
];

/** A row of five columns from one named part, centred on the origin. */
export const SOLID_SCRIPT_EXAMPLE_COLUMNS: readonly SolidScriptLine[] = [
  { command: 'part', values: { name: 'column' } },
  { command: 'cylinder', values: { h: '3', r1: '0.2', r2: '0.2', sides: '12' } },
  { command: 'end' },
  { command: 'repeat', values: { variable: 'i', from: '0', to: '4' } },
  { command: 'translate', values: { v: '[=[i] * 1.5 - 3], 0, 0' } },
  { command: 'use_part', values: { name: 'column' } },
  { command: 'end' },
  { command: 'end' },
];

/** Pillars on a circle, each placed with one position vector. */
export const SOLID_SCRIPT_EXAMPLE_PILLAR_RING: readonly SolidScriptLine[] = [
  { command: 'note', values: { text: 'Each pillar has one position: a vector with x, y and z' } },
  {
    command: 'input',
    values: { name: 'count', type: 'count', default: '8', min: '3', max: '32', label: 'Pillars' },
  },
  {
    command: 'input',
    values: { name: 'radius', type: 'number', default: '3', min: '0.5', max: '20', label: 'Radius' },
  },
  { command: 'variable', values: { name: 'center', value: '0, 0, 1.5' } },
  { command: 'repeat', values: { variable: 'i', from: '1', to: '[count]' } },
  { command: 'variable', values: { name: 'angle', value: '[=360 / [count] * [i]]' } },
  {
    command: 'variable',
    values: { name: 'pos', value: '[=[center] + vector(cos([angle]), sin([angle]), 0) * [radius]]' },
  },
  { command: 'translate', values: { v: '[pos]' } },
  { command: 'cylinder', values: { h: '3', r1: '0.25', r2: '0.2', sides: '12' } },
  { command: 'end' },
  { command: 'end' },
];

/** Stepping stones from one point to another, along a gentle wave. */
export const SOLID_SCRIPT_EXAMPLE_STEPPING_STONES: readonly SolidScriptLine[] = [
  { command: 'note', values: { text: 'lerp walks from one vector to another; pos.z changes one part' } },
  {
    command: 'input',
    values: { name: 'stones', type: 'count', default: '9', min: '2', max: '40', label: 'Stones' },
  },
  { command: 'variable', values: { name: 'start', value: '-4, -1, 0' } },
  { command: 'variable', values: { name: 'finish', value: '4, 2, 0' } },
  { command: 'repeat', values: { variable: 'i', from: '0', to: '[=[stones] - 1]' } },
  { command: 'variable', values: { name: 'pos', value: '[=lerp([start], [finish], [i] / ([stones] - 1))]' } },
  { command: 'variable', values: { name: 'pos.z', value: '[=sin([i] * 40) * 0.15]' } },
  { command: 'translate', values: { v: '[pos]' } },
  { command: 'rotate', values: { a: '0, 0, [=[i] * 23]' } },
  { command: 'cube', values: { size: '0.7, 0.5, 0.15' } },
  { command: 'end' },
  { command: 'end' },
  { command: 'end' },
];

/** Pebbles scattered over the top of a slab, more where the face is bigger. */
export const SOLID_SCRIPT_EXAMPLE_PEBBLES: readonly SolidScriptLine[] = [
  { command: 'note', values: { text: 'Scatter pebbles on the top of a slab; change Seed for another layout' } },
  {
    command: 'input',
    values: { name: 'pebbles', type: 'count', default: '40', min: '1', max: '400', label: 'Pebbles' },
  },
  { command: 'cube', values: { size: '3, 3, 0.4', center: 'true' } },
  { command: 'select_faces', values: { which: 'Facing Up' } },
  { command: 'for_each_scattered_point', values: { count: '[pebbles]', seed: '3' } },
  { command: 'translate', values: { v: '[Point.Position]' } },
  { command: 'sphere', values: { r: '[=random(0.05, 0.12, [Point.Index])]' } },
  { command: 'end' },
  { command: 'end' },
];

/** Spikes growing straight out of a ball at scattered points. */
export const SOLID_SCRIPT_EXAMPLE_SPIKY_BALL: readonly SolidScriptLine[] = [
  { command: 'note', values: { text: 'Align To turns each spike so its Z follows the face it stands on' } },
  {
    command: 'input',
    values: { name: 'spikes', type: 'count', default: '30', min: '1', max: '200', label: 'Spikes' },
  },
  { command: 'sphere', values: { r: '1' } },
  { command: 'select_faces', values: { which: 'All' } },
  { command: 'for_each_scattered_point', values: { count: '[spikes]', seed: '5' } },
  { command: 'translate', values: { v: '[Point.Position]' } },
  { command: 'align', values: { direction: '[Point.Normal]' } },
  { command: 'cylinder', values: { h: '0.5', r1: '0.08', r2: '0' } },
  { command: 'end' },
  { command: 'end' },
  { command: 'end' },
];
