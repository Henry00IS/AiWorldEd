import type * as THREE from 'three';
import { CommandPrimitiveCreate } from '@/tools/creation/commands/command_primitive_create.js';
import type { LayoutGlbImportParts } from './layout_glb_import.js';
import { LayoutFbxTextureResolver } from './layout_fbx_texture_resolver.js';

/**
 * Handles File → Import → Autodesk FBX: picks a file and imports it.
 *
 * @param parts Editor parts.
 */
export async function runLayoutFbxImportPicked(parts: LayoutGlbImportParts): Promise<void> {
  const file = await parts.sceneIo.pickFbx(parts.statusBar);
  if (file === null) return;
  await runLayoutFbxImportBytes(parts, file.bytes, file.filename, null);
}

/**
 * Imports FBX bytes and adds the result to the world in one undo step. Embedded
 * images become embedded textures of the level; image files the FBX names are
 * looked up among the project's textures.
 *
 * @param parts Editor parts.
 * @param bytes File bytes.
 * @param filename File name.
 * @param projectPath Project-relative path of the file, or null.
 * @param place Moves the loaded objects before they are added (default: where
 *   the file places them).
 */
export async function runLayoutFbxImportBytes(
  parts: LayoutGlbImportParts,
  bytes: ArrayBuffer,
  filename: string,
  projectPath: string | null,
  place?: (objects: readonly THREE.Object3D[]) => void,
): Promise<void> {
  const fbxFolder = projectPath === null ? null : projectPath.replace(/\/?[^/]*$/, '');
  const resolver = new LayoutFbxTextureResolver(parts, fbxFolder);
  const result = await parts.sceneIo.importFbxFromBytes(bytes, filename, resolver, parts.statusBar);
  if (result === null) return;
  place?.([result.root]);
  parts.commandStack.push(new CommandPrimitiveCreate(result.root, parts.world));
  parts.refresh();
}
