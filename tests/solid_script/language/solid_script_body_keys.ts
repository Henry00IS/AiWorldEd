import type * as THREE from 'three';
import type { SolidScriptBody } from '@/solid_script/language/solid_script_body.js';

/**
 * Corner keys of every face, so two bodies compare by shape, not order.
 *
 * @param body Body.
 * @returns Sorted face keys.
 */
export function solidScriptBodyFaceKeys(body: SolidScriptBody): string[] {
  const key = (point: THREE.Vector3) =>
    point
      .toArray()
      .map((value) => Math.round(value * 1e6) / 1e6 + 0)
      .join(',');
  return body.faces
    .map((loop) =>
      loop
        .map((index) => key(body.points[index]!))
        .sort()
        .join('|'),
    )
    .sort();
}
