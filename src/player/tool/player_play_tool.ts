import { Vector2 } from 'three';
import { Tool } from '@/editor/tools/tool.js';
import { managerPointerLock } from '@/input/manager_pointer_lock.js';
import type { PlayerPlaySession } from '@/player/session/player_play_session.js';

/**
 * Single-use exclusive play tool. Pointer lock uses the shared counter; Escape
 * or browser unlock ends play mode.
 */
export class PlayerPlayTool extends Tool {
  private readonly session: PlayerPlaySession;
  private isExiting: boolean;
  private holdsPointerLock: boolean;
  private pickElement: HTMLElement | null;
  private lastViewToggleTimeMs: number;
  private readonly boundPointerMove: (event: PointerEvent) => void;
  private readonly boundPointerDown: (event: PointerEvent) => void;
  private readonly boundWheel: (event: WheelEvent) => void;
  private readonly boundContextMenu: (event: Event) => void;
  private readonly boundPointerLockChange: () => void;

  /**
   * Creates a play tool bound to a session.
   *
   * @param session Play session that owns simulation state.
   */
  constructor(session: PlayerPlaySession) {
    super();
    this.session = session;
    this.isExiting = false;
    this.holdsPointerLock = false;
    this.pickElement = null;
    this.lastViewToggleTimeMs = 0;
    this.boundPointerMove = (event) => this.onPointerMoveLocked(event);
    this.boundPointerDown = (event) => this.onPointerDown(event);
    this.boundWheel = (event) => this.onWheelLocked(event);
    this.boundContextMenu = (event) => {
      event.preventDefault();
      event.stopPropagation();
    };
    this.boundPointerLockChange = () => this.onPointerLockChange();
  }

  /** Activates sticky pointer lock and begins exclusive play input. */
  override onActivate(): void {
    this.isExiting = false;
    const viewport = this.session.getActiveViewport();
    this.pickElement = viewport?.getContentElement() ?? null;
    this.attachInputListeners();
    this.takePointerLock();
    this.pinExclusiveDomain();
  }

  /** Releases sticky pointer lock and detaches play listeners. */
  override onDeactivate(): void {
    this.detachInputListeners();
    this.dropPointerLock();
    if (this.session.getIsActive()) {
      this.session.exit();
    }
    this.pickElement = null;
  }

  /**
   * Returns whether the tool must keep exclusive focus.
   *
   * @returns True while play mode is active.
   */
  override isBusy(): boolean {
    return this.session.getIsActive() && !this.isExiting;
  }

  /**
   * Keeps RMB/MMB with this tool so the exclusive shield never starts fly/pan.
   *
   * @returns Always true for the play tool.
   */
  override suppressesViewportNavigation(): boolean {
    return true;
  }

  /** Advances the play session once per editor repaint. */
  override onRender(): void {
    if (!this.session.getIsActive()) {
      return;
    }
    this.session.updateFromRender();
  }

  /**
   * Handles Escape to leave play mode and consumes gameplay keys.
   *
   * @param keyCode Layout-stable key code.
   * @param _event Optional keyboard event.
   * @returns True when consumed.
   */
  override onKeyDown(keyCode: string, _event?: KeyboardEvent): boolean {
    if (keyCode === 'Escape') {
      this.exitToParent();
      return true;
    }
    return true;
  }

  /**
   * Toggles first/third person on right-click.
   *
   * @param button Mouse button index.
   */
  override onMouseDown(button: number): void {
    if (button === 2) {
      this.toggleViewModeOnce();
    }
  }

  /**
   * Ignores tool mouse-move routing; look uses pointer-lock movement.
   *
   * @param _screenDelta Unused screen delta.
   * @param _gridDelta Unused grid delta.
   */
  override onMouseMove(_screenDelta: Vector2, _gridDelta: Vector2): void {}

  /** Pins the active viewport as the exclusive interaction domain. */
  private pinExclusiveDomain(): void {
    const pickElement = this.pickElement;
    if (!pickElement) {
      return;
    }
    this.editor?.getServices()?.pinExclusiveViewport(pickElement);
  }

