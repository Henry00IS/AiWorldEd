import type { Vector2 } from 'three';
import * as THREE from 'three';
import { Tool } from '@/editor/tools/tool.js';
import { OverlayLoopCutPreview } from '@/edit/overlay/overlay_loop_cut_preview.js';
import type { EditEdgeParameterHit } from '@/edit/pick/edit_edge_parameter_pick.js';
import { previewTopologyLoopCut, type TopologyLoopCutPreview } from '@/edit/topology/topology_loop_cut.js';
import {
  createTopologyLoopCutLockedBelt,
  type TopologyLoopCutLockedBelt,
} from '@/edit/topology/topology_loop_cut_belt.js';
import { loadWorkingGeometryFromTarget } from '@/edit/topology/topology_commit.js';
import type { LoopCutBeltParameterRange } from '@/edit/topology/topology_loop_cut_belt_range.js';
import { findEditDomainTargetById, resolveTopologyEditTarget } from '@/edit/topology/topology_target_resolve.js';
import type { LoopCutLockedSeed } from './edit_loop_cut_slide.js';
import { chooseLoopCutPreviewToShow, resolveLoopCutSlideParameter } from './edit_loop_cut_slide_resolve.js';

/**
 * Single-use loop cut: hover an edge, click to lock that belt, move to slide,
 * then click or Enter to cut, select the new loop, and return to the previous
 * tool.
 */
export class EditLoopCutTool extends Tool {
  private preview: OverlayLoopCutPreview | null;
  private hoverHit: EditEdgeParameterHit | null;
  private lockedSeed: LoopCutLockedSeed | null;
  private lockedBelt: TopologyLoopCutLockedBelt | null;
  private hoverBelt: TopologyLoopCutLockedBelt | null;
  private lastHoverEdgeKey: string | null;
  private lastPreview: TopologyLoopCutPreview | null;
  private slideParameter: number;
  private lastValidParameter: number;
  private finished: boolean;

  /** Creates the loop-cut tool. */
  constructor() {
    super();
    this.preview = null;
    this.hoverHit = null;
    this.lockedSeed = null;
    this.lockedBelt = null;
    this.hoverBelt = null;
    this.lastHoverEdgeKey = null;
    this.lastPreview = null;
    this.slideParameter = 0.5;
    this.lastValidParameter = 0.5;
    this.finished = false;
  }

  /** Called when the tool is activated. */
  override onActivate(): void {
    this.finished = false;
    this.clearLoopCutTransientState();
    this.publishLoopCutHoverStatus();
  }

  /** Called when the tool is deactivated. */
  override onDeactivate(): void {
    this.markLoopCutFinished();
    this.disposePreview();
    this.clearLoopCutTransientState();
  }

  /** Clears hover, lock, and slide state without reopening the session. */
  private clearLoopCutTransientState(): void {
    this.hoverHit = null;
    this.lockedSeed = null;
    this.lockedBelt = null;
    this.hoverBelt = null;
    this.lastHoverEdgeKey = null;
    this.lastPreview = null;
    this.slideParameter = 0.5;
    this.lastValidParameter = 0.5;
  }

  /** Marks the session finished so input can return to the parent tool. */
  private markLoopCutFinished(): void {
    this.finished = true;
  }

  /** Publishes the hover instruction. */
  private publishLoopCutHoverStatus(): void {
    this.editor
      ?.getServices()
      ?.setStatusMessage('Loop Cut: hover an edge, click to lock the belt, then slide · Esc cancels');
  }

  /**
   * Returns whether the loop cut still owns input.
   *
   * @returns True until commit or cancel, and only while this tool is active.
   */
  override isBusy(): boolean {
    if (!this.isSingleUse || this.finished) {
      return false;
    }
    const activeTool = this.editor?.activeTool ?? null;
    if (activeTool && activeTool !== this) {
      return false;
    }
    return true;
  }

  /** Called each frame to refresh the yellow loop. */
  override onRender(): void {
    if (this.lockedSeed) {
      this.refreshLockedSlide();
      return;
    }
    this.refreshHoverFromEditorPointer();
  }

  /**
   * Called when the tool receives a mouse down event.
   *
   * @param button Mouse button index.
   */
  override onMouseDown(button: number): void {
    if (button !== 0 || this.finished) {
      return;
    }
    this.handleConfirmClick();
  }

