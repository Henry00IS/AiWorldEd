import { solidScriptMeshLoopArea, solidScriptMeshLoopCenter, type SolidScriptShapeMesh } from './solid_script_mesh.js';

/** Lists of numbers packed one after another, with where each list starts. */
export interface SolidScriptMeshPackedLists {
  /** Where list i starts in items; list i ends where list i + 1 starts. */
  starts: Int32Array;
  /** Every list's items, one list after another. */
  items: Int32Array;
}

/**
 * A mesh's surface as patches in flat number arrays for fast walks: each
 * patch's center and area vector, the patches next to it, the faces around each
 * point and the patch each face belongs to. The finest graph has one patch per
 * face; coarser ones join nearby patches facing the same way.
 */
export class SolidScriptMeshPatchGraph {
  /**
   * Builds the graph with one patch per face.
   *
   * @param mesh Mesh.
   * @returns Graph.
   */
  static fromFaces(mesh: SolidScriptShapeMesh): SolidScriptMeshPatchGraph {
    const centers = new Float64Array(mesh.faces.length * 3);
    const areas = new Float64Array(mesh.faces.length * 3);
    mesh.faces.forEach((face, faceIndex) =>
      SolidScriptMeshPatchGraph.faceMeasure(mesh, face, faceIndex, centers, areas),
    );
    const pointPatches = SolidScriptMeshPatchGraph.facesOfPoints(mesh);
    const neighbours = SolidScriptMeshPatchGraph.facesAcrossEdges(mesh, pointPatches);
    const facePatch = Int32Array.from(mesh.faces, (_face, faceIndex) => faceIndex);
    return new SolidScriptMeshPatchGraph(centers, areas, neighbours, pointPatches, facePatch);
  }

  /**
   * Writes a face's center and area vector.
   *
   * @param mesh Mesh.
   * @param face Face corners.
   * @param faceIndex Face number.
   * @param centers Face centers, three numbers per face.
   * @param areas Face area vectors, three numbers per face.
   */
  private static faceMeasure(
    mesh: SolidScriptShapeMesh,
    face: readonly number[],
    faceIndex: number,
    centers: Float64Array,
    areas: Float64Array,
  ): void {
    const center = solidScriptMeshLoopCenter(mesh.points, face);
    const area = solidScriptMeshLoopArea(mesh.points, face);
    const at = faceIndex * 3;
    centers[at] = center.x;
    centers[at + 1] = center.y;
    centers[at + 2] = center.z;
    areas[at] = area.x;
    areas[at + 1] = area.y;
    areas[at + 2] = area.z;
  }

  /**
   * Stores a graph's arrays.
   *
   * @param centers Patch centers, three numbers per patch.
   * @param areas Patch normals twice the patch's area long, three numbers per
   *   patch.
   * @param neighbours Patches next to each patch.
   * @param pointFaces Faces using each point.
   * @param facePatch Patch of each face.
   */
  constructor(
    readonly centers: Float64Array,
    readonly areas: Float64Array,
    readonly neighbours: SolidScriptMeshPackedLists,
    readonly pointFaces: SolidScriptMeshPackedLists,
    readonly facePatch: Int32Array,
  ) {}

  /** Number of patches. */
  get patchCount(): number {
    return this.neighbours.starts.length - 1;
  }

  /**
   * Builds a coarser graph: patches whose centers share a cube of the given
   * size and that face mostly the same way become one patch.
   *
   * @param cubeSize Edge of the cubes, in metres.
   * @returns Coarser graph.
   */
  coarser(cubeSize: number): SolidScriptMeshPatchGraph {
    const groups = this.groupsInCubes(cubeSize);
    const count = groups.reduce((highest, group) => Math.max(highest, group + 1), 0);
    const centers = new Float64Array(count * 3);
    const areas = new Float64Array(count * 3);
    const weights = new Float64Array(count);
    groups.forEach((group, patch) => this.patchAddTo(patch, group, centers, areas, weights));
    for (let group = 0; group < count; group++)
      for (let axis = 0; axis < 3; axis++)
        centers[group * 3 + axis] = (centers[group * 3 + axis] ?? 0) / (weights[group] || 1);
    const neighbours = SolidScriptMeshPatchGraph.listsPacked(this.groupNeighbours(groups, count));
    const facePatch = this.facePatch.map((patch) => groups[patch] ?? 0);
    return new SolidScriptMeshPatchGraph(centers, areas, neighbours, this.pointFaces, facePatch);
  }

