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
