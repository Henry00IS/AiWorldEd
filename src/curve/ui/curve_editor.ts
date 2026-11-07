import type { Curve } from '@/curve/model/curve_model.js';
import type { CurvePreset } from '@/curve/model/curve_preset.js';
import { MenuKeyboardCapture, type MenuKeyboardCaptureOwner } from '@/ui/menu/menu_keyboard_capture.js';
import { MenuOutsidePointerClose } from '@/ui/menu/menu_outside_pointer_close.js';
import { PanelFloating } from '@/ui/floating_panel/panel_floating.js';
import { applyFloatingPanelToolChrome } from '@/ui/floating_panel/panel_floating_tool_chrome.js';
import { createFloatingPanelResizeGrip } from '@/ui/floating_panel/panel_floating_resize.js';
import { doesElementContainEventTarget } from '@/utils/dom_node_realm.js';
import { curveFilePick, curveFileSave } from './curve_file_io.js';
import { CurveEditorFooter } from './curve_editor_footer.js';
import { CurveEditorInteraction } from './curve_editor_interaction.js';
import { curveEditorKeyAction } from './curve_editor_keys.js';
import { curveEditorRender } from './curve_editor_render.js';
import { CurveEditorSession } from './curve_editor_session.js';
import { CurveEditorToolbar } from './curve_editor_toolbar.js';
import { CurveEditorView } from './curve_editor_view.js';

/** What an open curve editor edits and whom it tells. */
export interface CurveEditorOptions {
  /** Window title. */
  title: string;
  /** Element the editor belongs to; clicks on it do not close the editor. */
  anchor: HTMLElement;
  /**
   * Identity of the edited value; a rebuilt field with the same key takes the
   * editor over.
   */
  key?: string;
  /** Curve to edit. */
  curve: Curve;
  /** Presets offered in the menu. */
  presets: readonly CurvePreset[];
  /** Default file name for Save. */
  fileName: string;
  /** True opens with x running up. */
  rotated?: boolean;
  /** Receives drag steps, at most once per frame. */
  onPreview: (curve: Curve) => void;
  /** Receives final changes. */
  onCommit: (curve: Curve) => void;
  /** Called after the editor closed. */
  onClose?: (rotated: boolean) => void;
}

/** Callbacks a rebuilt field hands to the open editor. */
export type CurveEditorHandlers = Pick<CurveEditorOptions, 'onPreview' | 'onCommit' | 'onClose'>;

/** Outer size of a newly opened editor in pixels. */
const CURVE_EDITOR_SIZE = { width: 600, height: 440 } as const;

/** Smallest size the resize grip allows in pixels. */
const CURVE_EDITOR_MIN_SIZE = { width: 420, height: 300 } as const;

/** Gap between the docked editor and the inspector in pixels. */
const CURVE_EDITOR_DOCK_GAP_PX = 6;

/** Class of the inspector panel the editor docks beside. */
const CURVE_EDITOR_DOCK_SELECTOR = '.editor-properties-panel';

/** The one open curve editor, if any. */
let curveEditorActive: CurveEditor | null = null;

/** Closes the open curve editor, such as when the selection changes. */
export function curveEditorCloseActive(): void {
  curveEditorActive?.close();
}

/**
 * Hands the open editor of a value over to its rebuilt field, so an inspector
 * re-render keeps the editor open and attached.
 *
 * @param key Identity of the edited value.
 * @param anchor New field element.
 * @param handlers New field callbacks.
 * @returns The editor taken over, or null.
 */
export function curveEditorReattach(
  key: string,
  anchor: HTMLElement,
  handlers: CurveEditorHandlers,
): CurveEditor | null {
  if (!curveEditorActive || curveEditorActive.key !== key) return null;
  curveEditorActive.reattach(anchor, handlers);
  return curveEditorActive;
}

/**
 * Returns the open editor of an anchor.
 *
 * @param anchor Field element.
 * @returns Editor, or null.
 */
