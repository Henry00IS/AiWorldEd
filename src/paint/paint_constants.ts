/** Canvas texels per brush-local unit (one unit is one meter). */
export const PAINT_TEXELS_PER_UNIT = 128;

/** Texels of paint content along one side of a tile. */
export const PAINT_TILE_CONTENT_TEXELS = 62;

/** Gutter texels rasterized around a tile so linear filtering never seams. */
export const PAINT_TILE_GUTTER_TEXELS = 1;

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
