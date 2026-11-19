import * as THREE from 'three';

/** Fewest and most points a Path may write. */
export const SOLID_SCRIPT_PATH_COUNT_MIN = 2;
export const SOLID_SCRIPT_PATH_COUNT_MAX = 10000;

/** Fewest and most segments of a rounded corner. */
export const SOLID_SCRIPT_PATH_CORNER_SIDES_MIN = 1;
export const SOLID_SCRIPT_PATH_CORNER_SIDES_MAX = 64;

/** Shortest stretch or turn that still counts. */
const SOLID_SCRIPT_PATH_SHAPE_EPSILON = 1e-7;

/** Right-handed unit axes around a path Normal. */
type SolidScriptPathFrame = { x: THREE.Vector3; y: THREE.Vector3; z: THREE.Vector3 };

/**
 * Points evenly spaced along a straight line from From to To, including both
 * ends.
 *
 * @param from Start.
 * @param to End.
 * @param count How many points, at least 2.
 * @param label Command, for messages.
 * @returns Points.
 */
export function solidScriptPathLine(
  from: THREE.Vector3,
  to: THREE.Vector3,
  count: number,
  label: string,
): THREE.Vector3[] {
  if (from.distanceTo(to) <= SOLID_SCRIPT_PATH_SHAPE_EPSILON)
    throw new Error(`${label} needs From and To to stand apart, such as 0, 0, 0 and 1, 0, 0`);
  const steps = solidScriptPathCount(count, label);
  return Array.from({ length: steps }, (_, index) => from.clone().lerp(to, index / (steps - 1)));
}

/**
 * Points along a circular arc around Center, in the plane facing Normal.
 *
 * @param center Middle of the arc.
 * @param radius Metres, above 0.
 * @param start Degrees from the plane's X, the same way as RotateVector around
 *   Normal.
 * @param sweep Degrees of arc; a negative value turns the other way.
 * @param normal Axis of the arc.
 * @param count How many points, at least 2.
 * @param label Command, for messages.
 * @returns Points.
 */
export function solidScriptPathArc(
  center: THREE.Vector3,
  radius: number,
  start: number,
  sweep: number,
  normal: THREE.Vector3,
  count: number,
  label: string,
): THREE.Vector3[] {
  if (!(radius > 0)) throw new Error(`${label} needs a Radius greater than 0, not ${radius}`);
  if (Math.abs(sweep) <= SOLID_SCRIPT_PATH_SHAPE_EPSILON)
    throw new Error(`${label} needs a Sweep other than 0, such as 180, or -180 to turn the other way`);
  const frame = solidScriptPathFrame(normal, label);
  const steps = solidScriptPathCount(count, label);
  return Array.from({ length: steps }, (_, index) =>
    solidScriptPathOnFrame(center, radius, start + (sweep * index) / (steps - 1), 0, frame),
  );
}

/**
 * Points along a spiral or helix around Center: the radius moves from Radius to
 * End Radius, and Height climbs along Normal.
 *
 * @param center Middle at the start.
 * @param radius Start radius in metres, 0 or more.
 * @param endRadius End radius in metres, 0 or more.
 * @param height Metres along Normal, 0 for a flat spiral.
 * @param turns How many turns; a negative value turns the other way.
 * @param start Degrees of the first point.
 * @param normal Axis of the spiral.
 * @param count How many points, at least 2.
 * @param label Command, for messages.
 * @returns Points.
 */
export function solidScriptPathSpiral(
  center: THREE.Vector3,
  radius: number,
  endRadius: number,
  height: number,
  turns: number,
  start: number,
  normal: THREE.Vector3,
  count: number,
  label: string,
): THREE.Vector3[] {
  const { frame, steps } = solidScriptPathSpiralReady(radius, endRadius, turns, normal, count, label);
  return Array.from({ length: steps }, (_, index) =>
    solidScriptPathSpiralAt(center, radius, endRadius, height, turns, start, frame, index / (steps - 1)),
  );
}

/**
 * Checks a spiral and returns its frame and point count.
 *
 * @param radius Start radius in metres, 0 or more.
 * @param endRadius End radius in metres, 0 or more.
 * @param turns How many turns; a negative value turns the other way.
 * @param normal Axis of the spiral.
 * @param count How many points, at least 2.
 * @param label Command, for messages.
 * @returns Frame and point count.
 */
