import { listSharedBorders, type AreaSharedBorder } from './area_adjacency.js';
import type { AreaLeafPlacement } from './area_leaf_placement.js';
import { areaNumbersNearlyEqual, areaRectBottom, areaRectRight } from './area_rect.js';

/** Resizes overlapping, collinear pane sides as one connected border. */
export class AreaBorderResize {
  /**
   * Applies a ratio to all pane sides connected through an overlapping side.
   *
   * @param placements Mutable leaf placements.
   * @param first First pane on the left or top.
   * @param second Second pane on the right or bottom.
   * @param ratio Requested ratio within the selected pair's span.
   * @param minimumRatio Minimum retained fraction of each neighboring pair.
   * @returns Whether the selected border exists and can move.
   */
  static apply(
    placements: AreaLeafPlacement[],
    first: AreaLeafPlacement,
    second: AreaLeafPlacement,
    ratio: number,
    minimumRatio: number,
  ): boolean {
    const borders = listSharedBorders(placements);
    const selected = borders.find(
      (border) => border.firstAreaId === first.payload.areaId && border.secondAreaId === second.payload.areaId,
    );
    if (!selected) return false;
    const connected = this.collectConnectedBorders(borders, selected);
    const coordinate = this.computeClampedCoordinate(
      placements,
      connected,
      selected,
      first,
      second,
      ratio,
      minimumRatio,
    );
    if (coordinate === null) return false;
    this.resizeConnectedPlacements(placements, connected, selected, coordinate);
    return true;
  }

  /**
   * Collects collinear borders linked by a common pane side, leaving aligned
   * independent pairs alone.
   *
   * @param borders Available border segments.
   * @param selected Initial segment.
   * @returns Connected segments.
   */
  private static collectConnectedBorders(borders: AreaSharedBorder[], selected: AreaSharedBorder): AreaSharedBorder[] {
    const candidates = borders.filter(
      (border) =>
        border.direction === selected.direction &&
        areaNumbersNearlyEqual(this.borderCoordinate(border), this.borderCoordinate(selected)),
    );
    const areaIds = new Set([selected.firstAreaId, selected.secondAreaId]);
    const connected = new Set([selected]);
    let previousSize = 0;
    while (previousSize !== connected.size) {
      previousSize = connected.size;
      for (const border of candidates) {
        if (!areaIds.has(border.firstAreaId) && !areaIds.has(border.secondAreaId)) continue;
        connected.add(border);
        areaIds.add(border.firstAreaId);
        areaIds.add(border.secondAreaId);
      }
    }
    return [...connected];
  }

  /**
   * Reads a border's coordinate on its movement axis.
   *
   * @param border Border segment.
   * @returns Normalized divider coordinate.
   */
  private static borderCoordinate(border: AreaSharedBorder): number {
    const rect = border.borderRect;
    return border.direction === 'horizontal' ? rect.x + rect.width / 2 : rect.y + rect.height / 2;
  }

  /**
   * Reads a pane's start coordinate on the movement axis.
   *
   * @param placement Pane placement.
   * @param border Border defining the axis.
   * @returns Start coordinate.
   */
  private static paneStart(placement: AreaLeafPlacement, border: AreaSharedBorder): number {
    return border.direction === 'horizontal' ? placement.rect.x : placement.rect.y;
  }

  /**
   * Reads a pane's end coordinate on the movement axis.
   *
   * @param placement Pane placement.
   * @param border Border defining the axis.
   * @returns End coordinate.
   */
  private static paneEnd(placement: AreaLeafPlacement, border: AreaSharedBorder): number {
    return border.direction === 'horizontal' ? areaRectRight(placement.rect) : areaRectBottom(placement.rect);
  }

  /**
   * Clamps the requested coordinate to all connected neighbors' safe intervals.
   *
   * @param placements All panes.
   * @param connected Connected border segments.
   * @param selected Selected segment.
   * @param first Selected first pane.
   * @param second Selected second pane.
   * @param ratio Requested selected-pair ratio.
   * @param minimumRatio Minimum retained pair fraction.
   * @returns Safe coordinate, or null when no common interval exists.
   */
  private static computeClampedCoordinate(
    placements: AreaLeafPlacement[],
    connected: AreaSharedBorder[],
    selected: AreaSharedBorder,
    first: AreaLeafPlacement,
    second: AreaLeafPlacement,
    ratio: number,
    minimumRatio: number,
  ): number | null {
    const limits = connected.map((border) => this.pairLimits(placements, border, minimumRatio));
    const minimum = Math.max(...limits.map((limit) => limit[0]));
    const maximum = Math.min(...limits.map((limit) => limit[1]));
    if (minimum > maximum) return null;
    const start = this.paneStart(first, selected);
    const requested = start + (this.paneEnd(second, selected) - start) * ratio;
    return Math.min(maximum, Math.max(minimum, requested));
  }

  /**
   * Computes the safe interval for a neighboring pair.
   *
   * @param placements All panes.
   * @param border Neighbor border.
   * @param minimumRatio Minimum pair fraction.
   * @returns Minimum and maximum divider coordinates.
   */
  private static pairLimits(
    placements: AreaLeafPlacement[],
    border: AreaSharedBorder,
    minimumRatio: number,
  ): [number, number] {
    const first = placements.find((item) => item.payload.areaId === border.firstAreaId);
    const second = placements.find((item) => item.payload.areaId === border.secondAreaId);
    if (!first || !second) return [Infinity, -Infinity];
    const start = this.paneStart(first, border);
    const end = this.paneEnd(second, border);
    const margin = (end - start) * minimumRatio;
    return [start + margin, end - margin];
  }

  /**
   * Updates every connected pane once while preserving its opposite edge.
   *
   * @param placements Mutable pane placements.
   * @param connected Connected border segments.
   * @param selected Border defining the axis.
   * @param coordinate New divider coordinate.
   */
  private static resizeConnectedPlacements(
    placements: AreaLeafPlacement[],
    connected: AreaSharedBorder[],
    selected: AreaSharedBorder,
    coordinate: number,
  ): void {
    const firstIds = new Set(connected.map((border) => border.firstAreaId));
    const secondIds = new Set(connected.map((border) => border.secondAreaId));
    for (const placement of placements) {
      const isFirst = firstIds.has(placement.payload.areaId);
      if (!isFirst && !secondIds.has(placement.payload.areaId)) continue;
      this.resizePlacement(placement, selected, coordinate, isFirst);
    }
  }

  /**
   * Moves one pane side without changing perpendicular geometry.
   *
   * @param placement Mutable pane placement.
   * @param border Border defining the axis.
   * @param coordinate New divider coordinate.
   * @param isFirst Whether to move the trailing rather than leading side.
   */
  private static resizePlacement(
    placement: AreaLeafPlacement,
    border: AreaSharedBorder,
    coordinate: number,
    isFirst: boolean,
  ): void {
    const start = isFirst ? this.paneStart(placement, border) : coordinate;
    const end = isFirst ? coordinate : this.paneEnd(placement, border);
    if (border.direction === 'horizontal') {
      placement.rect = { ...placement.rect, x: start, width: end - start };
    } else {
      placement.rect = { ...placement.rect, y: start, height: end - start };
    }
  }
}
