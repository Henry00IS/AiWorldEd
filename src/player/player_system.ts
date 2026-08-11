import * as THREE from 'three';
import type { ManagerInput } from '@/input/manager_input.js';
import type { EditorWindow } from '@/editor/window/editor_window.js';
import type { Viewport3D } from '@/viewports/core/viewport_3d.js';
import type { ViewportEditor } from '@/viewports/core/viewport_editor.js';
import { PlayerSpawnState } from './player_spawn_state.js';
import { PlayerCollisionWorld } from './collision/player_collision_world.js';
import { PlayerFigurineMarker } from './figurine/player_figurine_marker.js';
import { PlayerFigurinePlacement } from './figurine/player_figurine_placement.js';
import { PlayerPlaySession } from './session/player_play_session.js';
import { PlayerPlayTool } from './tool/player_play_tool.js';
import { playerFigurineCreateToolbarButton, playerFigurineSetButtonActive } from './ui/player_figurine_button.js';
import { playerCharacterEnsureModelLoaded } from './character/player_character_model_loader.js';

/** Host surface used to wire the player system into the editor layout. */
export interface PlayerSystemHost {
  worldRoot: THREE.Object3D;
  inputManager: ManagerInput;
  getEditorWindow: () => EditorWindow | null;
  getPerspectiveViewports: () => readonly Viewport3D[];
  getInteractiveViewports: () => readonly ViewportEditor[];
  showStatusMessage: (message: string) => void;
}

/** Self-contained play-mode system: figurine placement, Space enter, ESC exit. */
export class PlayerSystem {
  private readonly host: PlayerSystemHost;
  private readonly spawnState: PlayerSpawnState;
  private readonly collisionWorld: PlayerCollisionWorld;
  private readonly figurineMarker: PlayerFigurineMarker;
  private readonly placement: PlayerFigurinePlacement;
  private readonly session: PlayerPlaySession;
  private readonly playTool: PlayerPlayTool;
  private readonly toolbarButtons: HTMLButtonElement[];
  private isDisposed: boolean;

  /**
   * Creates the player system and wires figurine buttons onto viewports.
   *
   * @param host Layout host dependencies.
   */
  constructor(host: PlayerSystemHost) {
    this.host = host;
    this.spawnState = new PlayerSpawnState();
    this.collisionWorld = new PlayerCollisionWorld();
    this.collisionWorld.setWorldRoot(host.worldRoot);
    this.figurineMarker = new PlayerFigurineMarker(host.worldRoot);
    this.placement = new PlayerFigurinePlacement(
      this.spawnState,
      this.figurineMarker,
      this.collisionWorld,
      () => this.resolvePlacementViewport(),
      () => this.refreshButtonActiveState(),
    );
    this.session = new PlayerPlaySession({
      inputManager: host.inputManager,
      worldRoot: host.worldRoot,
      spawnState: this.spawnState,
      figurineMarker: this.figurineMarker,
      collisionWorld: this.collisionWorld,
      getPerspectiveViewports: () => host.getPerspectiveViewports(),
      showStatusMessage: (message) => host.showStatusMessage(message),
    });
    this.playTool = new PlayerPlayTool(this.session);
    this.toolbarButtons = [];
    this.isDisposed = false;
    this.installFigurineButtons();
    void playerCharacterEnsureModelLoaded();
  }

  /**
   * Handles a global keydown for entering play mode with Space.
   *
   * @param event Browser keyboard event.
   * @returns True when the event was consumed.
   */
  tryHandleGlobalKeyDown(event: KeyboardEvent): boolean {
    if (this.isDisposed) {
      return false;
    }
    if (this.session.getIsActive()) {
      return false;
    }
    if (event.code !== 'Space' && event.key !== ' ') {
      return false;
    }
    if (event.repeat) {
      return true;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) {
      return false;
    }
    return this.tryBeginPlayMode();
  }

  /** Reinstalls figurine buttons after viewport kind changes or detach. */
  refreshViewportChrome(): void {
    if (this.isDisposed) {
      return;
    }
    this.installFigurineButtons();
  }

  /**
   * Returns whether play mode is active.
   *
   * @returns True while playing.
   */
  getIsPlaying(): boolean {
    return this.session.getIsActive();
  }

  /** Disposes figurine UI, markers, and active play mode. */
  dispose(): void {
    if (this.isDisposed) {
      return;
    }
    this.isDisposed = true;
    if (this.session.getIsActive()) {
      this.session.exit();
    }
    this.session.dispose();
    this.placement.dispose();
    this.figurineMarker.dispose();
    this.removeFigurineButtons();
  }

  /**
   * Starts play mode as a single-use exclusive tool.
   *
   * @returns True when play mode started.
   */
  private tryBeginPlayMode(): boolean {
    const editorWindow = this.host.getEditorWindow();
    if (!editorWindow) {
      return false;
    }
    if (editorWindow.activeTool?.isBusy()) {
      return false;
    }
    if (!this.session.tryEnter()) {
      return false;
    }
    editorWindow.useTool(this.playTool);
    return true;
  }

  /** Clears the placed spawn and updates toolbar button state. */
  private clearSpawnFromButton(): void {
    if (this.session.getIsActive()) {
      return;
    }
    if (!this.spawnState.hasSpawnPoint()) {
      this.host.showStatusMessage('Drag the figurine into the scene to set a play spawn');
      return;
    }
    this.spawnState.clearSpawn();
    this.figurineMarker.clear();
    this.refreshButtonActiveState();
    this.host.showStatusMessage('Play spawn cleared — Space uses the current camera');
  }

  /** Installs figurine buttons next to each perspective viewport title. */
  private installFigurineButtons(): void {
    this.removeFigurineButtons();
    const viewports = this.host.getPerspectiveViewports();
    for (let index = 0; index < viewports.length; index++) {
      const viewport = viewports[index];
      if (!viewport) {
        continue;
      }
      this.installButtonOnViewport(viewport);
    }
    this.refreshButtonActiveState();
  }

  /**
   * Creates and inserts one figurine button on a perspective viewport toolbar.
   *
   * @param viewport Perspective viewport.
   */
  private installButtonOnViewport(viewport: Viewport3D): void {
    const toolbar = viewport.getViewportToolbar();
    const ownerDocument = toolbar.getElement().ownerDocument;
    const button = playerFigurineCreateToolbarButton(
      ownerDocument,
      (event) => this.placement.beginDrag(event),
      () => this.clearSpawnFromButton(),
    );
    toolbar.insertControlAfterTitle(button);
    this.toolbarButtons.push(button);
  }

  /** Removes previously installed figurine buttons from the DOM. */
  private removeFigurineButtons(): void {
    for (let index = 0; index < this.toolbarButtons.length; index++) {
      const button = this.toolbarButtons[index];
      button?.parentElement?.removeChild(button);
    }
    this.toolbarButtons.length = 0;
  }

  /** Syncs active styling on all figurine buttons from spawn state. */
  private refreshButtonActiveState(): void {
    const active = this.spawnState.hasSpawnPoint();
    for (let index = 0; index < this.toolbarButtons.length; index++) {
      const button = this.toolbarButtons[index];
      if (button) {
        playerFigurineSetButtonActive(button, active);
      }
    }
  }

  /**
   * Resolves a perspective viewport for figurine placement under the pointer.
   *
   * @returns Perspective viewport, or null.
   */
  private resolvePlacementViewport(): Viewport3D | null {
    const viewports = this.host.getPerspectiveViewports();
    return viewports[0] ?? null;
  }
}