  /**
   * Called when the tool receives a key.
   *
   * @param keyCode Key code.
   * @param _event Keyboard event.
   * @returns True when handled.
   */
  override onKeyDown(keyCode: string, _event?: KeyboardEvent): boolean {
    if (keyCode === 'Enter' && this.lockedSeed) {
      this.commitSlide();
      return true;
    }
    if (keyCode !== 'Escape') {
      return false;
    }
    this.returnToParentTool();
    return true;
  }

  /**
   * Unused mouse move hook; hover is sampled from the editor pointer in render.
   *
   * @param _screenDelta Screen delta.
   * @param _gridDelta Grid delta.
   */
  override onMouseMove(_screenDelta: Vector2, _gridDelta: Vector2): void {}

  /**
   * Returns the client X written by the latest mouse movement.
   *
   * @returns Client X.
   */
  private readLoopCutPointerClientX(): number {
    if (!this.editor) {
      return 0;
    }
    return this.editor.mousePosition.x;
  }

  /**
   * Returns the client Y written by the latest mouse movement.
   *
   * @returns Client Y.
   */
  private readLoopCutPointerClientY(): number {
    if (!this.editor) {
      return 0;
    }
    return this.editor.mousePosition.y;
  }

  /** Samples the pointer and updates hover preview before the belt is locked. */
  private refreshHoverFromEditorPointer(): void {
    if (!this.editor) {
      return;
    }
    const hit = this.editor
      .getServices()
      ?.pickEditEdgeParameter?.(
        this.readLoopCutPointerClientX(),
        this.readLoopCutPointerClientY(),
        this.editor.lastPointerOwnerDocument,
      );
    if (!hit) {
      this.clearUnlockedHover();
      return;
    }
    this.forgetHoverBeltIfEdgeChanged(hit);
    if (this.showHoverHit(this.hitWithResolvedParameter(hit))) {
      return;
    }
    if (this.isSameHoverEdge(hit)) {
      return;
    }
    this.clearUnlockedHover();
  }

  /**
   * Tries to show a hover hit and remembers it when the belt is valid.
   *
   * @param hit Candidate hover hit.
   * @returns True when the preview was accepted.
   */
  private showHoverHit(hit: EditEdgeParameterHit): boolean {
    this.hoverHit = hit;
    return this.updateLoopPreviewFromSeed(hit);
  }

  /** Clears hover state when no valid belt is under the pointer. */
  private clearUnlockedHover(): void {
    this.hoverHit = null;
    this.forgetHoverBelt();
    this.updateLoopPreviewFromSeed(null);
  }

  /** Updates the slide parameter on the locked edge only. */
  private refreshLockedSlide(): void {
    const seed = this.lockedSeed;
    const belt = this.lockedBelt;
    const services = this.editor?.getServices();
    if (!seed || !belt || !this.editor || !services?.projectLockedLoopCutParameter) {
      return;
    }
    this.applyProjectedSlideParameter(seed, belt, services.projectLockedLoopCutParameter);
    this.updateLoopPreviewFromSeed(this.lockedPreviewHit());
  }

  /**
   * Resolves a camera-ray parameter onto the locked belt.
   *
   * @param seed Locked seed edge.
   * @param belt Locked belt.
   * @param project Pointer-to-parameter projector.
   */
  private applyProjectedSlideParameter(
    seed: LoopCutLockedSeed,
    belt: TopologyLoopCutLockedBelt,
    project: (
      clientX: number,
      clientY: number,
      worldA: THREE.Vector3,
      worldB: THREE.Vector3,
      ownerDocument?: Document | null,
    ) => number | null,
  ): void {
    if (!this.editor) {
      return;
    }
    const projected = project(
      this.readLoopCutPointerClientX(),
      this.readLoopCutPointerClientY(),
      seed.worldA,
      seed.worldB,
      this.editor.lastPointerOwnerDocument,
    );
    if (projected === null) {
      return;
    }
    const snapped = this.snapParameter(seed.worldA, seed.worldB, projected, belt.parameterRange);
    this.slideParameter = resolveLoopCutSlideParameter(projected, snapped, belt.parameterRange);
  }

