/**
 * Copies a plain structure all the way down, so nothing in the copy is shared
 * with the original: arrays, plain objects and values that copy themselves,
 * such as vectors and matrices. Text, numbers and Yes/No are kept as they are.
 * It reads the structure itself, so a field added to a shape later is copied
 * too.
 *
 * @param value Structure to copy.
 * @returns A copy that shares nothing with it.
 */
export function solidScriptStructureClone<Value>(value: Value): Value {
  if (typeof value !== 'object' || value === null) return value;
  if (Array.isArray(value)) return value.map((item) => solidScriptStructureClone(item)) as Value;
  const own = value as { clone?: () => unknown };
  if (typeof own.clone === 'function') return own.clone() as Value;
  const copy = Object.create(Object.getPrototypeOf(value)) as Record<string, unknown>;
  for (const [key, inner] of Object.entries(value)) copy[key] = solidScriptStructureClone(inner);
  return copy as Value;
}
