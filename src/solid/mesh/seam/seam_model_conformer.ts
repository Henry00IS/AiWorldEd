import * as THREE from 'three';
import { SolidCompiledPolygon } from '@/solid/algorithm/compile/solid_compiled_polygon.js';
import { SeamCornerGrid } from './seam_corner_grid.js';
import { SeamEdgeCornerCollector } from './seam_edge_corner_collector.js';
import { SeamConformedOutline, SeamPolygonConformer, seamOutlinesEqual } from './seam_polygon_conformer.js';
import { SeamChangedCornerRegion } from './seam_changed_corner_region.js';
import { SeamBrushBoundsIndex } from './seam_brush_bounds_index.js';
import { seamPolygonFingerprint, seamVerticesEqual } from './seam_polygon_fingerprint.js';

/** What the model conformer remembers about one brush. */
interface SeamBrushEntry {
  /** Polygon list the entry was made from (identity marks it current). */
  source: readonly SolidCompiledPolygon[];
  /** Owner slot the corners are filed under. */
  slot: number;
  /** Per-polygon conform result aligned with source. */
  outlines: Array<SeamConformedOutline | null>;
  /** Bounds of every corner of the brush. */
  bounds: THREE.Box3;
}

/** A brush re-filed this refresh, waiting to be conformed. */
interface SeamRefiledBrush {
  /** New entry. */
  entry: SeamBrushEntry;
  /** Outlines of the previous entry, indexed by previous polygon. */
  previousOutlines: ReadonlyArray<SeamConformedOutline | null>;
  /** Previous polygon index each new polygon matches, or -1. */
  matches: Int32Array;
}

/** Looks up the current output polygons of a brush. */
export type SeamPolygonLookup = (brushId: string) => readonly SolidCompiledPolygon[] | undefined;

/**
 * Keeps every brush's output polygons conforming across the whole model: a
 * corner of any polygon that lies inside another polygon's edge is inserted
 * into that edge. Refreshing after a partial compile only re-files polygons
 * that changed and re-conforms polygons near corners that changed.
 */
export class SeamModelConformer {
  private readonly grid = new SeamCornerGrid();
  private readonly conformer = new SeamPolygonConformer(new SeamEdgeCornerCollector(this.grid));
  private readonly entries = new Map<string, SeamBrushEntry>();
  private readonly changedCorners = new SeamChangedCornerRegion();
  private readonly slotBounds = new SeamBrushBoundsIndex();
  private lastOrder: readonly string[] = [];
  private nextSlot = 0;

  /** Forgets every brush. */
  clear(): void {
    this.grid.clear();
    this.slotBounds.clear();
    this.lastOrder = [];
    this.entries.clear();
    this.nextSlot = 0;
  }

  /**
   * Brings the conformed output up to date after a compile.
   *
   * @param brushOrder Every brush id with output, in evaluation order.
   * @param recompiledIds Brush ids whose polygons were recompiled.
   * @param lookup Current polygons of a brush.
   * @returns Ids of brushes that were not recompiled but whose conformed output
   *   changed and so need new mesh chunks.
   */
  refresh(brushOrder: readonly string[], recompiledIds: readonly string[], lookup: SeamPolygonLookup): string[] {
    this.changedCorners.clear();
    const sameBrushes = seamSameOrder(this.lastOrder, brushOrder);
    if (!sameBrushes) this.dropBrushesNotIn(new Set(brushOrder));
    const candidates = sameBrushes ? recompiledIds.filter((brushId) => this.entries.has(brushId)) : brushOrder;
    const refiled = this.refileChangedBrushes(candidates, recompiledIds, lookup);
    this.lastOrder = brushOrder.slice();
    for (const brush of refiled.values()) this.conformRefiled(brush);
    if (this.changedCorners.isEmpty()) return [];
    return this.reconformNeighbours(refiled);
  }

  /**
   * Returns the polygons a mesh chunk should be built from: the brush's own
   * polygons with conformed outlines and triangle orders where corners were
   * inserted.
   *
   * @param brushId Brush id.
   * @param polygons Brush polygons from the compiler.
   * @returns Polygons for triangulation.
   */
  polygonsForMesh(brushId: string, polygons: readonly SolidCompiledPolygon[]): SolidCompiledPolygon[] {
    const entry = this.entries.get(brushId);
    if (!entry || entry.source !== polygons) return polygons.slice();
    return polygons.map((polygon, index) => {
      const outline = entry.outlines[index];
      if (!outline) return polygon;
      return { ...polygon, vertices: outline.vertices, triangleCorners: outline.triangleCorners };
    });
  }

  /**
   * Unfiles brushes that no longer produce output.
   *
   * @param present Ids still in the model.
   */
  private dropBrushesNotIn(present: ReadonlySet<string>): void {
    for (const [brushId, entry] of this.entries) {
      if (present.has(brushId)) continue;
      for (const polygon of entry.source) this.unfilePolygon(polygon, entry.slot);
      this.slotBounds.remove(entry.slot);
      this.entries.delete(brushId);
    }
  }