function solidScriptPathSpiralReady(
  radius: number,
  endRadius: number,
  turns: number,
  normal: THREE.Vector3,
  count: number,
  label: string,
): { frame: SolidScriptPathFrame; steps: number } {
  if (radius < 0 || endRadius < 0)
    throw new Error(`${label} needs Radius and End Radius of 0 or more, not ${radius} and ${endRadius}`);
  if (Math.abs(turns) <= SOLID_SCRIPT_PATH_SHAPE_EPSILON)
    throw new Error(`${label} needs Turns other than 0, such as 2, or -2 to turn the other way`);
  return { frame: solidScriptPathFrame(normal, label), steps: solidScriptPathCount(count, label) };
}

/**
 * One point of a spiral at a fraction of its length.
 *
 * @param center Middle at the start.
 * @param radius Start radius in metres.
 * @param endRadius End radius in metres.
 * @param height Metres along Normal.
 * @param turns How many turns.
 * @param start Degrees of the first point.
 * @param frame Axes around Normal.
 * @param at Fraction along the spiral, 0 to 1.
 * @returns Point.
 */
function solidScriptPathSpiralAt(
  center: THREE.Vector3,
  radius: number,
  endRadius: number,
  height: number,
  turns: number,
  start: number,
  frame: SolidScriptPathFrame,
  at: number,
): THREE.Vector3 {
  return solidScriptPathOnFrame(
    center,
    radius + (endRadius - radius) * at,
    start + turns * 360 * at,
    height * at,
    frame,
  );
}

/**
 * Rounds the corners of a polyline with a corner radius, or returns the points
 * unchanged when the radius is 0.
 *
 * @param points Path corners, at least 2.
 * @param radius Metres of corner radius, 0 or more.
 * @param sides Segments of each rounded corner, 1 to 64.
 * @param closed True when the last point joins the first.
 * @param label Command, for messages.
 * @returns Points.
 */
export function solidScriptPathRound(
  points: readonly THREE.Vector3[],
  radius: number,
  sides: number,
  closed: boolean,
  label: string,
): THREE.Vector3[] {
  const path = solidScriptPathOpen(points, closed, label);
  if (!(radius > 0)) return path.map((point) => point.clone());
  if (path.length < 3) throw new Error(`${label} needs at least 3 points to round corners, not ${path.length}`);
  const distances = solidScriptPathCornerDistances(path, radius, closed, label);
  return solidScriptPathCornerPoints(path, distances, solidScriptPathCornerSides(sides, label), closed);
}

/**
 * Checks a Path count.
 *
 * @param count Requested count.
 * @param label Command, for messages.
 * @returns Whole count.
 */
export function solidScriptPathCount(count: number, label: string): number {
  const steps = Math.round(count);
  if (!Number.isInteger(steps) || steps < SOLID_SCRIPT_PATH_COUNT_MIN || steps > SOLID_SCRIPT_PATH_COUNT_MAX)
    throw new Error(
      `${label} needs a Count from ${SOLID_SCRIPT_PATH_COUNT_MIN} to ${SOLID_SCRIPT_PATH_COUNT_MAX}, not ${count}`,
    );
  return steps;
}

/**
 * A right-handed frame around an axis: X is the Start-0 direction, and a
 * positive angle turns the same way as RotateVector around Normal.
 *
 * @param normal Axis.
 * @param label Command, for messages.
 * @returns Unit axes.
 */
