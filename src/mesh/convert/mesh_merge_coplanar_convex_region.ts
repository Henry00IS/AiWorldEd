import * as THREE from 'three';
import { buildComponentEdgeKey } from '@/edit/component/component_selection_entry.js';

/** Sine of the largest inward turn still treated as a straight outline corner. */
const CONVEX_TURN_TOLERANCE = 1e-4;

/**
 * A growing coplanar face region whose outline stays one convex loop. Faces
 * join only across one contiguous run of outline edges, so the region never
 * gets holes or pinched corners, and only while every outline corner turns the
 * same way, so frames split into clean strips instead of long slivers.
 */
export class MeshMergeCoplanarConvexRegion {
  private readonly next = new Map<number, number>();
  private readonly previous = new Map<number, number>();
  private readonly edges = new Set<string>();
  private readonly vertices = new Set<number>();

  /**
   * Creates an empty region on a plane.
   *
   * @param positions Packed vertex positions.
   * @param normal Unit plane normal the outline winds around.
   */
  constructor(
    private readonly positions: Float32Array,
    private readonly normal: THREE.Vector3,
  ) {}

  /**
   * Tells whether a face may join: it is the first face, or it shares one run
   * of outline edges, its other corners and edges are new to the region, and
   * the grown outline stays convex.
   *
   * @param loop Face corner vertices in winding order.
   * @returns True when the face may join.
   */
  accepts(loop: readonly number[]): boolean {
    if (new Set(loop).size !== loop.length || loop.length < 3) return false;
    if (this.edges.size === 0) return this.isConvexChain([...loop, loop[0] ?? 0, loop[1] ?? 0]);
    const shared = this.sharedOutlineEdges(loop);
    const run = this.sharedRun(shared);
    if (run === null) return false;
    const fresh = loop.every((vertex, index) => this.cornerOnRun(shared, index) || !this.vertices.has(vertex));
    const freshEdges = loop.every((_vertex, index) => shared[index] || !this.edges.has(this.edgeKey(loop, index)));
    return fresh && freshEdges && this.isConvexChain(this.grownChain(loop, run));
  }

  /**
   * Adds an accepted face and rewires the outline around it.
   *
   * @param loop Face corner vertices in winding order.
   */
  add(loop: readonly number[]): void {
    const run = this.edges.size === 0 ? null : this.sharedRun(this.sharedOutlineEdges(loop));
    const chain = run === null ? [...loop, loop[0] ?? 0] : this.faceChain(loop, run);
    if (run !== null) this.innerRunVertices(loop, run).forEach((vertex) => this.leaveOutline(vertex));
    chain.slice(0, -1).forEach((vertex, index) => this.link(vertex, chain[index + 1] ?? vertex));
    loop.forEach((vertex, index) => {
      this.edges.add(this.edgeKey(loop, index));
      this.vertices.add(vertex);
    });
  }

  /**
   * Links two outline corners in winding order.
   *
   * @param from Corner the outline edge leaves.
   * @param to Corner the outline edge reaches.
   */
  private link(from: number, to: number): void {
    this.next.set(from, to);
    this.previous.set(to, from);
  }

  /**
   * Drops a corner that became interior from the outline.
   *
   * @param vertex Corner vertex.
   */
  private leaveOutline(vertex: number): void {
    this.next.delete(vertex);
    this.previous.delete(vertex);
  }

  /**
   * Marks the face edges that run along the outline in the opposite direction.
   *
   * @param loop Face corner vertices.
   * @returns Per face edge, whether it is shared with the outline.
   */
  private sharedOutlineEdges(loop: readonly number[]): boolean[] {
    return loop.map((vertex, index) => this.next.get(loop[(index + 1) % loop.length] ?? 0) === vertex);
  }

