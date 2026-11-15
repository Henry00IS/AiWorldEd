/**
 * Version of the fracture algorithm. Bump it whenever the pieces a given input
 * and seed produce change: their shapes, their count or their order. It is part
 * of the fracture input hash, so rubble baked by an older algorithm shows as
 * needing a new simulation instead of moving the wrong pieces.
 *
 * 1: first release. 2: inputs combine in CSG order, so later brushes carve
 * earlier ones and subtractive brushes leave holes instead of making pieces.
 */
export const PHYSICS_SHATTER_FRACTURE_VERSION = 2;
