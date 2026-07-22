import * as THREE from 'three';
import { GridSnap } from '../transform/grid_snap.js';
import { SnapManager } from '../transform/snap_manager.js';
import { updateGridDivisions } from '../viewports/grid_updater.js';
import { Viewport3D } from '../viewports/viewport_3d.js';
import { Viewport2D } from '../viewports/viewport_2d.js';
import { Toolbar } from '../ui/toolbar.js';
import { StatusBar } from '../ui/status_bar.js';
import { KeyboardShortcutHandler } from './keyboard_shortcut_handler.js';
import { TextureLockSettings } from '../texture/texture_lock_settings.js';

/**
 * Dependencies for snap interval, snap toggle, and texture lock controls.
 */
export interface SnapSettingsControllerDependencies {
  gridSnap: GridSnap;
  snapManager: SnapManager;
  textureLock: TextureLockSettings;
  toolbar: Toolbar;
  statusBar: StatusBar | null;
  keyboardShortcutHandler: KeyboardShortcutHandler;
  worldObject: THREE.Group;
  viewport2DTop: Viewport2D;
  viewport2DFront: Viewport2D;
  viewport2DSide: Viewport2D;
  viewport3D: Viewport3D;
  getUserSnapEnabled: () => boolean;
  setUserSnapEnabled: (enabled: boolean) => void;
}

/**
 * Owns snap interval changes, snap toggle, texture lock, and grid refresh.
 */
export class SnapSettingsController {
  private deps: SnapSettingsControllerDependencies;

  /**
   * Creates a snap settings controller.
   * @param deps Shared editor systems used by snap controls.
   */
  constructor(deps: SnapSettingsControllerDependencies) {
    this.deps = deps;
  }

  /**
   * Wires SnapManager change notifications and keyboard interval shortcuts.
   */
  setup(): void {
    this.deps.snapManager.onIntervalChanged((interval) => {
      this.onSnapIntervalChanged(interval);
    });
    this.bindSnapKeyboardShortcuts();
    this.onSnapIntervalChanged(this.deps.snapManager.getInterval());
  }

  /**
   * Toggles user snap preference and refreshes toolbar/status UI.
   */
  onToggleSnap(): void {
    const next = !this.deps.getUserSnapEnabled();
    this.deps.setUserSnapEnabled(next);
    this.deps.gridSnap.setEnabled(next);
    const snapButtonIndex = this.deps.toolbar.getButtonIndexByLabel('Snap');
    this.deps.toolbar.setButtonActive(snapButtonIndex, next);
    this.deps.statusBar?.setSnapStatus(next);
  }

  /**
   * Toggles CSG-style texture lock for bounds resize and scale.
   * When on, UVs re-bake so texture density stays constant in world space.
   */
  onToggleTextureLock(): void {
    const locked = this.deps.textureLock.toggle();
    this.deps.toolbar.setButtonActiveByLabel('Tex Lock', locked);
    if (this.deps.statusBar) {
      this.deps.statusBar.setLastAction(
        locked
          ? 'Texture lock on (world density)'
          : 'Texture lock off (UVs stretch)'
      );
    }
  }

  /**
   * Cycles the snap interval to the next preset value.
   */
  onSnapIntervalForward(): void {
    this.deps.snapManager.cycleForward();
  }

  /**
   * Cycles the snap interval to the previous preset value.
   */
  onSnapIntervalBackward(): void {
    this.deps.snapManager.cycleBackward();
  }

  /**
   * Re-bakes world planar UVs on all content meshes when texture lock is on.
   * Used after undo/redo of scale and bounds so tiles stay consistent.
   */
  rebakeWorldTexturesIfLocked(): void {
    if (!this.deps.textureLock.isLocked()) return;
    const meshes: THREE.Mesh[] = [];
    this.deps.worldObject.traverse((child) => {
      if (child instanceof THREE.Mesh && child.geometry) {
        meshes.push(child);
      }
    });
    this.deps.textureLock.rebakeMeshesIfLocked(meshes);
  }

  /**
   * Handles snap interval change events by updating all dependent systems.
   * @param interval The new snap interval value.
   */
  private onSnapIntervalChanged(interval: number): void {
    this.deps.gridSnap.setInterval(interval);
    this.deps.statusBar?.setSnapInterval(interval);
    this.updateAllViewportGrids(interval);
  }

  /**
   * Updates the grid division count in all four viewports.
   * @param interval The new snap interval value.
   */
  private updateAllViewportGrids(interval: number): void {
    updateGridDivisions(this.deps.viewport2DTop.getGrid(), interval);
    updateGridDivisions(this.deps.viewport2DFront.getGrid(), interval);
    updateGridDivisions(this.deps.viewport2DSide.getGrid(), interval);
    updateGridDivisions(this.deps.viewport3D.getGrid(), interval);
  }

  /**
   * Binds keyboard shortcuts for snap interval cycling.
   */
  private bindSnapKeyboardShortcuts(): void {
    this.deps.keyboardShortcutHandler.setOnSnapIntervalForward(
      () => this.onSnapIntervalForward()
    );
    this.deps.keyboardShortcutHandler.setOnSnapIntervalBackward(
      () => this.onSnapIntervalBackward()
    );
  }
}
