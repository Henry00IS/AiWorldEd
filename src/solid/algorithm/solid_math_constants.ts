/**
 * Numeric tolerances for solid CSG classification and vertex welding.
 * Tuned for meter-scale level geometry with sub-millimeter precision.
 */
export const SOLID_FAT_PLANE_EPSILON = 0.0006;
export const SOLID_EDGE_EPSILON = 0.0006;
export const SOLID_VERTEX_EQUAL_EPSILON = 0.0005;
export const SOLID_SQR_VERTEX_EQUAL_EPSILON =
  SOLID_VERTEX_EQUAL_EPSILON * SOLID_VERTEX_EQUAL_EPSILON;
export const SOLID_NORMAL_ALIGN_EPSILON = 0.9999;
export const SOLID_PLANE_D_ALIGN_EPSILON = 0.0006;
export const SOLID_BOUNDS_EPSILON = 0.0006;
