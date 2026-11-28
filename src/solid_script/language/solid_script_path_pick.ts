import { solidScriptPathResolutionOf, solidScriptPathTyped } from './solid_script_path_handles.js';
import type { SolidScriptPath, SolidScriptPathSegment } from './solid_script_path_model.js';

/**
 * Makes a path of straight and Bezier stretches: a Catmull Rom or NURBS path
 * becomes Bezier the way Set Path Type makes it, and any other path stays.
 *
 * @param path Path.
 * @returns Path with no whole-path curve.
 */
export function solidScriptPathWithoutSpline(path: SolidScriptPath<number[]>): SolidScriptPath<number[]> {
  if (!path.spline) return path;
  return solidScriptPathTyped(path, 'Bezier', solidScriptPathResolutionOf(path));
}

/**
 * Makes an open path from some of a path's points, in the order given, with
 * what each point carries: its tilt, handle types and, for a Free normal, its
 * normal.
 *
 * @param path Path with no whole-path curve.
 * @param indices Numbers of the points to take.
 * @param segments Stretches between the taken points, one fewer than points.
 * @returns Open path.
 */
export function solidScriptPathPicked(
  path: SolidScriptPath<number[]>,
  indices: readonly number[],
  segments: readonly SolidScriptPathSegment<number[]>[],
): SolidScriptPath<number[]> {
  const take = <Item>(items: readonly Item[]): Item[] => indices.map((index) => items[index] as Item);
  const types = path.handleTypes;
  const { normal } = path;
  return {
    points: take(path.points),
    segments: [...segments],
    closed: false,
    ...(path.resolution === undefined ? {} : { resolution: path.resolution }),
    ...(path.tilts ? { tilts: take(path.tilts) } : {}),
    ...(types ? { handleTypes: { left: take(types.left), right: take(types.right) } } : {}),
    ...(normal?.mode === 'Free' ? { normal: { mode: 'Free' as const, normals: take(normal.normals) } } : {}),
    ...(normal?.mode === 'Up' ? { normal } : {}),
  };
}
