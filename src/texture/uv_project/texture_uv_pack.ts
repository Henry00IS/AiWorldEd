/** One UV island, a loop of corner coordinates. */
export type TextureUvIsland = readonly (readonly [number, number])[];

/** Gap between packed islands when none is given, as a share of the square. */
const TEXTURE_UV_PACK_GAP = 0.02;

/**
 * Packs UV islands into the 0–1 square, keeping each island's shape, with a gap
 * between them about Margin of the square wide. With Rotate each island is
 * first turned so its bounding box is as small as it can be.
 *
 * @param islands Islands as corner UV loops.
 * @param margin Gap between islands, as a share of the square.
 * @param rotate True to turn each island for the best fit.
 * @returns Packed islands in the same order, or empty when none have area.
 */
export function textureUvPackIslands(
  islands: readonly TextureUvIsland[],
  margin = TEXTURE_UV_PACK_GAP,
  rotate = false,
): [number, number][][] {
  const boxes = islands.map((island) => textureUvPackBox(rotate ? textureUvPackTurned(island) : island));
  const placed = textureUvPackShelves(boxes, margin);
  const bounds = textureUvPackBounds(placed);
  if (!(bounds.width > 0) || !(bounds.height > 0)) return islands.map((island) => island.map(([u, v]) => [u, v]));
  const scale = 1 / Math.max(bounds.width, bounds.height);
  return placed.map((island) => island.map(([u, v]) => [u * scale, v * scale]));
}

/**
 * Turns an island about the origin by an angle.
 *
 * @param island Corner UV loop.
 * @param angle Angle in radians.
 * @returns Turned corners.
 */
function textureUvPackTurn(island: TextureUvIsland, angle: number): [number, number][] {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return island.map(([u, v]) => [u * cos - v * sin, u * sin + v * cos]);
}

/**
 * Bounding box area of an island.
 *
 * @param island Corner UV loop.
 * @returns Area.
 */
function textureUvPackArea(island: TextureUvIsland): number {
  const us = island.map(([u]) => u);
  const vs = island.map(([, v]) => v);
  return (Math.max(...us) - Math.min(...us)) * (Math.max(...vs) - Math.min(...vs));
}

/**
 * Turns an island so its bounding box is smallest: the best box always lies
 * along one of its edges, so each edge direction is tried.
 *
 * @param island Corner UV loop.
 * @returns Turned corners.
 */
export function textureUvPackTurned(island: TextureUvIsland): [number, number][] {
  const angles = new Set<number>([0]);
  island.forEach(([u, v], index) => {
    const [nextU, nextV] = island[(index + 1) % island.length] ?? [u, v];
    if (nextU !== u || nextV !== v) angles.add(Number((-Math.atan2(nextV - v, nextU - u) % (Math.PI / 2)).toFixed(9)));
  });
  let best = textureUvPackTurn(island, 0);
  for (const angle of angles) {
    const turned = textureUvPackTurn(island, angle);
    if (textureUvPackArea(turned) < textureUvPackArea(best) - 1e-12) best = turned;
  }
  return best;
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
 * @param margin Gap between islands, as a share of the shelf width.
 * @returns Corners in packed positions, same order as the boxes.
 */
function textureUvPackShelves(boxes: readonly TextureUvPackBox[], margin: number): [number, number][][] {
  const packed: [number, number][][] = boxes.map(() => []);
  const cursor = { x: 0, y: 0, height: 0, gap: 0 };
  const limit = textureUvPackShelfLimit(boxes);
  cursor.gap = margin * limit;
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
 * @param cursor Shelf cursor and the gap between islands.
 * @param box Island at the origin.
 * @param limit Shelf width limit.
 * @param packed Packed corners by original index.
 * @param index Original index.
 */
function textureUvPackShelfPlace(
  cursor: { x: number; y: number; height: number; gap: number },
  box: TextureUvPackBox,
  limit: number,
  packed: [number, number][][],
  index: number,
): void {
  if (cursor.x > 0 && cursor.x + box.width + cursor.gap > limit) {
    cursor.y += cursor.height + cursor.gap;
    cursor.x = 0;
    cursor.height = 0;
  }
  packed[index] = box.local.map(([u, v]) => [u + cursor.x, v + cursor.y]);
  cursor.x += box.width + cursor.gap;
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
