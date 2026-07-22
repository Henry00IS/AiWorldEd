/**
 * The axis restriction for alignment operations.
 * Determines which world axes will be affected by alignment.
 */
export enum AlignmentAxis {
  /** Restrict alignment to the X axis only. */
  X = 'X',
  /** Restrict alignment to the Y axis only. */
  Y = 'Y',
  /** Restrict alignment to the Z axis only. */
  Z = 'Z',
  /** Apply alignment to all axes (X, Y, Z). */
  ALL = 'ALL'
}
