import * as THREE from 'three';
import { Tool } from '@/editor/tools/tool.js';
import type { CommandStack } from '@/commands/command_stack.js';
import type { EditorViewportPickContext } from '@/editor/window/editor_viewport_pick_context.js';
import { RaycasterFaceSelection } from '@/selection/face/raycaster_face_selection.js';
import type { SolidModel } from '@/solid/model/solid_model.js';
import { SolidModelRegistry } from '@/solid/model/solid_model_registry.js';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { SOLID_TRIANGLE_SOURCES_USERDATA_KEY } from '@/solid/model/solid_model_keys.js';
import { paintStrokeIdCreate } from '@/paint/stroke/paint_stroke.js';
import type { PaintImageSource } from '@/paint/raster/paint_image.js';
import { PAINT_SHAPE_IMAGE_ID } from '@/paint/raster/paint_tile_raster.js';
import { paintShapeFind } from '@/paint/shape/paint_shape_catalog.js';
import type { PaintSceneSystem } from '@/paint/scene/paint_scene_system.js';
import { paintBrushKey, paintWorldToBrush } from '@/paint/scene/paint_brush_key.js';
import { CommandPaintStrokes, type PaintStrokePlacement } from '@/paint/commands/command_paint_strokes.js';
import { PaintStrokeBuilder, type PaintStrokeTarget } from './paint_stroke_builder.js';
import type { PaintToolSettings } from './paint_tool_settings.js';
import { PaintCursor } from './paint_cursor.js';
import { paintPickBaseColor, paintPickCombine } from './paint_color_pick.js';
import { paintDecalFit, paintDecalVolumeCreate } from '@/paint/decal/paint_decal_fit.js';
import { PaintDecalFitPreview } from '@/paint/decal/paint_decal_fit_preview.js';
import { CommandModifierVolumeCreate } from '@/modifier/stack/command_modifier_volume_create.js';
import { modifierStackDerivedByRoot } from '@/modifier/stack/evaluate/modifier_stack_compile.js';

/** Factor one press of [ or ] changes the brush size by. */
const PAINT_TOOL_SIZE_STEP = 1.2;

/** Change of hardness or strength per key press. */
const PAINT_TOOL_UNIT_STEP = 0.1;

/** What the paint tool needs from the editor. */
export interface PaintToolHost {
  /** Brush settings shared with the palette. */
  readonly settings: PaintToolSettings;
  /** Resolves stamp images for the cursor preview. */
  readonly images: PaintImageSource;
  /** Returns the paint scene system. */
  paintSystem(): PaintSceneSystem | null;
  /** Returns the world root. */
  worldObject(): THREE.Object3D;
  /** Returns the scene the cursor is drawn in. */
  scene(): THREE.Scene | null;
  /** Returns the undo stack. */
  commandStack(): CommandStack;
  /** Returns true while the user asks for reduced motion. */
  reducedMotion(): boolean;
  /**
   * Called when the tool turns on or off, to show or hide its palette.
   *
   * @param active True while the tool is active.
   */
  onActiveChanged(active: boolean): void;
  /**
   * Selects an object the tool created, such as a placed decal volume.
   *
   * @param object Object.
   */
  selectObject?(object: THREE.Object3D): void;
}

/** A surface under the pointer, including the faces of array and mirror copies. */
interface PaintToolSurface {
  readonly mesh: THREE.Mesh;
  readonly model: SolidModel;
  readonly faceIndex: number;
  readonly point: THREE.Vector3;
  readonly normal: THREE.Vector3;
  readonly source: { brushId: string; surfaceIndex: number; derivedId: string | undefined };
}

/** A surface under the pointer. */
interface PaintToolHit {
  readonly mesh: THREE.Mesh;
  readonly model: SolidModel;
  readonly brush: SolidBrushInstance;
  readonly faceIndex: number;
  readonly surfaceIndex: number;
  readonly point: THREE.Vector3;
  readonly normal: THREE.Vector3;
}

/** A stroke being drawn. */
interface PaintToolStroke {
  readonly builder: PaintStrokeBuilder;
  readonly pane: EditorViewportPickContext;
  readonly brushes: Map<string, { model: SolidModel; brush: SolidBrushInstance }>;
  readonly stamp: boolean;
}