  /** Starts slide on the hovered belt or commits the locked slide. */
  private handleConfirmClick(): void {
    if (this.lockedSeed) {
      this.commitSlide();
      return;
    }
    if (!this.hoverHit) {
      this.editor?.getServices()?.setStatusMessage('Hover an edge that can form a loop');
      return;
    }
    this.lockHoveredBelt();
  }

  /** Locks the hovered edge so later motion only slides that belt. */
  private lockHoveredBelt(): void {
    const hit = this.hoverHit;
    if (!hit) {
      return;
    }
    const belt = this.buildLockedBeltFromHit(hit);
    if (!belt) {
      this.editor?.getServices()?.setStatusMessage('Hover an edge that can form a loop');
      return;
    }
    this.assignLockedBelt(hit, belt);
  }

  /**
   * Stores the locked seed, belt, and starting slide parameter.
   *
   * @param hit Hover hit that produced the belt.
   * @param belt Locked belt.
   */
  private assignLockedBelt(hit: EditEdgeParameterHit, belt: TopologyLoopCutLockedBelt): void {
    this.lockedSeed = {
      targetId: hit.targetId,
      vertexA: hit.vertexA,
      vertexB: hit.vertexB,
      worldA: hit.worldA.clone(),
      worldB: hit.worldB.clone(),
    };
    this.lockedBelt = belt;
    this.slideParameter = hit.parameter;
    this.lastValidParameter = hit.parameter;
    this.editor
      ?.getServices()
      ?.setStatusMessage('Loop Cut: slide along the locked belt · click or Enter confirms · Esc cancels');
  }

  /**
   * Builds a locked belt from a hover hit.
   *
   * @param hit Hover hit.
   * @returns Locked belt, or null.
   */
  private buildLockedBeltFromHit(hit: EditEdgeParameterHit): TopologyLoopCutLockedBelt | null {
    const target = this.resolveHitTarget(hit.targetId);
    if (!target) {
      return null;
    }
    const geometry = loadWorkingGeometryFromTarget(target);
    const previewData = previewTopologyLoopCut(geometry, hit.vertexA, hit.vertexB, hit.parameter);
    if (!previewData) {
      return null;
    }
    return createTopologyLoopCutLockedBelt(previewData.crossings, hit.vertexA, hit.vertexB, geometry);
  }

  /**
   * Commits the locked loop cut and returns to the previous tool when it
   * applies.
   */
  private commitSlide(): void {
    if (!this.applyLockedLoopCut()) {
      return;
    }
    this.returnToParentTool();
  }

  /**
   * Applies the locked loop cut.
   *
   * @returns True when the cut was applied.
   */
  private applyLockedLoopCut(): boolean {
    const seed = this.lockedSeed;
    const services = this.editor?.getServices();
    if (!seed || !services?.loopCutEditEdge) {
      return false;
    }
    return services.loopCutEditEdge(
      seed.targetId,
      seed.vertexA,
      seed.vertexB,
      this.lastValidParameter,
      this.lockedBelt?.edges,
    );
  }

  /** Returns input to the tool that launched this loop cut. */
  private returnToParentTool(): void {
    this.markLoopCutFinished();
    const parent = this.parent;
    if (!this.editor || !parent) {
      return;
    }
    this.editor.switchTool(parent);
  }

  /**
   * Snaps an edge parameter to grid planes the edge crosses. Shift disables
   * snap.
   *
   * @param worldA Edge start.
   * @param worldB Edge end.
   * @param parameter Unsnapped parameter.
   * @param range Belt window, or null before a belt exists.
   * @returns Snapped parameter, or the original when snapping is unavailable.
   */
  private snapParameter(
    worldA: THREE.Vector3,
    worldB: THREE.Vector3,
    parameter: number,
    range: LoopCutBeltParameterRange | null,
  ): number {
    const snap = this.editor?.getServices()?.snapEditLoopCutParameter;
    if (!snap || !this.editor) {
      return parameter;
    }
    return snap(worldA, worldB, parameter, this.editor.isShiftPressed === true, range);
  }

