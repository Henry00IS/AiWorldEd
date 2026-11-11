import type * as THREE from 'three';
import { FbxExporter } from '@/io/fbx/fbx_exporter.js';
import type { FbxExportEncoding } from '@/io/fbx/fbx_export_types.js';
import { GlbExporter } from '@/io/glb/glb_exporter.js';
import { ObjExporter } from '@/io/obj/obj_exporter.js';
import type { ExportTarget } from './export_targets.js';
import type { ModelExportFormat } from './model_export_options.js';
import type { ModelExportTextures } from './model_export_textures.js';

/** What to export. */
export interface ModelExportRequest {
  format: ModelExportFormat;
  /** Target program: its axes and units (glTF ignores them). */
  target: ExportTarget;
  /** Checked file name without extension. */
  baseFileName: string;
  fbxEncoding: FbxExportEncoding;
  textures: ModelExportTextures;
  /** Whether OBJ exports write their .mtl and maps. */
  objMaterials: boolean;
}

/** One file of an export, by path relative to the model's folder. */
export interface ModelExportFile {
  path: string;
  blob: Blob;
}

/** The files of an export, the model first. */
export interface ModelExportFiles {
  files: ModelExportFile[];
  /** Number of texture image files among them. */
  textureCount: number;
}

/**
 * Builds the files of a model export.
 *
 * @param world Live editor world root.
 * @param request What to export.
 * @returns Files.
 */
export async function modelExportBuild(world: THREE.Group, request: ModelExportRequest): Promise<ModelExportFiles> {
  const base = request.baseFileName;
  const asFiles = (list: readonly { fileName: string; blob: Blob }[]) =>
    list.map((file) => ({ path: file.fileName, blob: file.blob }));
  switch (request.format) {
    case 'fbx': {
      const pkg = await new FbxExporter().exportPackage(
        world,
        request.target.space,
        base,
        request.fbxEncoding,
        request.textures,
      );
      const model = { path: pkg.fbxFileName, blob: new Blob([pkg.fbxBytes], { type: 'application/octet-stream' }) };
      return { files: [model, ...asFiles(pkg.textures)], textureCount: pkg.textures.length };
    }
    case 'obj': {
      const pkg = await new ObjExporter().exportPackage(
        world,
        request.target.objSpace,
        base,
        request.textures,
        request.objMaterials,
      );
      const text = (value: string) => new Blob([value], { type: 'text/plain' });
      const mtl = pkg.mtl === null ? [] : [{ path: pkg.mtl.fileName, blob: text(pkg.mtl.text) }];
      return {
        files: [{ path: pkg.objFileName, blob: text(pkg.objText) }, ...mtl, ...asFiles(pkg.textures)],
        textureCount: pkg.textures.length,
      };
    }
    case 'gltf': {
      const pkg = await new GlbExporter().exportGltf(world, base, request.textures);
      const model = { path: pkg.fileName, blob: new Blob([pkg.text], { type: 'model/gltf+json' }) };
      const images = pkg.files.filter((file) => !file.fileName.endsWith('.bin')).length;
      return { files: [model, ...asFiles(pkg.files)], textureCount: images };
    }
    case 'glb': {
      const bytes = await new GlbExporter().export(world);
      return {
        files: [{ path: `${base}.glb`, blob: new Blob([bytes], { type: 'model/gltf-binary' }) }],
        textureCount: 0,
      };
    }
  }
}
