/** Geometric relationship between the processed subject brush and another brush. */
export enum SolidAlgorithmIntersectionType {
  /** The two brushes do not intersect. */
  NoIntersection = 0,
  /** The two brushes intersect without either fully containing the other. */
  Intersection = 1,
  /** Processed subject is entirely inside the other brush. */
  AInsideB = 2,
  /** Other brush is entirely inside the processed subject. */
  BInsideA = 3,
  /** Sentinel for an unset or unusable relationship. */
  InvalidValue = 4,
}
