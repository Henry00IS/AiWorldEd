import * as THREE from 'three';
import type { ObjectEntry } from '@/io/scene/io_types.js';
import { SceneSerializer } from '@/io/scene/scene_serializer.js';
import { SolidModelCodec, type SerializedSolidBrush } from '@/solid/io/solid_model_codec.js';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { isSolidCsgGroup } from '@/solid/model/solid_group.js';

/** One copied brush and the solid model it belongs to. */
export interface ClipboardSceneBrush {
  /** Uuid of the owning solid model root. */
  model: string;
  /** Brush shape, transform, operation and surfaces. */
  brush: SerializedSolidBrush;
}

/** Scene objects on the clipboard. */
export interface ClipboardSceneData {
  /** Meshes, groups, modifier volumes and whole solid models. */
  objects: ObjectEntry[];
  /** Single brushes, pasted back into their solid model. */
  brushes: ClipboardSceneBrush[];
}

/**
 * Copies hierarchy roots: brushes as brushes of their model, everything else as
 * scene entries. CSG groups inside a solid model are left out.
 *
 * @param roots Selected hierarchy roots, outermost first.
 * @returns Clipboard data and how many roots were left out.
 */
export function clipboardSceneCopy(roots: readonly THREE.Object3D[]): { data: ClipboardSceneData; skipped: number } {
  const brushes = roots.flatMap((root) => clipboardSceneBrushCopy(root));
  const others = roots.filter((root) => !SolidBrushVisual.isBrushObject(root) && !isSolidCsgGroup(root));
  const objects = new SceneSerializer().serializeObjects(others);
  const copied = brushes.length + objects.filter((entry) => !entry.parentId).length;
  return { data: { objects, brushes }, skipped: roots.length - copied };
}

/**
 * Copies one brush mesh with its solid model id.
 *
 * @param root Candidate hierarchy root.
 * @returns The brush, or nothing for other objects.
 */
function clipboardSceneBrushCopy(root: THREE.Object3D): ClipboardSceneBrush[] {
  if (!(root instanceof THREE.Mesh) || !SolidBrushVisual.isBrushObject(root)) return [];
  const model = SolidModel.fromObject(root);
  const instance = model?.findBrushByMesh(root);
  if (!model || !instance) return [];
  instance.pullTransformFromMesh();
  return [{ model: model.root.uuid, brush: SolidModelCodec.brushEncode(instance) }];
}

/**
 * Returns whether clipboard data holds anything to paste.
 *
 * @param data Clipboard data.
 * @returns True when it does.
 */
export function clipboardSceneHasContent(data: ClipboardSceneData): boolean {
  return (
    (Array.isArray(data.objects) && data.objects.length > 0) || (Array.isArray(data.brushes) && data.brushes.length > 0)
  );
}
