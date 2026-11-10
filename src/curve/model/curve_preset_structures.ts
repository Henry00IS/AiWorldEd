import type { CurvePreset } from './curve_preset.js';

/**
 * Piers and pipework built from cross, stadium and polygon sections. Each
 * tooltip gives a real-world size for the generator box, width by height.
 */
export const CURVE_PRESETS_STRUCTURES: readonly CurvePreset[] = [
  {
    id: 'square_pedestal_column',
    label: 'Square Pedestal Column',
    tooltip:
      'A square cabinet column with a stepped plinth and a stepped crown cornice, as on closets and built-in wardrobes. Set the box to about 0.5 × 2.4 m.',
    markers: { bottom: 0.08, top: 0.88 },
    height: 2.4,
    start: 1,
    steps: [
      ['L', 0.04, 1],
      ['L', 0.04, 0.94],
      ['L', 0.06, 0.94],
      ['Q', 0.08, 0.82, 0.08, 0.92],
      ['L', 0.88, 0.82],
      ['L', 0.88, 0.86],
      ['L', 0.9, 0.86],
      ['Q', 0.93, 0.96, 0.9, 0.95],
      ['L', 0.95, 0.96],
      ['L', 0.95, 0.92],
      ['L', 0.97, 0.92],
      ['L', 0.97, 1],
      ['L', 1, 1],
    ],
    sections: [{ from: 0, to: 1, section: 'square' }],
  },
  {
    id: 'cruciform_pier',
    label: 'Cruciform Pier',
    tooltip:
      'A cross-shaped Romanesque pier on a square plinth under a square abacus. Set the box to about 1.2 × 5 m for naves, crypts and cloisters.',
    markers: { bottom: 0.1, top: 0.88 },
    height: 5,
    start: 1,
    steps: [
      ['L', 0.06, 1],
      ['L', 0.06, 0.94],
      ['L', 0.1, 0.94],
      ['L', 0.1, 0.86],
      ['L', 0.88, 0.86],
      ['L', 0.93, 0.94],
      ['L', 0.94, 1],
      ['L', 1, 1],
    ],
    sections: [
      { from: 0, to: 0.06, section: 'square' },
      { from: 0.06, to: 0.935, section: 'cross', armWidth: 0.42 },
      { from: 0.935, to: 1, section: 'square' },
    ],
  },
  {
    id: 'bridge_pier',
    label: 'Bridge Pier',
    tooltip:
      'A rounded-end river pier with a battered shaft and a projecting cap. Set the box to about 6 × 12 m with Depth / width 1 under bridge decks and viaducts.',
    markers: { bottom: 0.06, top: 0.9 },
    height: 12,
    start: 0.96,
    steps: [
      ['L', 0.06, 0.96],
      ['L', 0.06, 0.92],
      ['L', 0.9, 0.84],
      ['L', 0.9, 1],
      ['L', 1, 1],
    ],
    sections: [{ from: 0, to: 1, section: 'stadium', straight: 0.6 }],
  },
  {
    id: 'flanged_water_pipe',
    label: 'Flanged Water Pipe',
    tooltip:
      'A pipe spool with weld-neck flanges at both ends and a hexagon union in the middle. Set the box to about 0.3 × 1.2 m for plant rooms, sewers and factories.',
    markers: { bottom: 0.08, top: 0.92 },
    height: 1.2,
    start: 1,
    steps: [
      ['L', 0.03, 1],
      ['L', 0.03, 0.5],
      ['L', 0.08, 0.4],
      ['L', 0.46, 0.4],
      ['L', 0.46, 0.48],
      ['L', 0.48, 0.48],
      ['L', 0.48, 0.58],
      ['L', 0.52, 0.58],
      ['L', 0.52, 0.48],
      ['L', 0.54, 0.48],
      ['L', 0.54, 0.4],
      ['L', 0.92, 0.4],
      ['L', 0.97, 0.5],
      ['L', 0.97, 1],
      ['L', 1, 1],
    ],
    sections: [{ from: 0.481, to: 0.519, section: 'polygon', polygonSides: 6 }],
  },
];
