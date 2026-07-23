/**
 * CSG operation applied when combining a solid brush into a solid model.
 * Order matches Sander-style routing tables: additive, subtractive, intersecting.
 */
export enum SolidOperation {
  Additive = 0,
  Subtractive = 1,
  Intersecting = 2
}

/**
 * Returns a short human-readable label for a solid operation.
 * @param operation Operation enum value.
 * @returns Display label for UI and status messages.
 */
export function solidOperationLabel(operation: SolidOperation): string {
  if (operation === SolidOperation.Additive) return 'Additive';
  if (operation === SolidOperation.Subtractive) return 'Subtractive';
  return 'Intersecting';
}
