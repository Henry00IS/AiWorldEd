/**
 * Reads a required string argument.
 *
 * @param args Argument object.
 * @param key Argument key.
 * @returns String value.
 */
export function mcpArgumentString(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Missing string argument: ${key}`);
  }
  return value;
}

/**
 * Reads an optional string argument.
 *
 * @param args Argument object.
 * @param key Argument key.
 * @returns String, or undefined when missing or empty.
 */
export function mcpArgumentStringOptional(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/**
 * Reads a string array argument; a single string counts as a one-entry array.
 *
 * @param args Argument object.
 * @param key Argument key.
 * @returns String array.
 */
export function mcpArgumentStringArray(args: Record<string, unknown>, key: string): string[] {
  const value = args[key];
  if (typeof value === 'string' && value.length > 0) return [value];
  if (Array.isArray(value)) return value.filter((entry): entry is string => typeof entry === 'string');
  throw new Error(`Missing string array argument: ${key}`);
}

/**
 * Reads an optional string array argument.
 *
 * @param args Argument object.
 * @param key Argument key.
 * @returns String array, empty when missing.
 */
export function mcpArgumentStringArrayOptional(args: Record<string, unknown>, key: string): string[] {
  return args[key] === undefined ? [] : mcpArgumentStringArray(args, key);
}

/**
 * Reads a required finite number argument.
 *
 * @param args Argument object.
 * @param key Argument key.
 * @returns Number value.
 */
export function mcpArgumentNumber(args: Record<string, unknown>, key: string): number {
  const value = args[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Missing number argument: ${key}`);
  }
  return value;
}

/**
 * Reads an optional finite number argument.
 *
 * @param args Argument object.
 * @param key Argument key.
 * @returns Number, or undefined.
 */
export function mcpArgumentNumberOptional(args: Record<string, unknown>, key: string): number | undefined {
  const value = args[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * Reads an optional boolean argument.
 *
 * @param args Argument object.
 * @param key Argument key.
 * @returns Boolean, or undefined.
 */
export function mcpArgumentBooleanOptional(args: Record<string, unknown>, key: string): boolean | undefined {
  const value = args[key];
  return typeof value === 'boolean' ? value : undefined;
}

/**
 * Reads an optional plain object argument.
 *
 * @param args Argument object.
 * @param key Argument key.
 * @returns Object, or undefined.
 */
export function mcpArgumentObjectOptional(
  args: Record<string, unknown>,
  key: string,
): Record<string, unknown> | undefined {
  const value = args[key];
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}
