import type { ModifierStackPreset } from '@/modifier/stack/modifier_stack_types.js';

/**
 * Stair presets. They set the underside, landing and nosing; the climb
 * direction and how the steps are sized stay as they are, so a preset fits
 * whatever box the stairs fill.
 */
export const MODIFIER_STACK_STAIRS_PRESETS: readonly ModifierStackPreset[] = [
  {
    id: 'plain',
    label: 'Plain Flight',
    group: 'Basic',
    tooltip: 'Box steps over a sloped slab: the default flight.',
    parameters: {},
  },
  {
    id: 'solid-landing',
    label: 'Solid with Landing',
    group: 'Basic',
    tooltip: 'Steps filled down to the floor with a 1 m landing on top, for stoops and platforms.',
    parameters: { fill: 'solid', landing: 1 },
  },
  {
    id: 'floating',
    label: 'Floating Treads',
    group: 'Basic',
    tooltip: 'Open stairs of separate treads with nothing underneath, for cantilevered or stringer stairs.',
    parameters: { fill: 'floating', thickness: 0.06 },
  },
  {
    id: 'concrete-nosed',
    label: 'Concrete Nosed',
    group: 'Nosing',
    tooltip: 'Cast concrete flight: each tread overhangs a recessed riser with a chamfer under the nose.',
    parameters: { waist: 0.16, nosing: 0.035, noseHeight: 0.03, noseBevel: 0.035 },
  },
  {
    id: 'raked',
    label: 'Raked Riser',
    group: 'Nosing',
    tooltip: 'Risers lean back over their full height under a small chamfered nose, as in many public stairwells.',
    parameters: { waist: 0.16, nosing: 0.05, noseHeight: 0.012, noseBevel: 1, noseEdge: 0.006 },
  },
  {
    id: 'stone',
    label: 'Stone Steps',
    group: 'Nosing',
    tooltip: 'Solid stone blocks with a thick square overhang and an eased top edge, for terraces and entrances.',
    parameters: { fill: 'solid', nosing: 0.03, noseHeight: 0.05, noseBevel: 0, noseEdge: 0.01 },
  },
  {
    id: 'thin-slab',
    label: 'Thin Slab',
    group: 'Light',
    tooltip: 'A slender folded-plate look on a thin sloped slab, for modern interiors.',
    parameters: { waist: 0.08 },
  },
  {
    id: 'attic',
    label: 'Steep Attic Stair',
    group: 'Light',
    tooltip:
      'Thin open treads with a small square nose, for loft and service stairs. Fill a tall, short box for the steep pitch.',
    parameters: { fill: 'floating', thickness: 0.04, nosing: 0.02, noseHeight: 0.04, noseBevel: 0 },
  },
];