  /**
   * Re-files recompiled brushes and brushes whose polygon list changed
   * identity. When the brush list is the same as last time only recompiled
   * brushes are candidates, since only they get new polygon lists.
   *
   * @param brushOrder Candidate brush ids.
   * @param recompiledIds Recompiled brush ids.
   * @param lookup Polygon lookup.
   * @returns Re-filed brushes by id.
   */
  private refileChangedBrushes(
    brushOrder: readonly string[],
    recompiledIds: readonly string[],
    lookup: SeamPolygonLookup,
  ): Map<string, SeamRefiledBrush> {
    const recompiled = new Set(recompiledIds);
    const refiled = new Map<string, SeamRefiledBrush>();
    for (const brushId of brushOrder) {
      const polygons = lookup(brushId) ?? [];
      const entry = this.entries.get(brushId);
      if (entry && entry.source === polygons && !recompiled.has(brushId)) continue;
      refiled.set(brushId, this.refileBrush(brushId, polygons, entry));
    }
    return refiled;
  }

  /**
   * Replaces one brush's polygons: unchanged polygons keep their filed corners,
   * the corners of vanished and new polygons are recorded as changed.
   *
   * @param brushId Brush id.
   * @param polygons New polygons.
   * @param previous Previous entry, if any.
   * @returns Re-filed brush record.
   */
  private refileBrush(
    brushId: string,
    polygons: readonly SolidCompiledPolygon[],
    previous: SeamBrushEntry | undefined,
  ): SeamRefiledBrush {
    const matches = this.matchPreviousPolygons(polygons, previous);
    const slot = previous ? previous.slot : this.nextSlot++;
    if (previous) this.unfileUnmatchedPrevious(previous, matches);
    for (let index = 0; index < polygons.length; index++) {
      if (matches[index]! < 0) this.filePolygon(polygons[index]!, slot);
    }
    const bounds =
      previous && seamAllMatchedInPlace(matches, previous) ? previous.bounds : seamPolygonsBounds(polygons);
    const entry: SeamBrushEntry = { source: polygons, slot, outlines: [], bounds };
    this.slotBounds.set(slot, brushId, bounds);
    this.entries.set(brushId, entry);
    return { entry, previousOutlines: previous?.outlines ?? [], matches };
  }

  /**
   * Pairs each new polygon with an identical previous polygon, each previous
   * one used at most once. Polygons at the same position are compared first;
   * only the rest are matched through fingerprints.
   *
   * @param polygons New polygons.
   * @param previous Previous entry, if any.
   * @returns Previous index per new polygon, -1 when unmatched.
   */
  private matchPreviousPolygons(
    polygons: readonly SolidCompiledPolygon[],
    previous: SeamBrushEntry | undefined,
  ): Int32Array {
    const matches = new Int32Array(polygons.length).fill(-1);
    if (!previous) return matches;
    const used = new Uint8Array(previous.source.length);
    let unmatched = 0;
    for (let index = 0; index < polygons.length; index++) {
      const candidate = previous.source[index];
      if (candidate && seamVerticesEqual(candidate.vertices, polygons[index]!.vertices)) {
        matches[index] = index;
        used[index] = 1;
      } else unmatched++;
    }
    if (unmatched > 0) this.matchByFingerprint(polygons, previous, matches, used);
    return matches;
  }

  /**
   * Matches the remaining new polygons against unused previous polygons with
   * the same vertex fingerprint.
   *
   * @param polygons New polygons.
   * @param previous Previous entry.
   * @param matches Previous index per new polygon, filled in place.
   * @param used Flags of previous polygons already matched.
   */
  private matchByFingerprint(
    polygons: readonly SolidCompiledPolygon[],
    previous: SeamBrushEntry,
    matches: Int32Array,
    used: Uint8Array,
  ): void {
    const unused = seamIndexUnusedByFingerprint(previous.source, used);
    for (let index = 0; index < polygons.length; index++) {
      if (matches[index]! >= 0) continue;
      const candidates = unused.get(seamPolygonFingerprint(polygons[index]!.vertices));
      if (!candidates) continue;
      const position = candidates.findIndex((candidate) =>
        seamVerticesEqual(previous.source[candidate]!.vertices, polygons[index]!.vertices),
      );
      if (position < 0) continue;
      matches[index] = candidates[position]!;
      candidates.splice(position, 1);
    }
  }

