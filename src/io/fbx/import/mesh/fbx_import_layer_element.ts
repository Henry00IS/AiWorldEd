import type { FbxImportNode } from '@/io/fbx/import/parse/fbx_import_node.js';

/** Where one polygon corner looks up its value in a layer element. */
export interface FbxImportCorner {
  /** Running corner number in the polygon vertex index. */
  cornerIndex: number;
  /** Control point (vertex) index. */
  controlPoint: number;
  /** Polygon number. */
  polygonIndex: number;
}

/**
 * One per-corner attribute layer of an FBX geometry ("LayerElementUV",
 * "LayerElementMaterial", ...): resolves its mapping ("ByPolygonVertex",
 * "ByControlPoint", "ByPolygon", "AllSame") and reference ("Direct",
 * "IndexToDirect") modes to a data element index.
 */
export class FbxImportLayerElement {
  private readonly mapping: string;
  private readonly indexed: boolean;
  private readonly indices: Float64Array;
  /** Flat element values. */
  readonly data: Float64Array;

  /**
   * Reads a layer element.
   *
   * @param node Layer element record.
   * @param dataName Record holding the values ("UV", "Materials", ...).
   * @param indexName Record holding the indices ("UVIndex", ...), or empty.
   */
  constructor(node: FbxImportNode, dataName: string, indexName: string) {
    this.mapping = node.childString('MappingInformationType');
    const reference = node.childString('ReferenceInformationType');
    this.indices = indexName === '' ? new Float64Array(0) : node.childArray(indexName);
    this.indexed = reference !== 'Direct' && this.indices.length > 0;
    this.data = node.childArray(dataName);
  }

  /**
   * Returns the lowest-numbered layer element of a type on a geometry.
   *
   * @param geometry Geometry record.
   * @param type Layer element record name.
   * @returns Layer element record, or null.
   */
  static lowest(geometry: FbxImportNode, type: string): FbxImportNode | null {
    const layers = geometry.childrenNamed(type);
    const layerNumber = (layer: FbxImportNode) => Number(layer.properties[0] ?? 0);
    return layers.reduce<FbxImportNode | null>(
      (best, layer) => (best === null || layerNumber(layer) < layerNumber(best) ? layer : best),
      null,
    );
  }

  /**
   * Returns the data element index of a polygon corner.
   *
   * @param corner Polygon corner.
   * @returns Element index (not multiplied by the element size).
   */
  elementIndex(corner: FbxImportCorner): number {
    const mapped = this.mappedIndex(corner);
    return this.indexed ? (this.indices[mapped] ?? -1) : mapped;
  }

  /**
   * Applies the mapping mode.
   *
   * @param corner Polygon corner.
   * @returns Index into the indices (or data when direct).
   */
  private mappedIndex(corner: FbxImportCorner): number {
    switch (this.mapping) {
      case 'ByPolygonVertex':
        return corner.cornerIndex;
      case 'ByVertice':
      case 'ByVertex':
      case 'ByControlPoint':
        return corner.controlPoint;
      case 'ByPolygon':
        return corner.polygonIndex;
      default:
        return 0;
    }
  }
}
