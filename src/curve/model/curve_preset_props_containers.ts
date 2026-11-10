import type { CurvePreset, CurvePresetStep } from './curve_preset.js';
import { curvePresetGrid } from './curve_preset_stack.js';

/** Centre heights of the iron hoop bands of the wooden cask. */
const CURVE_PRESET_CASK_HOOPS: readonly number[] = [0.05, 0.22, 0.78, 0.95];

/**
 * Returns the bulging stave radius of the wooden cask at a height.
 *
 * @param height Height in 0..1.
 * @returns Radius in 0..1.
 */
function curvePresetCaskRadius(height: number): number {
  return curvePresetGrid(0.8 + 0.16 * Math.sin(Math.PI * height));
}

/**
 * Builds the wooden cask: bulging staves sampled every tenth, with a raised
 * iron hoop band around each hoop height.
 *
 * @returns Steps after the start point.
 */
function curvePresetCaskSteps(): CurvePresetStep[] {
  const heights = [0.1, 0.3, 0.4, 0.5, 0.6, 0.7, 0.9, 1];
  const steps: CurvePresetStep[] = [];
  const hoops = [...CURVE_PRESET_CASK_HOOPS];
  for (const height of heights) {
    const hoop = hoops[0];
    if (hoop !== undefined && hoop < height) {
      const [low, high] = [curvePresetGrid(hoop - 0.02), curvePresetGrid(hoop + 0.02)];
      steps.push(['L', low, curvePresetCaskRadius(low)], ['L', low, curvePresetCaskRadius(low) + 0.03]);
      steps.push(['L', high, curvePresetCaskRadius(high) + 0.03], ['L', high, curvePresetCaskRadius(high)]);
      hoops.shift();
    }
    steps.push(['L', height, curvePresetCaskRadius(height)]);
  }
  return steps;
}

/**
 * Medical props, bottles, cans and containers. Each tooltip gives a real-world
 * size for the generator box, width by height.
 */