export function solidScriptPathFrame(normal: THREE.Vector3, label: string): SolidScriptPathFrame {
  if (normal.lengthSq() <= SOLID_SCRIPT_PATH_SHAPE_EPSILON)
    throw new Error(`${label} cannot use 0, 0, 0 as a Normal; write a direction such as 0, 1, 0`);
  const z = normal.clone().normalize();
  const ref = Math.abs(z.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
  const x = ref.clone().addScaledVector(z, -z.dot(ref)).normalize();
  return { x, y: new THREE.Vector3().crossVectors(z, x).normalize(), z };
}

/**
 * A point in a path frame: angle in degrees in the XY plane, height along Z.
 *
 * @param center Origin of the frame.
 * @param radius Metres in the plane.
 * @param angle Degrees from X, right-handed around Z.
 * @param height Metres along Z.
 * @param frame Unit axes.
 * @returns Point.
 */
function solidScriptPathOnFrame(
  center: THREE.Vector3,
  radius: number,
  angle: number,
  height: number,
  frame: SolidScriptPathFrame,
): THREE.Vector3 {
  const radians = THREE.MathUtils.degToRad(angle);
  return center
    .clone()
    .addScaledVector(frame.x, Math.cos(radians) * radius)
    .addScaledVector(frame.y, Math.sin(radians) * radius)
    .addScaledVector(frame.z, height);
}

/**
 * Drops a repeated last point of a closed path and checks there are enough
 * corners.
 *
 * @param points Input points.
 * @param closed True when the last point joins the first.
 * @param label Command, for messages.
 * @returns Open list of unique corners.
 */
function solidScriptPathOpen(points: readonly THREE.Vector3[], closed: boolean, label: string): THREE.Vector3[] {
  if (points.length < 2) throw new Error(`${label} needs at least 2 points, not ${points.length}`);
  const path = points.map((point) => point.clone());
  const first = path[0];
  const last = path[path.length - 1];
  if (first && last && first.distanceTo(last) <= SOLID_SCRIPT_PATH_SHAPE_EPSILON) path.pop();
  if (path.length < 2) throw new Error(`${label} needs at least 2 different points`);
  if (closed && path.length < 3) throw new Error(`${label} needs at least 3 different points when Closed`);
  return path;
}

/**
 * Checks a corner-segment count.
 *
 * @param sides Requested segments.
 * @param label Command, for messages.
 * @returns Whole count.
 */
function solidScriptPathCornerSides(sides: number, label: string): number {
  const steps = Math.round(sides);
  if (
    !Number.isInteger(steps) ||
    steps < SOLID_SCRIPT_PATH_CORNER_SIDES_MIN ||
    steps > SOLID_SCRIPT_PATH_CORNER_SIDES_MAX
  )
    throw new Error(
      `${label} needs Sides from ${SOLID_SCRIPT_PATH_CORNER_SIDES_MIN} to ${SOLID_SCRIPT_PATH_CORNER_SIDES_MAX}, not ${sides}`,
    );
  return steps;
}

/**
 * Tangent lengths from each corner to its fillet, in corner order.
 *
 * @param path Unique corners.
 * @param radius Corner radius.
 * @param closed True when the last point joins the first.
 * @param label Command, for messages.
 * @returns Distance per corner, 0 when the corner is straight.
 */
function solidScriptPathCornerDistances(
  path: readonly THREE.Vector3[],
  radius: number,
  closed: boolean,
  label: string,
): number[] {
  const distances = path.map((_, index) => solidScriptPathCornerDistance(path, index, radius, closed));
  solidScriptPathCornerFit(path, distances, closed, radius, label);
  return distances;
}

/**
 * Tangent length of one corner, or 0 when the path is straight there.
 *
 * @param path Unique corners.
 * @param index Corner index.
 * @param radius Corner radius.
 * @param closed True when the last point joins the first.
 * @returns Distance, or 0.
 */
function solidScriptPathCornerDistance(
  path: readonly THREE.Vector3[],
  index: number,
  radius: number,
  closed: boolean,
): number {
  const rays = solidScriptPathCornerRays(path, index, closed);
  if (!rays) return 0;
  const angle = Math.acos(Math.min(1, Math.max(-1, -rays.in.dot(rays.out))));
  if (angle <= SOLID_SCRIPT_PATH_SHAPE_EPSILON || Math.PI - angle <= SOLID_SCRIPT_PATH_SHAPE_EPSILON) return 0;
  return radius / Math.tan(angle / 2);
}

/**
 * Incoming and outgoing unit directions at a corner, or none at an end or a
 * zero-length stretch.
 *
 * @param path Unique corners.
 * @param index Corner index.
 * @param closed True when the last point joins the first.
 * @returns Unit directions, or null.
 */
function solidScriptPathCornerRays(
  path: readonly THREE.Vector3[],
  index: number,
  closed: boolean,
): { in: THREE.Vector3; out: THREE.Vector3; corner: THREE.Vector3 } | null {
  if (!closed && (index === 0 || index === path.length - 1)) return null;
  const around = solidScriptPathCornerAround(path, index);
  if (!around) return null;
  const { corner, prev, next } = around;
  return {
    in: corner.clone().sub(prev).normalize(),
    out: next.clone().sub(corner).normalize(),
    corner: corner.clone(),
  };
}

/**
 * The corner and its neighbours, or none when a stretch has no length.
 *
 * @param path Unique corners.
 * @param index Corner index.
 * @returns Corner and neighbours, or null.
 */
function solidScriptPathCornerAround(
  path: readonly THREE.Vector3[],
  index: number,
): { corner: THREE.Vector3; prev: THREE.Vector3; next: THREE.Vector3 } | null {
  const corner = path[index];
  const prev = path[(index + path.length - 1) % path.length];
  const next = path[(index + 1) % path.length];
  if (!corner || !prev || !next) return null;
  if (
    prev.distanceTo(corner) <= SOLID_SCRIPT_PATH_SHAPE_EPSILON ||
    corner.distanceTo(next) <= SOLID_SCRIPT_PATH_SHAPE_EPSILON
  )
    return null;
  return { corner, prev, next };
}

/**
 * Stops when a corner radius does not fit on a stretch.
 *
 * @param path Unique corners.
 * @param distances Tangent lengths per corner.
 * @param closed True when the last point joins the first.
 * @param radius Corner radius, for the message.
 * @param label Command, for messages.
 */
function solidScriptPathCornerFit(
  path: readonly THREE.Vector3[],
  distances: readonly number[],
  closed: boolean,
  radius: number,
  label: string,
): void {
  const last = closed ? path.length : path.length - 1;
  for (let index = 0; index < last; index++) {
    const a = path[index];
    const b = path[(index + 1) % path.length];
    const first = distances[index] ?? 0;
    const second = distances[(index + 1) % distances.length] ?? 0;
    if (a && b && first + second > a.distanceTo(b) + SOLID_SCRIPT_PATH_SHAPE_EPSILON)
      throw new Error(
        `${label} cannot use Radius ${radius} on a stretch of ${+a.distanceTo(b).toFixed(4)} m; use a smaller Radius, or longer stretches`,
      );
  }
}

/**
 * Builds the rounded polyline from the tangent lengths at each corner.
 *
 * @param path Unique corners.
 * @param distances Tangent lengths per corner.
 * @param sides Segments of each rounded corner.
 * @param closed True when the last point joins the first.
 * @returns Points.
 */
function solidScriptPathCornerPoints(
  path: readonly THREE.Vector3[],
  distances: readonly number[],
  sides: number,
  closed: boolean,
): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  path.forEach((corner, index) => {
    const rays = distances[index] ? solidScriptPathCornerRays(path, index, closed) : null;
    if (rays && (distances[index] ?? 0) > 0)
      points.push(...solidScriptPathCornerArc(rays, distances[index] ?? 0, sides));
    else if (!closed || index > 0) points.push(corner.clone());
  });
  return points;
}