/**
 * Paints onto solid surfaces. Dragging lays dabs along the pointer path on
 * every brush they reach and previews them live; releasing commits the whole
 * stroke as one undo step. Alt+click or the picker samples the shown color.
 */
export class PaintTool extends Tool {
  private readonly raycaster = new RaycasterFaceSelection();
  private readonly ndc = new THREE.Vector2();
  private readonly ray = new THREE.Raycaster();
  private readonly cursor: PaintCursor;
  private readonly decalPreview = new PaintDecalFitPreview();
  private readonly sample = new Float32Array(6);
  private readonly baseSample = new Float32Array(4);
  private stroke: PaintToolStroke | null = null;
  /**
   * True while a press that missed every surface waits for the drag to reach
   * one.
   */
  private armed = false;
  private removeSettingsListener: (() => void) | null = null;

  /**
   * Creates the tool.
   *
   * @param host Editor access.
   */
  constructor(private readonly host: PaintToolHost) {
    super();
    this.cursor = new PaintCursor(() => host.reducedMotion());
  }

  /** Brush settings. */
  get settings(): PaintToolSettings {
    return this.host.settings;
  }

  /**
   * Keeps input on the tool while a stroke is drawn.
   *
   * @returns True while painting.
   */
  override isBusy(): boolean {
    return this.stroke !== null;
  }

  /**
   * Stops camera navigation from stealing a stroke.
   *
   * @returns True while painting.
   */
  override suppressesViewportNavigation(): boolean {
    return this.stroke !== null;
  }

  /** Shows the palette and cursor. */
  override onActivate(): void {
    const services = this.editor?.getServices();
    services?.pinExclusiveViewportDomain(services.getInteractiveViewportPickElements());
    this.host.scene()?.add(this.cursor.object, this.decalPreview.object);
    this.removeSettingsListener = this.settings.listen(() => this.refreshLook());
    this.refreshLook();
    this.host.onActiveChanged(true);
    services?.setStatusMessage('Paint · B Brush · E Eraser · I Pick Color · D Place Decal · [ ] Size');
  }

  /** Cancels any stroke and hides the palette and cursor. */
  override onDeactivate(): void {
    this.cancelStroke();
    this.cursor.hide();
    this.cursor.object.removeFromParent();
    this.decalPreview.hide();
    this.decalPreview.object.removeFromParent();
    this.removeSettingsListener?.();
    this.removeSettingsListener = null;
    if (this.settings.mode === 'pick' || this.settings.mode === 'decal') this.settings.setMode(this.settings.drawMode);
    this.host.onActiveChanged(false);
    this.editor?.getServices()?.clearExclusiveViewport();
  }

  /** Advances the cursor animation. */
  override onRender(): void {
    if (this.cursor.object.visible) this.cursor.animate();
  }

  /**
   * Starts a stroke, or picks a color in pick mode or with Alt.
   *
   * @param button Mouse button.
   */
  override onMouseDown(button: number): void {
    if (button !== 0 || this.editor === null) return;
    const pane = this.paneAtPointer();
    if (pane === null) return;
    if (this.settings.mode === 'decal') {
      this.placeDecal(pane);
      return;
    }
    const hit = this.pick(pane);
    const alt = this.editor.getLatchedModifierFlags()?.altKey === true;
    if (this.settings.mode === 'pick' || alt) {
      if (hit !== null) this.pickColor(hit);
      return;
    }
    if (hit === null) {
      this.armed = true;
      this.editor.getServices()?.setStatusMessage('Paint lands on solid surfaces');
      return;
    }
    this.beginStroke(pane, hit);
  }

  /**
   * Hovers the cursor over surfaces.
   *
   * @param _screenDelta Unused.
   * @param _gridDelta Unused.
   */
  override onMouseMove(_screenDelta: THREE.Vector2, _gridDelta: THREE.Vector2): void {
    if (this.stroke !== null) return;
    this.refreshHover();
  }

  /**
   * Extends the stroke.
   *
   * @param button Mouse button.
   * @param screenDelta Pointer delta.
   * @param gridDelta Grid delta.
   */
  override onMouseDrag(button: number, screenDelta: THREE.Vector2, gridDelta: THREE.Vector2): void {
    if (button !== 0) return;
    if (this.stroke === null) {
      if (this.armed) this.beginArmedStroke();
      if (this.stroke === null) this.onMouseMove(screenDelta, gridDelta);
      return;
    }
    this.extendStroke(this.stroke);
  }

