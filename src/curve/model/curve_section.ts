import type { CurveSegment, CurveSegmentSection, CurveSegmentSide } from './curve_model.js';

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
  { value: 'cross', label: 'Cross' },
  { value: 'bar', label: 'Bar' },
  { value: 'stadium', label: 'Stadium' },
];

/** Side mode choice of the toolbar; mirror stores no side. */
export type CurveSideChoice = CurveSegmentSide | 'mirror';

/** Side mode choices in toolbar order. */
export const CURVE_SIDE_CHOICES: readonly { value: CurveSideChoice; label: string }[] = [
  { value: 'mirror', label: 'Mirror' },
  { value: 'negative', label: '−X only' },
  { value: 'positive', label: '+X only' },
  { value: 'custom', label: 'Custom' },
];

/** Sections with a clear left and right that accept a side mode. */
export const CURVE_SIDE_SECTIONS: readonly CurveSegmentSection[] = ['bar', 'square', 'stadium'];

/** Sections whose depth can stay fixed while their width follows the profile. */
export const CURVE_FIXED_DEPTH_SECTIONS: readonly CurveSegmentSection[] = ['square', 'stadium'];

/** Numeric cross-section properties edited by the toolbar. */
export type CurveSectionParameter =
  'cornerSize' | 'cornerSides' | 'polygonSides' | 'armWidth' | 'armWidthEnd' | 'straight' | 'twist' | 'rotation';

/** Thinnest cross arm as a fraction of the section width. */
export const CURVE_CROSS_ARM_MIN = 0.05;

/** Thickest cross arm as a fraction of the section width. */
export const CURVE_CROSS_ARM_MAX = 0.95;

/** Arm thickness a new cross section gets, as a fraction of its width. */
export const CURVE_CROSS_ARM_DEFAULT = 0.3;

/** Shortest flat side of a stadium as a fraction of the section width. */
export const CURVE_STADIUM_STRAIGHT_MIN = 0.05;

/** Longest flat side of a stadium as a fraction of the section width. */
export const CURVE_STADIUM_STRAIGHT_MAX = 0.95;

/** Flat side length a new stadium section gets, as a fraction of its width. */
export const CURVE_STADIUM_STRAIGHT_DEFAULT = 0.5;

/** Largest segment rotation either way, in degrees. */
export const CURVE_ROTATION_MAX = 360;

/** Largest number of faces across one corner. */
export const CURVE_CORNER_SIDES_MAX = 8;

/** Corner faces a newly cut corner gets. */
export const CURVE_CORNER_SIDES_DEFAULT = 4;

/**
 * Repairs section-specific values and removes fields belonging to other
 * sections.
 *
 * @param segment Stored segment.
 * @returns Canonical section, twist and rotation fields.
 */
export function curveSectionConstrain(segment: CurveSegment | undefined): Partial<CurveSegment> {
  const section = segment?.section;
  const result: Partial<CurveSegment> = {};
  if (section && CURVE_SECTION_CHOICES.some((choice) => choice.value === section)) result.section = section;
  if (section === 'polygon') result.polygonSides = curveSectionPolygonSides(segment?.polygonSides);
  if (section === 'cross' || section === 'bar') Object.assign(result, curveSectionArms(segment));
  if (section === 'stadium')
    result.straight = curveSectionNumber(
      segment?.straight,
      CURVE_STADIUM_STRAIGHT_DEFAULT,
      CURVE_STADIUM_STRAIGHT_MIN,
      CURVE_STADIUM_STRAIGHT_MAX,
    );
  if (section === 'square' || section === 'polygon') Object.assign(result, curveSectionCorners(segment));
  if (segment?.blend === true) result.blend = true;
  return Object.assign(result, curveSectionSides(segment), curveSectionTurns(segment));
}

/**
 * Repairs the arm width of a cross, or the start and end thickness of a bar.
 *
 * @param segment Stored cross or bar segment.
 * @returns Thickness fields.
 */
function curveSectionArms(segment: CurveSegment | undefined): Partial<CurveSegment> {
  const armWidth = curveSectionNumber(
    segment?.armWidth,
    CURVE_CROSS_ARM_DEFAULT,
    curveSectionArmMin(segment),
    CURVE_CROSS_ARM_MAX,
  );
  return segment?.section === 'bar' ? { armWidth, ...curveSectionBarEnd(segment, armWidth) } : { armWidth };
}

/**
 * Returns the smallest start thickness of a cross or bar: a bar that thickens
 * toward its end may start from a sharp 0 edge.
 *
 * @param segment Stored segment.
 * @returns Smallest thickness.
 */
function curveSectionArmMin(segment: CurveSegment | undefined): number {
  const end = segment?.armWidthEnd;
  return segment?.section === 'bar' && end !== undefined && end >= CURVE_CROSS_ARM_MIN ? 0 : CURVE_CROSS_ARM_MIN;
}

/**
 * Keeps a bar's end thickness when it differs from its start thickness.
 *
 * @param segment Stored segment.
 * @param start Repaired start thickness.
 * @returns End thickness field, or nothing for an even bar.
 */
function curveSectionBarEnd(segment: CurveSegment | undefined, start: number | undefined): Partial<CurveSegment> {
  if (segment?.armWidthEnd === undefined || !Number.isFinite(segment.armWidthEnd)) return {};
  const end = curveSectionNumber(segment.armWidthEnd, 0, 0, CURVE_CROSS_ARM_MAX);
  return Math.abs(end - (start ?? CURVE_CROSS_ARM_DEFAULT)) > 1e-9 ? { armWidthEnd: end } : {};
}

/**
 * Repairs the twist and rotation of a segment; zero turns store nothing.
 *
 * @param segment Stored segment.
 * @returns Twist and rotation fields.
 */
function curveSectionTurns(segment: CurveSegment | undefined): Partial<CurveSegment> {
  const result: Partial<CurveSegment> = {};
  const twist = curveSectionNumber(segment?.twist, 0, -1440, 1440);
  if (twist !== 0) result.twist = twist;
  const rotation = curveSectionNumber(segment?.rotation, 0, -CURVE_ROTATION_MAX, CURVE_ROTATION_MAX);
  if (rotation !== 0) result.rotation = rotation;
  return result;
}

/**
 * Keeps a valid side mode and fixed depth only on sections that support them;
 * mirrored sides and free depth store nothing.
 *
 * @param segment Stored segment.
 * @returns Side mode and fixed depth fields.
 */
function curveSectionSides(segment: CurveSegment | undefined): Partial<CurveSegment> {
  const section = segment?.section ?? 'round';
  const result: Partial<CurveSegment> = {};
  const side = CURVE_SIDE_CHOICES.find((choice) => choice.value !== 'mirror' && choice.value === segment?.side);
  if (side && CURVE_SIDE_SECTIONS.includes(section)) result.side = side.value as CurveSegmentSide;
  if (segment?.fixedDepth === true && CURVE_FIXED_DEPTH_SECTIONS.includes(section)) result.fixedDepth = true;
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
