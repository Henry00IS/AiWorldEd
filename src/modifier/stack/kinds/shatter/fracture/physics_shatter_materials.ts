/**
 * Material presets of Physics Shatter, in inspector order. Each sets how the
 * cracks run; 'custom' leaves the raw pattern rows to the user.
 */
export const PHYSICS_SHATTER_MATERIALS = [
  'glass',
  'temperedGlass',
  'stone',
  'concrete',
  'wood',
  'ceramic',
  'plaster',
  'brick',
  'custom',
] as const;

/** One material preset id. */
export type PhysicsShatterMaterial = (typeof PHYSICS_SHATTER_MATERIALS)[number];
