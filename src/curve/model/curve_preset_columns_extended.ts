import type { CurvePreset } from './curve_preset.js';

/**
 * Simplified architectural profile studies; shafts deliberately omit fluting
 * and capitals omit carved ornament.
 */
export const CURVE_PRESETS_COLUMNS_EXTENDED: readonly CurvePreset[] = [
  {
    id: 'tuscan_plain_shaft',
    label: 'Tuscan shaft (plain)',
    group: 'Architecture · shafts',
    start: 1,
    steps: [['L', 1, 0.8]],
  },
  {
    id: 'doric_shaft_study',
    label: 'Doric shaft (unfluted study)',
    group: 'Architecture · shafts',
    start: 1,
    steps: [['B', 1, 0.833333, 0.3, 1, 0.65, 0.94]],
  },
  {
    id: 'ionic_shaft_study',
    label: 'Ionic shaft (unfluted study)',
    group: 'Architecture · shafts',
    start: 1,
    steps: [
      ['L', 0.12, 1],
      ['B', 1, 0.833333, 0.4, 0.99, 0.7, 0.92],
    ],
  },
  {
    id: 'tuscan_base_study',
    label: 'Tuscan base (torus and plinth)',
    group: 'Architecture · bases and capitals',
    start: 1,
    steps: [
      ['L', 0.18, 1],
      ['L', 0.18, 0.76],
      ['Q', 0.68, 0.76, 0.42, 1],
      ['L', 0.75, 0.68],
      ['L', 1, 0.68],
    ],
    square: [[0, 0.18]],
  },
  {
    id: 'ionic_base_study',
    label: 'Ionic base (two-scotia study)',
    group: 'Architecture · bases and capitals',
    start: 1,
    steps: [
      ['L', 0.14, 1],
      ['L', 0.14, 0.88],
      ['Q', 0.35, 0.86, 0.25, 0.56],
      ['L', 0.4, 0.86],
      ['Q', 0.61, 0.8, 0.5, 0.54],
      ['L', 0.66, 0.82],
      ['Q', 0.92, 0.7, 0.78, 1],
      ['L', 1, 0.7],
    ],
    square: [[0, 0.14]],
  },
  {
    id: 'doric_capital_study',
    label: 'Doric capital (echinus study)',
    group: 'Architecture · bases and capitals',
    start: 0.55,
    steps: [
      ['L', 0.18, 0.55],
      ['L', 0.22, 0.62],
      ['L', 0.28, 0.56],
      ['L', 0.34, 0.64],
      ['Q', 0.78, 0.92, 0.58, 0.9],
      ['L', 0.8, 1],
      ['L', 1, 1],
    ],
    square: [[0.8, 1]],
  },
  {
    id: 'octagonal_pillar',
    label: 'Gothic-inspired octagonal pillar',
    group: 'Architecture · polygon studies',
    start: 0.9,
    steps: [
      ['L', 0.1, 0.9],
      ['L', 0.16, 0.65],
      ['L', 0.86, 0.65],
      ['L', 0.92, 0.9],
      ['L', 1, 0.9],
    ],
    sections: [{ from: 0, to: 1, section: 'polygon', polygonSides: 8 }],
  },
  {
    id: 'twisted_octagon_column',
    label: 'Twisted octagon column (approx.)',
    group: 'Architecture · twist studies',
    start: 0.9,
    steps: [
      ['L', 0.1, 0.9],
      ['L', 0.16, 0.62],
      ['L', 0.84, 0.62],
      ['L', 0.9, 0.9],
      ['L', 1, 0.9],
    ],
    sections: [{ from: 0.16, to: 0.84, section: 'polygon', polygonSides: 8, twist: 270 }],
  },
  {
    id: 'solomonic_study',
    label: 'Solomonic shaft (polygon twist study)',
    group: 'Architecture · twist studies',
    start: 0.85,
    steps: [
      ['L', 0.08, 0.85],
      ['Q', 0.16, 0.58, 0.12, 0.95],
      ['L', 0.84, 0.58],
      ['Q', 0.92, 0.85, 0.88, 0.95],
      ['L', 1, 0.85],
    ],
    sections: [{ from: 0.16, to: 0.84, section: 'rounded_square', cornerRadius: 0.6, twist: 360 }],
  },
];
