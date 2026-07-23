import * as THREE from 'three';
import { CommandStack } from '../commands/command_stack.js';
import { AssignSurfaceTextureCommand } from '../commands/assign_surface_texture_command.js';
import { AssignSolidBrushTextureCommand } from '../commands/assign_solid_brush_texture_command.js';
import { AssignSolidFaceTextureCommand } from '../commands/assign_solid_face_texture_command.js';
import { SelectionManager } from './selection_manager.js';
import { FaceExtrusionController } from './face_extrusion_controller.js';
import { SelectionMode } from '../types/selection_mode.js';
import {
  TextureApplyTarget,
  buildTargetsFromFaceSelection,
  buildTargetsFromMeshes
} from '../texture/face_texture_applier.js';
import { getTexturePaintState } from '../texture/texture_paint_state.js';
import { TextureBrowserEntry } from '../texture/texture_browser_entry.js';
import { SolidBrushVisual } from '../solid/model/solid_brush_visual.js';
import {
  SolidModel,
  SOLID_TRIANGLE_SOURCES_USERDATA_KEY
} from '../solid/model/solid_model.js';
import { FaceSelection } from '../selection/face_selection_manager.js';
import { mapPreviewTriangleToBrushFace } from '../solid/model/brush_preview_face_map.js';

/**
 * Callback for status messages after texture assignment.
 * @param message Status text.
 */
export type TextureAssignmentStatusCallback = (message: string) => void;

/**
 * Assigns browser textures to regular content or solid-model brush surfaces.
 * Face mode paints individual solid faces; object mode paints whole brushes.
 */
export class TextureAssignmentController {
  private selectionManager: SelectionManager;
  private faceExtrusionController: FaceExtrusionController;
  private commandStack: CommandStack;
  private statusCallback: TextureAssignmentStatusCallback | null;
  private afterSolidTextureAssign: (() => void) | null;

  /**
   * Creates a texture assignment controller.
   * @param selectionManager Object selection.
   * @param faceExtrusionController Face selection / mode.
   * @param commandStack Undo stack.
   */
  constructor(
    selectionManager: SelectionManager,
    faceExtrusionController: FaceExtrusionController,
    commandStack: CommandStack
  ) {
    this.selectionManager = selectionManager;
    this.faceExtrusionController = faceExtrusionController;
    this.commandStack = commandStack;
    this.statusCallback = null;
    this.afterSolidTextureAssign = null;
  }

  /**
   * Registers a status callback.
   * @param callback Status handler, or null.
   */
  setStatusCallback(callback: TextureAssignmentStatusCallback | null): void {
    this.statusCallback = callback;
  }

  /**
   * Optional viewport refresh after solid CSG texture rebuilds.
   * @param callback Refresh hook, or null.
   */
  setAfterSolidTextureAssign(callback: (() => void) | null): void {
    this.afterSolidTextureAssign = callback;
  }

  /**
   * Records paint texture and assigns it to the current selection when any.
   * @param entry Selected browser entry.
   */
  onTextureSelected(entry: TextureBrowserEntry): void {
    getTexturePaintState().setLastTextureId(entry.id);
    const mode = this.faceExtrusionController.getSelectionMode();
    if (mode === SelectionMode.FACE) {
      if (this.tryAssignSolidFaces(entry)) return;
      const targets = this.collectRegularFaceTargets();
      if (targets.length === 0) {
        this.statusCallback?.(
          `Paint texture: ${entry.displayName} (select faces to assign)`
        );
        return;
      }
      this.assignTextureToTargets(targets, entry);
      return;
    }
    const meshes = this.selectionManager.getAllSelectedObjectsAsArray();
    const solidBrushes = AssignSolidBrushTextureCommand.filterBrushMeshes(meshes);
    if (solidBrushes.length > 0) {
      this.assignSolidBrushTextures(solidBrushes, entry);
      return;
    }
    const targets = this.collectContentObjectTargets(meshes);
    if (targets.length === 0) {
      this.statusCallback?.(
        `Paint texture: ${entry.displayName} (select faces, objects, or solid brushes)`
      );
      return;
    }
    this.assignTextureToTargets(targets, entry);
  }

  /**
   * Face-mode paint for solid result or solid brush faces.
   * @param entry Texture entry.
   * @returns True when solid faces were painted.
   */
  private tryAssignSolidFaces(entry: TextureBrowserEntry): boolean {
    const faces = this.faceExtrusionController.getSelectedFaces();
    if (faces.length === 0) return false;
    const solidTargets = this.resolveSolidFaceTargets(faces);
    if (solidTargets.length === 0) return false;
    const command = new AssignSolidFaceTextureCommand(solidTargets, entry.id);
    this.commandStack.push(command);
    this.afterSolidTextureAssign?.();
    this.statusCallback?.(
      `Assigned ${entry.displayName} to ${solidTargets.length} solid face(s)`
    );
    return true;
  }

