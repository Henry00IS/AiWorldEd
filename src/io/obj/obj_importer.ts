import * as THREE from 'three';
import { ObjParser } from './obj_parser.js';
import { ObjMeshBuilder } from './obj_mesh_builder.js';
import { contentMeshImportFileStem } from '@/io/geometry/content_mesh_import.js';
import { buildModelFileTransform } from '@/io/coordinates/coordinate_space_transform.js';
import type { ExportSpace } from '@/io/coordinates/export_space.js';
import { objMetaRead, objMetaTransform, type ObjMeta } from './obj_meta.js';

/** Result of importing a Wavefront OBJ document. */
export interface ObjImportResult {
  /** Content meshes built from named objects. */
  meshes: THREE.Mesh[];
  /** Number of mesh objects successfully built. */
  importedObjectCount: number;
  /** Number of face polygons consumed across all objects. */
  importedFaceCount: number;
  /**
   * Source file name (may include path). Used when multi-mesh imports are
   * wrapped in a group named after the file stem.
   */
  sourceFileName: string;
  /** Whether the file's objmeta comment set the axes and unit. */
  axesFromFile: boolean;
}

/**
 * Imports Wavefront OBJ geometry as regular content meshes through the mesh
 * document pipeline.
 */
export class ObjImporter {
  private readonly parser = new ObjParser();
  private readonly meshBuilder = new ObjMeshBuilder();

  /**
   * Parses OBJ text and builds content meshes. The file's objmeta comment says
   * which axes and unit it is written in; without a valid one, the program that
   * wrote the file does.
   *
   * @param source OBJ file contents.
   * @param sourceFileName Optional source path/name for multi-mesh grouping.
   * @param sourceSpace Axes and units of the program that wrote the file, or
   *   null for the editor's own (meters, +Y up); unused with a valid objmeta.
   * @param meta The file's objmeta, when the caller has already read it.
   * @returns Import result with meshes and counts.
   */
  importFromText(
    source: string,
    sourceFileName: string = '',
    sourceSpace: ExportSpace | null = null,
    meta: ObjMeta | null = objMetaRead(source),
  ): ObjImportResult {
    const parsed = this.parser.parse(source);
    const toEditor = (meta === null ? buildModelFileTransform(sourceSpace) : objMetaTransform(meta)).invert();
    if (toEditor.determinant() < 0) {
      for (const object of parsed.objects) {
        for (const face of object.faces) face.corners.reverse();
      }
    }
    const position = new THREE.Vector3();
    for (const point of parsed.positions) {
      position.set(point.x, point.y, point.z).applyMatrix4(toEditor);
      point.x = position.x;
      point.y = position.y;
      point.z = position.z;
    }
    const meshes = this.meshBuilder.buildMeshes(parsed);
    let faceCount = 0;
    for (const object of parsed.objects) {
      faceCount += object.faces.length;
    }
    return {
      meshes,
      importedObjectCount: meshes.length,
      importedFaceCount: faceCount,
      sourceFileName,
      axesFromFile: meta !== null,
    };
  }
}

/**
 * Builds the base group name for a multi-mesh OBJ import from a file path.
 *
 * @param filename Source file name, possibly with path and extension.
 * @returns File stem, or {@code Imported OBJ} when empty.
 */
export function buildObjImportGroupBaseName(filename: string): string {
  return contentMeshImportFileStem(filename, 'Imported OBJ');
}