  /**
   * Finds the single contiguous run of shared edges.
   *
   * @param shared Per face edge, whether it is shared.
   * @returns First and last shared edge index, or null without exactly one run
   *   that leaves at least one edge unshared.
   */
  private sharedRun(shared: readonly boolean[]): { first: number; last: number } | null {
    const count = shared.length;
    const starts = shared.flatMap((on, index) => (on && !shared[(index + count - 1) % count] ? [index] : []));
    const first = starts[0];
    if (starts.length !== 1 || first === undefined) return null;
    let last = first;
    while (shared[(last + 1) % count]) last = (last + 1) % count;
    return { first, last };
  }

  /**
   * Lists the face corners that replace the shared run in the outline, from the
   * run's last corner back around to its first corner.
   *
   * @param loop Face corner vertices.
   * @param run Shared run.
   * @returns Outline chain through the face's unshared edges.
   */
  private faceChain(loop: readonly number[], run: { first: number; last: number }): number[] {
    const count = loop.length;
    const chain: number[] = [];
    for (let index = (run.last + 1) % count; index !== run.first; index = (index + 1) % count) {
      chain.push(loop[index] ?? 0);
    }
    return [...chain, loop[run.first] ?? 0];
  }

  /**
   * Lists the corners strictly inside the shared run, which leave the outline.
   *
   * @param loop Face corner vertices.
   * @param run Shared run.
   * @returns Vertices that become interior.
   */
  private innerRunVertices(loop: readonly number[], run: { first: number; last: number }): number[] {
    const count = loop.length;
    const inner: number[] = [];
    for (let index = (run.first + 1) % count; index !== (run.last + 1) % count; index = (index + 1) % count) {
      inner.push(loop[index] ?? 0);
    }
    return inner;
  }

  /**
   * Builds the outline stretch a face would change, padded with the outline
   * corner before and after it so every changed corner can be checked.
   *
   * @param loop Face corner vertices.
   * @param run Shared run.
   * @returns Corner chain whose interior corners must turn convexly.
   */
  private grownChain(loop: readonly number[], run: { first: number; last: number }): number[] {
    const chain = this.faceChain(loop, run);
    const start = chain[0] ?? 0;
    const before = this.previous.get(start) ?? start;
    return [before, ...chain, this.next.get(chain[chain.length - 1] ?? 0) ?? start];
  }

  /**
   * Tells whether every interior corner of a chain turns left or goes straight
   * around the plane normal, without folding back.
   *
   * @param chain Corner vertices.
   * @returns True when the chain is convex.
   */
  private isConvexChain(chain: readonly number[]): boolean {
    for (let index = 1; index + 1 < chain.length; index++) {
      const a = this.point(chain[index - 1] ?? 0);
      const b = this.point(chain[index] ?? 0);
      const incoming = b.clone().sub(a);
      const outgoing = this.point(chain[index + 1] ?? 0).sub(b);
      const scale = incoming.length() * outgoing.length();
      const turn = new THREE.Vector3().crossVectors(incoming, outgoing).dot(this.normal);
      if (turn < -CONVEX_TURN_TOLERANCE * scale) return false;
      if (turn <= CONVEX_TURN_TOLERANCE * scale && incoming.dot(outgoing) <= 0) return false;
    }
    return true;
  }

  /**
   * Reads one vertex position.
   *
   * @param vertex Vertex index.
   * @returns Position.
   */
  private point(vertex: number): THREE.Vector3 {
    return new THREE.Vector3().fromArray(this.positions, vertex * 3);
  }

  /**
   * Returns the undirected key of the edge leaving a corner.
   *
   * @param loop Face corner vertices.
   * @param index Corner index.
   * @returns Edge key.
   */
  private edgeKey(loop: readonly number[], index: number): string {
    return buildComponentEdgeKey(loop[index] ?? 0, loop[(index + 1) % loop.length] ?? 0);
  }

  /**
   * Tells whether a corner touches a shared edge (its own or the previous one).
   *
   * @param shared Per face edge, whether it is shared.
   * @param index Corner index.
   * @returns True when the corner lies on the shared run.
   */
  private cornerOnRun(shared: readonly boolean[], index: number): boolean {
    return (shared[index] ?? false) || (shared[(index + shared.length - 1) % shared.length] ?? false);
  }
}
