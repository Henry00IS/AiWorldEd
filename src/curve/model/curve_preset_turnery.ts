import type { CurvePreset } from './curve_preset.js';

/**
 * Turnery profiles for furniture, clocks and props: x is height, y is radius.
 * Square ranges become four-sided blocks that fill the bounds at value 1, the
 * rest is turned round.
 */
export const CURVE_PRESETS_TURNERY: readonly CurvePreset[] = [
  {
    id: 'softened_table_leg',
    label: 'Softened table leg',
    tooltip:
      'A square leg with rounded corners that widens toward the top. Use for tables, desks and modern furniture.',
    markers: { bottom: 0.08, top: 0.85 },
    start: 0.45,
    steps: [
      ['L', 0.08, 0.45],
      ['B', 0.85, 0.85, 0.3, 0.5, 0.65, 0.8],
      ['L', 1, 0.85],
    ],
    roundedSquare: [[0, 1, 0.25]],
  },
  {
    id: 'softened_bedpost',
    label: 'Softened bedpost',
    tooltip: 'A rounded square post that tapers toward its top. Use for beds, simple newels and fence posts.',
    markers: { bottom: 0.18, top: 0.65 },
    start: 0.8,
    steps: [
      ['L', 0.18, 0.8],
      ['L', 0.65, 0.5],
      ['B', 1, 0.2, 0.75, 1, 0.9, 1],
    ],
    roundedSquare: [[0, 0.65, 0.35]],
  },
  {
    id: 'chair_leg',
    label: 'Chair leg',
    tooltip:
      'Turned legs keep square blocks where the rails are joined, with the turning in between. Use for chairs, stools and benches.',
    markers: { bottom: 0.12, top: 0.7 },
    start: 0.8,
    square: [
      [0, 0.11],
      [0.71, 1],
    ],
    steps: [
      ['L', 0.12, 0.8],
      ['L', 0.12, 0.55],
      ['Q', 0.2, 0.72, 0.16, 0.76],
      ['L', 0.24, 0.5],
      ['B', 0.6, 0.42, 0.36, 0.7, 0.5, 0.4],
      ['Q', 0.66, 0.62, 0.63, 0.66],
      ['L', 0.7, 0.55],
      ['L', 0.7, 0.8],
      ['L', 1, 0.8],
    ],
  },
  {
    id: 'table_leg',
    label: 'Table leg',
    tooltip:
      'A turned, tapered leg with a square block at the top where the apron is joined. Use for dining tables, desks and side tables.',
    markers: { bottom: 0.08, top: 0.75 },
    start: 0.45,
    square: [[0.76, 1]],
    steps: [
      ['Q', 0.06, 0.55, 0.03, 0.6],
      ['L', 0.08, 0.42],
      ['L', 0.62, 0.66],
      ['Q', 0.7, 0.85, 0.68, 0.86],
      ['L', 0.75, 0.7],
      ['L', 0.75, 1],
      ['L', 1, 1],
    ],
  },
  {
    id: 'bed_post',
    label: 'Bed post',
    tooltip:
      'Square blocks for the bed rails, a turned vase and a finial on top. Use for four-poster beds and canopy frames.',
    markers: { bottom: 0.18, top: 0.61 },
    start: 1,
    square: [
      [0, 0.17],
      [0.5, 0.6],
    ],
    steps: [
      ['L', 0.18, 1],
      ['L', 0.18, 0.62],
      ['B', 0.44, 0.5, 0.26, 1, 0.38, 0.45],
      ['L', 0.49, 0.6],
      ['L', 0.49, 1],
      ['L', 0.61, 1],
      ['L', 0.61, 0.5],
      ['L', 0.82, 0.42],
      ['Q', 0.9, 0.62, 0.86, 0.66],
      ['B', 1, 0, 0.94, 0.55, 0.99, 0.2],
    ],
  },
  {
    id: 'spindle',
    label: 'Stair spindle',
    tooltip:
      'Square ends that sit in the handrail and the stair string, with a turned middle. Use for staircases, landings and galleries.',
    markers: { bottom: 0.15, top: 0.85 },
    start: 0.7,
    square: [
      [0, 0.14],
      [0.86, 1],
    ],
    steps: [
      ['L', 0.15, 0.7],
      ['L', 0.15, 0.5],
      ['Q', 0.2, 0.62, 0.18, 0.64],
      ['L', 0.22, 0.38],
      ['B', 0.78, 0.38, 0.4, 0.75, 0.6, 0.2],
      ['Q', 0.82, 0.62, 0.8, 0.64],
      ['L', 0.85, 0.5],
      ['L', 0.85, 0.7],
      ['L', 1, 0.7],
    ],
  },
  {
    id: 'clock_finial',
    label: 'Clock finial',
    tooltip:
      'An urn with a spire, the kind of ornament that tops the hood of a longcase clock. Use on clocks, cabinets, gate posts and roof peaks.',
    markers: { bottom: 0.06, top: 0.52 },
    start: 0.55,
    steps: [
      ['L', 0.06, 0.55],
      ['L', 0.08, 0.3],
      ['B', 0.42, 0.42, 0.16, 1, 0.34, 0.95],
      ['L', 0.46, 0.25],
      ['Q', 0.52, 0.38, 0.49, 0.42],
      ['B', 1, 0, 0.62, 0.22, 0.85, 0.08],
    ],
  },
  {
    id: 'clock_pillar',
    label: 'Clock hood pillar',
    tooltip:
      'A small ringed column like those beside the dial of a longcase clock. Use for small columns on furniture, shrines and cabinets.',
    markers: { bottom: 0.08, top: 0.92 },
    start: 1,
    square: [
      [0, 0.07],
      [0.93, 1],
    ],
    steps: [
      ['L', 0.08, 1],
      ['L', 0.08, 0.7],
      ['Q', 0.13, 0.85, 0.105, 0.88],
      ['L', 0.15, 0.6],
      ['L', 0.85, 0.6],
      ['Q', 0.895, 0.85, 0.87, 0.88],
      ['L', 0.92, 0.7],
      ['L', 0.92, 1],
      ['L', 1, 1],
    ],
  },
  {
    id: 'candlestick',
    label: 'Candlestick',
    tooltip:
      'A turned holder with a foot, a stem and a socket for the candle. Use as a prop on tables, altars and mantels.',
    markers: { bottom: 0.24, top: 0.8 },
    start: 1,
    steps: [
      ['Q', 0.08, 0.35, 0.06, 0.8],
      ['L', 0.12, 0.25],
      ['Q', 0.2, 0.42, 0.16, 0.45],
      ['L', 0.24, 0.18],
      ['L', 0.72, 0.22],
      ['Q', 0.8, 0.5, 0.76, 0.52],
      ['L', 0.84, 0.75],
      ['L', 0.88, 0.75],
      ['L', 0.88, 0.3],
      ['L', 1, 0.3],
    ],
  },
  {
    id: 'pawn',
    label: 'Chess pawn',
    tooltip:
      'A pawn in the style of the standard Staunton chess set. Use for board game props or giant garden chess pieces.',
    markers: { bottom: 0.16, top: 0.55 },
    start: 1,
    steps: [
      ['Q', 0.12, 0.7, 0.1, 0.98],
      ['L', 0.16, 0.62],
      ['B', 0.55, 0.25, 0.3, 0.45, 0.45, 0.22],
      ['L', 0.6, 0.55],
      ['L', 0.62, 0.3],
      ['B', 1, 0, 0.66, 0.7, 0.98, 0.5],
    ],
  },
  {
    id: 'table_lamp',
    label: 'Lamp base',
    tooltip: 'A square foot with a turned stem that narrows toward the bulb holder. Use for table and floor lamps.',
    markers: { bottom: 0.1, top: 0.9 },
    start: 0.9,
    square: [[0, 0.09]],
    steps: [
      ['L', 0.1, 0.9],
      ['L', 0.1, 0.4],
      ['B', 0.7, 0.3, 0.3, 0.95, 0.55, 0.9],
      ['Q', 0.8, 0.22, 0.74, 0.2],
      ['L', 0.9, 0.2],
      ['L', 0.9, 0.14],
      ['L', 1, 0.14],
    ],
  },
];