export function curveEditorActiveFor(anchor: HTMLElement): CurveEditor | null {
  return curveEditorActive?.anchor === anchor ? curveEditorActive : null;
}

/**
 * Curve editor tool window, built on the standard floating window: title bar
 * drag, close button, status bar with the resize grip, stacking and screen
 * clamping. It opens docked beside the inspector and closes on Escape, on a
 * press outside it and its field, and when the selection changes.
 */
export class CurveEditor extends PanelFloating implements MenuKeyboardCaptureOwner {
  anchor: HTMLElement;
  readonly key: string | undefined;
  readonly closesOnBlur = false;
  readonly session: CurveEditorSession;
  private handlers: CurveEditorHandlers;
  private readonly canvas: HTMLCanvasElement;
  private readonly view = new CurveEditorView();
  private readonly toolbar: CurveEditorToolbar;
  private readonly footer: CurveEditorFooter;
  private readonly interaction: CurveEditorInteraction;
  private readonly keyboard = new MenuKeyboardCapture();
  private readonly outside = new MenuOutsidePointerClose();
  private readonly resizeObserver: ResizeObserver | null;
  private redrawQueued = false;
  private previewQueued: Curve | null = null;
  private picking = false;
  private closed = false;

  /**
   * Opens an editor, closing any other.
   *
   * @param options Editor options.
   * @returns Open editor.
   */
  static open(options: CurveEditorOptions): CurveEditor {
    curveEditorCloseActive();
    const editor = new CurveEditor(options);
    curveEditorActive = editor;
    editor.begin();
    return editor;
  }

