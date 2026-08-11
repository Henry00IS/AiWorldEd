import * as THREE from 'three';
import type { PlayerCollisionWorld } from '@/player/collision/player_collision_world.js';
import type { PlayerSpawnState } from '@/player/player_spawn_state.js';
import type { PlayerFigurineMarker } from './player_figurine_marker.js';
import { playerFigurineBuildMesh, playerFigurineDispose } from './player_figurine_builder.js';

/** Drag-and-drop figurine placement over a perspective viewport. */
export class PlayerFigurinePlacement {
  private readonly spawnState: PlayerSpawnState;
  private readonly marker: PlayerFigurineMarker;
  private readonly collisionWorld: PlayerCollisionWorld;
  private readonly getPerspectiveViewport: () => PlayerFigurineViewport | null;
  private readonly onSpawnPlaced: (() => void) | null;
  private isDragging: boolean;
  private ghost: THREE.Group | null;
  private dragWindow: Window | null;
  private hadPlacedMarkerBeforeDrag: boolean;
  private readonly stashedFeetPosition: THREE.Vector3;
  private stashedYawRadians: number;
  private readonly raycaster: THREE.Raycaster;
  private readonly ndc: THREE.Vector2;
  private readonly scratchHit: THREE.Vector3;
  private readonly scratchDirection: THREE.Vector3;
  private readonly boundPointerMove: (event: PointerEvent) => void;
  private readonly boundPointerUp: (event: PointerEvent) => void;

  /**
   * Creates a placement controller.
   *
   * @param spawnState Shared spawn state.
   * @param marker World marker manager.
   * @param collisionWorld Collision world for ground hits.
   * @param getPerspectiveViewport Resolves the active/hovered perspective pane.
   * @param onSpawnPlaced Optional callback after a successful drop.
   */
  constructor(
    spawnState: PlayerSpawnState,
    marker: PlayerFigurineMarker,
    collisionWorld: PlayerCollisionWorld,
    getPerspectiveViewport: () => PlayerFigurineViewport | null,
    onSpawnPlaced: (() => void) | null = null,
  ) {
    this.spawnState = spawnState;
    this.marker = marker;
    this.collisionWorld = collisionWorld;
    this.getPerspectiveViewport = getPerspectiveViewport;
    this.onSpawnPlaced = onSpawnPlaced;
    this.isDragging = false;
    this.ghost = null;
    this.dragWindow = null;
    this.hadPlacedMarkerBeforeDrag = false;
    this.stashedFeetPosition = new THREE.Vector3();
    this.stashedYawRadians = 0;
    this.raycaster = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    this.scratchHit = new THREE.Vector3();
    this.scratchDirection = new THREE.Vector3();
    this.boundPointerMove = (event) => this.onPointerMove(event);
    this.boundPointerUp = (event) => this.onPointerUp(event);
  }

  /**
   * Begins a figurine drag from a toolbar button pointer down.
   *
   * @param event Pointer event from the button.
   */
  beginDrag(event: PointerEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = true;
    this.stashAndHideExistingMarker();
    if (!this.ghost) {
      this.ghost = playerFigurineBuildMesh();
      this.ghost.visible = false;
    }
    const viewport = this.getPerspectiveViewport();
    viewport?.getWorldGroup()?.add(this.ghost);
    this.dragWindow = resolveEventWindow(event);
    this.dragWindow.addEventListener('pointermove', this.boundPointerMove);
    this.dragWindow.addEventListener('pointerup', this.boundPointerUp);
  }

  /**
   * Returns whether a drag is currently active.
   *
   * @returns True while dragging the figurine.
   */
  getIsDragging(): boolean {
    return this.isDragging;
  }

  /** Cancels any active drag and removes the ghost. */
  cancelDrag(): void {
    const wasDragging = this.isDragging;
    this.endDragListeners();
    this.removeGhost();
    this.isDragging = false;
    if (wasDragging) {
      this.restoreStashedMarkerAfterFailedDrop();
    }
  }

  /** Disposes ghost resources and ends listeners. */
  dispose(): void {
    this.cancelDrag();
  }

  /**
   * Updates the ghost position while dragging.
   *
   * @param event Pointer move event.
   */
  private onPointerMove(event: PointerEvent): void {
    if (!this.isDragging || !this.ghost) {
      return;
    }
    const hit = this.raycastPlacement(event.clientX, event.clientY);
    if (!hit) {
      this.ghost.visible = false;
      return;
    }
    this.ghost.visible = true;
    this.ghost.position.copy(hit.feetPosition);
    this.ghost.rotation.set(0, hit.yawRadians, 0);
  }

