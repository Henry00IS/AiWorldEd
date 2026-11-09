/** Keyboard axis lock for modal transform drags (X / Y / Z). */
export enum TransformModalAxis {
  None = 'none',
  X = 'x',
  Y = 'y',
  Z = 'z',
}

/**
 * Toggles a modal axis lock. Pressing the same axis again clears the lock.
 *
 * @param current Current modal axis lock.
 * @param next Axis key that was pressed.
 * @returns Updated modal axis lock.
 */
export function transformModalAxisToggle(
  current: TransformModalAxis,
  next: TransformModalAxis.X | TransformModalAxis.Y | TransformModalAxis.Z,
): TransformModalAxis {
  if (current === next) {
    return TransformModalAxis.None;
  }
  return next;
}

/**
 * Returns whether the modal axis lock is active on a single world axis.
 *
 * @param axis Modal axis lock.
 * @returns True when X, Y, or Z is locked.
 */
export function transformModalAxisIsLocked(axis: TransformModalAxis): boolean {
  return axis !== TransformModalAxis.None;
}