export const CURVE_PRESETS_PROPS_CONTAINERS: readonly CurvePreset[] = [
  {
    id: 'syringe',
    label: 'Syringe',
    tooltip:
      'A plastic syringe with a stadium finger grip and a cross-shaped plunger. Set the box to about 0.03 × 0.14 m for a 10 ml syringe in clinics and labs.',
    markers: { bottom: 0.09, top: 0.62 },
    start: 0.12,
    steps: [
      ['L', 0.06, 0.12],
      ['L', 0.09, 0.5],
      ['L', 0.62, 0.5],
      ['L', 0.62, 1],
      ['L', 0.65, 1],
      ['L', 0.65, 0.4],
      ['L', 0.95, 0.4],
      ['L', 0.95, 0.62],
      ['L', 1, 0.62],
    ],
    sections: [
      { from: 0.62, to: 0.645, section: 'stadium', straight: 0.5 },
      { from: 0.655, to: 0.95, section: 'cross', armWidth: 0.16 },
    ],
  },
  {
    id: 'prescription_pill_bottle',
    label: 'Prescription Pill Bottle',
    tooltip:
      'A pharmacy pill vial with a wider push-and-turn cap. Set the box to about 0.045 × 0.085 m for bathroom shelves and medicine cabinets.',
    markers: { bottom: 0.04, top: 0.76 },
    start: 0.8,
    steps: [
      ['Q', 0.04, 0.88, 0, 0.88],
      ['L', 0.76, 0.9],
      ['L', 0.76, 0.86],
      ['L', 0.78, 0.86],
      ['L', 0.78, 1],
      ['L', 0.96, 1],
      ['Q', 1, 0.92, 1, 1],
    ],
  },
  {
    id: 'supplement_bottle',
    label: 'Supplement Bottle',
    tooltip:
      'A rounded vitamin bottle with a shoulder, short neck and screw cap. Set the box to about 0.065 × 0.12 m for kitchens, pharmacies and gyms.',
    markers: { bottom: 0.04, top: 0.66 },
    start: 0.84,
    steps: [
      ['Q', 0.04, 0.94, 0, 0.94],
      ['L', 0.66, 0.94],
      ['B', 0.76, 0.6, 0.73, 0.94, 0.76, 0.76],
      ['L', 0.79, 0.6],
      ['L', 0.79, 0.68],
      ['L', 0.98, 0.68],
      ['Q', 1, 0.62, 1, 0.68],
    ],
    sections: [{ from: 0.79, to: 1, section: 'polygon', polygonSides: 12 }],
  },
  {
    id: 'apothecary_jar',
    label: 'Apothecary Jar',
    tooltip:
      'A glass medicine jar with a short neck and a tapered cork. Set the box to about 0.08 × 0.13 m for old pharmacies, alchemy labs and potion shelves.',
    markers: { bottom: 0.03, top: 0.6 },
    start: 0.84,
    steps: [
      ['Q', 0.03, 0.92, 0, 0.92],
      ['L', 0.58, 0.92],
      ['B', 0.7, 0.5, 0.68, 0.92, 0.68, 0.5],
      ['L', 0.73, 0.5],
      ['L', 0.73, 0.58],
      ['L', 0.76, 0.58],
      ['L', 0.76, 0.46],
      ['L', 0.97, 0.53],
      ['Q', 1, 0.47, 1, 0.53],
    ],
  },
  {
    id: 'capsule_pill',
    label: 'Capsule Pill',
    tooltip:
      'A two-part gelatin capsule with round ends. Set the box to about 0.007 × 0.021 m, or scale it up for signs and oversized props.',
    markers: { bottom: 0.17, top: 0.83 },
    start: 0,
    steps: [
      ['B', 0.17, 0.95, 0, 0.53, 0.08, 0.95],
      ['L', 0.47, 0.95],
      ['L', 0.47, 1],
      ['L', 0.83, 1],
      ['B', 1, 0, 0.92, 1, 1, 0.55],
    ],
  },
  {
    id: 'beer_bottle',
    label: 'Beer Bottle',
    tooltip:
      'A long-neck beer bottle with a lip ring and a crimped crown cap. Set the box to about 0.062 × 0.235 m for bars, kitchens and picnic tables.',
    markers: { bottom: 0.03, top: 0.5 },
    start: 0.88,
    steps: [
      ['Q', 0.03, 1, 0, 1],
      ['L', 0.5, 1],
      ['B', 0.72, 0.4, 0.62, 1, 0.64, 0.42],
      ['L', 0.91, 0.36],
      ['L', 0.91, 0.42],
      ['L', 0.93, 0.42],
      ['L', 0.93, 0.38],
      ['L', 0.94, 0.38],
      ['L', 0.94, 0.45],
      ['L', 0.99, 0.44],
      ['L', 1, 0.4],
    ],
    sections: [{ from: 0.94, to: 1, section: 'polygon', polygonSides: 12 }],
  },
  {
    id: 'wine_bottle',
    label: 'Wine Bottle',
    tooltip:
      'A Bordeaux wine bottle with high shoulders, a long neck and a foil top. Set the box to about 0.075 × 0.3 m for cellars, restaurants and dinner tables.',
    markers: { bottom: 0.03, top: 0.6 },
    start: 0.9,
    steps: [
      ['Q', 0.03, 1, 0, 1],
      ['L', 0.6, 1],
      ['B', 0.72, 0.38, 0.67, 1, 0.68, 0.4],
      ['L', 0.87, 0.34],
      ['L', 0.87, 0.37],
      ['L', 0.99, 0.37],
      ['L', 1, 0.34],
    ],
  },
  {
    id: 'soda_bottle',
    label: 'Soda Bottle',
    tooltip:
      'A plastic soda bottle with a label waist, neck collar and ridged screw cap. Set the box to about 0.065 × 0.21 m for shops, fridges and vending machines.',
    markers: { bottom: 0.03, top: 0.6 },
    start: 0.85,
    steps: [
      ['Q', 0.03, 0.96, 0, 0.96],
      ['L', 0.3, 0.96],
      ['Q', 0.38, 0.88, 0.34, 0.88],
      ['L', 0.46, 0.88],
      ['Q', 0.54, 0.96, 0.5, 0.96],
      ['L', 0.6, 0.96],
      ['B', 0.8, 0.36, 0.7, 0.96, 0.76, 0.4],
      ['L', 0.86, 0.36],
      ['L', 0.86, 0.48],
      ['L', 0.87, 0.48],
      ['L', 0.87, 0.42],
      ['L', 1, 0.42],
    ],
    sections: [{ from: 0.875, to: 1, section: 'polygon', polygonSides: 12 }],
  },
  {
    id: 'soda_can',
    label: 'Soda Can',
    tooltip:
      'A drinks can with a chamfered base, necked top and rim. Set the box to about 0.066 × 0.115 m for kitchens, shops and litter in streets.',
    markers: { bottom: 0.05, top: 0.86 },
    start: 0.78,
    steps: [
      ['L', 0.05, 1],
      ['L', 0.86, 1],
      ['L', 0.97, 0.82],
      ['L', 0.97, 0.85],
      ['L', 1, 0.85],
    ],
  },
  {
    id: 'whiskey_bottle',
    label: 'Whiskey Bottle',
    tooltip:
      'A square whiskey bottle with rounded corners, a shoulder that rounds off into a round neck, and a cork stopper. Set the box to about 0.08 × 0.27 m for bars, offices and saloons.',
    markers: { bottom: 0.03, top: 0.68 },
    start: 0.92,
    steps: [
      ['L', 0.68, 0.95],
      ['Q', 0.77, 0.3, 0.76, 0.95],
      ['L', 0.9, 0.3],
      ['L', 0.9, 0.36],
      ['L', 1, 0.36],
    ],
    sections: [
      { from: 0, to: 0.68, section: 'square', cornerSize: 0.35, cornerSides: 3 },
      { from: 0.68, to: 0.77, section: 'square', cornerSize: 0.35, cornerSides: 3, blend: true },
    ],
  },
  {
    id: 'oil_drum',
    label: 'Oil Drum',
    tooltip:
      'A 200-litre steel drum with rolled rims and two rolling hoops. Set the box to about 0.6 × 0.88 m for warehouses, docks and industrial yards.',
    markers: { bottom: 0.03, top: 0.97 },
    start: 1,
    steps: [
      ['L', 0.02, 1],
      ['L', 0.02, 0.96],
      ['L', 0.31, 0.96],
      ['L', 0.33, 1],
      ['L', 0.35, 0.96],
      ['L', 0.65, 0.96],
      ['L', 0.67, 1],
      ['L', 0.69, 0.96],
      ['L', 0.98, 0.96],
      ['L', 0.98, 1],
      ['L', 1, 1],
    ],
  },
  {
    id: 'wooden_cask',
    label: 'Wooden Cask',
    tooltip:
      'A bulging wooden barrel bound by four iron hoops. Set the box to about 0.6 × 0.85 m for taverns, cellars, ships and market stalls.',
    markers: { bottom: 0.08, top: 0.92 },
    start: 0.8,
    steps: curvePresetCaskSteps(),
  },
  {
    id: 'flower_pot',
    label: 'Flower Pot',
    tooltip:
      'A tapered terracotta pot with a thick rim band. Set the box to about 0.22 × 0.19 m for windowsills, patios and greenhouses.',
    markers: { bottom: 0.02, top: 0.79 },
    start: 0.6,
    steps: [
      ['L', 0.02, 0.63],
      ['L', 0.79, 0.86],
      ['L', 0.79, 0.97],
      ['L', 0.98, 1],
      ['L', 1, 0.96],
    ],
  },
];
