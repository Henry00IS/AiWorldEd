import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { pickComponentFaceLoops } from '@/edit/pick/raycaster_component_face_loops.js';
import { SharedWebGLSurface } from '@/viewports/shared/shared_webgl_surface.js';
import type { RenderSurface } from '@/viewports/shared/render_surface.js';
import { getActiveThemeViewportPalette } from '@/viewports/theme/theme_viewport_palette.js';
import { SolidScriptNormalPickScene } from './solid_script_normal_pick_scene.js';
import { solidScriptNormalPickMiddle, solidScriptNormalPickText } from './solid_script_normal_pick_model.js';

/** The direction towards the viewer on opening, from above and in front. */
export const SOLID_SCRIPT_NORMAL_PICK_VIEW = new THREE.Vector3(1, 0.8, 1.15);

/** The face under the pointer: its words and its normal as field text. */
export interface SolidScriptNormalPickHovered {
  readonly label: string;
  readonly normal: string;
}

/** Creates the renderer surface of the picker. */
export type SolidScriptNormalPickSurface = (host: HTMLElement) => RenderSurface;

/** What the line below the viewport says while no face is under the pointer. */
export const SOLID_SCRIPT_NORMAL_PICK_HELP = 'Click a face to use the way it points. Drag to orbit, scroll to zoom.';

/** Pointer distance in pixels that starts an orbit rather than a pick. */
const SOLID_SCRIPT_NORMAL_PICK_DRAG_PIXELS = 5;

/** A small orbitable viewport that picks a face of the 26-faced shape. */
export class SolidScriptNormalPickView {
  private readonly model = new SolidScriptNormalPickScene();
  private readonly camera = new THREE.PerspectiveCamera(38, 1, 0.05, 500);
  private readonly controls: OrbitControls;
  private readonly surface: RenderSurface;
  private readonly observer: ResizeObserver | null;
  private down: { x: number; y: number; moved: boolean } | null = null;
  private disposed = false;

  /**
   * Builds a viewport in a host that has already been added to the page.
   *
   * @param host Viewport element.
   * @param hovered Shows the face under the pointer, or null for none.
   * @param write Writes a picked direction.
   * @param surface Builds a rendering surface; tests give one that draws
   *   nothing.
   */
  constructor(
    private readonly host: HTMLElement,
    private readonly hovered: (face: SolidScriptNormalPickHovered | null) => void,
    private readonly write: (text: string) => void,
    surface: SolidScriptNormalPickSurface = (element) =>
      new SharedWebGLSurface(element, { ownerName: 'normal_picker' }),
  ) {
    this.surface = surface(host);
    const target = solidScriptNormalPickMiddle();
    this.camera.position.copy(SOLID_SCRIPT_NORMAL_PICK_VIEW).normalize().multiplyScalar(7).add(target);
    this.camera.lookAt(target);
    this.controls = new OrbitControls(this.camera, host);
    this.controls.target.copy(target);
    this.controls.enablePan = false;
    this.controls.minDistance = 3.5;
    this.controls.maxDistance = 16;
    this.controls.addEventListener('change', () => this.render());
    this.listen();
    this.observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => this.render());
    this.observer?.observe(host);
    this.controls.update();
    this.render();
  }

  /** Registers pointer events; the controls take care of orbiting and zooming. */
  private listen(): void {
    this.host.addEventListener('pointerdown', (event) => this.pointerDown(event));
    this.host.addEventListener('pointermove', (event) => this.pointerMove(event));
    this.host.addEventListener('pointerup', (event) => this.pointerUp(event));
    this.host.addEventListener('pointercancel', () => {
      this.down = null;
    });
    this.host.addEventListener('pointerleave', () => this.hover(-1));
  }

  /**
   * Begins a possible pick, which becomes an orbit on a drag.
   *
   * @param event Pointer event.
   */
  private pointerDown(event: PointerEvent): void {
    this.host.focus({ preventScroll: true });
    this.down = event.button === 0 ? { x: event.clientX, y: event.clientY, moved: false } : null;
  }

  /**
   * Highlights the face under the pointer, unless the pointer is orbiting.
   *
   * @param event Pointer event.
   */
  private pointerMove(event: PointerEvent): void {
    if (this.down) {
      const distance = Math.hypot(event.clientX - this.down.x, event.clientY - this.down.y);
      this.down.moved ||= distance > SOLID_SCRIPT_NORMAL_PICK_DRAG_PIXELS;
    }
    this.hover(this.down?.moved ? -1 : this.pick(event));
  }

  /**
   * Writes the direction of a clicked face; a drag writes nothing.
   *
   * @param event Pointer event.
   */
  private pointerUp(event: PointerEvent): void {
    const down = this.down;
    this.down = null;
    if (
      !down ||
      down.moved ||
      Math.hypot(event.clientX - down.x, event.clientY - down.y) > SOLID_SCRIPT_NORMAL_PICK_DRAG_PIXELS
    )
      return;
    const face = this.model.faces[this.pick(event)];
    if (face) this.write(solidScriptNormalPickText(face.direction));
  }

  /**
   * Picks a front-facing face using the editor's face-loop picker.
   *
   * @param event Pointer event.
   * @returns Face number, or -1.
   */
  private pick(event: MouseEvent): number {
    this.render();
    const faces = this.model.faces.map((face, faceIndex) => ({ faceIndex, worldLoop: face.loop }));
    return (
      pickComponentFaceLoops(event, this.camera, this.host, [{ targetId: 'normal_picker', faces }])?.faceIndex ?? -1
    );
  }

  /**
   * Highlights a face and describes its normal below the viewport.
   *
   * @param index Face number, or -1.
   */
  private hover(index: number): void {
    this.model.hover(index);
    const face = this.model.faces[index];
    this.hovered(
      face ? { label: face.direction.lines.join(' '), normal: solidScriptNormalPickText(face.direction) } : null,
    );
    this.render();
  }

  /** Draws the scene to fill the host. */
  private render(): void {
    if (this.disposed) return;
    const box = this.host.getBoundingClientRect();
    const width = Math.max(1, box.width);
    const height = Math.max(1, box.height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.model.update(this.camera);
    this.surface.renderPanes(
      this.model.scene,
      [{ camera: this.camera, viewportRect: { x: 0, y: 0, width, height } }],
      getActiveThemeViewportPalette().viewportBackground,
    );
  }

  /** Releases the orbit controls, surface and scene. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.observer?.disconnect();
    this.controls.dispose();
    this.model.dispose();
    this.surface.dispose();
  }
}
