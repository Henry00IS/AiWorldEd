/** Numeric tolerances for solid CSG classification and vertex welding. */
export const SOLID_FAT_PLANE_EPSILON = 0.0006;
/**
 * Vertex weld radius for hashed intermediate geometry. Kept sub-millimeter so
 * intentional centimeter-scale gaps between nearly aligned brushes stay
 * distinct.
 */
export const SOLID_VERTEX_EQUAL_EPSILON = 0.0005;
export const SOLID_SQR_VERTEX_EQUAL_EPSILON = SOLID_VERTEX_EQUAL_EPSILON * SOLID_VERTEX_EQUAL_EPSILON;
/** Spatial hash cell size: vertex equal epsilon times 2.5. */
export const SOLID_VERTEX_HASH_CELL_SIZE = SOLID_VERTEX_EQUAL_EPSILON * 2.5;
export const SOLID_NORMAL_ALIGN_EPSILON = 0.9999;
export const SOLID_PLANE_D_ALIGN_EPSILON = 0.0006;
export const SOLID_BOUNDS_EPSILON = 0.0006;
/**
 * Tight straddle threshold for detecting whether a peer plane cuts a face. Must
 * stay much smaller than SOLID_FAT_PLANE_EPSILON so cut collection is not
 * blocked by the fat membership band used when clipping.
 */
export const SOLID_PLANE_CUT_EPSILON = 1e-5;
/** Minimum denominator for triple-plane intersection. */
export const SOLID_DIVIDE_MINIMUM_EPSILON = 0.000001;
