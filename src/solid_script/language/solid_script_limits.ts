/**
 * Caps one script run may not pass. They are generous: the largest official
 * example builds 307 brushes, 288 mesh triangles and a list of a few hundred,
 * and takes a few thousand line runs, so each cap keeps at least ten times that
 * headroom. The work cap is the existing runaway-loop guard.
 */
export const SOLID_SCRIPT_LIMITS = {
  /** Brushes and meshes one run may make. */
  brushes: 10_000,
  /** Triangles one mesh may have. */
  meshTriangles: 1_000_000,
  /** Corner points one mesh may have. */
  meshPoints: 1_000_000,
  /** Items one list may hold. */
  listItems: 100_000,
  /** Functions and parts that may run inside each other. */
  callDepth: 256,
  /** Lines, loop rounds and calls one run may take. */
  work: 10_000_000,
  /** Rounds one Repeat, For Each or While may run. */
  repeatRounds: 10_000,
} as const;

/** Most steps of work one run may take, the runaway-loop guard. */
export const SOLID_SCRIPT_WORK_LIMIT = SOLID_SCRIPT_LIMITS.work;

/** Most functions and parts that may run inside each other. */
export const SOLID_SCRIPT_PART_DEPTH_MAX = SOLID_SCRIPT_LIMITS.callDepth;

/** Most corner points a mesh may have after an operation. */
export const SOLID_SCRIPT_MESH_POINTS_MAX = SOLID_SCRIPT_LIMITS.meshPoints;

/** Most rounds one Repeat, For Each or While may run. */
export const SOLID_SCRIPT_REPEAT_ROUNDS_MAX = SOLID_SCRIPT_LIMITS.repeatRounds;

/**
 * Writes a cap as people read it, with grouping commas.
 *
 * @param limit Cap.
 * @returns Grouped number, such as 10,000.
 */
export function solidScriptLimitCount(limit: number): string {
  return limit.toLocaleString('en-US');
}

/**
 * Stops the run when a list is longer than the list cap.
 *
 * @param value Value being stored or built.
 */
export function solidScriptListLimitCheck(value: unknown): void {
  if (!Array.isArray(value) || value.length <= SOLID_SCRIPT_LIMITS.listItems) return;
  throw new Error(
    `this line made a list with more than ${solidScriptLimitCount(SOLID_SCRIPT_LIMITS.listItems)} items. Change the Count, or split the list into smaller pieces.`,
  );
}

/**
 * Counts triangles in a mesh, counting a face of n corners as n-2 triangles.
 *
 * @param faces Face loops.
 * @returns Triangle count.
 */
export function solidScriptMeshTriangleCount(faces: readonly number[][]): number {
  let count = 0;
  for (const face of faces) count += Math.max(0, face.length - 2);
  return count;
}

/**
 * Stops the run when a mesh is larger than the triangle or point cap.
 *
 * @param points Corner count.
 * @param faces Face loops.
 */
export function solidScriptMeshLimitCheck(points: number, faces: readonly number[][]): void {
  const triangles = solidScriptMeshTriangleCount(faces);
  if (triangles > SOLID_SCRIPT_LIMITS.meshTriangles) {
    throw new Error(
      `this line made a mesh with more than ${solidScriptLimitCount(SOLID_SCRIPT_LIMITS.meshTriangles)} triangles. Use fewer Columns, Rows or Levels, or split this into smaller generators.`,
    );
  }
  if (points > SOLID_SCRIPT_LIMITS.meshPoints) {
    throw new Error(
      `this line made a mesh with more than ${solidScriptLimitCount(SOLID_SCRIPT_LIMITS.meshPoints)} points. Use fewer Levels, or split this into smaller generators.`,
    );
  }
}