  /**
   * Extends the stroke while the pointer is outside the viewport.
   *
   * @param button Mouse button.
   * @param screenDelta Pointer delta.
   * @param gridDelta Grid delta.
   */
  override onGlobalMouseDrag(button: number, screenDelta: THREE.Vector2, gridDelta: THREE.Vector2): void {
    this.onMouseDrag(button, screenDelta, gridDelta);
  }

  /**
   * Commits the stroke.
   *
   * @param button Mouse button.
   */
  override onGlobalMouseUp(button: number): void {
    if (button !== 0) return;
    this.armed = false;
    this.commitStroke();
  }

  /**
   * Commits the stroke when the release reaches the viewport first.
   *
   * @param button Mouse button.
   */
  override onMouseUp(button: number): void {
    this.onGlobalMouseUp(button);
  }

  /**
   * Handles paint shortcuts.
   *
   * @param keyCode Key code.
   * @param event Keyboard event.
   * @returns True when the key was used.
   */
  override onKeyDown(keyCode: string, event?: KeyboardEvent): boolean {
    if (keyCode === 'Escape' && this.stroke === null && this.settings.mode === 'decal') {
      this.settings.setMode(this.settings.drawMode);
      this.refreshHover();
      return true;
    }
    if (keyCode === 'Escape' && this.stroke !== null) {
      this.cancelStroke();
      this.editor?.getServices()?.setStatusMessage('Stroke cancelled');
      return true;
    }
    if (this.stroke !== null) return true;
    if (event !== undefined && (event.ctrlKey || event.metaKey || event.altKey)) return false;
    const shift = event?.shiftKey === true;
    switch (keyCode) {
      case 'KeyB':
        this.settings.setMode('paint');
        return true;
      case 'KeyE':
        this.settings.setMode('erase');
        return true;
      case 'KeyI':
        this.settings.setMode(this.settings.mode === 'pick' ? this.settings.drawMode : 'pick');
        return true;
      case 'KeyD':
        this.settings.setMode(this.settings.mode === 'decal' ? this.settings.drawMode : 'decal');
        this.refreshHover();
        return true;
      case 'ShiftLeft':
      case 'ShiftRight':
        if (this.settings.mode === 'decal') this.refreshHover(true);
        return false;
      case 'BracketLeft':
        if (shift) this.settings.setHardness(this.settings.hardness - PAINT_TOOL_UNIT_STEP);
        else this.settings.scaleRadius(1 / PAINT_TOOL_SIZE_STEP);
        this.refreshHover();
        return true;
      case 'BracketRight':
        if (shift) this.settings.setHardness(this.settings.hardness + PAINT_TOOL_UNIT_STEP);
        else this.settings.scaleRadius(PAINT_TOOL_SIZE_STEP);
        this.refreshHover();
        return true;
      default:
        break;
    }
    const digit = /^Digit([0-9])$/.exec(keyCode);
    if (digit !== null) {
      const value = Number(digit[1]);
      this.settings.setOpacity(value === 0 ? 1 : value / 10);
      return true;
    }
    return false;
  }

  /** Frees the cursor. */
  dispose(): void {
    this.cancelStroke();
    this.cursor.dispose();
    this.decalPreview.dispose();
  }

  /**
   * Returns the viewport under the pointer.
   *
   * @returns Camera and pick element, or null.
   */
  private paneAtPointer(): EditorViewportPickContext | null {
    const editor = this.editor;
    const services = editor?.getServices();
    if (!editor || !services) return null;
    return services.resolveInteractiveViewportAtClientPoint(
      editor.lastPointerClientX,
      editor.lastPointerClientY,
      editor.lastPointerOwnerDocument,
    );
  }

