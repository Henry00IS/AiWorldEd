import type { CurvePreset } from './curve_preset.js';

/**
 * Simplified architectural profiles; shafts deliberately omit fluting and
 * capitals omit carved ornament.
 */
export const CURVE_PRESETS_COLUMNS_EXTENDED: readonly CurvePreset[] = [
  {
    id: 'tuscan_plain_shaft',
    label: 'Tuscan Shaft',
    tooltip:
      'The plain, unfluted shaft of the Tuscan order, slightly tapered. Combine with a base and capital, or use alone for simple porches.',
    markers: { bottom: 0.1, top: 0.9 },
    height: 3,
    start: 1,
    steps: [['L', 1, 0.8]],
  },
  {
    id: 'doric_shaft',
    label: 'Doric Shaft',
    tooltip:
      'A Doric shaft tapering toward the top; Greek Doric shafts are usually fluted, this one is plain. Use for temples and heavy colonnades.',
    markers: { bottom: 0.1, top: 0.9 },
    height: 3,
    start: 1,
    steps: [['B', 1, 0.833333, 0.3, 1, 0.65, 0.94]],
  },
  {
    id: 'ionic_shaft',
    label: 'Ionic Shaft',
    tooltip:
      'A slender Ionic shaft with a short straight foot; real Ionic shafts are usually fluted, this one is plain. Use for elegant colonnades and interiors.',
    markers: { bottom: 0.12, top: 0.9 },
    height: 3,
    start: 1,
    steps: [
      ['L', 0.12, 1],
      ['B', 1, 0.833333, 0.4, 0.99, 0.7, 0.92],
    ],
  },
  {
    id: 'tuscan_base',
    label: 'Tuscan Base',
    tooltip:
      'A single torus on a square plinth, the simple base of the Tuscan order. Turn on Base to keep its height while the shaft stretches.',
    markers: { bottom: 0.18, top: 0.75 },
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
    id: 'ionic_base',
    label: 'Ionic Base',
    tooltip:
      'A plinth with two concave hollows (scotiae) between thin rings, the base described for the Ionic order. Turn on Base to keep its height while the shaft stretches.',
    markers: { bottom: 0.14, top: 0.92 },
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
    id: 'doric_capital',
    label: 'Doric Capital',
    tooltip:
      'A cushion-like echinus under a square slab (abacus), the capital of the Doric order. Turn on Top to keep its height while the shaft stretches.',
    markers: { bottom: 0.18, top: 0.8 },
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
    label: 'Gothic Octagonal Pillar',
    tooltip:
      'An eight-sided pier with moulded ends, common in medieval Gothic parish churches. Use for churches, cloisters, crypts and castle halls.',
    markers: { bottom: 0.16, top: 0.86 },
    height: 3,
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
    label: 'Twisted Octagonal Column',
    tooltip:
      'An eight-sided shaft twisted along its length. Use for ornamental or fantasy architecture, altars and garden follies.',
    markers: { bottom: 0.16, top: 0.84 },
    height: 3,
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
    id: 'solomonic_column',
    label: 'Solomonic Column',
    tooltip:
      "A spiral column, made famous by Bernini's baldachin in St Peter's Basilica and common on Baroque altars. Use for altars, palaces and churches.",
    markers: { bottom: 0.16, top: 0.84 },
    height: 3,
    start: 0.85,
    steps: [
      ['L', 0.08, 0.85],
      ['Q', 0.16, 0.58, 0.12, 0.95],
      ['L', 0.84, 0.58],
      ['Q', 0.92, 0.85, 0.88, 0.95],
      ['L', 1, 0.85],
    ],
    sections: [{ from: 0.16, to: 0.84, section: 'square', cornerSize: 0.6, cornerSides: 6, twist: 360 }],
  },
];
