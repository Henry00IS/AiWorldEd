/** Geometry element a snap query can land on. */
export type SnapHitKind = 'vertex' | 'edge' | 'face';

/**
 * Returns whether a value is a snap hit kind.
 *
 * @param value Unknown value.
 * @returns True for vertex, edge, or face.
 */
export function snapHitKindIsValid(value: string): value is SnapHitKind {
  return value === 'vertex' || value === 'edge' || value === 'face';
}
