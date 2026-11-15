import * as THREE from 'three';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import { SolidPlane } from '@/solid/brush/solid_plane.js';
import { PhysicsShatterPolytope } from './physics_shatter_polytope.js';
import type { PhysicsShatterBadCell, PhysicsShatterPattern } from './physics_shatter_pattern.js';

/** One cell of a pattern before it becomes pieces. */
export interface PhysicsShatterCell {
  /** Stable index of the site, brick or shard the cell belongs to. */
  cellIndex: number;
  /** Cell geometry, or null when the cut failed. */
  brush: SolidBrush | null;
  /** Input face index of each cell face, or -1 for crack faces. */
  origins: number[];
}

/**
 * Distance measure of a Voronoi pattern: Euclidean, or shrunk along a grain
 * direction so cells stretch along it.
 */
export interface PhysicsShatterMetric {
  /** Unit grain direction. */
  grain: THREE.Vector3;
  /** One over the squared stretch: 1 is Euclidean, smaller stretches cells. */
  weight: number;
}

/** The Euclidean metric. */
export const PHYSICS_SHATTER_METRIC_EUCLIDEAN: PhysicsShatterMetric = {
  grain: new THREE.Vector3(1, 0, 0),
  weight: 1,
};

/**
 * Builds the metric that stretches cells along a grain direction.
 *
 * @param grain Grain direction; normalized here.
 * @param stretch Length of a cell along the grain over its width, at least 1.
 * @returns Metric.
 */
export function physicsShatterMetricStretched(grain: THREE.Vector3, stretch: number): PhysicsShatterMetric {
  const factor = Math.max(1, Number.isFinite(stretch) ? stretch : 1);
  return { grain: grain.clone().normalize(), weight: 1 / (factor * factor) };
}

/**
 * Measures an offset in a metric.
 *
 * @param metric Metric.
 * @param offset Offset vector.
 * @returns Length in the metric.
 */
export function physicsShatterMetricLength(metric: PhysicsShatterMetric, offset: THREE.Vector3): number {
  const along = offset.dot(metric.grain);
  return Math.sqrt(Math.max(0, offset.lengthSq() - (1 - metric.weight) * along * along));
}

/**
 * Cuts a convex brush into the Voronoi cells of its sites. Each cell is the
 * brush clipped by the bisector planes to the nearer sites, so it is convex.
 *
 * @param brush Convex brush.
 * @param sites Voronoi sites inside the brush.
 * @returns One cell per site, in site order.
 */
export function physicsShatterVoronoiCells(brush: SolidBrush, sites: readonly THREE.Vector3[]): PhysicsShatterCell[] {
  return [...new PhysicsShatterVoronoiPattern(brush, sites).cells()];
}

/**
 * Turns a cut polytope into a cell.
 *
 * @param polytope Cut polytope, or null when nothing is left.
 * @param cellIndex Site or brick index.
 * @returns Cell; its brush is null when the shell could not be built.
 */
export function physicsShatterCellOf(polytope: PhysicsShatterPolytope | null, cellIndex: number): PhysicsShatterCell {
  const built = polytope?.toBrush() ?? null;
  return { cellIndex, brush: built?.brush ?? null, origins: built?.origins ?? [] };
}

/** A bad piece of a cell: its geometry and the origin of each face. */
export interface PhysicsShatterBadPiece {
  /** Piece geometry. */
  brush: SolidBrush;
  /** Origin per face: an input face, or -2 − site for a Voronoi crack face. */
  origins: readonly number[];
}

/**
 * Finds the shortest edge of a piece and the face origins at each vertex.
 *
 * @param piece Piece with face origins.
 * @returns Edge ends and the origins meeting at every vertex, or null.
 */
function physicsShatterShortestEdge(
  piece: PhysicsShatterBadPiece,
): { ends: readonly [number, number]; planes: Map<number, Set<number>> } | null {
  const planes = new Map<number, Set<number>>();
  let best: { ends: readonly [number, number]; length: number } | null = null;
  piece.brush.faces.forEach((face, faceIndex) => {
    const loop = piece.brush.getFaceVertexIndices(face);
    const origin = piece.origins[faceIndex] ?? -1;
    loop.forEach((vertex, position) => {
      const next = loop[(position + 1) % loop.length] ?? vertex;
      if (!planes.has(vertex)) planes.set(vertex, new Set());
      planes.get(vertex)?.add(origin);
      const a = piece.brush.vertices[vertex];
      const b = piece.brush.vertices[next];
      const length = a && b ? a.distanceTo(b) : Infinity;
      if (!best || length < best.length) best = { ends: [vertex, next], length };
    });
  });
  const found = best as { ends: readonly [number, number]; length: number } | null;
  return found ? { ends: found.ends, planes } : null;
}

