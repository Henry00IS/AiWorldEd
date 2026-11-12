import * as THREE from 'three';
import type { UndoCommand } from '@/commands/command_undo.js';
import { SceneDeserializer } from '@/io/scene/scene_deserializer.js';
import { SolidModelCodec } from '@/solid/io/solid_model_codec.js';
import { allocateCopiedHierarchyNames } from '@/outliner/hierarchy/hierarchy_copy_names.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { modifierBevelRefreshScene } from '@/modifier/compile/modifier_bevel_scene_refresh.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import type { ClipboardSceneBrush, ClipboardSceneData } from './clipboard_scene_data.js';
import { CLIPBOARD_SCENE_PASTE_TARGET_NONE, type ClipboardScenePasteTarget } from './clipboard_scene_paste_target.js';

/** One pasted brush, for undo and selection. */
interface ClipboardScenePastedBrush {
  model: SolidModel;
  id: string;
  mesh: THREE.Mesh | null;
}

/**
 * Undoable paste of clipboard scene objects in place, with fresh ids. Brushes
 * and generators only live inside a solid model: they go to the target model
 * (after the most recent selection, like Duplicate), else a brush goes back to
 * its own model, else a new model is created for them in the same step.
 * Modifier volumes follow the most recent selection the same way when it sits
 * inside a solid model, and go under the world otherwise. Everything else goes
 * under the world.
 */
export class CommandClipboardScenePaste implements UndoCommand {
  private objects: THREE.Object3D[] = [];
  private brushes: ClipboardScenePastedBrush[] = [];
  /**
   * Model made for this paste, kept across undo so redo brings back the same
   * one.
   */
  private created: SolidModel | null = null;
  private cursor: THREE.Object3D | null = null;

  /**
   * Creates the paste.
   *
   * @param world Scene world root.
   * @param data Clipboard scene data.
   * @param target Model, parent and sibling for brushes and generators.
   */
  constructor(
    private readonly world: THREE.Object3D,
    private readonly data: ClipboardSceneData,
    private readonly target: ClipboardScenePasteTarget = CLIPBOARD_SCENE_PASTE_TARGET_NONE,
  ) {}

  /** Adds fresh copies of everything on the clipboard. */
  execute(): void {
    this.cursor = this.target.after;
    this.objects = new SceneDeserializer().objectsFromEntries(structuredClone(this.data.objects));
    for (const object of this.objects) {
      allocateCopiedHierarchyNames(object);
      object.traverse((node) => {
        node.uuid = THREE.MathUtils.generateUUID();
      });
      if (ModifierVolume.isGenerator(object)) this.place(this.slot(null), object);
      else if (ModifierVolume.isVolume(object) && this.target.parent && this.target.after)
        this.place({ parent: this.target.parent }, object);
      else this.world.add(object);
    }
    this.brushes = this.data.brushes.map((record) => this.pasteBrush(record));
    modifierBevelRefreshScene(this.world);
  }

  /** Removes everything the paste added, including a model it created. */
  undo(): void {
    for (const object of this.objects) object.removeFromParent();
    for (const brush of this.brushes) brush.model.removeBrush(brush.id);
    this.created?.root.removeFromParent();
    this.objects = [];
    this.brushes = [];
    modifierBevelRefreshScene(this.world);
  }

  /**
   * Returns the solid model the paste created, if any.
   *
   * @returns New model, or null.
   */
  createdModel(): SolidModel | null {
    return this.created?.root.parent ? this.created : null;
  }

  /**
   * Picks the model and parent for a brush or generator: the target, else the
   * brush's own model, else a model created for this paste.
   *
   * @param own Model the copied brush came from, if still in the scene.
   * @returns Model and parent.
   */
  private slot(own: SolidModel | null): { model: SolidModel; parent: THREE.Object3D } {
    const { model, parent } = this.target;
    if (model && parent) return { model, parent };
    if (own) return { model: own, parent: own.root };
    this.created ??= new SolidModel();
    if (!this.created.root.parent) this.world.add(this.created.root);
    return { model: this.created, parent: this.created.root };
  }

  /**
   * Adds an object under a parent, right after the previous pasted object there
   * (or the target sibling), as Duplicate places clones.
   *
   * @param slot Model and parent.
   * @param object Object to add.
   */
  private place(slot: { parent: THREE.Object3D }, object: THREE.Object3D): void {
    const after = this.cursor?.parent === slot.parent ? this.cursor : null;
    clipboardScenePasteInsert(slot.parent, object, after);
    this.cursor = object;
  }

  /**
   * Adds a copy of one brush with a fresh id.
   *
   * @param record Copied brush.
   * @returns The pasted brush.
   */
  private pasteBrush(record: ClipboardSceneBrush): ClipboardScenePastedBrush {
    const slot = this.slot(clipboardScenePasteOwnModel(this.world, record));
    const { model } = slot;
    const decoded = SolidModelCodec.brushDecode(record.brush);
    const fresh = model.prepareTopologyBrush(
      decoded.brush,
      decoded.operation,
      decoded.position,
      undefined,
      decoded.name,
    );
    const copy = decoded.cloneWithId(fresh.id, fresh.name);
    if (fresh.mesh) copy.attachMesh(fresh.mesh);
    const after = this.cursor?.parent === slot.parent ? this.cursor : null;
    model.addBrushInstanceAfter(copy, slot.parent, after);
    if (copy.mesh) this.cursor = copy.mesh;
    return { model, id: copy.id, mesh: copy.mesh };
  }

  /**
   * Returns the pasted hierarchy roots to select.
   *
   * @returns Objects and brush meshes.
   */
  pasted(): THREE.Object3D[] {
    return [...this.objects, ...this.brushes.flatMap((brush) => brush.mesh ?? [])];
  }
}

/**
 * Finds the solid model a copied brush came from.
 *
 * @param world Scene world root.
 * @param record Copied brush.
 * @returns Its model, or null when it is gone.
 */
function clipboardScenePasteOwnModel(world: THREE.Object3D, record: ClipboardSceneBrush): SolidModel | null {
  const root = world.getObjectByProperty('uuid', record.model);
  const model = root ? SolidModel.fromObject(root) : null;
  return model && model.root === root ? model : null;
}

/**
 * Adds an object under a parent, right after a sibling when given.
 *
 * @param parent New parent.
 * @param object Object to add.
 * @param after Sibling to follow, or null to append.
 */
function clipboardScenePasteInsert(parent: THREE.Object3D, object: THREE.Object3D, after: THREE.Object3D | null): void {
  parent.add(object);
  const index = after ? parent.children.indexOf(after) : -1;
  if (index < 0) return;
  parent.children.splice(parent.children.indexOf(object), 1);
  parent.children.splice(index + 1, 0, object);
}