  /**
   * Number of the coarser patch every patch joins.
   *
   * @param cubeSize Edge of the cubes, in metres.
   * @returns Group per patch, counting from 0.
   */
  private groupsInCubes(cubeSize: number): Int32Array {
    const keys = new Map<string, number>();
    const groups = new Int32Array(this.patchCount);
    for (let patch = 0; patch < this.patchCount; patch++) {
      const key = this.cubeKey(patch, cubeSize);
      const group = keys.get(key) ?? keys.size;
      keys.set(key, group);
      groups[patch] = group;
    }
    return groups;
  }

  /**
   * Key of the cube a patch's center falls in, and the main way it faces.
   *
   * @param patch Patch number.
   * @param cubeSize Edge of the cubes, in metres.
   * @returns Key.
   */
  private cubeKey(patch: number, cubeSize: number): string {
    const at = patch * 3;
    const main = SolidScriptMeshPatchGraph.facingKey(
      this.areas[at] ?? 0,
      this.areas[at + 1] ?? 0,
      this.areas[at + 2] ?? 0,
    );
    const cubeX = Math.floor((this.centers[at] ?? 0) / cubeSize);
    const cubeY = Math.floor((this.centers[at + 1] ?? 0) / cubeSize);
    const cubeZ = Math.floor((this.centers[at + 2] ?? 0) / cubeSize);
    return cubeX + ',' + cubeY + ',' + cubeZ + ',' + main;
  }

  /**
   * Number of the axis direction a vector points along most: 0 and 1 for minus
   * and plus X, 2 and 3 for Y, 4 and 5 for Z.
   *
   * @param x X part.
   * @param y Y part.
   * @param z Z part.
   * @returns Direction number.
   */
  private static facingKey(x: number, y: number, z: number): number {
    const [ax, ay, az] = [Math.abs(x), Math.abs(y), Math.abs(z)];
    if (ax >= ay && ax >= az) return x < 0 ? 0 : 1;
    if (ay >= az) return y < 0 ? 2 : 3;
    return z < 0 ? 4 : 5;
  }

  /**
   * Adds a patch's area and area-weighted center to its group.
   *
   * @param patch Patch number.
   * @param group Group number.
   * @param centers Group center sums.
   * @param areas Group area sums.
   * @param weights Group area length sums.
   */
  private patchAddTo(
    patch: number,
    group: number,
    centers: Float64Array,
    areas: Float64Array,
    weights: Float64Array,
  ): void {
    const at = patch * 3;
    const ax = this.areas[at] ?? 0;
    const ay = this.areas[at + 1] ?? 0;
    const az = this.areas[at + 2] ?? 0;
    const weight = Math.sqrt(ax * ax + ay * ay + az * az);
    const to = group * 3;
    areas[to] = (areas[to] ?? 0) + ax;
    areas[to + 1] = (areas[to + 1] ?? 0) + ay;
    areas[to + 2] = (areas[to + 2] ?? 0) + az;
    for (let axis = 0; axis < 3; axis++)
      centers[to + axis] = (centers[to + axis] ?? 0) + (this.centers[at + axis] ?? 0) * weight;
    weights[group] = (weights[group] ?? 0) + weight;
  }

  /**
   * Groups next to each group.
   *
   * @param groups Group per patch.
   * @param count Number of groups.
   * @returns Group numbers per group.
   */
  private groupNeighbours(groups: Int32Array, count: number): number[][] {
    const neighbours = Array.from({ length: count }, (): number[] => []);
    const { starts, items } = this.neighbours;
    for (let patch = 0; patch < this.patchCount; patch++) {
      const group = groups[patch] ?? 0;
      const list = neighbours[group] as number[];
      for (let item = starts[patch] ?? 0; item < (starts[patch + 1] ?? 0); item++) {
        const other = groups[items[item] ?? 0] ?? 0;
        if (other !== group && !list.includes(other)) list.push(other);
      }
    }
    return neighbours;
  }