/** Times a site's power weight may be moved to close a short edge. */
const PHYSICS_SHATTER_COLLAPSE_TRIES = 1;

/** Min-heap of site indices by distance, ties by index. */
class PhysicsShatterNearestQueue {
  /**
   * Heapifies the indices.
   *
   * @param heap Site indices; taken over.
   * @param distances Distance per site index.
   */
  constructor(
    private readonly heap: number[],
    private readonly distances: Float64Array,
  ) {
    for (let index = (heap.length >> 1) - 1; index >= 0; index--) this.down(index);
  }

  /**
   * Returns the distance of a site.
   *
   * @param index Site index.
   * @returns Distance.
   */
  distanceOf(index: number): number {
    return this.distances[index] ?? Infinity;
  }

  /**
   * Takes the nearest site.
   *
   * @returns Site index, or -1 when empty.
   */
  pop(): number {
    const { heap } = this;
    const top = heap[0];
    const last = heap.pop();
    if (top === undefined || last === undefined) return -1;
    if (heap.length > 0) {
      heap[0] = last;
      this.down(0);
    }
    return top;
  }

  /**
   * Returns whether site a comes before site b.
   *
   * @param a Site index.
   * @param b Site index.
   * @returns True when a is nearer, or as near with a lower index.
   */
  private before(a: number, b: number): boolean {
    const left = this.distanceOf(a);
    const right = this.distanceOf(b);
    return left < right || (left === right && a < b);
  }

  /**
   * Sifts an entry down to its place.
   *
   * @param start Heap position.
   */
  private down(start: number): void {
    const { heap } = this;
    let position = start;
    for (;;) {
      const left = 2 * position + 1;
      const right = left + 1;
      let best = position;
      if (left < heap.length && this.before(heap[left] ?? 0, heap[best] ?? 0)) best = left;
      if (right < heap.length && this.before(heap[right] ?? 0, heap[best] ?? 0)) best = right;
      if (best === position) return;
      const swap = heap[position] ?? 0;
      heap[position] = heap[best] ?? 0;
      heap[best] = swap;
      position = best;
    }
  }
}

/** A built Voronoi cell and the sites whose bisectors cut it. */
interface PhysicsShatterVoronoiEntry {
  cell: PhysicsShatterCell;
  cutBy: number[];
}

/**
 * Voronoi cells of a site set, kept up to date while bad cells are healed: a
 * bad cell's site is removed and only the cells its bisector cut are built
 * again, growing over the freed space. Cell indices stay the site indices.
 */
export class PhysicsShatterVoronoiPattern implements PhysicsShatterPattern {
  private readonly polytope: PhysicsShatterPolytope;
  private readonly sites: THREE.Vector3[];
  private readonly alive: boolean[];
  private readonly collapses: number[];
  private readonly weights: number[];
  private weightTop = 0;
  private readonly entries = new Map<number, PhysicsShatterVoronoiEntry>();

  /**
   * Creates the pattern.
   *
   * @param brush Convex input brush.
   * @param sites Sites, in a stable order.
   * @param metric Distance measure.
   * @param place Keeps a relaxed site where sites may lie, such as on the
   *   mid-plane of 2D cracks.
   */
  constructor(
    brush: SolidBrush,
    sites: readonly THREE.Vector3[],
    private readonly metric: PhysicsShatterMetric = PHYSICS_SHATTER_METRIC_EUCLIDEAN,
    private readonly place: (site: THREE.Vector3) => THREE.Vector3 = (site) => site,
  ) {
    this.polytope = PhysicsShatterPolytope.fromBrush(brush);
    this.sites = sites.map((site) => site.clone());
    this.alive = sites.map(() => true);
    this.collapses = sites.map(() => 0);
    this.weights = sites.map(() => 0);
  }

  /**
   * Moves every site to the centroid of its cell, a few times (Lloyd
   * relaxation). The cells grow more even and far fewer short edges appear.
   *
   * @param rounds Relaxation rounds.
   */
  relax(rounds: number): void {
    for (let round = 0; round < rounds; round++) {
      const moved = this.sites.map((site, index) => {
        const cell = this.alive[index] ? this.clipCell(index).cell : null;
        return cell ? this.place(cell.centroid()) : site;
      });
      moved.forEach((site, index) => this.sites[index]?.copy(site));
      this.entries.clear();
    }
  }

  /**
   * Returns the cached cell of a site, building it when needed.
   *
   * @param index Site index.
   * @returns Cell.
   */
  private cellAt(index: number): PhysicsShatterCell {
    let entry = this.entries.get(index);
    if (!entry) {
      entry = this.build(index);
      this.entries.set(index, entry);
    }
    return entry.cell;
  }

