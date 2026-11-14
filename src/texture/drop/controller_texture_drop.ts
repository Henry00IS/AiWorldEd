import * as THREE from 'three';
import { RaycasterFaceSelection } from '@/selection/face/raycaster_face_selection.js';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import type { ControllerTextureAssignment } from '@/texture/controller/controller_texture_assignment.js';
import type { TextureBrowserEntry } from '@/texture/library/texture_browser_entry.js';
import { TEXTURE_BROWSER_DRAG_TYPE, textureBrowserDragHas } from '@/texture/ui/browser/texture_browser_drag.js';

/** What a texture drop needs from a viewport. */
export interface TextureDropViewport {
  getContentElement(): HTMLElement;
  getCamera(): THREE.Camera;
}

/** Editor services a texture drop uses. */
export interface TextureDropDeps {
  /** World holding the solid models. */
  world: THREE.Object3D;
  /** Live viewports. */
  viewports: () => readonly TextureDropViewport[];
  /** Looks up a library texture by id. */
  entry: (id: string) => TextureBrowserEntry | null;
  assignment: ControllerTextureAssignment;
  /** Admits a one-shot edit of an object (collaboration locks). */
  gate: (object: THREE.Object3D, apply: () => void) => void;
  /** Shows a status message. */
  status: (message: string) => void;
}

/**
 * Paints the brush face under the cursor when a texture from the browser is
 * dropped on a viewport, in any selection mode and without changing the
 * selection.
 */
export class ControllerTextureDrop {
  private readonly raycaster = new RaycasterFaceSelection();
  private readonly onDragOver = (event: Event) => this.dragOver(event as DragEvent);
  private readonly onDrop = (event: Event) => this.drop(event as DragEvent);

  /**
   * @param target Document or element that receives the drags.
   * @param deps Editor services.
   */
  constructor(
    private readonly target: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>,
    private readonly deps: TextureDropDeps,
  ) {
    target.addEventListener('dragover', this.onDragOver);
    target.addEventListener('drop', this.onDrop);
  }

  /** Stops listening. */
  dispose(): void {
    this.target.removeEventListener('dragover', this.onDragOver);
    this.target.removeEventListener('drop', this.onDrop);
    this.raycaster.dispose();
  }

  /**
   * Accepts texture drags over a viewport.
   *
   * @param event Drag event.
   */
  private dragOver(event: DragEvent): void {
    if (!textureBrowserDragHas(event.dataTransfer) || this.viewportAt(event) === null) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }

  /**
   * Paints the face under a dropped texture.
   *
   * @param event Drop event.
   */
  private drop(event: DragEvent): void {
    if (!textureBrowserDragHas(event.dataTransfer)) return;
    const viewport = this.viewportAt(event);
    if (viewport === null) return;
    event.preventDefault();
    const entry = this.deps.entry(event.dataTransfer.getData(TEXTURE_BROWSER_DRAG_TYPE));
    if (entry === null) return;
    const target = this.faceAt(event, viewport);
    const brush = target?.model.findBrush(target.brushId)?.mesh ?? null;
    if (target === null || brush === null) return this.deps.status('Drop textures onto a brush face');
    this.deps.gate(brush, () => this.deps.assignment.assignSolidFaceTargets([target], entry));
  }

  /**
   * Finds the brush face under the pointer.
   *
   * @param event Pointer position.
   * @param viewport Viewport under the pointer.
   * @returns Brush face, or null when no brush face is there.
   */
  private faceAt(event: MouseEvent, viewport: TextureDropViewport) {
    const element = viewport.getContentElement();
    const pick = this.raycaster.pickFace(event, viewport.getCamera(), element, this.resultMeshes());
    return pick === null ? null : this.deps.assignment.resolveSolidFace(pick.mesh, pick.faceIndex);
  }

  /**
   * Lists the visible solid result meshes, whose triangles show brush faces.
   *
   * @returns Result meshes.
   */
  private resultMeshes(): THREE.Mesh[] {
    const meshes: THREE.Mesh[] = [];
    this.deps.world.traverseVisible((child) => {
      if (!(child instanceof THREE.Mesh) || !SolidModel.isResultMesh(child)) return;
      if (!SolidBrushVisual.shouldSkipFacePick(child)) meshes.push(child);
    });
    return meshes;
  }

  /**
   * Finds the viewport whose content area holds the pointer.
   *
   * @param event Pointer position.
   * @returns Viewport, or null outside every viewport.
   */
  private viewportAt(event: MouseEvent): TextureDropViewport | null {
    const target = event.target instanceof Node ? event.target : null;
    for (const viewport of this.deps.viewports()) {
      const element = viewport.getContentElement();
      if (target !== null && !element.contains(target)) continue;
      const rect = element.getBoundingClientRect();
      const inside = event.clientX >= rect.left && event.clientX <= rect.right;
      if (inside && event.clientY >= rect.top && event.clientY <= rect.bottom) return viewport;
    }
    return null;
  }
}