  /**
   * Finds the solid surface under the pointer, on authored brushes and on their
   * array and mirror copies.
   *
   * @param pane Viewport.
   * @returns Surface, or null.
   */
  private surfaceAt(pane: EditorViewportPickContext): PaintToolSurface | null {
    const editor = this.editor;
    if (editor === null) return null;
    const rect = pane.pickElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    this.ndc.set(
      ((editor.lastPointerClientX - rect.left) / rect.width) * 2 - 1,
      -((editor.lastPointerClientY - rect.top) / rect.height) * 2 + 1,
    );
    pane.camera.updateMatrixWorld(true);
    this.ray.setFromCamera(this.ndc, pane.camera);
    let best: {
      model: SolidModel;
      mesh: THREE.Mesh;
      faceIndex: number;
      point: THREE.Vector3;
      normal: THREE.Vector3;
    } | null = null;
    let bestDistance = Infinity;
    for (const model of SolidModelRegistry.collectUnder(this.host.worldObject())) {
      const mesh = model.getResultMesh();
      if (!this.isShown(mesh)) continue;
      const hit = this.raycaster.pickFrontFaceFromRay(mesh, this.ray.ray.origin, this.ray.ray.direction);
      if (hit === null) continue;
      const distance = hit.hitPoint.distanceTo(this.ray.ray.origin);
      if (distance >= bestDistance) continue;
      bestDistance = distance;
      best = { model, mesh, faceIndex: hit.faceIndex, point: hit.hitPoint.clone(), normal: hit.faceNormal.clone() };
    }
    if (best === null) return null;
    const sources = best.mesh.userData[SOLID_TRIANGLE_SOURCES_USERDATA_KEY] as unknown;
    const source = Array.isArray(sources)
      ? (sources[best.faceIndex] as { brushId?: string; surfaceIndex?: number; derivedId?: string } | undefined)
      : undefined;
    if (source?.brushId === undefined || source.surfaceIndex === undefined) return null;
    return {
      ...best,
      source: { brushId: source.brushId, surfaceIndex: source.surfaceIndex, derivedId: source.derivedId },
    };
  }

  /**
   * Finds the paintable surface under the pointer.
   *
   * @param pane Viewport.
   * @returns Hit, or null.
   */
  private pick(pane: EditorViewportPickContext): PaintToolHit | null {
    const surface = this.surfaceAt(pane);
    if (surface === null || surface.source.derivedId !== undefined) return null;
    const brush = surface.model.findBrush(surface.source.brushId);
    if (brush === undefined) return null;
    return {
      mesh: surface.mesh,
      model: surface.model,
      brush,
      faceIndex: surface.faceIndex,
      surfaceIndex: surface.source.surfaceIndex,
      point: surface.point,
      normal: surface.normal,
    };
  }

  /**
   * Returns whether a mesh and all its parents are visible.
   *
   * @param object Object.
   * @returns True when shown.
   */
  private isShown(object: THREE.Object3D): boolean {
    for (let current: THREE.Object3D | null = object; current !== null; current = current.parent) {
      if (!current.visible) return false;
    }
    return true;
  }

  /**
   * Shows the cursor on a hit, or hides it.
   *
   * @param pane Viewport, or null.
   * @param hit Hit, or null.
   * @param up Stamp up, or null to use the view up.
   */
  private showCursor(pane: EditorViewportPickContext | null, hit: PaintToolHit | null, up?: THREE.Vector3): void {
    if (pane === null || hit === null) {
      this.cursor.hide();
      return;
    }
    const viewUp = up ?? new THREE.Vector3(0, 1, 0).applyQuaternion(pane.camera.quaternion);
    this.cursor.place(hit.point, hit.normal, viewUp, this.settings.radius);
  }

  /**
   * Re-places the cursor, or the decal preview in decal mode.
   *
   * @param shift Shift state when it is known before the editor latches it.
   */
  private refreshHover(shift?: boolean): void {
    const pane = this.paneAtPointer();
    if (this.settings.mode === 'decal') {
      this.cursor.hide();
      const fit = pane === null ? null : this.decalFitAt(pane, shift);
      if (fit === null) this.decalPreview.hide();
      else this.decalPreview.show(fit.matrix, this.settings.color);
      return;
    }
    this.decalPreview.hide();
    this.showCursor(pane, pane === null ? null : this.pick(pane));
  }

