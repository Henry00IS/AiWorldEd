import type * as THREE from 'three';
import type { CommandStack } from '@/commands/command_stack.js';
import { CommandPrimitiveCreate } from '@/tools/creation/commands/command_primitive_create.js';
import type { HandlerSceneIo } from '@/tools/io/handler_scene_io.js';
import type { StatusBar } from '@/ui/status/status_bar.js';
import { LayoutGlbTextureResolver, type LayoutGlbTextureResolverParts } from './layout_glb_texture_resolver.js';

/** Editor parts a GLB import uses. */
export interface LayoutGlbImportParts extends LayoutGlbTextureResolverParts {
  /** Element hosting dialogs. */
  container: HTMLElement;
  world: THREE.Group;
  commandStack: CommandStack;
  statusBar: StatusBar | null;
  sceneIo: HandlerSceneIo;
  /** Refreshes outliner, selection and viewports after the world changed. */
  refresh: () => void;
}

/**
 * Handles File → Import → glTF: picks a file and imports it.
 *
 * @param parts Editor parts.
 */
export async function runLayoutGlbImportPicked(parts: LayoutGlbImportParts): Promise<void> {
  const file = await parts.sceneIo.pickGlb(parts.statusBar);
  if (file === null) return;
  await runLayoutGlbImportBytes(parts, file.bytes, file.filename);
}

/**
 * Imports glTF bytes and adds the result to the world in one undo step.
 * Embedded images become embedded textures of the level.
 *
 * @param parts Editor parts.
 * @param bytes File bytes.
 * @param filename File name.
 * @param place Moves the loaded objects before they are added (default: where
 *   the file places them).
 */
export async function runLayoutGlbImportBytes(
  parts: LayoutGlbImportParts,
  bytes: ArrayBuffer,
  filename: string,
  place?: (objects: readonly THREE.Object3D[]) => void,
): Promise<void> {
  const resolver = new LayoutGlbTextureResolver(parts);
  const result = await parts.sceneIo.importGlbFromBytes(bytes, filename, resolver, parts.statusBar);
  if (result === null) return;
  place?.([result.root]);
  parts.commandStack.push(new CommandPrimitiveCreate(result.root, parts.world));
  parts.refresh();
}
