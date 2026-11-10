import { FbxImportNode, fbxImportValueNumber, type FbxImportValue } from './fbx_import_node.js';

/** Index of the first value in a "P:" record (after name, type, label, flags). */
const FBX_IMPORT_PROPERTY_VALUE_START = 4;

/** The typed properties ("Properties70" block) of an FBX object, by name. */
export class FbxImportProperties {
  private readonly valuesByName: Map<string, FbxImportValue[]>;

  /**
   * Reads the properties block of an object.
   *
   * @param owner Object record, or null for an empty set.
   */
  constructor(owner: FbxImportNode | null) {
    this.valuesByName = new Map();
    const block = owner?.child('Properties70') ?? null;
    block?.childrenNamed('P').forEach((record) => this.recordAdd(record));
  }

  /**
   * Reads a number property.
   *
   * @param name Property name.
   * @param fallback Value when missing.
   * @returns Value.
   */
  number(name: string, fallback: number): number {
    return fbxImportValueNumber(this.valuesByName.get(name)?.[0]) ?? fallback;
  }

  /**
   * Reads a three-component property.
   *
   * @param name Property name.
   * @param fallback Value when missing.
   * @returns Components.
   */
  vector3(name: string, fallback: readonly [number, number, number]): [number, number, number] {
    const values = this.valuesByName.get(name) ?? [];
    const components = [0, 1, 2].map((index) => fbxImportValueNumber(values[index]));
    const [x, y, z] = components;
    if (x === null || y === null || z === null || x === undefined || y === undefined || z === undefined) {
      return [fallback[0], fallback[1], fallback[2]];
    }
    return [x, y, z];
  }

  /**
   * Reads a string property.
   *
   * @param name Property name.
   * @returns Value, or an empty string when missing.
   */
  string(name: string): string {
    const value = this.valuesByName.get(name)?.[0];
    return typeof value === 'string' ? value : '';
  }

  /**
   * Stores the values of one "P:" record.
   *
   * @param record Property record.
   */
  private recordAdd(record: FbxImportNode): void {
    const name = record.properties[0];
    if (typeof name === 'string') this.valuesByName.set(name, record.properties.slice(FBX_IMPORT_PROPERTY_VALUE_START));
  }
}
