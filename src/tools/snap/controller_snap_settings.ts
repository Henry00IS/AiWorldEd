import * as THREE from 'three';
import { GridSnap } from '@/transform/snap/grid_snap.js';
import { ManagerSnap } from '@/transform/snap/manager_snap.js';
import { updateGridDivisions } from '@/viewports/grid/grid_updater.js';
import type { ViewportEditor } from '@/viewports/core/viewport_editor.js';
import { Toolbar } from '@/ui/toolbar/toolbar.js';
import { StatusBar } from '@/ui/status/status_bar.js';
import { HandlerKeyboardShortcut } from '@/input/handler_keyboard_shortcut.js';
import { TextureLockSettings } from '@/texture/lock/texture_lock_settings.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { ManagerProjectedGrid } from '@/viewports/grid/projected/manager_projected_grid.js';

/** Dependencies for snap interval, snap toggle, and texture lock controls. */
export interface ControllerSnapSettingsDependencies {
  gridSnap: GridSnap;
  snapManager: ManagerSnap;
  textureLock: TextureLockSettings;
  toolbar: Toolbar;
  statusBar: StatusBar | null;
  keyboardShortcutHandler: HandlerKeyboardShortcut;
  worldObject: THREE.Group;
  getViewports: () => readonly ViewportEditor[];
  getUserSnapEnabled: () => boolean;
  setUserSnapEnabled: (enabled: boolean) => void;
  /** Optional hook when the snap interval changes. */
  onSnapIntervalChanged?: (interval: number) => void;
}

/** Owns snap interval changes, snap toggle, texture lock, and grid refresh. */
export class ControllerSnapSettings {
  private deps: ControllerSnapSettingsDependencies;

  /**
   * Creates a snap settings controller.
   *
   * @param deps Dependencies for snap interval, snap toggle, and texture lock
   *   controls.
   */
  constructor(deps: ControllerSnapSettingsDependencies) {
    this.deps = deps;
  }

  /** Wires SnapManager change notifications and keyboard interval shortcuts. */
  setup(): void {
    this.deps.snapManager.onIntervalChanged((interval) => {
      this.onSnapIntervalChanged(interval);
    });
    this.bindSnapKeyboardShortcuts();
    this.onSnapIntervalChanged(this.deps.snapManager.getInterval());
  }

  /** Toggles user snap preference and refreshes toolbar/status UI. */
  onToggleSnap(): void {
    const next = !this.deps.getUserSnapEnabled();
    this.deps.setUserSnapEnabled(next);
    this.deps.gridSnap.setEnabled(next);
    const snapButtonIndex = this.deps.toolbar.getButtonIndexByLabel('Snap');
    this.deps.toolbar.setButtonActive(snapButtonIndex, next);
    this.deps.statusBar?.setSnapStatus(next);
  }

  /**
   * Toggles position lock: UVs stick when moving/rotating objects and brushes.
   * Off = world-slide. Toggle never rewrites UVs by itself.
   */
  onTogglePositionLock(): void {
    const locked = this.deps.textureLock.togglePositionLock();
    this.deps.toolbar.setButtonActiveByLabel('Pos Lock', locked);
    this.syncSolidUvStickHints();
    if (this.deps.statusBar) {
      this.deps.statusBar.setLastAction(
        locked ? 'Position lock on (UVs stick on move/rotate)' : 'Position lock off (world slide)',
      );
    }
  }

  /**
   * Toggles stretch lock: UVs stretch when scaling objects and brushes. Off =
   * world tile density. Toggle never rewrites UVs by itself.
   */
  onToggleStretchLock(): void {
    const locked = this.deps.textureLock.toggleStretchLock();
    this.deps.toolbar.setButtonActiveByLabel('Stretch Lock', locked);
    this.syncSolidUvStickHints();
    if (this.deps.statusBar) {
      this.deps.statusBar.setLastAction(
        locked ? 'Stretch lock on (UVs stretch on scale)' : 'Stretch lock off (tile density)',
      );
    }
  }

  /**
   * Toggles both position and stretch texture locks together and refreshes
   * toolbar and status UI.
   */
  onToggleTextureLock(): void {
    const locked = this.deps.textureLock.toggle();
    this.deps.toolbar.setButtonActiveByLabel('Pos Lock', this.deps.textureLock.isPositionLocked());
    this.deps.toolbar.setButtonActiveByLabel('Stretch Lock', this.deps.textureLock.isStretchLocked());
    this.syncSolidUvStickHints();
    if (this.deps.statusBar) {
      this.deps.statusBar.setLastAction(locked ? 'Texture locks on' : 'Texture locks off (world slide / density)');
    }
  }

  /** Updates solid models with a legacy stick hint from either lock. No remesh. */
  private syncSolidUvStickHints(): void {
    const flags = this.deps.textureLock.getFlags();
    const stick = flags.positionLock || flags.stretchLock;
    this.deps.worldObject.traverse((child) => {
      const model = SolidModel.fromObject(child);
      if (!model) return;
      model.setUvStickToBrush(stick);
    });
  }

  /** Cycles the snap interval to the next preset value. */
  onSnapIntervalForward(): void {
    this.deps.snapManager.cycleForward();
  }

  /** Cycles the snap interval to the previous preset value. */
  onSnapIntervalBackward(): void {
    this.deps.snapManager.cycleBackward();
  }

  /**
   * Collects meshes under the world object and rebakes content-mesh UVs when
   * both texture locks are off.
   */
  rebakeWorldTexturesIfLocked(): void {
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
   *
   * @param interval The new snap interval value.
   */
  private onSnapIntervalChanged(interval: number): void {
    this.deps.gridSnap.setInterval(interval);
    this.deps.statusBar?.setSnapInterval(interval);
    this.updateAllViewportGrids(interval);
    ManagerProjectedGrid.setCellSize(interval);
    this.deps.onSnapIntervalChanged?.(interval);
  }

  /**
   * Updates the grid division count in every live viewport.
   *
   * @param interval The new snap interval value.
   */
  private updateAllViewportGrids(interval: number): void {
    this.deps.getViewports().forEach((viewport) => {
      updateGridDivisions(viewport.getGrid(), interval);
    });
  }

  /** Binds keyboard shortcuts for snap interval cycling. */
  private bindSnapKeyboardShortcuts(): void {
    this.deps.keyboardShortcutHandler.setOnSnapIntervalForward(() => this.onSnapIntervalForward());
    this.deps.keyboardShortcutHandler.setOnSnapIntervalBackward(() => this.onSnapIntervalBackward());
  }
}
