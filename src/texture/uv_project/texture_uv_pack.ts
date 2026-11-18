/** One UV island, a loop of corner coordinates. */
export type TextureUvIsland = readonly (readonly [number, number])[];

/** Padding between packed islands, in UV units before the final 0–1 scale. */
const TEXTURE_UV_PACK_GAP = 0.02;

/**
 * Packs UV islands into the 0–1 square, keeping each island's shape, with a
 * small gap between them.
 *
 * @param islands Islands as corner UV loops.
 * @returns Packed islands in the same order, or empty when none have area.
 */
export function textureUvPackIslands(islands: readonly TextureUvIsland[]): [number, number][][] {
  const boxes = islands.map(textureUvPackBox);
  const placed = textureUvPackShelves(boxes);
  const bounds = textureUvPackBounds(placed);
  if (!(bounds.width > 0) || !(bounds.height > 0)) return islands.map((island) => island.map(([u, v]) => [u, v]));
  const scale = 1 / Math.max(bounds.width, bounds.height);
  return placed.map((island) => island.map(([u, v]) => [u * scale, v * scale]));
}

/** Bounding box of one island, with its shifted corners. */
interface TextureUvPackBox {
  width: number;
  height: number;
  local: [number, number][];
}

/**
 * Shifts an island so its lowest U and V are 0 and records its size.
 *
 * @param island Corner UV loop.
 * @returns Box at the origin.
 */
function textureUvPackBox(island: TextureUvIsland): TextureUvPackBox {
  const minU = Math.min(...island.map(([u]) => u));
  const minV = Math.min(...island.map(([, v]) => v));
  const local: [number, number][] = island.map(([u, v]) => [u - minU, v - minV]);
  return {
    width: Math.max(0, ...local.map(([u]) => u)),
    height: Math.max(0, ...local.map(([, v]) => v)),
    local,
  };
}

/**
 * Places boxes on shelves from left to right, starting a new shelf when the row
 * would grow wider than the tallest running span.
 *
 * @param boxes Islands at the origin.
 * @returns Corners in packed positions, same order as the boxes.
 */
function textureUvPackShelves(boxes: readonly TextureUvPackBox[]): [number, number][][] {
  const packed: [number, number][][] = boxes.map(() => []);
  const cursor = { x: 0, y: 0, height: 0 };
  const limit = textureUvPackShelfLimit(boxes);
  for (const index of textureUvPackShelfOrder(boxes)) {
    const box = boxes[index];
    if (box) textureUvPackShelfPlace(cursor, box, limit, packed, index);
  }
  return packed;
}

/**
 * Sorts islands tallest first so later shelves stay short.
 *
 * @param boxes Islands at the origin.
 * @returns Indices in packing order.
 */
function textureUvPackShelfOrder(boxes: readonly TextureUvPackBox[]): number[] {
  return boxes
    .map((_, index) => index)
    .sort((left, right) => {
      const taller = boxes[right];
      const shorter = boxes[left];
      return (taller?.height ?? 0) - (shorter?.height ?? 0);
    });
}

/**
 * Widest shelf the packer will fill before starting a new row.
 *
 * @param boxes Islands at the origin.
 * @returns Width limit.
 */
function textureUvPackShelfLimit(boxes: readonly TextureUvPackBox[]): number {
  const area = boxes.reduce((sum, box) => sum + box.width * box.height, 0);
  return Math.max(...boxes.map((box) => box.width), Math.sqrt(Math.max(area, 0)), 1);
}

/**
 * Places one island on the current shelf, or starts a new shelf when it would
 * not fit.
 *
 * @param cursor Shelf cursor.
 * @param box Island at the origin.
 * @param limit Shelf width limit.
 * @param packed Packed corners by original index.
 * @param index Original index.
 */
function textureUvPackShelfPlace(
  cursor: { x: number; y: number; height: number },
  box: TextureUvPackBox,
  limit: number,
  packed: [number, number][][],
  index: number,
): void {
  if (cursor.x > 0 && cursor.x + box.width + TEXTURE_UV_PACK_GAP > limit) {
    cursor.y += cursor.height + TEXTURE_UV_PACK_GAP;
    cursor.x = 0;
    cursor.height = 0;
  }
  packed[index] = box.local.map(([u, v]) => [u + cursor.x, v + cursor.y]);
  cursor.x += box.width + TEXTURE_UV_PACK_GAP;
  cursor.height = Math.max(cursor.height, box.height);
}

/**
 * Bounds of packed islands.
 *
 * @param islands Packed corners.
 * @returns Width and height from the origin.
 */
function textureUvPackBounds(islands: readonly TextureUvIsland[]): { width: number; height: number } {
  const us = islands.flatMap((island) => island.map(([u]) => u));
  const vs = islands.flatMap((island) => island.map(([, v]) => v));
  return { width: us.length === 0 ? 0 : Math.max(0, ...us), height: vs.length === 0 ? 0 : Math.max(0, ...vs) };
}
