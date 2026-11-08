import type { CurvePreset } from './curve_preset.js';

/** Today's column: base, step down, shaft, step up, capital. */
export const CURVE_PRESET_COLUMN_CLASSIC: CurvePreset = {
  id: 'classic',
  label: 'Classic column',
  tooltip:
    'The three parts of a classical column: a base, a plain shaft and a capital. Use for porticos, colonnades and grand halls.',
  markers: { bottom: 0.25, top: 0.75 },
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
  {
    id: 'plain',
    label: 'Plain shaft',
    tooltip: 'A straight cylinder with no mouldings. Use for pipes, plain pillars, posts and supports.',
    markers: { bottom: 0.1, top: 0.9 },
    start: 1,
    steps: [['L', 1, 1]],
  },
  {
    id: 'tapered',
    label: 'Tapered shaft',
    tooltip:
      'Narrows toward the top, as most classical column shafts do. Use for pillars, lamp posts and trunk-like props.',
    markers: { bottom: 0.1, top: 0.9 },
    start: 1,
    steps: [['L', 1, 0.7]],
  },
  {
    id: 'doric',
    label: 'Doric column',
    tooltip:
      'The plainest Greek order: no base, a tapering shaft and a cushion-shaped capital, as on the Parthenon. Use for temples and sober public buildings.',
    markers: { bottom: 0.05, top: 0.86 },
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
    label: 'Tuscan column',
    tooltip:
      'A simplified Roman order with a plain shaft, a simple base and a simple capital. Use for porches, arcades, villas and farm buildings.',
    markers: { bottom: 0.1, top: 0.86 },
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
    id: 'attic_base',
    label: 'Attic base',
    tooltip:
      'Two convex rings (tori) around a concave hollow (scotia), the most common base under classical Ionic and Corinthian columns. Turn on Base to keep its height while the shaft stretches.',
    markers: { bottom: 0.19, top: 0.9 },
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
    label: 'Corinthian capital',
    tooltip:
      'The bell-shaped capital of the most ornate classical order, usually carved with acanthus leaves; only its silhouette is modelled. Use for palaces, banks and grand interiors.',
    markers: { bottom: 0.1, top: 0.8 },
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
    tooltip:
      'A short moulded post that holds up a handrail; a row of them forms a balustrade. Use for balconies, terraces, bridges and stairs.',
    markers: { bottom: 0.1, top: 0.88 },
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
    tooltip:
      'A tall tapering monument with a pointed top, first raised in ancient Egypt; set Section to Square for the classic four-sided form. Use as a landmark in plazas, parks and cemeteries.',
    markers: { bottom: 0.06, top: 0.88 },
    start: 1,
    steps: [
      ['L', 0.06, 1],
      ['L', 0.06, 0.7],
      ['L', 0.88, 0.5],
      ['L', 1, 0],
    ],
  },
];
