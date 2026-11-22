import * as THREE from 'three';

/**
 * Eigenvalues of a symmetric 3 by 3 matrix, largest first, with their unit
 * eigenvectors.
 */
export interface SolidScriptEigen {
  values: number[];
  vectors: THREE.Vector3[];
}

/** Most Jacobi sweeps before the result is taken as it is. */
const SOLID_SCRIPT_EIGEN_SWEEPS = 64;

/**
 * Turns rows p and q, and columns p and q, of a symmetric matrix so the entry
 * at p, q becomes 0, and turns the eigenvector columns the same way.
 *
 * @param matrix Symmetric matrix, changed in place.
 * @param vectors Eigenvector columns so far, changed in place.
 * @param p First index.
 * @param q Second index, above p.
 */
function solidScriptEigenRotate(matrix: number[][], vectors: number[][], p: number, q: number): void {
  const at = (row: number, column: number): number => matrix[row]?.[column] ?? 0;
  const theta = (at(q, q) - at(p, p)) / (2 * at(p, q));
  const tangent = (theta >= 0 ? 1 : -1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
  const cosine = 1 / Math.sqrt(tangent * tangent + 1);
  const sine = tangent * cosine;
  for (const rows of [matrix, vectors])
    for (const row of rows) {
      const [a = 0, b = 0] = [row[p], row[q]];
      [row[p], row[q]] = [cosine * a - sine * b, sine * a + cosine * b];
    }
  for (let column = 0; column < 3; column++) {
    const [a, b] = [at(p, column), at(q, column)];
    (matrix[p] ?? [])[column] = cosine * a - sine * b;
    (matrix[q] ?? [])[column] = sine * a + cosine * b;
  }
}

/**
 * Finds the eigenvalues and eigenvectors of a symmetric 3 by 3 matrix. Each
 * vector is flipped so its largest part is positive, so results do not depend
 * on rounding.
 *
 * @param symmetric Rows of a symmetric matrix.
 * @returns Values, largest first, and their vectors.
 */
export function solidScriptEigenSymmetric(symmetric: readonly (readonly number[])[]): SolidScriptEigen {
  const matrix = [0, 1, 2].map((row) => [0, 1, 2].map((column) => symmetric[row]?.[column] ?? 0));
  const vectors = [0, 1, 2].map((row) => [0, 1, 2].map((column) => (row === column ? 1 : 0)));
  const pairs: [number, number][] = [
    [0, 1],
    [0, 2],
    [1, 2],
  ];
  for (let sweep = 0; sweep < SOLID_SCRIPT_EIGEN_SWEEPS; sweep++) {
    const off = pairs.reduce((sum, [p, q]) => sum + Math.abs(matrix[p]?.[q] ?? 0), 0);
    if (off < 1e-14) break;
    for (const [p, q] of pairs)
      if (Math.abs(matrix[p]?.[q] ?? 0) > 1e-300) solidScriptEigenRotate(matrix, vectors, p, q);
  }
  const order = [0, 1, 2].sort((a, b) => (matrix[b]?.[b] ?? 0) - (matrix[a]?.[a] ?? 0));
  return {
    values: order.map((index) => matrix[index]?.[index] ?? 0),
    vectors: order.map((index) => solidScriptEigenSigned(vectors.map((row) => row[index] ?? 0))),
  };
}

/**
 * Makes a unit vector whose largest part is positive.
 *
 * @param numbers Three numbers.
 * @returns Unit vector.
 */
function solidScriptEigenSigned(numbers: readonly number[]): THREE.Vector3 {
  const vector = new THREE.Vector3(numbers[0], numbers[1], numbers[2]).normalize();
  const largest = [vector.x, vector.y, vector.z].reduce(
    (best, value) => (Math.abs(value) > Math.abs(best) ? value : best),
    0,
  );
  return largest < 0 ? vector.negate() : vector;
}
