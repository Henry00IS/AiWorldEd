import type { CurvePreset } from './curve_preset.js';

/** Fixed-depth square sections over the whole profile. */
const CURVE_PRESET_SIDED_PIER = { from: 0, to: 1, section: 'square', fixedDepth: true } as const;

/** Fixed-depth square sections whose +X side alone follows the profile. */
const CURVE_PRESET_SIDED_WALL = { ...CURVE_PRESET_SIDED_PIER, side: 'positive' } as const;

/** Profile of a pier that flares into a cove under a slab. */
const CURVE_PRESET_SIDED_FLARE: CurvePreset['steps'] = [
  ['L', 0.05, 0.36],
  ['L', 0.05, 0.3],
  ['L', 0.55, 0.3],
  ['Q', 0.9, 1, 0.88, 0.31],
  ['L', 1, 1],
];

/**
 * Architecture pieces made with side modes and fixed depth: flat-backed pieces
 * grow on one side only, piers keep a flat front and back. The box width sets
 * the widest part; Depth / width sets the depth of fixed-depth pieces, which
 * keep the depth of their bottom.
 */
export const CURVE_PRESETS_SIDED: readonly CurvePreset[] = [
  {
    id: 'flared_pier',
    label: 'Flared Pier',
    tooltip:
      'A T-shaped brick pier whose shaft flares on both sides into concave coves under a flat slab, like a pair of arch springings; front and back stay flat. Set the box to about 1.6 × 2.4 m for gateways, arcades and bridges.',
    markers: { bottom: 0.05, top: 0.55 },
    height: 2.4,
    start: 0.36,
    steps: CURVE_PRESET_SIDED_FLARE,
    sections: [CURVE_PRESET_SIDED_PIER],
  },
  {
    id: 'half_arch_springer',
    label: 'Half-Arch Springer',
    tooltip:
      'A one-sided pier with a flat back that flares into a concave cove on its +X side only, the springing of a half arch or a large corbel. Set the box to about 1.6 × 2.4 m against a wall.',
    markers: { bottom: 0.05, top: 0.55 },
    height: 2.4,
    start: 0.36,
    steps: CURVE_PRESET_SIDED_FLARE,
    sections: [CURVE_PRESET_SIDED_WALL],
  },
  {
    id: 'stepped_buttress',
    label: 'Stepped Buttress',
    tooltip:
      'A wall buttress with a flat back that steps in twice with sloped set-offs and ends in a weathered top. Set the box to about 1.6 × 5 m with Depth / width near 0.8 against a church or castle wall.',
    markers: { bottom: 0.3, top: 0.9 },
    height: 5,
    start: 1,
    steps: [
      ['L', 0.3, 1],
      ['L', 0.36, 0.7],
      ['L', 0.62, 0.7],
      ['L', 0.68, 0.45],
      ['L', 0.9, 0.45],
      ['L', 1, 0.2],
    ],
    sections: [CURVE_PRESET_SIDED_WALL],
  },
  {
    id: 'stepped_corbel',
    label: 'Stepped Corbel',
    tooltip:
      'Four brick corbel courses, each stepping a quarter further out from a flat wall face, to carry a beam or an oriel. Set the box to about 0.8 × 0.6 m with Depth / width near 2.',
    markers: { bottom: 0.25, top: 0.75 },
    start: 0.25,
    steps: [
      ['L', 0.25, 0.25],
      ['L', 0.25, 0.5],
      ['L', 0.5, 0.5],
      ['L', 0.5, 0.75],
      ['L', 0.75, 0.75],
      ['L', 0.75, 1],
      ['L', 1, 1],
    ],
    sections: [CURVE_PRESET_SIDED_WALL],
  },
  {
    id: 'console_bracket',
    label: 'Console Bracket',
    tooltip:
      'A carved console with a flat back whose front swells in an S-curve up to a square cap, as under shelves, balconies and door hoods. Set the box to about 0.4 × 0.6 m with Depth / width near 2.',
    markers: { bottom: 0.1, top: 0.85 },
    start: 0.2,
    steps: [
      ['B', 0.85, 0.9, 0.55, 0.16, 0.42, 0.92],
      ['L', 0.85, 1],
      ['L', 1, 1],
    ],
    sections: [CURVE_PRESET_SIDED_WALL],
  },
  {
    id: 'shelf_bracket',
    label: 'Shelf Bracket',
    tooltip:
      'A thin flat-backed gusset plate with a concave front edge and a top flange, the steel bracket under a wall shelf. Set the box to about 0.3 × 0.3 m with Depth / width near 0.3.',
    markers: { bottom: 0.1, top: 0.9 },
    start: 0.12,
    steps: [
      ['Q', 0.9, 0.9, 0.86, 0.14],
      ['L', 0.9, 1],
      ['L', 1, 1],
    ],
    sections: [CURVE_PRESET_SIDED_WALL],
  },
  {
    id: 'wall_pilaster',
    label: 'Wall Pilaster',
    tooltip:
      'A flat pilaster engaged in a wall: its back stays flush while the base and capital mouldings project forward and sideways. Set the box to about 0.25 × 3 m with Depth / width near 3.',
    markers: { bottom: 0.11, top: 0.86 },
    height: 3,
    start: 1,
    steps: [
      ['L', 0.05, 1],
      ['L', 0.05, 0.86],
      ['Q', 0.11, 0.7, 0.11, 0.84],
      ['L', 0.86, 0.7],
      ['Q', 0.92, 0.86, 0.92, 0.72],
      ['L', 0.94, 0.86],
      ['L', 0.94, 1],
      ['L', 1, 1],
    ],
    sections: [{ from: 0, to: 1, section: 'square', side: 'positive' }],
  },
  {
    id: 'chimney_breast',
    label: 'Chimney Breast',
    tooltip:
      'A chimney breast with flat front and back: a wide fireplace base, sloped shoulders, a narrow stack and an oversailing cap course. Set the box to about 2 × 6 m with Depth / width near 0.3.',
    markers: { bottom: 0.42, top: 0.94 },
    height: 6,
    start: 1,
    steps: [
      ['L', 0.42, 1],
      ['L', 0.55, 0.42],
      ['L', 0.94, 0.42],
      ['L', 0.94, 0.5],
      ['L', 1, 0.5],
    ],
    sections: [CURVE_PRESET_SIDED_PIER],
  },
  {
    id: 'stepped_retaining_wall',
    label: 'Stepped Retaining Wall',
    tooltip:
      'A retaining wall with a flat back and a front that steps back in four courses as it rises. Set the box to about 1.2 × 2 m with Depth / width near 3 for a long run of wall.',
    markers: { bottom: 0.25, top: 0.75 },
    start: 1,
    steps: [
      ['L', 0.25, 1],
      ['L', 0.25, 0.8],
      ['L', 0.5, 0.8],
      ['L', 0.5, 0.6],
      ['L', 0.75, 0.6],
      ['L', 0.75, 0.4],
      ['L', 1, 0.4],
    ],
    sections: [CURVE_PRESET_SIDED_WALL],
  },
  {
    id: 'gable_wall',
    label: 'Gable Wall',
    tooltip:
      'A flat gable end: a rectangular wall rising into a triangular peak, with the depth of its base all the way up. Set the box to about 6 × 7 m with Depth / width near 0.06.',
    markers: { bottom: 0.1, top: 0.55 },
    start: 1,
    steps: [
      ['L', 0.55, 1],
      ['L', 1, 0],
    ],
    sections: [CURVE_PRESET_SIDED_PIER],
  },
  {
    id: 'merlon',
    label: 'Merlon',
    tooltip:
      'A battlement merlon with flat faces, a projecting drip course and a ridged weathering on top. Set the box to about 1 × 1.4 m with Depth / width near 0.6 and repeat it along a parapet.',
    markers: { bottom: 0.1, top: 0.8 },
    start: 0.9,
    steps: [
      ['L', 0.8, 0.9],
      ['L', 0.8, 1],
      ['L', 0.85, 1],
      ['L', 0.85, 0.94],
      ['L', 1, 0.1],
    ],
    sections: [CURVE_PRESET_SIDED_PIER],
  },
  {
    id: 'keystone',
    label: 'Keystone',
    tooltip:
      'The wedge-shaped top stone of an arch, wider at the top, with flat faces and a small projecting cap. Set the box to about 0.5 × 0.6 m with Depth / width near 1.2.',
    markers: { bottom: 0.1, top: 0.9 },
    start: 0.7,
    steps: [
      ['L', 0.88, 0.94],
      ['L', 0.88, 1],
      ['L', 1, 1],
    ],
    sections: [CURVE_PRESET_SIDED_PIER],
  },
  {
    id: 'chamfered_plinth',
    label: 'Chamfered Plinth',
    tooltip:
      'A plinth or quoin block with a flat back and a chamfer along its front top edge only. Set the box to about 0.6 × 0.4 m with Depth / width near 1.5 and run it along a wall base.',
    markers: { bottom: 0.1, top: 0.9 },
    start: 1,
    steps: [
      ['L', 0.65, 1],
      ['L', 1, 0.7],
    ],
    sections: [CURVE_PRESET_SIDED_WALL],
  },
  {
    id: 'haunched_beam',
    label: 'Haunched Beam',
    tooltip:
      'A beam with a flat top whose underside deepens in concave haunches at both ends. Lay it down by turning the generator 90°; set the box to about 0.6 × 5 m with Depth / width near 0.5.',
    markers: { bottom: 0.2, top: 0.8 },
    height: 5,
    start: 1,
    steps: [
      ['Q', 0.2, 0.6, 0.08, 0.6],
      ['L', 0.8, 0.6],
      ['Q', 1, 1, 0.92, 0.6],
    ],
    sections: [{ ...CURVE_PRESET_SIDED_PIER, side: 'negative' }],
  },
];