  /**
   * Maps selected triangles on solid result/brush meshes to brush face targets.
   * @param faces Face selections.
   * @returns Unique solid face paint targets.
   */
  private resolveSolidFaceTargets(
    faces: FaceSelection[]
  ): Array<{ model: SolidModel; brushId: string; surfaceIndex: number }> {
    const targets: Array<{
      model: SolidModel;
      brushId: string;
      surfaceIndex: number;
    }> = [];
    const seen = new Set<string>();
    for (const face of faces) {
      const resolved = this.resolveOneSolidFace(face);
      if (!resolved) continue;
      const key = `${resolved.model.root.uuid}:${resolved.brushId}:${resolved.surfaceIndex}`;
      if (seen.has(key)) continue;
      seen.add(key);
      targets.push(resolved);
    }
    return targets;
  }

  /**
   * Resolves one face selection to a brush surface when possible.
   * @param face Face selection entry.
   * @returns Solid face target or null.
   */
  private resolveOneSolidFace(
    face: FaceSelection
  ): { model: SolidModel; brushId: string; surfaceIndex: number } | null {
    if (SolidModel.isResultMesh(face.mesh)) {
      return this.resolveResultTriangle(face.mesh, face.faceIndex);
    }
    if (SolidBrushVisual.isBrushObject(face.mesh)) {
      return this.resolveBrushTriangle(face.mesh, face.faceIndex);
    }
    return null;
  }

  /**
   * Maps a result-mesh triangle back to its originating brush face.
   * @param mesh Result mesh.
   * @param triangleIndex Triangle index.
   * @returns Solid face target or null.
   */
  private resolveResultTriangle(
    mesh: THREE.Mesh,
    triangleIndex: number
  ): { model: SolidModel; brushId: string; surfaceIndex: number } | null {
    const model = SolidModel.fromObject(mesh);
    if (!model) return null;
    const sources = mesh.userData[SOLID_TRIANGLE_SOURCES_USERDATA_KEY] as
      | Array<{ brushId: string; surfaceIndex: number }>
      | undefined;
    if (!sources || !sources[triangleIndex]) return null;
    const source = sources[triangleIndex];
    if (!source.brushId) return null;
    return {
      model,
      brushId: source.brushId,
      surfaceIndex: source.surfaceIndex
    };
  }

  /**
   * Maps a brush-preview triangle to a brush face by normal matching.
   * BoxGeometry face order differs from solid wing-edge face order.
   * @param mesh Brush preview mesh.
   * @param triangleIndex Triangle index on the preview.
   * @returns Solid face target or null.
   */
  private resolveBrushTriangle(
    mesh: THREE.Mesh,
    triangleIndex: number
  ): { model: SolidModel; brushId: string; surfaceIndex: number } | null {
    const model = SolidModel.fromObject(mesh);
    if (!model) return null;
    const brush = model.findBrushByMesh(mesh);
    if (!brush) return null;
    mesh.updateMatrix();
    const surfaceIndex = mapPreviewTriangleToBrushFace(
      mesh,
      triangleIndex,
      brush
    );
    if (surfaceIndex < 0) return null;
    return {
      model,
      brushId: brush.id,
      surfaceIndex
    };
  }

  /**
   * Assigns texture to solid brushes and rebuilds their CSG results.
   * @param brushMeshes Selected solid brush meshes.
   * @param entry Texture entry.
   */
  private assignSolidBrushTextures(
    brushMeshes: THREE.Mesh[],
    entry: TextureBrowserEntry
  ): void {
    const command = new AssignSolidBrushTextureCommand(brushMeshes, entry.id);
    this.commandStack.push(command);
    this.afterSolidTextureAssign?.();
    this.statusCallback?.(
      `Assigned ${entry.displayName} to ${brushMeshes.length} solid brush(es)`
    );
  }

  /**
   * Pushes an undoable assignment for regular content mesh targets.
   * @param targets Regions to paint.
   * @param entry Texture to apply.
   */
  private assignTextureToTargets(
    targets: TextureApplyTarget[],
    entry: TextureBrowserEntry
  ): void {
    const command = new AssignSurfaceTextureCommand(targets, entry.id);
    this.commandStack.push(command);
    this.statusCallback?.(
      `Assigned ${entry.displayName} to ${targets.length} surface region(s)`
    );
  }

  /**
   * Face-mode targets for regular (non-solid) content only.
   * @returns Apply targets.
   */
  private collectRegularFaceTargets(): TextureApplyTarget[] {
    const faces = this.faceExtrusionController
      .getSelectedFaces()
      .filter((face) => this.isContentTextureMesh(face.mesh));
    if (faces.length === 0) return [];
    return buildTargetsFromFaceSelection(faces);
  }

  /**
   * Object-mode targets for regular content meshes only.
   * @param selectedMeshes Current object selection.
   * @returns Apply targets.
   */
  private collectContentObjectTargets(
    selectedMeshes: THREE.Mesh[]
  ): TextureApplyTarget[] {
    const contentMeshes = selectedMeshes.filter((mesh) =>
      this.isContentTextureMesh(mesh)
    );
    if (contentMeshes.length === 0) return [];
    return buildTargetsFromMeshes(contentMeshes);
  }

  /**
   * Returns whether a mesh may receive freeform content texture paint.
   * @param mesh Candidate mesh.
   * @returns True for regular content meshes.
   */
  private isContentTextureMesh(mesh: THREE.Mesh): boolean {
    if (SolidBrushVisual.isBrushObject(mesh)) return false;
    if (SolidModel.isResultMesh(mesh)) return false;
    return true;
  }
}