/**
 * Arc that replaces one sharp corner, including both tangent points.
 *
 * @param rays Incoming and outgoing directions at the corner.
 * @param distance Tangent length from the corner.
 * @param sides Segments of the arc.
 * @returns Arc points, including both ends.
 */
function solidScriptPathCornerArc(
  rays: { in: THREE.Vector3; out: THREE.Vector3; corner: THREE.Vector3 },
  distance: number,
  sides: number,
): THREE.Vector3[] {
  const angle = Math.acos(Math.min(1, Math.max(-1, -rays.in.dot(rays.out))));
  const start = rays.corner.clone().addScaledVector(rays.in, -distance);
  const axis = new THREE.Vector3().crossVectors(rays.in, rays.out);
  if (axis.lengthSq() <= SOLID_SCRIPT_PATH_SHAPE_EPSILON) return [rays.corner.clone()];
  axis.normalize();
  const radius = distance * Math.tan(angle / 2);
  const center = start.clone().addScaledVector(new THREE.Vector3().crossVectors(axis, rays.in).normalize(), radius);
  const from = start.clone().sub(center);
  const sweep = Math.PI - angle;
  return Array.from({ length: sides + 1 }, (_, index) =>
    center.clone().add(from.clone().applyAxisAngle(axis, (sweep * index) / sides)),
  );
}
