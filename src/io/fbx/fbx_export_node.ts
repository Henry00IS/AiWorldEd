/**
 * Encoding-neutral FBX node tree. The document builder produces it once and the
 * ASCII and binary serializers write the same records, so both encodings carry
 * identical content.
 */

/** One typed FBX property value, keyed by its binary type code. */
export type FbxExportValue =
  | { type: 'C'; value: boolean }
  | { type: 'Y' | 'I' | 'L' | 'F' | 'D'; value: number }
  | { type: 'S'; value: string; objectClass?: string }
  | { type: 'R'; value: Uint8Array }
  | { type: 'f' | 'd' | 'l' | 'i'; value: readonly number[] }
  | { type: 'b'; value: readonly boolean[] };

/** One FBX record: name, typed properties and nested records. */
export interface FbxExportNode {
  /** Record name, at most 255 bytes. */
  name: string;
  /** Property values in file order. */
  properties: FbxExportValue[];
  /** Nested records. */
  children: FbxExportNode[];
}

/**
 * Creates a record.
 *
 * @param name Record name.
 * @param properties Property values.
 * @param children Nested records.
 * @returns Record.
 */
export function fbxExportNode(
  name: string,
  properties: FbxExportValue[] = [],
  children: FbxExportNode[] = [],
): FbxExportNode {
  return { name, properties, children };
}

/**
 * Creates a 32-bit integer value.
 *
 * @param value Integer.
 * @returns Value.
 */
export function fbxExportInt(value: number): FbxExportValue {
  return { type: 'I', value };
}

/**
 * Creates a 64-bit integer value (object ids).
 *
 * @param value Integer.
 * @returns Value.
 */
export function fbxExportLong(value: number): FbxExportValue {
  return { type: 'L', value };
}

/**
 * Creates a 64-bit float value.
 *
 * @param value Number.
 * @returns Value.
 */
export function fbxExportDouble(value: number): FbxExportValue {
  return { type: 'D', value };
}

/**
 * Creates a string value.
 *
 * @param value Text.
 * @returns Value.
 */
export function fbxExportString(value: string): FbxExportValue {
  return { type: 'S', value };
}

/**
 * Creates an object name value: written "Class::name" in ASCII and
 * "name\0\x01Class" in binary.
 *
 * @param name Object name.
 * @param objectClass Object class such as Model or Material.
 * @returns Value.
 */
export function fbxExportObjectName(name: string, objectClass: string): FbxExportValue {
  return { type: 'S', value: name, objectClass };
}

/**
 * Creates a record holding one value, such as "Version: 232".
 *
 * @param name Record name.
 * @param value Value.
 * @returns Record.
 */
export function fbxExportLeaf(name: string, value: FbxExportValue): FbxExportNode {
  return fbxExportNode(name, [value]);
}

/**
 * Creates a Properties70 "P" entry.
 *
 * @param name Property name.
 * @param type Property type such as "double" or "Lcl Translation".
 * @param label Property label such as "Number".
 * @param flags Property flags such as "A".
 * @param values Typed values following the four strings.
 * @returns P record.
 */
export function fbxExportProperty(
  name: string,
  type: string,
  label: string,
  flags: string,
  values: FbxExportValue[] = [],
): FbxExportNode {
  return fbxExportNode('P', [name, type, label, flags].map(fbxExportString).concat(values));
}
