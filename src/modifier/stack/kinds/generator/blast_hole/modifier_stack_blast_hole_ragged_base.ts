import * as THREE from 'three';

/**
 * Base outline of a Jagged hole: a rounded rectangle walked by arc length, and
 * the inset core every jag is pushed towards. Corner radius 0 is a rectangle;
 * corner radius equal to the smaller half size is a circle or a stadium, so the
 * shape is never stretched to the box.
 */
export interface BlastHoleRaggedBase {
  /** Half width of the outer outline. */
  halfWidth: number;
  /** Half height of the outer outline. */
  halfHeight: number;
  /** Corner radius. */
  radius: number;
  /** Deepest a jag may cut in, the inset of the core. */
  maxDepth: number;
  /** Arc length of the whole outline. */
  perimeter: number;
}

/** One straight or round stretch of the base outline. */
interface BlastHoleRaggedStretch {
  /** Arc length where the stretch starts. */
  start: number;
  /** Arc length of the stretch. */
  length: number;
  /** Corner centre the stretch runs around or along. */
  center: THREE.Vector2;
  /** Outward direction at the start, as an angle. */
  angle: number;
  /** True for a corner arc, false for a straight side. */
  round: boolean;
}

/**
 * Builds the base outline for the given outer half sizes, roundness and depth.
 *
 * @param halfWidth Outer half width.
 * @param halfHeight Outer half height.
 * @param shape 0 rounds the corners fully (circle), 1 keeps them square.
 * @param maxDepth Deepest jag, at most most of the smaller half size.
 * @returns Base outline.
 */
export function blastHoleRaggedBaseCreate(
  halfWidth: number,
  halfHeight: number,
  shape: number,
  maxDepth: number,
): BlastHoleRaggedBase {
  const radius = (1 - THREE.MathUtils.clamp(shape, 0, 1)) * Math.min(halfWidth, halfHeight);
  const sides = 4 * (halfWidth - radius) + 4 * (halfHeight - radius);
  return { halfWidth, halfHeight, radius, maxDepth, perimeter: sides + Math.PI * 2 * radius };
}

/**
 * Lists the eight stretches of the outline, counter-clockwise from the bottom
 * of the right side.
 *
 * @param base Base outline.
 * @returns Stretches in order.
 */
function blastHoleRaggedStretches(base: BlastHoleRaggedBase): BlastHoleRaggedStretch[] {
  const innerX = base.halfWidth - base.radius;
  const innerY = base.halfHeight - base.radius;
  const corners = [
    new THREE.Vector2(innerX, innerY),
    new THREE.Vector2(-innerX, innerY),
    new THREE.Vector2(-innerX, -innerY),
    new THREE.Vector2(innerX, -innerY),
  ];
  const sideLengths = [2 * innerY, 2 * innerX, 2 * innerY, 2 * innerX];
  const stretches: BlastHoleRaggedStretch[] = [];
  let start = 0;
  corners.forEach((corner, side) => {
    const angle = (side * Math.PI) / 2;
    stretches.push({ start, length: sideLengths[side]!, center: corner, angle, round: false });
    start += sideLengths[side]!;
    stretches.push({ start, length: (Math.PI / 2) * base.radius, center: corner, angle, round: true });
    start += (Math.PI / 2) * base.radius;
  });
  return stretches;
}

/**
 * Returns the outer outline point and its outward direction at an arc length.
 *
 * @param base Base outline.
 * @param distance Arc length, wrapped into one lap.
 * @returns Point and unit outward direction.
 */
export function blastHoleRaggedBaseAt(
  base: BlastHoleRaggedBase,
  distance: number,
): { point: THREE.Vector2; outward: THREE.Vector2 } {
  const lap = THREE.MathUtils.euclideanModulo(distance, base.perimeter);
  const stretches = blastHoleRaggedStretches(base);
  const stretch = stretches.find((candidate) => lap < candidate.start + candidate.length) ?? stretches.at(-1)!;
  const along = THREE.MathUtils.clamp(lap - stretch.start, 0, stretch.length);
  const turn = stretch.round && base.radius > 0 ? along / base.radius : 0;
  const outward = new THREE.Vector2(Math.cos(stretch.angle + turn), Math.sin(stretch.angle + turn));
  const anchor = blastHoleRaggedSideAnchor(stretch, along);
  return { point: anchor.addScaledVector(outward, base.radius), outward };
}

/**
 * Returns the point on the corner rectangle a stretch walks along: its start
 * corner moved along the side for a straight stretch, the corner for an arc.
 *
 * @param stretch Stretch.
 * @param along Arc length into the stretch.
 * @returns Anchor point.
 */
function blastHoleRaggedSideAnchor(stretch: BlastHoleRaggedStretch, along: number): THREE.Vector2 {
  if (stretch.round) return stretch.center.clone();
  const travel = new THREE.Vector2(-Math.sin(stretch.angle), Math.cos(stretch.angle));
  const sideStart = stretch.center.clone().addScaledVector(travel, -stretch.length);
  return sideStart.addScaledVector(travel, along);
}

/**
 * Returns the outline point cut in by a depth: the outer point moved towards
 * its matching point on the core, the outline inset by the deepest jag and
 * clamped to the inset box. Straight sides move straight in by the depth;
 * square corners fan towards one core corner, so cut-in points never cross.
 *
 * @param base Base outline.
 * @param distance Arc length.
 * @param depth Cut-in depth, 0 to the deepest jag.
 * @returns Outline point.
 */
export function blastHoleRaggedPoint(base: BlastHoleRaggedBase, distance: number, depth: number): THREE.Vector2 {
  const { point, outward } = blastHoleRaggedBaseAt(base, distance);
  const core = point.clone().addScaledVector(outward, -base.maxDepth);
  core.x = THREE.MathUtils.clamp(core.x, -(base.halfWidth - base.maxDepth), base.halfWidth - base.maxDepth);
  core.y = THREE.MathUtils.clamp(core.y, -(base.halfHeight - base.maxDepth), base.halfHeight - base.maxDepth);
  const share = base.maxDepth > 0 ? THREE.MathUtils.clamp(depth / base.maxDepth, 0, 1) : 0;
  return point.lerp(core, share);
}

/**
 * Returns the arc lengths where the base outline turns: the ends of every
 * stretch, plus points along each corner arc no more than the given step apart,
 * so a sampled outline keeps square corners square and round ones round.
 *
 * @param base Base outline.
 * @param step Longest arc between samples on a corner.
 * @returns Arc lengths within one lap.
 */
export function blastHoleRaggedBaseSamples(base: BlastHoleRaggedBase, step: number): number[] {
  const samples: number[] = [];
  for (const stretch of blastHoleRaggedStretches(base)) {
    samples.push(stretch.start);
    if (!stretch.round) continue;
    const parts = Math.max(1, Math.ceil(stretch.length / Math.max(step, 1e-6)));
    for (let part = 1; part < parts; part++) samples.push(stretch.start + (stretch.length * part) / parts);
  }
  return samples.filter((sample) => sample < base.perimeter);
}