  /**
   * Commits or cancels placement on pointer up.
   *
   * @param event Pointer up event.
   */
  private onPointerUp(event: PointerEvent): void {
    if (!this.isDragging) {
      return;
    }
    const hit = this.raycastPlacement(event.clientX, event.clientY);
    this.endDragListeners();
    this.removeGhost();
    this.isDragging = false;
    if (!hit) {
      this.restoreStashedMarkerAfterFailedDrop();
      return;
    }
    this.hadPlacedMarkerBeforeDrag = false;
    this.spawnState.placeSpawn(hit.feetPosition, hit.yawRadians);
    this.marker.showAt(hit.feetPosition, hit.yawRadians);
    this.onSpawnPlaced?.();
  }

  /** Hides the placed marker and stashes its pose for a failed drop restore. */
  private stashAndHideExistingMarker(): void {
    this.hadPlacedMarkerBeforeDrag = this.spawnState.hasSpawnPoint();
    if (!this.hadPlacedMarkerBeforeDrag) {
      return;
    }
    this.spawnState.copySpawnFeetPositionTo(this.stashedFeetPosition);
    this.stashedYawRadians = this.spawnState.getSpawnYawRadians();
    this.marker.hide();
  }

  /** Restores the previous marker only when a drag ends without a valid drop. */
  private restoreStashedMarkerAfterFailedDrop(): void {
    if (!this.hadPlacedMarkerBeforeDrag) {
      return;
    }
    this.spawnState.placeSpawn(this.stashedFeetPosition, this.stashedYawRadians);
    this.marker.showAt(this.stashedFeetPosition, this.stashedYawRadians);
    this.hadPlacedMarkerBeforeDrag = false;
    this.onSpawnPlaced?.();
  }

  /** Removes window-level drag listeners. */
  private endDragListeners(): void {
    if (!this.dragWindow) {
      return;
    }
    this.dragWindow.removeEventListener('pointermove', this.boundPointerMove);
    this.dragWindow.removeEventListener('pointerup', this.boundPointerUp);
    this.dragWindow = null;
  }

  /** Removes and disposes the ghost mesh. */
  private removeGhost(): void {
    if (!this.ghost) {
      return;
    }
    this.ghost.parent?.remove(this.ghost);
    playerFigurineDispose(this.ghost);
    this.ghost = null;
  }

  /**
   * Raycasts from the pointer into a perspective viewport for feet placement.
   *
   * @param clientX Pointer client X.
   * @param clientY Pointer client Y.
   * @returns Placement sample, or null when invalid.
   */
  private raycastPlacement(
    clientX: number,
    clientY: number,
  ): { feetPosition: THREE.Vector3; yawRadians: number } | null {
    const viewport = this.getPerspectiveViewport();
    if (!viewport) {
      return null;
    }
    const camera = viewport.getCamera();
    if (!(camera instanceof THREE.PerspectiveCamera)) {
      return null;
    }
    const pickElement = viewport.getContentElement();
    const rect = pickElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return null;
    }
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
      return null;
    }
    this.ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.ndc, camera);
    const hit = this.collisionWorld.raycastNearest(this.raycaster.ray.origin, this.raycaster.ray.direction, 5000);
    if (hit) {
      this.scratchHit.copy(hit.point);
    } else if (!intersectGroundPlane(this.raycaster.ray, this.scratchHit)) {
      return null;
    }
    camera.getWorldDirection(this.scratchDirection);
    const yaw = Math.atan2(this.scratchDirection.x, this.scratchDirection.z);
    return { feetPosition: this.scratchHit, yawRadians: yaw };
  }
}

/** Minimal viewport surface required for figurine placement. */
export interface PlayerFigurineViewport {
  getCamera(): THREE.Camera;
  getContentElement(): HTMLElement;
  getWorldGroup(): THREE.Group | null;
}

/**
 * Intersects a ray with the y=0 ground plane.
 *
 * @param ray World ray.
 * @param target Hit point destination.
 * @returns True when the plane is hit in front of the ray.
 */
function intersectGroundPlane(ray: THREE.Ray, target: THREE.Vector3): boolean {
  if (Math.abs(ray.direction.y) < 1e-8) {
    return false;
  }
  const distance = -ray.origin.y / ray.direction.y;
  if (distance < 0) {
    return false;
  }
  target.copy(ray.origin).addScaledVector(ray.direction, distance);
  return true;
}

/**
 * Resolves the window that owns a pointer event.
 *
 * @param event Pointer event.
 * @returns Owner window.
 */
function resolveEventWindow(event: PointerEvent): Window {
  const view = event.view;
  if (view) {
    return view;
  }
  return window;
}
