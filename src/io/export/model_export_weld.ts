import * as THREE from 'three';

/** Decimals two values must share to be welded (micro units of the file). */
const MODEL_EXPORT_WELD_DECIMALS = 6;

/** Which welded vertex each source vertex became, and the vertices kept. */
export interface ModelExportWeld {
  /** Welded index per source index. */
  remap: Uint32Array;
  /** Source index of each welded vertex, in order. */
  kept: number[];
}

/**
 * Welds vertices that have the same key: the first one of each key is kept.
 *
 * @param count Number of source vertices.
 * @param keyOf Key of a source vertex.
 * @returns Remap and kept vertices.
 */
export function modelExportWeld(count: number, keyOf: (index: number) => string): ModelExportWeld {
  const remap = new Uint32Array(count);
  const kept: number[] = [];
  const byKey = new Map<string, number>();
  for (let index = 0; index < count; index++) {
    const key = keyOf(index);
    let welded = byKey.get(key);
    if (welded === undefined) {
      welded = kept.length;
      byKey.set(key, welded);
      kept.push(index);
    }
    remap[index] = welded;
  }
  return { remap, kept };
}

/**
 * Builds the weld key of some values: rounded to a millionth, without -0.
 *
 * @param values Components.
 * @returns Key.
 */
export function modelExportWeldKey(values: readonly number[]): string {
  return values.map((value) => Number(value.toFixed(MODEL_EXPORT_WELD_DECIMALS)) + 0).join(',');
}

/**
 * Returns the components of one vertex of an attribute.
 *
 * @param attribute Attribute.
 * @param index Vertex index.
 * @returns Components.
 */
export function modelExportWeldComponents(
  attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  index: number,
): number[] {
  const values: number[] = [];
  for (let component = 0; component < attribute.itemSize; component++)
    values.push(attribute.getComponent(index, component));
  return values;
}

/**
 * Builds an indexed copy of a geometry in which triangle corners identical in
 * every attribute share one vertex (as glTF needs: a vertex has one normal and
 * one UV). Corner order and groups stay as they are.
 *
 * @param geometry Geometry, indexed or not.
 * @returns Welded indexed geometry.
 */
export function modelExportWeldGeometry(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const index = geometry.getIndex();
  const names = Object.keys(geometry.attributes);
  const count = index ? index.count : geometry.getAttribute('position').count;
  const vertexOf = (corner: number) => (index ? index.getX(corner) : corner);
  const weld = modelExportWeld(count, (corner) =>
    names
      .map((name) => modelExportWeldKey(modelExportWeldComponents(geometry.getAttribute(name), vertexOf(corner))))
      .join('|'),
  );
  const welded = new THREE.BufferGeometry();
  names.forEach((name) =>
    welded.setAttribute(name, modelExportWeldAttribute(geometry.getAttribute(name), weld.kept.map(vertexOf))),
  );
  welded.setIndex(Array.from(weld.remap));
  geometry.groups.forEach((group) => welded.addGroup(group.start, group.count, group.materialIndex));
  welded.name = geometry.name;
  return welded;
}

/**
 * Copies the chosen vertices of an attribute into a new attribute.
 *
 * @param attribute Source attribute.
 * @param vertices Source vertex per new vertex.
 * @returns New attribute.
 */
function modelExportWeldAttribute(
  attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  vertices: readonly number[],
): THREE.BufferAttribute {
  const size = attribute.itemSize;
  const array = new Float32Array(vertices.length * size);
  vertices.forEach((vertex, at) => array.set(modelExportWeldComponents(attribute, vertex), at * size));
  return new THREE.BufferAttribute(array, size, attribute.normalized);
}