  /**
   * Packs lists of numbers one after another.
   *
   * @param lists Lists.
   * @returns Packed lists.
   */
  private static listsPacked(lists: readonly number[][]): SolidScriptMeshPackedLists {
    const starts = new Int32Array(lists.length + 1);
    lists.forEach((list, index) => (starts[index + 1] = (starts[index] ?? 0) + list.length));
    const items = new Int32Array(starts[lists.length] ?? 0);
    lists.forEach((list, index) => items.set(list, starts[index] ?? 0));
    return { starts, items };
  }

  /**
   * Faces using each point.
   *
   * @param mesh Mesh.
   * @returns Face numbers per point.
   */
  private static facesOfPoints(mesh: SolidScriptShapeMesh): SolidScriptMeshPackedLists {
    const starts = new Int32Array(mesh.points.length + 1);
    for (const face of mesh.faces) for (const point of face) starts[point + 1] = (starts[point + 1] ?? 0) + 1;
    for (let point = 0; point < mesh.points.length; point++)
      starts[point + 1] = (starts[point + 1] ?? 0) + (starts[point] ?? 0);
    const items = new Int32Array(starts[mesh.points.length] ?? 0);
    const filled = starts.slice(0, mesh.points.length);
    mesh.faces.forEach((face, faceIndex) => {
      for (const point of face) items[(filled[point] = (filled[point] ?? 0) + 1) - 1] = faceIndex;
    });
    return { starts, items };
  }

  /**
   * Faces sharing an edge with each face.
   *
   * @param mesh Mesh.
   * @param pointFaces Faces using each point.
   * @returns Face numbers per face.
   */
  private static facesAcrossEdges(
    mesh: SolidScriptShapeMesh,
    pointFaces: SolidScriptMeshPackedLists,
  ): SolidScriptMeshPackedLists {
    const starts = new Int32Array(mesh.faces.length + 1);
    mesh.faces.forEach((face, faceIndex) => {
      const found = SolidScriptMeshPatchGraph.faceNeighboursWrite(face, faceIndex, pointFaces, null, 0);
      starts[faceIndex + 1] = (starts[faceIndex] ?? 0) + found;
    });
    const items = new Int32Array(starts[mesh.faces.length] ?? 0);
    mesh.faces.forEach((face, faceIndex) =>
      SolidScriptMeshPatchGraph.faceNeighboursWrite(face, faceIndex, pointFaces, items, starts[faceIndex] ?? 0),
    );
    return { starts, items };
  }

  /**
   * Counts, and writes when given somewhere to write, every other face that
   * shares one of a face's edges, once per shared edge.
   *
   * @param face Face corners.
   * @param faceIndex Face number.
   * @param pointFaces Faces using each point.
   * @param items Where to write the faces, or null to only count them.
   * @param at Where in items to start writing.
   * @returns Number of faces found.
   */
  private static faceNeighboursWrite(
    face: readonly number[],
    faceIndex: number,
    pointFaces: SolidScriptMeshPackedLists,
    items: Int32Array | null,
    at: number,
  ): number {
    const { starts, items: faces } = pointFaces;
    let found = 0;
    for (let corner = 0; corner < face.length; corner++) {
      const point = face[corner] ?? 0;
      const next = face[(corner + 1) % face.length] ?? 0;
      for (let item = starts[point] ?? 0; item < (starts[point + 1] ?? 0); item++) {
        const other = faces[item] ?? 0;
        if (other === faceIndex || !SolidScriptMeshPatchGraph.listHas(pointFaces, next, other)) continue;
        if (items) items[at + found] = other;
        found++;
      }
    }
    return found;
  }

  /**
   * Whether one packed list holds a number.
   *
   * @param lists Packed lists.
   * @param list List number.
   * @param value Number to look for.
   * @returns True when the list holds it.
   */
  private static listHas(lists: SolidScriptMeshPackedLists, list: number, value: number): boolean {
    for (let item = lists.starts[list] ?? 0; item < (lists.starts[list + 1] ?? 0); item++)
      if (lists.items[item] === value) return true;
    return false;
  }
}
