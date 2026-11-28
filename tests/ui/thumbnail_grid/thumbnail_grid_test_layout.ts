import { vi } from 'vitest';

/** Sizes of the fake layout of a thumbnail grid. */
export interface ThumbnailGridTestLayout {
  /** Client width of every element in CSS pixels. */
  width: number;
  /** Client height of every element in CSS pixels. */
  height: number;
  /** Height of a tile. */
  tilePx: number;
  /** Height of a full-width heading. */
  headingPx: number;
}

/**
 * Gives jsdom a layout: elements have a client size, tiles a height, and the
 * grid a scroll offset that fires scroll events like a browser. Call
 * `vi.restoreAllMocks()` afterwards.
 *
 * @param layout Sizes (mutable: change them and fire a window resize to
 *   resize).
 * @returns Function that attaches a scroll offset to a grid element.
 */
export function thumbnailGridTestLayoutInstall(layout: ThumbnailGridTestLayout): (grid: HTMLElement) => void {
  vi.spyOn(Element.prototype, 'clientWidth', 'get').mockImplementation(() => layout.width);
  vi.spyOn(Element.prototype, 'clientHeight', 'get').mockImplementation(() => layout.height);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.hasAttribute('data-thumbnail-spacer')) return new DOMRect(0, 0, 100, 0);
    if (this.dataset['missingHeading'] !== undefined) return new DOMRect(0, 0, 100, layout.headingPx);
    const tile = this.className.includes('tile');
    return new DOMRect(0, 0, 100, tile ? layout.tilePx : 0);
  });
  return (grid) => {
    let offset = 0;
    Object.defineProperty(grid, 'scrollTop', {
      configurable: true,
      get: () => offset,
      set: (value: number) => {
        offset = Math.max(0, value);
        grid.dispatchEvent(new Event('scroll'));
      },
    });
  };
}
