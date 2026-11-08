import type { CurveSegment, CurveSegmentSection } from './curve_model.js';

/**
 * Supported polygon face counts, bounded so mixed profiles have at most 120
 * ring samples.
 */
export const CURVE_POLYGON_SIDES = [3, 4, 5, 6, 8, 12] as const;

/** Section choices in toolbar and keyboard cycle order. */
export const CURVE_SECTION_CHOICES: readonly { value: CurveSegmentSection; label: string }[] = [
  { value: 'round', label: 'Round' },
  { value: 'square', label: 'Square' },
  { value: 'polygon', label: 'Polygon' },
];

/** Numeric cross-section properties edited by the toolbar. */
export type CurveSectionParameter = 'cornerSize' | 'cornerSides' | 'polygonSides' | 'twist';

/** Largest number of faces across one corner. */
export const CURVE_CORNER_SIDES_MAX = 8;

/** Corner faces a newly cut corner gets. */
export const CURVE_CORNER_SIDES_DEFAULT = 4;

/**
 * Repairs section-specific values and removes fields belonging to other
 * sections.
 *
 * @param segment Stored segment.
 * @returns Canonical section and twist fields.
 */
export function curveSectionConstrain(segment: CurveSegment | undefined): Partial<CurveSegment> {
  const section = segment?.section;
  const result: Partial<CurveSegment> = {};
  if (section && CURVE_SECTION_CHOICES.some((choice) => choice.value === section)) result.section = section;
  if (section === 'polygon') result.polygonSides = curveSectionPolygonSides(segment?.polygonSides);
  if (result.section) Object.assign(result, curveSectionCorners(segment));
  const twist = curveSectionNumber(segment?.twist, 0, -1440, 1440);
  if (twist !== 0) result.twist = twist;
  return result;
}

/**
 * Repairs the corner settings of a square or polygon segment; sharp corners
 * store nothing.
 *
 * @param segment Stored segment.
 * @returns Corner size and faces, or nothing for sharp corners.
 */
function curveSectionCorners(segment: CurveSegment | undefined): Partial<CurveSegment> {
  const size = curveSectionNumber(segment?.cornerSize, 0, 0, 1);
  if (size === 0) return {};
  const sides = Math.round(
    curveSectionNumber(segment?.cornerSides, CURVE_CORNER_SIDES_DEFAULT, 1, CURVE_CORNER_SIDES_MAX),
  );
  return { cornerSize: size, cornerSides: sides };
}

/**
 * Chooses the nearest supported polygon face count.
 *
 * @param value Requested face count.
 * @returns Supported face count.
 */
export function curveSectionPolygonSides(value = 6): number {
  return CURVE_POLYGON_SIDES.reduce<number>(
    (best, next) => (Math.abs(next - value) < Math.abs(best - value) ? next : best),
    6,
  );
}

/**
 * Clamps a finite property, using its fallback for invalid input.
 *
 * @param value Stored value.
 * @param fallback Default value.
 * @param min Smallest value.
 * @param max Largest value.
 * @returns Finite bounded value.
 */
function curveSectionNumber(value: number | undefined, fallback: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? (value ?? fallback) : fallback));
}