  /**
   * Unfiles the previous polygons no new polygon matched.
   *
   * @param previous Previous entry.
   * @param matches Previous index per new polygon.
   */
  private unfileUnmatchedPrevious(previous: SeamBrushEntry, matches: Int32Array): void {
    const kept = new Uint8Array(previous.source.length);
    for (const match of matches) if (match >= 0) kept[match] = 1;
    previous.source.forEach((polygon, index) => {
      if (!kept[index]) this.unfilePolygon(polygon, previous.slot);
    });
  }

  /**
   * Files every corner of a polygon and records it as changed.
   *
   * @param polygon Polygon.
   * @param slot Owner slot.
   */
  private filePolygon(polygon: SolidCompiledPolygon, slot: number): void {
    for (const vertex of polygon.vertices) {
      this.grid.addCorner(vertex.x, vertex.y, vertex.z, slot);
      this.changedCorners.add(vertex.x, vertex.y, vertex.z);
    }
  }

  /**
   * Unfiles every corner of a polygon and records it as changed.
   *
   * @param polygon Polygon.
   * @param slot Owner slot.
   */
  private unfilePolygon(polygon: SolidCompiledPolygon, slot: number): void {
    for (const vertex of polygon.vertices) {
      this.grid.removeCorner(vertex.x, vertex.y, vertex.z, slot);
      this.changedCorners.add(vertex.x, vertex.y, vertex.z);
    }
  }

  /**
   * Conforms a re-filed brush, reusing the outline of every unchanged polygon
   * no changed corner can reach.
   *
   * @param brush Re-filed brush record.
   */
  private conformRefiled(brush: SeamRefiledBrush): void {
    const { entry, previousOutlines, matches } = brush;
    entry.outlines = entry.source.map((polygon, index) => {
      const match = matches[index]!;
      if (match >= 0 && !this.changedCorners.touchesOutline(polygon.vertices)) return previousOutlines[match] ?? null;
      return this.conformer.conformPolygon(polygon.vertices);
    });
  }

  /**
   * Re-conforms the polygons of untouched brushes that changed corners can
   * reach.
   *
   * @param refiled Brushes conformed already this refresh.
   * @returns Untouched brush ids whose conformed output changed.
   */
  private reconformNeighbours(refiled: ReadonlyMap<string, SeamRefiledBrush>): string[] {
    const changed: string[] = [];
    for (const brushId of this.slotBounds.overlapping(this.changedCorners.getBounds())) {
      const entry = this.entries.get(brushId)!;
      if (refiled.has(brushId) || !this.changedCorners.touchesBox(entry.bounds)) continue;
      const outlines = entry.source.map((polygon, index) =>
        this.changedCorners.touchesOutline(polygon.vertices)
          ? this.conformer.conformPolygon(polygon.vertices)
          : (entry.outlines[index] ?? null),
      );
      if (seamOutlinesEqual(entry.outlines, outlines)) continue;
      entry.outlines = outlines;
      changed.push(brushId);
    }
    return changed;
  }
}

/**
 * Bounds of every vertex of a polygon list.
 *
 * @param polygons Polygons.
 * @returns New box, empty for no polygons.
 */
function seamPolygonsBounds(polygons: readonly SolidCompiledPolygon[]): THREE.Box3 {
  const bounds = new THREE.Box3();
  for (const polygon of polygons) {
    for (const vertex of polygon.vertices) bounds.expandByPoint(vertex);
  }
  return bounds;
}

/**
 * Whether every previous polygon was matched by the new polygon at the same
 * position and the counts agree.
 *
 * @param matches Previous index per new polygon.
 * @param previous Previous entry.
 * @returns True when the brush output is unchanged.
 */
function seamAllMatchedInPlace(matches: Int32Array, previous: SeamBrushEntry): boolean {
  if (matches.length !== previous.source.length) return false;
  for (let index = 0; index < matches.length; index++) if (matches[index] !== index) return false;
  return true;
}

/**
 * Groups the unused previous polygon indices by vertex fingerprint.
 *
 * @param polygons Previous polygons.
 * @param used Flags of previous polygons already matched.
 * @returns Fingerprint to previous polygon indices.
 */
function seamIndexUnusedByFingerprint(
  polygons: readonly SolidCompiledPolygon[],
  used: Uint8Array,
): Map<number, number[]> {
  const byFingerprint = new Map<number, number[]>();
  polygons.forEach((polygon, index) => {
    if (used[index]) return;
    const fingerprint = seamPolygonFingerprint(polygon.vertices);
    const list = byFingerprint.get(fingerprint);
    if (list) list.push(index);
    else byFingerprint.set(fingerprint, [index]);
  });
  return byFingerprint;
}

/**
 * Whether two brush orders list the same ids in the same order.
 *
 * @param previous Order of the last refresh.
 * @param next New order.
 * @returns True when identical.
 */
function seamSameOrder(previous: readonly string[], next: readonly string[]): boolean {
  if (previous.length !== next.length) return false;
  for (let index = 0; index < next.length; index++) if (previous[index] !== next[index]) return false;
  return true;
}
