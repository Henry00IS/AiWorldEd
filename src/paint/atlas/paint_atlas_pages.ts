import * as THREE from 'three';
import {
  PAINT_PAGE_SLOTS_PER_SIDE,
  PAINT_PAGE_SLOT_COUNT,
  PAINT_PAGE_TEXELS,
  PAINT_TILE_SLOT_TEXELS,
} from '@/paint/paint_constants.js';

/** Bands of dirty slot rows above which a page is uploaded whole. */
const PAINT_PAGE_PARTIAL_BAND_LIMIT = 6;

/** One atlas page: the A map in the left half and the B map in the right. */
export class PaintAtlasPage {
  /** RGBA bytes, two page widths wide. */
  readonly data: Uint8Array;
  /** GPU texture over {@link data}. */
  readonly texture: THREE.DataTexture;
  private readonly dirtyBands = new Set<number>();
  private fullUploadPending = true;

  /** Creates an identity page (A = 1, B = 0). */
  constructor() {
    const width = PAINT_PAGE_TEXELS * 2;
    this.data = new Uint8Array(width * PAINT_PAGE_TEXELS * 4);
    for (let y = 0; y < PAINT_PAGE_TEXELS; y++) {
      const row = y * width * 4;
      this.data.fill(255, row, row + PAINT_PAGE_TEXELS * 4);
      for (let x = PAINT_PAGE_TEXELS; x < width; x++) this.data[row + x * 4 + 3] = 255;
    }
    this.texture = new THREE.DataTexture(this.data, width, PAINT_PAGE_TEXELS, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.texture.name = 'Paint Atlas Page';
    this.texture.colorSpace = THREE.NoColorSpace;
    this.texture.magFilter = THREE.LinearFilter;
    // Mipmaps come from the GPU after every upload. Slots are multiples of the
    // capped level's mip texel, so no mip texel up to the cap mixes two slots;
    // the overlay shader never samples above the cap. Anisotropic taps could
    // reach past the gutter, so filtering stays isotropic.
    this.texture.minFilter = THREE.LinearMipmapLinearFilter;
    this.texture.generateMipmaps = true;
    this.texture.anisotropy = 1;
    this.texture.onUpdate = () => {
      this.fullUploadPending = false;
    };
    this.texture.needsUpdate = true;
  }

  /**
   * Marks a slot as written.
   *
   * @param slotInPage Slot index within the page.
   */
  markSlotDirty(slotInPage: number): void {
    this.dirtyBands.add(Math.floor(slotInPage / PAINT_PAGE_SLOTS_PER_SIDE));
  }

  /** Queues the dirty rows for upload. */
  flush(): void {
    if (this.dirtyBands.size === 0) return;
    this.texture.clearUpdateRanges();
    if (!this.fullUploadPending && this.dirtyBands.size <= PAINT_PAGE_PARTIAL_BAND_LIMIT) {
      const rowComponents = PAINT_PAGE_TEXELS * 2 * 4;
      for (const band of this.dirtyBands) {
        const firstRow = band * PAINT_TILE_SLOT_TEXELS;
        // Each range is uploaded as a single texture row.
        for (let row = firstRow; row < firstRow + PAINT_TILE_SLOT_TEXELS; row++) {
          this.texture.addUpdateRange(row * rowComponents, rowComponents);
        }
      }
    }
    this.dirtyBands.clear();
    this.texture.needsUpdate = true;
  }

  /** Releases the GPU texture. */
  dispose(): void {
    this.texture.dispose();
  }
}

/**
 * Splits a global slot into its page and the slot's column and row there.
 *
 * @param slot Global slot.
 * @returns Page index, slot index in the page, column and row.
 */
export function paintAtlasSlotLocate(slot: number): { page: number; slotInPage: number; column: number; row: number } {
  const page = Math.floor(slot / PAINT_PAGE_SLOT_COUNT);
  const slotInPage = slot - page * PAINT_PAGE_SLOT_COUNT;
  return {
    page,
    slotInPage,
    column: slotInPage % PAINT_PAGE_SLOTS_PER_SIDE,
    row: Math.floor(slotInPage / PAINT_PAGE_SLOTS_PER_SIDE),
  };
}

/**
 * Copies one slot's texels (both halves) between page buffers.
 *
 * @param from Source page.
 * @param fromColumn Source column.
 * @param fromRow Source row.
 * @param to Target page.
 * @param toColumn Target column.
 * @param toRow Target row.
 */
export function paintAtlasSlotCopy(
  from: PaintAtlasPage,
  fromColumn: number,
  fromRow: number,
  to: PaintAtlasPage,
  toColumn: number,
  toRow: number,
): void {
  const rowBytes = PAINT_PAGE_TEXELS * 2 * 4;
  const slotBytes = PAINT_TILE_SLOT_TEXELS * 4;
  for (let y = 0; y < PAINT_TILE_SLOT_TEXELS; y++) {
    for (const half of [0, PAINT_PAGE_TEXELS * 4]) {
      const source = (fromRow * PAINT_TILE_SLOT_TEXELS + y) * rowBytes + fromColumn * slotBytes + half;
      const target = (toRow * PAINT_TILE_SLOT_TEXELS + y) * rowBytes + toColumn * slotBytes + half;
      to.data.set(from.data.subarray(source, source + slotBytes), target);
    }
  }
}
