/** Orders names ignoring case, with numbers by value (tex2 before tex10). */
const NAME_ORDER_COLLATOR = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/**
 * Compares two names ignoring case, with numbers by value.
 *
 * @param left First name.
 * @param right Second name.
 * @returns Sort order.
 */
export function nameOrderCompare(left: string, right: string): number {
  return NAME_ORDER_COLLATOR.compare(left, right);
}

/**
 * Compares by name, then by path, then exactly, so lists never depend on the
 * order their items arrived in. Used by the Texture Browser and the Project
 * Browser.
 *
 * @param leftName First item's name.
 * @param leftPath First item's path or id.
 * @param rightName Second item's name.
 * @param rightPath Second item's path or id.
 * @returns Sort order.
 */
export function nameOrderCompareWithPath(
  leftName: string,
  leftPath: string,
  rightName: string,
  rightPath: string,
): number {
  return (
    nameOrderCompare(leftName, rightName) ||
    nameOrderCompare(leftPath, rightPath) ||
    (leftPath < rightPath ? -1 : leftPath > rightPath ? 1 : 0)
  );
}