  /**
   * Fits a decal volume to the surface under the pointer: the face, or with
   * Shift the whole brush or copy.
   *
   * @param pane Viewport.
   * @param shift Shift state, or undefined to read it from the editor.
   * @returns World matrix and a name for what it covers, or null.
   */
  private decalFitAt(
    pane: EditorViewportPickContext,
    shift?: boolean,
  ): { matrix: THREE.Matrix4; label: string } | null {
    const surface = this.surfaceAt(pane);
    if (surface === null) return null;
    const { model, source } = surface;
    const authored = model.findBrush(source.brushId);
    if (authored === undefined) return null;
    let brush = authored.brush;
    let toWorld: THREE.Matrix4;
    let label = authored.name;
    if (source.derivedId !== undefined) {
      const copy = modifierStackDerivedByRoot.get(model.root)?.get(source.derivedId);
      if (copy === undefined) return null;
      brush = copy.brush;
      model.root.updateWorldMatrix(true, false);
      toWorld = model.root.matrixWorld.clone();
      label = `a copy of ${authored.name}`;
    } else {
      toWorld = paintWorldToBrush(model, authored, new THREE.Matrix4()).invert();
    }
    const whole = shift ?? this.editor?.getLatchedModifierFlags()?.shiftKey === true;
    const matrix = paintDecalFit({ brush, surfaceIndex: source.surfaceIndex, toWorld }, whole ? 'object' : 'surface');
    return matrix === null ? null : { matrix, label };
  }

  /**
   * Places a decal volume fitted to the surface under the pointer, selects it
   * and returns to drawing.
   *
   * @param pane Viewport.
   */
  private placeDecal(pane: EditorViewportPickContext): void {
    const services = this.editor?.getServices();
    const fit = this.decalFitAt(pane);
    if (fit === null) {
      services?.setStatusMessage('Decals fit to solid surfaces');
      return;
    }
    const parent = this.host.worldObject();
    const volume = paintDecalVolumeCreate(fit.matrix, parent, this.settings.color);
    this.host.commandStack().push(new CommandModifierVolumeCreate(volume, parent));
    this.settings.setMode(this.settings.drawMode);
    this.decalPreview.hide();
    this.host.selectObject?.(volume);
    this.cursor.pulse(false);
    services?.setStatusMessage(`${volume.name} placed on ${fit.label} · pick its image in the Inspector`);
  }

  /** Updates the cursor look from the settings. */
  private refreshLook(): void {
    const style = this.settings.style();
    this.cursor.setLook({
      mode: this.settings.mode,
      color: this.settings.color,
      opacity: this.settings.opacity,
      hardness: this.settings.hardness,
      shape: style.shape,
      image: style.shape === PAINT_SHAPE_IMAGE_ID ? this.host.images.image(style.stampTextureId) : null,
    });
    if (this.stroke === null && this.editor !== null) this.refreshHover();
  }

  /**
   * Starts a stroke at a hit.
   *
   * @param pane Viewport the stroke is drawn in.
   * @param hit First surface hit.
   */
  private beginStroke(pane: EditorViewportPickContext, hit: PaintToolHit): void {
    const brushes = new Map<string, { model: SolidModel; brush: SolidBrushInstance }>();
    const targets: PaintStrokeTarget[] = [];
    for (const model of SolidModelRegistry.collectUnder(this.host.worldObject())) {
      if (!this.isShown(model.getResultMesh())) continue;
      for (const brush of model.getBrushes()) {
        const target = this.targetFor(model, brush);
        if (target === null) continue;
        brushes.set(target.key, { model, brush });
        targets.push(target);
      }
    }
    const style = this.settings.style();
    const stroke: PaintToolStroke = {
      builder: new PaintStrokeBuilder(style, targets, paintStrokeIdCreate),
      pane,
      brushes,
      stamp: paintShapeFind(style.shape).stamp || style.shape === PAINT_SHAPE_IMAGE_ID,
    };
    this.stroke = stroke;
    this.addPoint(stroke, hit);
  }

  /**
   * Describes a brush as a stroke target.
   *
   * @param model Model.
   * @param brush Brush.
   * @returns Target, or null when the brush is hidden or has no bounds.
   */
  private targetFor(model: SolidModel, brush: SolidBrushInstance): PaintStrokeTarget | null {
    const mesh = brush.mesh;
    if (mesh !== null && !mesh.visible) return null;
    const worldBounds = new THREE.Box3();
    if (mesh !== null) {
      mesh.geometry.computeBoundingBox();
      const box = mesh.geometry.boundingBox;
      if (box === null || box.isEmpty()) return null;
      mesh.updateWorldMatrix(true, false);
      worldBounds.copy(box).applyMatrix4(mesh.matrixWorld);
    } else {
      model.root.updateWorldMatrix(true, false);
      worldBounds.copy(brush.getModelSpaceBounds()).applyMatrix4(model.root.matrixWorld);
    }
    return {
      key: paintBrushKey(model, brush),
      worldToLocal: paintWorldToBrush(model, brush, new THREE.Matrix4()),
      worldBounds,
      order: brush.paint.nextOrder(),
    };
  }