  /** Takes one shared pointer-lock ref for play look capture. */
  private takePointerLock(): void {
    if (!this.pickElement || this.holdsPointerLock) {
      return;
    }
    managerPointerLock.lock(this.pickElement);
    this.holdsPointerLock = true;
  }

  /** Drops this tool's shared pointer-lock ref when held. */
  private dropPointerLock(): void {
    if (!this.holdsPointerLock) {
      return;
    }
    this.holdsPointerLock = false;
    managerPointerLock.unlock();
  }

  /**
   * Ends play mode when the browser unlocks capture while play still holds a
   * ref.
   */
  private onPointerLockChange(): void {
    if (!this.holdsPointerLock || this.isExiting) {
      return;
    }
    if (managerPointerLock.isBrowserLocked()) {
      return;
    }
    this.exitToParent();
  }

  /**
   * Attaches look, click, wheel, and pointer-lock listeners on the play
   * viewport.
   */
  private attachInputListeners(): void {
    if (!this.pickElement) {
      return;
    }
    this.pickElement.addEventListener('pointermove', this.boundPointerMove);
    this.pickElement.addEventListener('pointerdown', this.boundPointerDown);
    this.pickElement.addEventListener('wheel', this.boundWheel, { passive: false });
    this.pickElement.addEventListener('contextmenu', this.boundContextMenu);
    this.pickElement.ownerDocument.addEventListener('contextmenu', this.boundContextMenu, true);
    this.pickElement.ownerDocument.addEventListener('pointerlockchange', this.boundPointerLockChange);
  }

  /** Removes look, click, wheel, and pointer-lock listeners. */
  private detachInputListeners(): void {
    if (!this.pickElement) {
      return;
    }
    this.pickElement.removeEventListener('pointermove', this.boundPointerMove);
    this.pickElement.removeEventListener('pointerdown', this.boundPointerDown);
    this.pickElement.removeEventListener('wheel', this.boundWheel);
    this.pickElement.removeEventListener('contextmenu', this.boundContextMenu);
    this.pickElement.ownerDocument.removeEventListener('contextmenu', this.boundContextMenu, true);
    this.pickElement.ownerDocument.removeEventListener('pointerlockchange', this.boundPointerLockChange);
  }

  /**
   * Applies look from pointer-lock movement deltas.
   *
   * @param event Pointer move event.
   */
  private onPointerMoveLocked(event: PointerEvent): void {
    if (!this.session.getIsActive() || this.isExiting) {
      return;
    }
    if (!this.holdsPointerLock) {
      return;
    }
    this.session.applyLookDelta(event.movementX, event.movementY);
  }

  /**
   * Handles right-click on the locked element for view-mode toggle.
   *
   * @param event Pointer down event.
   */
  private onPointerDown(event: PointerEvent): void {
    if (!this.session.getIsActive() || this.isExiting) {
      return;
    }
    if (event.button !== 2) {
      return;
    }
    event.preventDefault();
    this.toggleViewModeOnce();
  }

  /** Toggles first/third person at most once per short interval. */
  private toggleViewModeOnce(): void {
    const now = performance.now();
    if (now - this.lastViewToggleTimeMs < 80) {
      return;
    }
    this.lastViewToggleTimeMs = now;
    this.session.toggleViewMode();
  }

  /**
   * Zooms third-person distance from the mouse wheel.
   *
   * @param event Wheel event.
   */
  private onWheelLocked(event: WheelEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.session.applyWheel(event.deltaY);
  }

  /** Ends play mode and restores the parent editor tool. */
  private exitToParent(): void {
    if (this.isExiting) {
      return;
    }
    this.isExiting = true;
    this.detachInputListeners();
    this.dropPointerLock();
    this.session.exit();
    const parent = this.parent;
    if (parent && this.editor) {
      this.editor.switchTool(parent);
      return;
    }
    this.editor?.getServices()?.clearExclusiveViewport();
  }
}
