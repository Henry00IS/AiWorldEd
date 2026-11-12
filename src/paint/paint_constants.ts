/** Canvas texels per brush-local unit (one unit is one meter). */
export const PAINT_TEXELS_PER_UNIT = 128;

/** Texels of paint content along one side of a tile. */
export const PAINT_TILE_CONTENT_TEXELS = 62;

/**
 * Coarsest mip level the paint overlay samples. Level 3 is 16 texels per meter;
 * beyond it, the overlay keeps sampling level 3.
 */
export const PAINT_ATLAS_MIP_LEVEL_MAX = 3;

/**
 * Texels rasterized around a tile's content: the real paint of the canvas
 * there, never a fill color. A bilinear tap at the capped mip level reaches
 * half of one of its texels (2^(max-1) texels) past the content edge, so the
 * gutter is one texel wider than that.
 */
export const PAINT_TILE_GUTTER_TEXELS = 2 ** (PAINT_ATLAS_MIP_LEVEL_MAX - 1) + 1;

/** Texels along one side of an atlas slot (content plus both gutters). */
export const PAINT_TILE_SLOT_TEXELS = PAINT_TILE_CONTENT_TEXELS + PAINT_TILE_GUTTER_TEXELS * 2;

/** Texels along one side of an atlas page. */
export const PAINT_PAGE_TEXELS = 1024;

/** Slots along one side of an atlas page. */
export const PAINT_PAGE_SLOTS_PER_SIDE = Math.floor(PAINT_PAGE_TEXELS / PAINT_TILE_SLOT_TEXELS);

/** Slots in one atlas page. */
export const PAINT_PAGE_SLOT_COUNT = PAINT_PAGE_SLOTS_PER_SIDE * PAINT_PAGE_SLOTS_PER_SIDE;

/** Brush-local units covered by one tile. */
export const PAINT_TILE_UNITS = PAINT_TILE_CONTENT_TEXELS / PAINT_TEXELS_PER_UNIT;