  /**
   * Extends a stroke to the pointer.
   *
   * @param stroke Stroke.
   */
  private extendStroke(stroke: PaintToolStroke): void {
    const hit = this.pick(stroke.pane);
    if (hit === null) {
      stroke.builder.lift();
      this.cursor.hide();
      return;
    }
    this.addPoint(stroke, hit);
  }

  /**
   * Adds a surface point to a stroke and refreshes the live preview.
   *
   * @param stroke Stroke.
   * @param hit Surface hit.
   */
  private addPoint(stroke: PaintToolStroke, hit: PaintToolHit): void {
    const viewUp = new THREE.Vector3(0, 1, 0).applyQuaternion(stroke.pane.camera.quaternion);
    const placed = stroke.builder.addPoint(hit.point, hit.normal, viewUp);
    this.showCursor(stroke.pane, hit, stroke.stamp ? placed.at(-1)?.up : undefined);
    if (placed.length === 0) return;
    this.cursor.pulse(stroke.stamp);
    this.refreshPreview(stroke);
  }

  /**
   * Shows every record of a stroke as a preview on its brush.
   *
   * @param stroke Stroke.
   */
  private refreshPreview(stroke: PaintToolStroke): void {
    const system = this.host.paintSystem();
    if (system === null) return;
    const byKey = new Map<string, ReturnType<PaintStrokeBuilder['recordsFor']>>();
    for (const record of stroke.builder.records()) {
      const list = byKey.get(record.target.key) ?? [];
      list.push(record.stroke);
      byKey.set(record.target.key, list);
    }
    for (const [key, strokes] of byKey) {
      const entry = stroke.brushes.get(key);
      if (entry !== undefined) system.previewSet(entry.model, entry.brush, strokes);
    }
  }

  /** Commits the current stroke as one undo step. */
  private commitStroke(): void {
    const stroke = this.stroke;
    if (stroke === null) return;
    if (stroke.builder.finish().length > 0) this.cursor.pulse(stroke.stamp);
    this.stroke = null;
    const placements: PaintStrokePlacement[] = [];
    for (const record of stroke.builder.records()) {
      const entry = stroke.brushes.get(record.target.key);
      if (entry === undefined) continue;
      placements.push({
        model: entry.model,
        brushId: entry.brush.id,
        stroke: { ...record.stroke, dabs: record.stroke.dabs.slice() },
      });
    }
    if (placements.length > 0) {
      this.host.commandStack().push(new CommandPaintStrokes(placements));
      if (this.settings.mode === 'paint') this.settings.rememberColor(this.settings.color);
    }
    this.host.paintSystem()?.previewClear();
  }

  /**
   * Starts the stroke a missed press was waiting for once the drag reaches a
   * surface.
   */
  private beginArmedStroke(): void {
    const pane = this.paneAtPointer();
    const hit = pane === null ? null : this.pick(pane);
    if (pane === null || hit === null) return;
    this.armed = false;
    this.beginStroke(pane, hit);
  }

  /** Drops the current stroke without committing it. */
  private cancelStroke(): void {
    this.armed = false;
    if (this.stroke === null) return;
    this.stroke = null;
    this.host.paintSystem()?.previewClear();
  }

  /**
   * Picks the shown color at a hit.
   *
   * @param hit Surface hit.
   */
  private pickColor(hit: PaintToolHit): void {
    paintPickBaseColor(hit.mesh, hit.faceIndex, hit.point, this.baseSample);
    const painted =
      this.host.paintSystem()?.sampleAt(hit.model, hit.brush, hit.surfaceIndex, hit.point, this.sample) === true;
    const color = paintPickCombine(this.baseSample, painted ? this.sample : null);
    this.settings.setColor(color);
    this.settings.rememberColor(color);
    this.cursor.pulse(false);
    if (this.settings.mode === 'pick') this.settings.setMode(this.settings.drawMode);
    this.editor?.getServices()?.setStatusMessage(`Picked #${color.toString(16).padStart(6, '0').toUpperCase()}`);
  }
}
