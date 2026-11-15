import { SolidOperation } from '@/solid/types/solid_operation.js';

/** One box of the test house: corners in metres and its CSG operation. */
export interface ShatterHouseBox {
  name: string;
  min: [number, number, number];
  max: [number, number, number];
  operation: SolidOperation;
}

/**
 * A small house, 6 m by 4 m and 3 m high: a floor, four 0.25 m walls, a roof
 * slab, and a door and three windows cut by subtractive brushes listed after
 * the walls they open.
 */
export const SHATTER_HOUSE: readonly ShatterHouseBox[] = [
  { name: 'Floor', min: [-3, -0.2, -2], max: [3, 0, 2], operation: SolidOperation.Additive },
  { name: 'Front Wall', min: [-3, 0, -2], max: [3, 3, -1.75], operation: SolidOperation.Additive },
  { name: 'Back Wall', min: [-3, 0, 1.75], max: [3, 3, 2], operation: SolidOperation.Additive },
  { name: 'Left Wall', min: [-3, 0, -1.75], max: [-2.75, 3, 1.75], operation: SolidOperation.Additive },
  { name: 'Right Wall', min: [2.75, 0, -1.75], max: [3, 3, 1.75], operation: SolidOperation.Additive },
  { name: 'Roof', min: [-3.2, 3, -2.2], max: [3.2, 3.25, 2.2], operation: SolidOperation.Additive },
  { name: 'Door', min: [-0.5, 0, -2.1], max: [0.5, 2.1, -1.65], operation: SolidOperation.Subtractive },
  { name: 'Front Window', min: [1.3, 1.1, -2.1], max: [2.3, 2.1, -1.65], operation: SolidOperation.Subtractive },
  { name: 'Back Window', min: [-1.5, 1.1, 1.65], max: [1.5, 2.1, 2.1], operation: SolidOperation.Subtractive },
  { name: 'Left Window', min: [-3.1, 1.1, -0.6], max: [-2.65, 2.1, 0.6], operation: SolidOperation.Subtractive },
];

/** Solid volume of the house once the openings are cut, in cubic metres. */
export const SHATTER_HOUSE_VOLUME = 4.8 + 4.5 + 4.5 + 2.625 + 2.625 + 7.04 - 0.525 - 0.25 - 0.75 - 0.3;

/**
 * Physics Shatter parameters for the house, for a volume centred 1.5 m above
 * the floor: glass cracks, and a blast at the middle of the front wall, left of
 * the door, pushing into the house.
 */
export const SHATTER_HOUSE_PARAMETERS = {
  mode: 'glass',
  crackSize: 0.4,
  maxPieces: 2000,
  impactX: -1.6,
  impactY: 0,
  impactZ: -1.875,
  directionX: 0,
  directionY: 0,
  directionZ: 1,
  strength: 10,
  radius: 2.5,
  duration: 3,
} as const;
