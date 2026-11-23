import {
  solidScriptPathWalk,
  type SolidScriptPath,
  type SolidScriptPathSegment,
} from '@/solid_script/language/solid_script_path_model.js';
import { solidScriptPathCatmullHandles } from '@/solid_script/language/solid_script_path_splines.js';
import { PATH_ASSET_RESOLUTION, type PathAsset, type PathAssetPoint, type PathAssetSegment } from './path_asset.js';
import { pathAssetArcInner } from './path_asset_arc.js';

/** Points and segments of a path as a script reads them. */
interface PathAssetScriptParts {
  points: number[][];
  segments: SolidScriptPathSegment<number[]>[];
  /** Index of the first script segment of each stretch of the asset. */
  starts: number[];
}

/**
 * Turns a path asset into the Path a script reads. Quadratic and Smooth
 * stretches become the Bezier curves they are exactly, and an Arc adds points
 * on its circle joined by straight stretches, so every reader samples it as
 * drawn.
 *
 * @param asset Path asset.
 * @returns Script path.
 */
export function pathAssetScriptPath(asset: PathAsset): SolidScriptPath<number[]> {
  const parts = pathAssetScriptParts(asset);
  return { points: parts.points, segments: parts.segments, closed: asset.closed };
}

/**
 * Returns the line each stretch of a path is drawn as, from its start to its
 * end, so a stretch can be drawn and picked on its own.
 *
 * @param asset Path asset.
 * @returns Points of each stretch, in stretch order.
 */
export function pathAssetStretchWalks(asset: PathAsset): number[][][] {
  const parts = pathAssetScriptParts(asset);
  return parts.starts.map((start, index) => {
    const end = parts.starts[index + 1] ?? parts.segments.length;
    const points = [...parts.points.slice(start, end), parts.points[end % parts.points.length]!];
    return solidScriptPathWalk({ points, segments: parts.segments.slice(start, end), closed: false });
  });
}

/**
 * Builds the script points and segments of a path asset, and where each of its
 * stretches starts among them.
 *
 * @param asset Path asset.
 * @returns Parts.
 */
function pathAssetScriptParts(asset: PathAsset): PathAssetScriptParts {
  const smooth = solidScriptPathCatmullHandles(asset.points, asset.closed);
  const parts: PathAssetScriptParts = { points: [], segments: [], starts: [] };
  asset.segments.forEach((segment, index) => {
    const start = asset.points[index]!;
    const end = asset.points[(index + 1) % asset.points.length]!;
    parts.starts.push(parts.segments.length);
    parts.points.push([...start]);
    if (segment.kind === 'Arc') return pathAssetScriptArc(parts, start, end, segment);
    const handles: [number[], number[]] | null =
      segment.kind === 'Smooth'
        ? [smooth.right[index]!, smooth.left[(index + 1) % asset.points.length]!]
        : pathAssetScriptHandles(start, end, segment);
    parts.segments.push(
      handles
        ? { kind: 'bezier', out: handles[0], in: handles[1], resolution: PATH_ASSET_RESOLUTION }
        : { kind: 'line' },
    );
  });
  if (!asset.closed) parts.points.push([...asset.points[asset.points.length - 1]!]);
  return parts;
}

/**
 * Returns the Bezier handles of a Quadratic or Bezier stretch, as points.
 *
 * @param start Start point.
 * @param end End point.
 * @param segment Stretch.
 * @returns Out and In handles, or null for a straight stretch.
 */
function pathAssetScriptHandles(
  start: PathAssetPoint,
  end: PathAssetPoint,
  segment: PathAssetSegment,
): [number[], number[]] | null {
  if (segment.kind === 'Bezier') return [pathAssetAdd(start, segment.out, 1), pathAssetAdd(end, segment.in, 1)];
  if (segment.kind !== 'Quadratic') return null;
  const control = pathAssetAdd(
    start.map((value, axis) => (value + end[axis]!) / 2),
    segment.control,
    1,
  );
  return [pathAssetToward(start, control), pathAssetToward(end, control)];
}

/**
 * Adds the inner points of an arc stretch, joined by straight stretches.
 *
 * @param parts Points and segments so far; the start is already added.
 * @param start Start point.
 * @param end End point.
 * @param segment Arc stretch.
 */
function pathAssetScriptArc(
  parts: PathAssetScriptParts,
  start: PathAssetPoint,
  end: PathAssetPoint,
  segment: PathAssetSegment,
): void {
  const inner = pathAssetArcInner(start, end, segment.degrees ?? 90, segment.axis ?? [0, 1, 0], PATH_ASSET_RESOLUTION);
  parts.points.push(...inner);
  parts.segments.push(...Array.from({ length: inner.length + 1 }, () => ({ kind: 'line' as const })));
}

/**
 * Adds an offset to a point.
 *
 * @param point Point.
 * @param offset Offset, or none for no move.
 * @param scale Scale of the offset.
 * @returns Moved point.
 */
function pathAssetAdd(point: readonly number[], offset: PathAssetPoint | undefined, scale: number): number[] {
  return point.map((value, axis) => value + (offset?.[axis] ?? 0) * scale);
}

/**
 * Returns the cubic handle of a quadratic curve end: two thirds of the way from
 * the end toward the control point.
 *
 * @param end Curve end.
 * @param control Quadratic control point.
 * @returns Cubic handle.
 */
function pathAssetToward(end: PathAssetPoint, control: readonly number[]): number[] {
  return end.map((value, axis) => value + ((control[axis] ?? 0) - value) * (2 / 3));
}