  /**
   * Returns the cell of every live site, building the ones not cached.
   *
   * @returns Cells in site order.
   */
  cells(): readonly PhysicsShatterCell[] {
    const cells: PhysicsShatterCell[] = [];
    this.sites.forEach((_, index) => {
      if (this.alive[index]) cells.push(this.cellAt(index));
    });
    return cells;
  }

  /**
   * Heals bad cells. A cell with only a short edge or small face first tries to
   * close that edge by moving a neighbour's power weight; a cell that is too
   * small or thin, or whose edge cannot be closed, loses its site, so its
   * neighbours grow over it. Within one round a site is only changed when no
   * neighbour of it changed yet, so one bad corner shared by three cells costs
   * one site, not three.
   *
   * @param bad Bad cells, worst first.
   * @returns True when a site was moved or removed.
   */
  repair(bad: readonly PhysicsShatterBadCell[]): boolean {
    const touched = new Set<number>();
    let changed = false;
    for (const { cellIndex: index, small, piece } of bad) {
      if (!this.alive[index] || touched.has(index)) continue;
      let changedSite = -1;
      if (!small) changedSite = piece ? this.collapseShortEdge(index, piece, touched) : -1;
      if (changedSite < 0) {
        if (this.aliveCount() <= 1) continue;
        changedSite = index;
        this.alive[index] = false;
      }
      changed = true;
      const affected = new Set([changedSite, ...this.neighboursOf(changedSite)]);
      // A heavier site reaches past its old neighbours: its new cell names them.
      if (this.alive[changedSite]) for (const site of this.clipCell(changedSite).cutBy) affected.add(site);
      for (const site of affected) {
        touched.add(site);
        this.entries.delete(site);
      }
    }
    return changed;
  }

  /**
   * Collapses the shortest edge of a bad piece exactly. The edge runs between
   * two corners of the cell; one corner has a crack plane of a neighbour site c
   * the other lacks. Raising or lowering c's power weight until c is exactly as
   * near the other corner moves all of c's planes through it, so the two
   * corners become one and the edge is gone. The cells stay an exact power
   * diagram: convex, without gaps or overlaps.
   *
   * @param index Bad cell's site a.
   * @param piece Bad piece (cell or carved fragment) with face origins.
   * @param touched Sites already changed this round, left alone.
   * @returns The site whose weight changed, or -1 when no crack plane can close
   *   the edge (it lies between input faces only).
   */
  private collapseShortEdge(index: number, piece: PhysicsShatterBadPiece, touched: ReadonlySet<number>): number {
    const site = this.sites[index];
    const edge = physicsShatterShortestEdge(piece);
    if (!site || !edge) return -1;
    for (const [from, to] of [edge.ends, [edge.ends[1], edge.ends[0]] as const]) {
      const corner = piece.brush.vertices[from];
      const fromPlanes = edge.planes.get(from) ?? new Set<number>();
      for (const origin of edge.planes.get(to) ?? []) {
        const other = -2 - origin;
        if (origin > -2 || fromPlanes.has(origin) || !corner || other === index || !this.alive[other]) continue;
        if (touched.has(other)) continue;
        if ((this.collapses[other] ?? 0) >= PHYSICS_SHATTER_COLLAPSE_TRIES) continue;
        const otherSite = this.sites[other];
        if (!otherSite) continue;
        const near = this.metricSquared(corner, site) - (this.weights[index] ?? 0);
        this.weights[other] = this.metricSquared(corner, otherSite) - near;
        this.weightTop = Math.max(this.weightTop, ...this.weights.map(Math.abs));
        this.collapses[other] = (this.collapses[other] ?? 0) + 1;
        return other;
      }
    }
    return -1;
  }

  /**
   * Squared metric distance between two points.
   *
   * @param point Point.
   * @param site Site.
   * @returns Squared distance in the metric.
   */
  private metricSquared(point: THREE.Vector3, site: THREE.Vector3): number {
    const length = physicsShatterMetricLength(this.metric, new THREE.Vector3().subVectors(point, site));
    return length * length;
  }

  /**
   * Lists the live sites whose cells share a bisector with a site.
   *
   * @param index Site index.
   * @returns Neighbouring site indices.
   */
  private neighboursOf(index: number): number[] {
    const found = new Set(this.entries.get(index)?.cutBy ?? []);
    for (const [other, entry] of this.entries) if (entry.cutBy.includes(index)) found.add(other);
    found.delete(index);
    return [...found].filter((other) => this.alive[other]);
  }

  /**
   * Counts the live sites.
   *
   * @returns Number of live sites.
   */
  private aliveCount(): number {
    return this.alive.reduce((count, alive) => count + (alive ? 1 : 0), 0);
  }

