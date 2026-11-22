import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SOLID_SCRIPT_FUNCTIONS_PRINCIPAL } from '@/solid_script/language/solid_script_functions_principal.js';
import { solidScriptMatrixRead, solidScriptMatrixRows } from '@/solid_script/language/solid_script_functions_matrix.js';

/**
 * Checks that the returned factors reproduce the linear matrix and that the two
 * bases are orthogonal, including flat and mirrored matrices.
 *
 * @param numbers Nine row-major coefficients.
 */
function reconstruct(numbers: number[]): void {
  const [a = 0, b = 0, c = 0, d = 0, e = 0, f = 0, g = 0, h = 0, i = 0] = numbers;
  const matrix = new THREE.Matrix4().set(a, b, c, 0, d, e, f, 0, g, h, i, 0, 0, 0, 0, 1);
  const rows = solidScriptMatrixRows(matrix);
  const u = solidScriptMatrixRead(SOLID_SCRIPT_FUNCTIONS_PRINCIPAL.matrix_svd([rows, 'U']), 'U');
  const v = solidScriptMatrixRead(SOLID_SCRIPT_FUNCTIONS_PRINCIPAL.matrix_svd([rows, 'V']), 'V');
  const s = SOLID_SCRIPT_FUNCTIONS_PRINCIPAL.matrix_svd([rows]) as number[];
  const got = u
    .clone()
    .multiply(new THREE.Matrix4().makeScale(s[0] ?? 0, s[1] ?? 0, s[2] ?? 0))
    .multiply(v.clone().transpose());
  matrix.elements.forEach((value, index) => expect(got.elements[index]).toBeCloseTo(value, 6));
  for (const basis of [u, v])
    basis
      .clone()
      .transpose()
      .multiply(basis)
      .elements.forEach((value, index) => expect(value).toBeCloseTo(index % 5 === 0 ? 1 : 0, 6));
}

describe('MatrixSvd reconstruction', () => {
  it('reconstructs skewed, singular, zero, mirrored and repeated-value matrices', () => {
    for (const coefficients of [
      [1, 2, 3, 4, 5, 7, 2, -3, 1],
      [1, 2, 3, 2, 4, 6, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0],
      [-2, 0, 0, 0, 3, 0, 0, 0, 1],
      [2, 0, 0, 0, 2, 0, 0, 0, 2],
    ])
      reconstruct(coefficients);
  });
});
