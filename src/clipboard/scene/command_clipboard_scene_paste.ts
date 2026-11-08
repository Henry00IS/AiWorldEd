import * as THREE from 'three';
import type { UndoCommand } from '@/commands/command_undo.js';
import { SceneDeserializer } from '@/io/scene/scene_deserializer.js';
import { SolidModelCodec } from '@/solid/io/solid_model_codec.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { modifierBevelRefreshScene } from '@/modifier/compile/modifier_bevel_scene_refresh.js';
import type { ClipboardSceneBrush, ClipboardSceneData } from './clipboard_scene_data.js';

/** One pasted brush, for undo and selection. */
interface ClipboardScenePastedBrush {
  model: SolidModel;
  id: string;
  mesh: THREE.Mesh | null;
}

/**
 * Undoable paste of clipboard scene objects in place: objects get fresh ids
 * under the world, brushes join their solid model with fresh brush ids. Brushes
 * whose model is gone are left out.
 */
export class CommandClipboardScenePaste implements UndoCommand {
  private objects: THREE.Object3D[] = [];
  private brushes: ClipboardScenePastedBrush[] = [];

  /**
   * Creates the paste.
   *
   * @param world Scene world root.
   * @param data Clipboard scene data.
   */
  constructor(
    private readonly world: THREE.Object3D,
    private readonly data: ClipboardSceneData,
  ) {}

  /** Adds fresh copies of everything on the clipboard. */
  execute(): void {
    this.objects = new SceneDeserializer().objectsFromEntries(structuredClone(this.data.objects));
    for (const object of this.objects) {
      object.traverse((node) => {
        node.uuid = THREE.MathUtils.generateUUID();
      });
      this.world.add(object);
    }
    this.brushes = this.data.brushes.flatMap((record) => clipboardScenePasteBrush(this.world, record));
    modifierBevelRefreshScene(this.world);
  }

  /** Removes everything the paste added. */
  undo(): void {
    for (const object of this.objects) object.removeFromParent();
    for (const brush of this.brushes) brush.model.removeBrush(brush.id);
    this.objects = [];
    this.brushes = [];
    modifierBevelRefreshScene(this.world);
  }

  /**
   * Returns the pasted hierarchy roots to select.
   *
   * @returns Objects and brush meshes.
   */
  pasted(): THREE.Object3D[] {
    return [...this.objects, ...this.brushes.flatMap((brush) => brush.mesh ?? [])];
  }

  /**
   * Returns how many copied items could not be pasted.
   *
   * @returns Brushes whose solid model is gone.
   */
  missing(): number {
    return this.data.brushes.length - this.brushes.length;
  }
}

/**
 * Adds a copy of one brush to its solid model with a fresh id.
 *
 * @param world Scene world root.
 * @param record Copied brush.
 * @returns The pasted brush, or nothing when its model is gone.
 */
function clipboardScenePasteBrush(world: THREE.Object3D, record: ClipboardSceneBrush): ClipboardScenePastedBrush[] {
  const root = world.getObjectByProperty('uuid', record.model);
  const model = root ? SolidModel.fromObject(root) : null;
  if (!model || model.root !== root) return [];
  const decoded = SolidModelCodec.brushDecode(record.brush);
  const fresh = model.prepareTopologyBrush(decoded.brush, decoded.operation, decoded.position);
  const copy = decoded.cloneWithId(fresh.id, fresh.name);
  if (fresh.mesh) copy.attachMesh(fresh.mesh);
  model.addBrushInstance(copy);
  return [{ model, id: copy.id, mesh: copy.mesh }];
}
