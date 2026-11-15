/**
 * CSG operation applied when combining a solid brush or group into a solid
 * model. Order matches Sander-style routing tables: additive, subtractive,
 * intersecting. Pass-through is for groups only: the group is no operand of its
 * own and its children join the parent as if they were not grouped.
 */
export enum SolidOperation {
  Additive = 0,
  Subtractive = 1,
  Intersecting = 2,
  PassThrough = 3,
}

/** Tooltip of the pass-through group operation. */
export const SOLID_OPERATION_PASS_THROUGH_TOOLTIP =
  "Pass-Through: acts like a folder. Its brushes are combined as if they weren't grouped.";

/**
 * Returns a short human-readable label for a solid operation.
 *
 * @param operation Operation enum value.
 * @returns Display label for UI and status messages.
 */
export function solidOperationLabel(operation: SolidOperation): string {
  if (operation === SolidOperation.Additive) return 'Additive';
  if (operation === SolidOperation.Subtractive) return 'Subtractive';
  if (operation === SolidOperation.PassThrough) return 'Pass-Through';
  return 'Intersecting';
}

/**
 * Reads a stored brush operation. Brushes are always additive, subtractive or
 * intersecting, so any other value, including the group-only pass-through,
 * reads as additive.
 *
 * @param value Stored operation value.
 * @returns Brush operation.
 */
export function solidOperationBrushRead(value: unknown): SolidOperation {
  if (value === SolidOperation.Subtractive) return SolidOperation.Subtractive;
  if (value === SolidOperation.Intersecting) return SolidOperation.Intersecting;
  return SolidOperation.Additive;
}

/**
 * Flips additive ↔ subtractive for keyboard toggle. Intersecting is left alone.
 *
 * @param operation Current CSG operation.
 * @returns Opposite additive/subtractive, or null when not toggled.
 */
export function solidOperationToggleAdditiveSubtractive(operation: SolidOperation): SolidOperation | null {
  if (operation === SolidOperation.Additive) {
    return SolidOperation.Subtractive;
  }
  if (operation === SolidOperation.Subtractive) {
    return SolidOperation.Additive;
  }
  return null;
}
