import type { CurvePreset } from './curve_preset.js';

/** Today's column: base, step down, shaft, step up, capital. */
export const CURVE_PRESET_COLUMN_CLASSIC: CurvePreset = {
  id: 'classic',
  label: 'Classic (base, shaft, capital)',
  start: 1,
  steps: [
    ['L', 0.25, 1],
    ['L', 0.25, 0.75],
    ['L', 0.75, 0.75],
    ['L', 0.75, 1],
    ['L', 1, 1],
  ],
};

/** Architectural column profiles: x is height, y is radius. */
export const CURVE_PRESETS_ARCHITECTURE: readonly CurvePreset[] = [
  CURVE_PRESET_COLUMN_CLASSIC,
  { id: 'plain', label: 'Plain', start: 1, steps: [['L', 1, 1]] },
  { id: 'tapered', label: 'Tapered', start: 1, steps: [['L', 1, 0.7]] },
  {
    id: 'doric',
    label: 'Doric',
    start: 0.8,
    steps: [
      ['B', 0.84, 0.66, 0.3, 0.8, 0.6, 0.72],
      ['L', 0.86, 0.66],
      ['L', 0.86, 0.7],
      ['B', 0.93, 0.95, 0.9, 0.7, 0.9, 0.95],
      ['L', 0.93, 1],
      ['L', 1, 1],
    ],
  },
  {
    id: 'tuscan',
    label: 'Tuscan',
    start: 1,
    steps: [
      ['L', 0.06, 1],
      ['L', 0.06, 0.88],
      ['B', 0.1, 0.78, 0.07, 0.95, 0.1, 0.9],
      ['L', 0.1, 0.76],
      ['L', 0.86, 0.66],
      ['L', 0.86, 0.72],
      ['Q', 0.92, 0.9, 0.9, 0.72],
      ['L', 0.92, 1],
      ['L', 1, 1],
    ],
  },
  {
    id: 'ionic_base',
    label: 'Ionic (Attic) base',
    start: 1,
    steps: [
      ['L', 0.05, 1],
      ['L', 0.05, 0.93],
      ['B', 0.1, 0.82, 0.06, 1, 0.1, 0.95],
      ['B', 0.15, 0.82, 0.12, 0.7, 0.13, 0.7],
      ['B', 0.19, 0.74, 0.15, 0.9, 0.19, 0.86],
      ['L', 0.19, 0.72],
      ['L', 1, 0.66],
    ],
  },
  {
    id: 'corinthian_capital',
    label: 'Corinthian-style capital',
    start: 0.7,
    steps: [
      ['L', 0.8, 0.64],
      ['L', 0.8, 0.7],
      ['L', 0.82, 0.7],
      ['B', 0.95, 0.92, 0.9, 0.7, 0.93, 0.8],
      ['L', 0.95, 1],
      ['L', 1, 0.96],
    ],
  },
  {
    id: 'baluster',
    label: 'Baluster',
    start: 0.9,
    steps: [
      ['L', 0.1, 0.9],
      ['L', 0.1, 0.55],
      ['B', 0.6, 0.3, 0.2, 1, 0.45, 0.6],
      ['B', 0.82, 0.45, 0.72, 0.15, 0.78, 0.3],
      ['L', 0.88, 0.45],
      ['L', 0.88, 0.95],
      ['L', 1, 0.95],
    ],
  },
  {
    id: 'obelisk',
    label: 'Obelisk',
    start: 1,
    steps: [
      ['L', 0.06, 1],
      ['L', 0.06, 0.7],
      ['L', 0.88, 0.5],
      ['L', 1, 0],
    ],
  },
];