  /**
   * Returns a copy of a hover hit with snap and belt-range applied.
   *
   * @param hit Hover hit.
   * @returns Resolved hit.
   */
  private hitWithResolvedParameter(hit: EditEdgeParameterHit): EditEdgeParameterHit {
    const range = this.hoverBelt?.parameterRange ?? null;
    const snapped = this.snapParameter(hit.worldA, hit.worldB, hit.parameter, range);
    const parameter = range ? resolveLoopCutSlideParameter(hit.parameter, snapped, range) : snapped;
    return { ...hit, parameter, worldPoint: hit.worldA.clone().lerp(hit.worldB, parameter) };
  }

  /**
   * Builds a preview hit from the locked seed and current slide parameter.
   *
   * @returns Preview hit, or null.
   */
  private lockedPreviewHit(): EditEdgeParameterHit | null {
    const seed = this.lockedSeed;
    if (!seed) {
      return null;
    }
    return {
      targetId: seed.targetId,
      vertexA: seed.vertexA,
      vertexB: seed.vertexB,
      parameter: this.slideParameter,
      worldPoint: seed.worldA.clone().lerp(seed.worldB, this.slideParameter),
      edgeDirection: seed.worldB.clone().sub(seed.worldA),
      worldA: seed.worldA,
      worldB: seed.worldB,
    };
  }

  /**
   * Updates the yellow loop from a seed hit.
   *
   * @param hit Edge hit, or null.
   * @returns True when a new valid preview was recorded.
   */
  private updateLoopPreviewFromSeed(hit: EditEdgeParameterHit | null): boolean {
    if (!hit) {
      this.hideUnlockedPreview();
      return false;
    }
    const target = this.resolveHitTarget(hit.targetId);
    if (!target) {
      this.hideUnlockedPreview();
      return false;
    }
    return this.refreshPreviewForTarget(hit, target);
  }

  /**
   * Rebuilds the overlay for one topology target.
   *
   * @param hit Seed hit.
   * @param target Topology target.
   * @returns True when a new valid preview was recorded.
   */
  private refreshPreviewForTarget(
    hit: EditEdgeParameterHit,
    target: NonNullable<ReturnType<typeof resolveTopologyEditTarget>>,
  ): boolean {
    const geometry = loadWorkingGeometryFromTarget(target);
    const nextPreview = previewTopologyLoopCut(
      geometry,
      hit.vertexA,
      hit.vertexB,
      hit.parameter,
      this.activeBeltEdges(),
    );
    const chosen = chooseLoopCutPreviewToShow(nextPreview, this.lastPreview, this.shouldKeepLastPreview(hit));
    this.applyChosenLoopPreview(chosen, geometry, target);
    this.rememberHoverBeltFromPreview(hit, nextPreview, geometry);
    return this.recordValidPreview(nextPreview, hit.parameter);
  }

  /**
   * Remembers a newly computed preview and its parameter.
   *
   * @param nextPreview Newly computed preview, or null.
   * @param parameter Parameter that produced it.
   * @returns True when the preview is valid.
   */
  private recordValidPreview(nextPreview: TopologyLoopCutPreview | null, parameter: number): boolean {
    if (!nextPreview) {
      return false;
    }
    this.lastPreview = nextPreview;
    this.lastValidParameter = parameter;
    return true;
  }

  /**
   * Shows a chosen preview or hides the overlay when unlocked.
   *
   * @param chosen Preview to show, or null.
   * @param geometry Working geometry.
   * @param target Topology target.
   */
  private applyChosenLoopPreview(
    chosen: TopologyLoopCutPreview | null,
    geometry: ReturnType<typeof loadWorkingGeometryFromTarget>,
    target: NonNullable<ReturnType<typeof resolveTopologyEditTarget>>,
  ): void {
    if (!chosen) {
      this.hideUnlockedPreview();
      return;
    }
    this.ensurePreview()?.setLoop(geometry, chosen.crossings, this.resolveTargetWorldMatrix(target));
  }

  /** Hides the overlay only before the belt is locked. */
  private hideUnlockedPreview(): void {
    if (this.lockedSeed || this.hoverBelt) {
      return;
    }
    this.preview?.clear();
    this.lastPreview = null;
  }

  /**
   * Returns the locked or hovered belt edges used for remapping.
   *
   * @returns Belt edges, or undefined before a belt exists.
   */
  private activeBeltEdges(): TopologyLoopCutLockedBelt['edges'] | undefined {
    return this.lockedBelt?.edges ?? this.hoverBelt?.edges;
  }

