import type { CurvePreset } from './curve_preset.js';

/**
 * Original furniture profiles using researched turning vocabulary, not measured
 * historical reproductions.
 */
export const CURVE_PRESETS_FURNITURE_EXTENDED: readonly CurvePreset[] = [
  {
    id: 'shaker_taper_leg',
    label: 'Shaker taper leg',
    tooltip:
      'A slender tapered square leg in the spirit of Shaker furniture, known for simple, useful forms; this one tapers evenly on all sides. Use for plain tables and workshop furniture.',
    markers: { bottom: 0.1, top: 0.82 },
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
    label: 'Shaker swell leg',
    tooltip:
      'A round leg that swells gently and tapers to the floor below a square block, in the plain Shaker manner. Use for tables, stands and rural interiors.',
    markers: { bottom: 0.1, top: 0.85 },
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
    label: 'Cup-and-cover leg',
    tooltip:
      'A bulbous leg shaped like a cup with a lid, found on English oak tables and beds of the late 16th and early 17th centuries. Use for manor halls, taverns and heavy oak furniture.',
    markers: { bottom: 0.1, top: 0.84 },
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
    label: 'Barley twist post',
    tooltip:
      'A spiral twist, often called barley twist, popular on 17th-century English furniture. Use for four-poster beds, chair backs and period stairs.',
    markers: { bottom: 0.18, top: 0.82 },
    group: 'Furniture · twists',
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
      { from: 0.18, to: 0.82, section: 'square', cornerSize: 0.18, cornerSides: 4, twist: 360 },
      { from: 0.82, to: 1, section: 'square' },
    ],
  },
  {
    id: 'chamfered_cabinet_foot',
    label: 'Chamfered cabinet foot',
    tooltip: 'A tapered square foot with its corners cut off. Use under cabinets, chests and sideboards.',
    markers: { bottom: 0.15, top: 0.85 },
    group: 'Furniture · legs',
    start: 0.55,
    steps: [
      ['L', 0.15, 0.55],
      ['L', 0.85, 0.9],
      ['L', 1, 0.9],
    ],
    sections: [{ from: 0, to: 1, section: 'square', cornerSize: 0.26, cornerSides: 1 }],
  },
  {
    id: 'ribbon_twist_leg',
    label: 'Ribbon twist leg',
    tooltip: 'A chamfered square leg twisted like a ribbon. Use for decorative tables, stands and ornate furniture.',
    markers: { bottom: 0.12, top: 0.88 },
    group: 'Furniture · twists',
    start: 0.45,
    steps: [
      ['L', 0.12, 0.45],
      ['L', 0.88, 0.72],
      ['L', 1, 0.72],
    ],
    sections: [
      { from: 0, to: 0.12, section: 'square', cornerSize: 0.41, cornerSides: 1 },
      { from: 0.12, to: 0.88, section: 'square', cornerSize: 0.41, cornerSides: 1, twist: 180 },
      { from: 0.88, to: 1, section: 'square', cornerSize: 0.41, cornerSides: 1 },
    ],
  },
  {
    id: 'victorian_newel',
    label: 'Victorian newel post',
    tooltip:
      'The heavy post at the foot of a staircase in 19th-century houses. Use at stair starts and landings in period interiors.',
    markers: { bottom: 0.22, top: 0.74 },
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
    tooltip:
      'An eight-sided newel post, made by cutting the corners of a square post. Use for stairs, porches, fences and gates.',
    markers: { bottom: 0.22, top: 0.78 },
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
    tooltip: 'A bedpost with square blocks at the joints and a six-sided shaft. Use for beds, frames and rustic posts.',
    markers: { bottom: 0.2, top: 0.82 },
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
      { from: 0.82, to: 1, section: 'square', cornerSize: 0.3, cornerSides: 4 },
    ],
  },
  {
    id: 'chamfered_beam',
    label: 'Chamfered beam',
    tooltip:
      'A square timber with its edges cut off, as in traditional timber framing. Use for ceiling beams, posts and barns; lay the column on its side for a beam.',
    markers: { bottom: 0.1, top: 0.9 },
    group: 'Joinery · posts',
    start: 0.9,
    steps: [['L', 1, 0.9]],
    sections: [{ from: 0, to: 1, section: 'square', cornerSize: 0.21, cornerSides: 1 }],
  },
];
