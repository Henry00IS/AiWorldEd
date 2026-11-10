/** One property value of an FBX record. */
export type FbxImportValue = number | bigint | string | Float64Array | Uint8Array;

/**
 * One record of an FBX document tree (binary and ASCII files share this shape):
 * a name, its property values and its nested records.
 */
export class FbxImportNode {
  /**
   * Creates a record.
   *
   * @param name Record name ("Model", "Vertices", "P", ...).
   * @param properties Property values in file order.
   * @param children Nested records in file order.
   */
  constructor(
    readonly name: string,
    readonly properties: FbxImportValue[],
    readonly children: FbxImportNode[],
  ) {}

  /**
   * Returns the first nested record with a name.
   *
   * @param name Record name.
   * @returns Record, or null.
   */
  child(name: string): FbxImportNode | null {
    return this.children.find((child) => child.name === name) ?? null;
  }

  /**
   * Returns every nested record with a name.
   *
   * @param name Record name.
   * @returns Records in file order.
   */
  childrenNamed(name: string): FbxImportNode[] {
    return this.children.filter((child) => child.name === name);
  }

  /**
   * Returns the first property of a nested record as a number.
   *
   * @param name Record name.
   * @returns Number, or null when missing or not numeric.
   */
  childNumber(name: string): number | null {
    const value = this.child(name)?.properties[0];
    return fbxImportValueNumber(value);
  }

  /**
   * Returns the first property of a nested record as a string.
   *
   * @param name Record name.
   * @returns String, or an empty string when missing.
   */
  childString(name: string): string {
    const value = this.child(name)?.properties[0];
    return typeof value === 'string' ? value : '';
  }

  /**
   * Returns the first property of a nested record as a numeric array.
   *
   * @param name Record name.
   * @returns Values, or an empty array when missing.
   */
  childArray(name: string): Float64Array {
    const value = this.child(name)?.properties[0];
    return value instanceof Float64Array ? value : new Float64Array(0);
  }
}

/**
 * Reads a scalar value as a number.
 *
 * @param value Property value.
 * @returns Number, or null when the value is not a scalar number.
 */
export function fbxImportValueNumber(value: FbxImportValue | undefined): number | null {
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  return null;
}

/**
 * Turns an object id into a map key that is exact for 64-bit ids.
 *
 * @param value Id property value.
 * @returns Key, or null when the value is not an integer id.
 */
export function fbxImportIdKey(value: FbxImportValue | undefined): string | null {
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'number' && Number.isInteger(value)) return String(value);
  return null;
}

/**
 * Returns the object name of an "Class::Name" (ASCII) or "Name\0\1Class"
 * (binary) label.
 *
 * @param value Label property value.
 * @returns Name without the class part.
 */
export function fbxImportObjectName(value: FbxImportValue | undefined): string {
  if (typeof value !== 'string') return '';
  const binarySeparator = value.indexOf('\u0000\u0001');
  if (binarySeparator >= 0) return value.slice(0, binarySeparator);
  const asciiSeparator = value.indexOf('::');
  return asciiSeparator >= 0 ? value.slice(asciiSeparator + 2) : value;
}