  /**
   * Builds the window.
   *
   * @param options Editor options.
   */
  private constructor(options: CurveEditorOptions) {
    super(options.anchor.ownerDocument.body, { corner: 'top-left' });
    this.anchor = options.anchor;
    this.key = options.key;
    this.handlers = options;
    this.view.rotated = options.rotated === true;
    this.session = new CurveEditorSession(options.curve, {
      onPreview: (curve) => this.previewQueue(curve),
      onCommit: (curve) => this.commit(curve),
      onState: () => this.stateChanged(),
    });
    this.canvas = document.createElement('canvas');
    this.toolbar = new CurveEditorToolbar(this.session, options.presets, this.toolbarActions(), options.fileName);
    this.footer = new CurveEditorFooter(this.session);
    this.interaction = new CurveEditorInteraction(this.canvas, this.view, this.session, () => this.redraw());
    this.populate(options.title);
    this.resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => this.layout(false));
  }

  /**
   * Returns the window element.
   *
   * @returns Root element.
   */
  getElement(): HTMLElement {
    return this.root;
  }

  /** Closes on Escape, unless a file picker is open. */
  requestClose(): void {
    if (!this.picking) this.close();
  }

  /**
   * Moves the editor to a rebuilt field of the same value.
   *
   * @param anchor New field element.
   * @param handlers New field callbacks.
   */
  reattach(anchor: HTMLElement, handlers: CurveEditorHandlers): void {
    this.anchor = anchor;
    this.handlers = handlers;
  }

  /**
   * Runs a keyboard shortcut.
   *
   * @param event Key press the capture consumed.
   */
  navigate(event: KeyboardEvent): void {
    curveEditorKeyAction(event, this.session, { frameAll: () => this.frameAll(), rotate: () => this.rotate() });
    this.redraw();
  }

  /**
   * Shows a curve changed elsewhere.
   *
   * @param curve New curve.
   */
  adopt(curve: Curve): void {
    this.session.adopt(curve);
    this.redraw();
  }

  /** Closes the window, flushing a pending preview as a commit. */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.session.dragEnd();
    this.keyboard.end();
    this.outside.end();
    this.resizeObserver?.disconnect();
    this.dispose();
    if (curveEditorActive === this) curveEditorActive = null;
    this.handlers.onClose?.(this.view.rotated);
  }

  /** Shows the window docked beside the inspector and starts listening. */
  private begin(): void {
    const ownerWindow = this.anchor.ownerDocument.defaultView ?? window;
    this.show();
    this.dock(ownerWindow);
    this.keyboard.begin(ownerWindow, this);
    this.outside.begin(
      ownerWindow,
      (target) => this.isInside(target),
      () => this.close(),
    );
    this.root.addEventListener('keydown', (event) => this.fieldEscape(event));
    this.resizeObserver?.observe(this.canvas.parentElement ?? this.root);
    this.layout(true);
  }

  /**
   * Returns whether a press lands on the editor or its field.
   *
   * @param target Event target.
   * @returns True inside.
   */
  private isInside(target: EventTarget | null): boolean {
    if (doesElementContainEventTarget(this.root, target)) return true;
    return this.anchor.isConnected && doesElementContainEventTarget(this.anchor, target);
  }

  /**
   * Closes on Escape from a closed dropdown or number field of the window,
   * which the keyboard capture leaves to the control. An open dropdown takes
   * Escape itself first.
   *
   * @param event Key press inside the window.
   */
  private fieldEscape(event: KeyboardEvent): void {
    if (!MenuKeyboardCapture.isEscapeKeyEvent(event) || event.defaultPrevented) return;
    event.preventDefault();
    event.stopPropagation();
    this.close();
  }

  /**
   * Docks the window against the left edge of the inspector, top aligned, or
   * beside its field when there is no inspector.
   *
   * @param ownerWindow Window that hosts the editor.
   */
  private dock(ownerWindow: Window): void {
    const panel = this.anchor.closest<HTMLElement>(CURVE_EDITOR_DOCK_SELECTOR) ?? this.anchor;
    const rect = panel.getBoundingClientRect();
    const { width, height } = CURVE_EDITOR_SIZE;
    const fitsLeft = rect.left - width - CURVE_EDITOR_DOCK_GAP_PX >= CURVE_EDITOR_DOCK_GAP_PX;
    const left = fitsLeft ? rect.left - width - CURVE_EDITOR_DOCK_GAP_PX : rect.right + CURVE_EDITOR_DOCK_GAP_PX;
    const top = Math.min(rect.top, ownerWindow.innerHeight - height - CURVE_EDITOR_DOCK_GAP_PX);
    this.setTopLeftPosition(Math.max(CURVE_EDITOR_DOCK_GAP_PX, left), Math.max(CURVE_EDITOR_DOCK_GAP_PX, top));
    this.clampToScreen();
  }

  /**
   * Fills the window: title bar, toolbar, canvas, point row, status bar and
   * resize grip.
   *
   * @param title Window title.
   */
  private populate(title: string): void {
    this.root.dataset['curveEditor'] = 'true';
    applyFloatingPanelToolChrome(this.root, {
      width: `${CURVE_EDITOR_SIZE.width}px`,
      height: `${CURVE_EDITOR_SIZE.height}px`,
      minWidth: `${CURVE_EDITOR_MIN_SIZE.width}px`,
      minHeight: `${CURVE_EDITOR_MIN_SIZE.height}px`,
      borderBox: true,
      overflowHidden: true,
    });
    this.root.style.color = '#ffffff';
    const bar = this.createStandardTitleBar({ titleText: title, flexShrinkZero: true, onClose: () => this.close() });
    const parts = [bar.bar, this.toolbar.getElement(), this.createCanvasHost(), this.footer.getElement()];
    this.root.append(...parts, this.footer.getStatusElement(), this.createResizeGrip());
  }

  /**
   * Builds the box the canvas fills; the canvas follows it while resizing.
   *
   * @returns Canvas host.
   */
  private createCanvasHost(): HTMLElement {
    const host = document.createElement('div');
    Object.assign(host.style, { position: 'relative', flex: '1', minHeight: '0', margin: '0 8px' });
    Object.assign(this.canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%' });
    Object.assign(this.canvas.style, { cursor: 'crosshair', borderRadius: '3px' });
    host.appendChild(this.canvas);
    return host;
  }

  /**
   * Builds the standard southeast resize grip.
   *
   * @returns Grip element.
   */
  private createResizeGrip(): HTMLElement {
    return createFloatingPanelResizeGrip(this.root, {
      minWidth: CURVE_EDITOR_MIN_SIZE.width,
      minHeight: CURVE_EDITOR_MIN_SIZE.height,
      place: (left, top) => this.setTopLeftPosition(left, top),
      done: () => this.clampToScreen(),
    });
  }

  /**
   * Sizes the canvas to its box and the screen density and draws at once, so
   * the graph never blanks while the window resizes.
   *
   * @param frame True also fits the curve into view.
   */
  private layout(frame: boolean): void {
    if (this.closed) return;
    const width = this.canvas.clientWidth || CURVE_EDITOR_SIZE.width - 16;
    const height = this.canvas.clientHeight || CURVE_EDITOR_SIZE.height - 150;
    const ratio = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(1, Math.round(width * ratio));
    this.canvas.height = Math.max(1, Math.round(height * ratio));
    this.view.resize(width, height);
    if (frame) this.view.frameAll();
    this.draw();
  }

  /** Draws on the next frame. */
  private redraw(): void {
    if (this.redrawQueued || this.closed) return;
    this.redrawQueued = true;
    requestAnimationFrame(() => {
      this.redrawQueued = false;
      if (!this.closed) this.draw();
    });
  }

  /** Draws the canvas and updates the footer. */
  private draw(): void {
    const context = this.canvas.getContext('2d');
    this.footer.refresh(this.interaction.cursor);
    if (!context) return;
    const ratio = this.canvas.width / Math.max(1, this.view.size().width);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    const snapStep = this.session.snapOn ? this.session.snapStep : 0;
    const scene = {
      curve: this.session.curve,
      selection: this.session.selection,
      hover: this.interaction.hover,
      snapStep,
    };
    curveEditorRender(context, this.view, scene);
  }

  /**
   * Sends a drag step on the next frame.
   *
   * @param curve Dragged curve.
   */
  private previewQueue(curve: Curve): void {
    this.redraw();
    if (this.previewQueued) return void (this.previewQueued = curve);
    this.previewQueued = curve;
    requestAnimationFrame(() => {
      const pending = this.previewQueued;
      this.previewQueued = null;
      if (pending && !this.closed) this.handlers.onPreview(pending);
    });
  }

  /**
   * Sends a final change.
   *
   * @param curve Final curve.
   */
  private commit(curve: Curve): void {
    this.previewQueued = null;
    this.handlers.onCommit(curve);
    this.redraw();
  }

  /** Refreshes controls after selection, history or snap changes. */
  private stateChanged(): void {
    this.toolbar.refresh();
    this.redraw();
  }

  /** Fits the curve into view. */
  private frameAll(): void {
    this.view.frameAll();
    this.redraw();
  }

  /** Turns the view by 90 degrees and fits it again. */
  private rotate(): void {
    this.view.rotated = !this.view.rotated;
    this.frameAll();
  }

  /**
   * Returns the toolbar's editor actions.
   *
   * @returns Actions.
   */
  private toolbarActions(): ConstructorParameters<typeof CurveEditorToolbar>[2] {
    return {
      frameAll: () => this.frameAll(),
      rotate: () => this.rotate(),
      save: (name) => void this.save(name),
      load: () => void this.load(),
      redraw: () => this.redraw(),
    };
  }

  /**
   * Saves the curve and reports where.
   *
   * @param name File name.
   */
  private async save(name: string): Promise<void> {
    try {
      this.footer.message(await curveFileSave(this.session.curve, name, this.anchor.ownerDocument));
    } catch {
      this.footer.message('Saving the curve failed.');
    }
  }

  /** Loads a curve file picked by the user, keeping the editor open meanwhile. */
  private async load(): Promise<void> {
    this.picking = true;
    const result = await curveFilePick(this.anchor.ownerDocument);
    this.picking = false;
    if (!result) return;
    if ('error' in result) return this.footer.message(result.error);
    this.session.replace(result.curve);
    this.footer.message(`Loaded ${result.name || 'curve'}`);
  }
}
