import { ThemeCss } from '@/ui/theme/theme_ui_css_variables.js';
import { SolidScriptDialog } from '../solid_script_dialog.js';
import {
  SOLID_SCRIPT_NORMAL_PICK_HELP,
  SolidScriptNormalPickView,
  type SolidScriptNormalPickHovered,
  type SolidScriptNormalPickSurface,
} from './solid_script_normal_pick_view.js';

/** What the picker opens over and where its pick goes. */
export interface SolidScriptNormalPickWindowOptions {
  /** Element the window mounts in. */
  host: HTMLElement;
  /** Window it opens over, such as the configurator, or null. */
  parent: SolidScriptDialog | null;
  /** Writes the picked direction into the field. */
  write: (text: string) => void;
  /** Builds the rendering surface; tests give one that draws nothing. */
  surface?: SolidScriptNormalPickSurface;
}

/**
 * Window with a small 3D view of a 26-faced shape on the floor grid. Each face
 * is coloured by the axes it points along and labelled, such as +X or +X+Y 45°;
 * a click on a face writes the way it points into the field and closes.
 * Dragging orbits the view; Escape or Cancel closes without writing.
 */
export class SolidScriptNormalPickWindow extends SolidScriptDialog {
  private readonly view = document.createElement('div');
  private readonly status = document.createElement('div');
  private picker: SolidScriptNormalPickView | null = null;
  private picked = '';

  /**
   * Builds the window.
   *
   * @param options Where it opens and where the pick goes.
   */
  constructor(private readonly options: SolidScriptNormalPickWindowOptions) {
    super(options.host, 'Pick Normal', 'Use Normal', options.parent);
    this.root.dataset['solidScriptNormalPick'] = '';
    this.root.setAttribute('aria-label', 'Pick Normal');
    this.view.dataset['normalPickView'] = '';
    this.view.tabIndex = 0;
    this.view.setAttribute('aria-label', 'Shape with one face per normal');
    Object.assign(this.view.style, {
      position: 'relative',
      height: '280px',
      borderRadius: '4px',
      overflow: 'hidden',
      cursor: 'pointer',
      touchAction: 'none',
      outline: 'none',
    });
    this.status.setAttribute('aria-live', 'polite');
    Object.assign(this.status.style, { margin: '8px 0 12px', color: ThemeCss.mutedTextColor, minHeight: '16px' });
    this.status.textContent = SOLID_SCRIPT_NORMAL_PICK_HELP;
    this.content.append(this.view, this.status, this.buttonRow());
    this.confirmEnable(false);
  }

  /** Builds the 3D view once the window is on the page, so it has a size. */
  protected override onAfterShow(): void {
    this.picker ??= new SolidScriptNormalPickView(
      this.view,
      (face) => this.statusShow(face),
      (text) => this.use(text),
      this.options.surface,
    );
  }

  /**
   * Shows the face under the pointer, and remembers its normal for Use Normal.
   *
   * @param face Face under the pointer, or null for none.
   */
  private statusShow(face: SolidScriptNormalPickHovered | null): void {
    this.status.textContent = face ? `${face.label}: ${face.normal}` : SOLID_SCRIPT_NORMAL_PICK_HELP;
    if (face) this.picked = face.normal;
    this.confirmEnable(this.picked !== '');
  }

  /**
   * Writes a clicked face's normal and closes.
   *
   * @param text Normal as field text.
   */
  private use(text: string): void {
    this.picked = text;
    this.confirmEnable(true);
    this.confirmRequest();
  }

  /**
   * Writes the last face's normal.
   *
   * @returns True to close.
   */
  protected confirm(): boolean {
    if (this.picked === '') return false;
    this.options.write(this.picked);
    return true;
  }

  /** Writes nothing. */
  protected cancel(): void {}

  /** Releases the 3D view with the window. */
  protected override onAfterHide(): void {
    super.onAfterHide();
    this.picker?.dispose();
    this.picker = null;
  }
}
