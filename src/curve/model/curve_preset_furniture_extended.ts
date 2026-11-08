import type { CurvePreset } from './curve_preset.js';

/**
 * Original furniture studies using researched turning vocabulary, not measured
 * historical reproductions.
 */
export const CURVE_PRESETS_FURNITURE_EXTENDED: readonly CurvePreset[] = [
  {
    id: 'shaker_taper_leg',
    label: 'Shaker-inspired taper leg',
    group: 'Furniture · legs',
    start: 0.28,
    steps: [
      ['L', 0.82, 0.78],
      ['L', 1, 0.78],
    ],
    sections: [{ from: 0, to: 1, section: 'square' }],
  },
  {
    id: 'shaker_swell_leg',
    label: 'Shaker-inspired swell leg',
    group: 'Furniture · legs',
    start: 0.25,
    steps: [
      ['B', 0.75, 0.7, 0.2, 0.35, 0.5, 0.88],
      ['L', 0.85, 0.7],
      ['L', 1, 0.82],
    ],
    square: [[0.85, 1]],
  },
  {
    id: 'jacobean_cup_cover',
    label: 'Jacobean cup-and-cover study',
    group: 'Furniture · legs',
    start: 0.48,
    steps: [
      ['L', 0.1, 0.48],
      ['Q', 0.5, 0.72, 0.28, 1],
      ['Q', 0.7, 0.4, 0.58, 0.5],
      ['L', 0.76, 0.65],
      ['L', 0.84, 0.65],
      ['L', 0.84, 0.78],
      ['L', 1, 0.78],
    ],
    square: [[0.84, 1]],
  },
  {
    id: 'jacobean_twist_post',
    label: 'Jacobean-inspired twist post (approx.)',
    group: 'Furniture · twist studies',
    start: 0.85,
    steps: [
      ['L', 0.12, 0.85],
      ['L', 0.18, 0.56],
      ['L', 0.82, 0.56],
      ['L', 0.88, 0.85],
      ['L', 1, 0.85],
    ],
    sections: [
      { from: 0, to: 0.18, section: 'square' },
      { from: 0.18, to: 0.82, section: 'rounded_square', cornerRadius: 0.18, twist: 360 },
      { from: 0.82, to: 1, section: 'square' },
    ],
  },
  {
    id: 'chamfered_cabinet_foot',
    label: 'Chamfered cabinet foot',
    group: 'Furniture · legs',
    start: 0.55,
    steps: [
      ['L', 0.15, 0.55],
      ['L', 0.85, 0.9],
      ['L', 1, 0.9],
    ],
    sections: [{ from: 0, to: 1, section: 'chamfered_square', chamferAmount: 0.45 }],
  },
  {
    id: 'ribbon_twist_leg',
    label: 'Chamfered ribbon leg (approx.)',
    group: 'Furniture · twist studies',
    start: 0.45,
    steps: [
      ['L', 0.12, 0.45],
      ['L', 0.88, 0.72],
      ['L', 1, 0.72],
    ],
    sections: [
      { from: 0, to: 0.12, section: 'chamfered_square', chamferAmount: 0.7 },
      { from: 0.12, to: 0.88, section: 'chamfered_square', chamferAmount: 0.7, twist: 180 },
      { from: 0.88, to: 1, section: 'chamfered_square', chamferAmount: 0.7 },
    ],
  },
  {
    id: 'victorian_newel',
    label: 'Victorian-inspired newel post',
    group: 'Joinery · posts',
    start: 0.88,
    steps: [
      ['L', 0.18, 0.88],
      ['L', 0.22, 0.5],
      ['Q', 0.46, 0.55, 0.33, 0.9],
      ['Q', 0.7, 0.4, 0.58, 0.35],
      ['L', 0.74, 0.7],
      ['Q', 0.9, 0.7, 0.82, 1],
      ['L', 0.94, 0.82],
      ['L', 1, 0.82],
    ],
    square: [
      [0, 0.18],
      [0.94, 1],
    ],
  },
  {
    id: 'octagonal_newel',
    label: 'Octagonal newel post',
    group: 'Joinery · posts',
    start: 0.9,
    steps: [
      ['L', 0.15, 0.9],
      ['L', 0.22, 0.62],
      ['L', 0.78, 0.62],
      ['L', 0.85, 0.9],
      ['L', 1, 0.9],
    ],
    sections: [{ from: 0, to: 1, section: 'polygon', polygonSides: 8 }],
  },
  {
    id: 'hexagonal_bedpost',
    label: 'Hexagonal bedpost',
    group: 'Joinery · posts',
    start: 0.82,
    steps: [
      ['L', 0.15, 0.82],
      ['L', 0.2, 0.55],
      ['L', 0.82, 0.55],
      ['L', 0.88, 0.78],
      ['L', 1, 0.78],
    ],
    sections: [
      { from: 0, to: 0.2, section: 'square' },
      { from: 0.2, to: 0.82, section: 'polygon', polygonSides: 6 },
      { from: 0.82, to: 1, section: 'rounded_square', cornerRadius: 0.3 },
    ],
  },
  {
    id: 'chamfered_beam',
    label: 'Chamfered beam',
    group: 'Joinery · posts',
    start: 0.9,
    steps: [['L', 1, 0.9]],
    sections: [{ from: 0, to: 1, section: 'chamfered_square', chamferAmount: 0.35 }],
  },
];