  /**
   * Builds one cell. Neighbours are visited nearest first, and the walk stops
   * as soon as a bisector lies beyond the cell's current radius, since no
   * farther site can cut it.
   *
   * @param cellIndex Site whose cell is built.
   * @returns Cell and the sites that cut it.
   */
  private build(cellIndex: number): PhysicsShatterVoronoiEntry {
    const { cell, cutBy } = this.clipCell(cellIndex);
    return { cell: physicsShatterCellOf(cell, cellIndex), cutBy };
  }

  /**
   * Clips the input down to one site's cell. Neighbours are visited nearest
   * first, and the walk stops as soon as a bisector lies beyond the cell's
   * current radius, since no farther site can cut it.
   *
   * @param cellIndex Site whose cell is clipped.
   * @returns Cell polytope, or null when nothing is left, and the sites that
   *   cut it.
   */
  private clipCell(cellIndex: number): { cell: PhysicsShatterPolytope | null; cutBy: number[] } {
    const site = this.sites[cellIndex] ?? new THREE.Vector3();
    const cutBy: number[] = [];
    let cell: PhysicsShatterPolytope | null = this.polytope;
    let radius = this.radiusAround(cell, site);
    const own = this.weights[cellIndex] ?? 0;
    const spread = this.weightTop * 2;
    const queue = this.neighbourQueue(cellIndex);
    for (let neighbour = queue.pop(); neighbour >= 0 && cell; neighbour = queue.pop()) {
      const distance = queue.distanceOf(neighbour);
      if ((distance * distance - spread) / (2 * Math.max(distance, 1e-12)) > radius) break;
      const shift = own - (this.weights[neighbour] ?? 0);
      const plane = this.bisector(site, this.sites[neighbour] ?? site, shift);
      const cut: PhysicsShatterPolytope | null = cell.clip(plane, -2 - neighbour);
      if (cut !== cell) {
        cutBy.push(neighbour);
        if (cut) radius = this.radiusAround(cut, site);
      }
      cell = cut;
    }
    return { cell, cutBy };
  }

  /**
   * Returns the largest metric distance from a site to a polytope vertex.
   *
   * @param polytope Polytope.
   * @param site Site.
   * @returns Radius in the metric.
   */
  private radiusAround(polytope: PhysicsShatterPolytope, site: THREE.Vector3): number {
    if (this.metric.weight === 1) return polytope.radiusAround(site);
    let radius = 0;
    const offset = new THREE.Vector3();
    for (const face of polytope.faces)
      for (const index of face.loop) {
        offset.subVectors(polytope.vertices[index] ?? site, site);
        radius = Math.max(radius, physicsShatterMetricLength(this.metric, offset));
      }
    return radius;
  }

  /**
   * Queues the other live sites nearest first in the metric; ties keep site
   * order, so the walk is deterministic. Only the sites actually taken are
   * sorted.
   *
   * @param cellIndex Site to measure from.
   * @returns Queue of neighbour indices.
   */
  private neighbourQueue(cellIndex: number): PhysicsShatterNearestQueue {
    const origin = this.sites[cellIndex] ?? new THREE.Vector3();
    const offset = new THREE.Vector3();
    const distances = new Float64Array(this.sites.length);
    const indices: number[] = [];
    this.sites.forEach((site, index) => {
      if (index === cellIndex || !this.alive[index]) return;
      distances[index] = physicsShatterMetricLength(this.metric, offset.subVectors(site, origin));
      indices.push(index);
    });
    return new PhysicsShatterNearestQueue(indices, distances);
  }

  /**
   * Builds the outward bisector plane between a site and a neighbour in the
   * metric and power weights; the site's side is kept. With the metric M and
   * weights w the bisector is x·M(b − a) = ((a + b)·M(b − a) + w_a − w_b) / 2,
   * still a plane.
   *
   * @param site Cell site a.
   * @param neighbour Neighbouring site b.
   * @param shift Power weight of a minus that of b; 0 for plain Voronoi.
   * @returns Plane halfway between them, facing the neighbour.
   */
  private bisector(site: THREE.Vector3, neighbour: THREE.Vector3, shift: number): SolidPlane {
    const normal = this.metricApply(new THREE.Vector3().subVectors(neighbour, site));
    const level = 0.5 * (normal.dot(new THREE.Vector3().addVectors(neighbour, site)) + shift);
    const length = normal.length();
    return new SolidPlane(normal.multiplyScalar(1 / length), -level / length);
  }

  /**
   * Applies the metric matrix M = I − (1 − w)·g·gᵀ in place.
   *
   * @param vector Vector.
   * @returns The same vector, multiplied by M.
   */
  private metricApply(vector: THREE.Vector3): THREE.Vector3 {
    if (this.metric.weight === 1) return vector;
    return vector.addScaledVector(this.metric.grain, -(1 - this.metric.weight) * vector.dot(this.metric.grain));
  }
}