  /**
   * Returns whether a failed rebuild should keep the last loop.
   *
   * @param hit Current seed hit.
   * @returns True when the belt is locked or the hover edge is unchanged.
   */
  private shouldKeepLastPreview(hit: EditEdgeParameterHit): boolean {
    return this.lockedSeed !== null || this.isSameHoverEdge(hit);
  }

  /**
   * Stores a hover belt from the first valid preview of an edge.
   *
   * @param hit Current hit.
   * @param preview Newly computed preview, or null.
   * @param geometry Working geometry.
   */
  private rememberHoverBeltFromPreview(
    hit: EditEdgeParameterHit,
    preview: TopologyLoopCutPreview | null,
    geometry: ReturnType<typeof loadWorkingGeometryFromTarget>,
  ): void {
    if (this.lockedBelt || this.hoverBelt || !preview) {
      return;
    }
    this.hoverBelt = createTopologyLoopCutLockedBelt(preview.crossings, hit.vertexA, hit.vertexB, geometry);
    this.lastHoverEdgeKey = this.hoverEdgeKey(hit);
  }

  /**
   * Drops the hover belt when the pointer moves to a different edge.
   *
   * @param hit Current hover hit.
   */
  private forgetHoverBeltIfEdgeChanged(hit: EditEdgeParameterHit): void {
    if (this.lastHoverEdgeKey && !this.isSameHoverEdge(hit)) {
      this.forgetHoverBelt();
    }
  }

  /** Clears the hover-only belt. */
  private forgetHoverBelt(): void {
    this.hoverBelt = null;
    this.lastHoverEdgeKey = null;
  }

  /**
   * Returns whether a hit is the same undirected edge as the last hover belt.
   *
   * @param hit Candidate hit.
   * @returns True when the edge identity matches.
   */
  private isSameHoverEdge(hit: EditEdgeParameterHit): boolean {
    return this.lastHoverEdgeKey === this.hoverEdgeKey(hit);
  }

  /**
   * Builds an identity key for a hovered edge.
   *
   * @param hit Edge hit.
   * @returns Target and undirected endpoint key.
   */
  private hoverEdgeKey(hit: EditEdgeParameterHit): string {
    const first = Math.min(hit.vertexA, hit.vertexB);
    const second = Math.max(hit.vertexA, hit.vertexB);
    return `${hit.targetId}:${first}:${second}`;
  }

  /**
   * Resolves a topology target from the open edit session.
   *
   * @param targetId Target id.
   * @returns Target, or null.
   */
  private resolveHitTarget(targetId: string): ReturnType<typeof resolveTopologyEditTarget> {
    const session = this.editor?.getServices()?.getEditSession?.();
    if (!session) {
      return null;
    }
    const domain = findEditDomainTargetById(session.getDomain(), targetId);
    if (!domain) {
      return null;
    }
    return resolveTopologyEditTarget(domain);
  }

  /**
   * Builds a local-to-world matrix for a target.
   *
   * @param target Topology target.
   * @returns World matrix.
   */
  private resolveTargetWorldMatrix(target: NonNullable<ReturnType<typeof resolveTopologyEditTarget>>): THREE.Matrix4 {
    if (target.kind === 'mesh') {
      target.mesh.updateMatrixWorld(true);
      return target.mesh.matrixWorld.clone();
    }
    const instance = target.solidModel.findBrush(target.brushId);
    target.solidModel.root.updateMatrixWorld(true);
    if (!instance) {
      return target.solidModel.root.matrixWorld.clone();
    }
    return target.solidModel.root.matrixWorld.clone().multiply(instance.getLocalMatrix());
  }

  /**
   * Ensures the loop overlay exists.
   *
   * @returns Preview, or null.
   */
  private ensurePreview(): OverlayLoopCutPreview | null {
    if (this.preview) {
      return this.preview;
    }
    const scene = this.editor?.getServices()?.getPrimaryScene?.();
    if (!scene) {
      return null;
    }
    this.preview = new OverlayLoopCutPreview(scene);
    return this.preview;
  }

  /** Disposes the loop overlay. */
  private disposePreview(): void {
    this.preview?.dispose();
    this.preview = null;
  }
}
