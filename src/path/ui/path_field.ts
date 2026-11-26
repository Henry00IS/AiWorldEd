import { pathAssetDecode, PATH_ASSET_DEFAULT, type PathAsset } from '@/path/model/path_asset.js';
import {
  pathFileNameOf,
  pathFileNameReadable,
  pathFileRead,
  pathFileWrite,
  PATH_FILE_EXTENSION,
} from '@/path/model/path_file.js';
import { downloadTextFile } from '@/io/dialog/manager_file_dialog.js';
import { projectFileRead } from '@/project/project_file_access.js';
import { PANEL_PROJECT_PATH_DRAG_TYPE } from '@/project/ui/panel_project_drag.js';
import { modifierStackUiTextButton, modifierStackUiToggleRow } from '@/modifier/stack/ui/modifier_stack_ui_style.js';
import { pathAssetClosedSet } from '@/path/model/path_asset_edit.js';
import { PATH_POINT_PANEL_NONE, PathPointPanel, type PathPointPanelSelection } from './path_point_panel.js';

/** What a path field shows and whom it tells. */
export interface PathFieldOptions {
  /** Caption and file name for Save. */
  label: string;
  /** Receives a path opened from a file or dropped on the field. */
  onCommit: (path: PathAsset) => void;
}

/**
 * A Path input in the inspector: a summary of the path, Closed, the settings of
 * the point selected in the scene, Save Path and Open Path buttons, and a drop
 * target for .aipath files from the project or the desktop. Points are drawn,
 * picked and moved in the scene, never typed in as a list.
 */
export class PathField {
  /** Field element. */
  private readonly element = document.createElement('div');
  /** Summary line. */
  private readonly summary = document.createElement('div');
  /** Why the last file could not be opened, or empty. */
  private readonly message = document.createElement('div');
  /** Closed checkbox. */
  private readonly closed = document.createElement('input');
  /** Selected points or stretches. */
  private readonly point: PathPointPanel;
  /** Path shown. */
  private path: PathAsset = PATH_ASSET_DEFAULT;
  /** Selected points and stretches. */
  private selected: PathPointPanelSelection = PATH_POINT_PANEL_NONE;

  /**
   * Builds the field.
   *
   * @param options Field options.
   */
  constructor(private readonly options: PathFieldOptions) {
    this.summary.dataset['pathSummary'] = 'true';
    this.message.setAttribute('role', 'status');
    this.closed.type = 'checkbox';
    this.closed.setAttribute('aria-label', 'Closed');
    this.closed.addEventListener('change', () => options.onCommit(pathAssetClosedSet(this.path, this.closed.checked)));
    this.point = new PathPointPanel(options.onCommit);
    this.element.append(
      this.summary,
      modifierStackUiToggleRow('Closed', this.closed, 'Joins the last point back to the first'),
      this.point.getElement(),
      this.buttons(),
      this.message,
    );
    this.element.addEventListener('dragover', (event) => event.preventDefault());
    this.element.addEventListener('drop', (event) => void this.dropped(event));
  }

  /**
   * Builds the Save Path and Open Path buttons.
   *
   * @returns Button row.
   */
  private buttons(): HTMLElement {
    const row = document.createElement('div');
    Object.assign(row.style, { display: 'flex', gap: '4px' });
    const { label } = this.options;
    row.append(
      modifierStackUiTextButton('Save Path', `Save ${label} as a .${PATH_FILE_EXTENSION} file`, () => this.save()),
      modifierStackUiTextButton('Open Path', `Open a .${PATH_FILE_EXTENSION} file into ${label}`, () => this.open()),
    );
    return row;
  }

  /**
   * Returns the field element.
   *
   * @returns Element.
   */
  getElement(): HTMLElement {
    return this.element;
  }

  /**
   * Shows the path stored as text; text without a path shows the default.
   *
   * @param text Stored text.
   */
  setText(text: string): void {
    this.setPath(pathAssetDecode(text) ?? PATH_ASSET_DEFAULT);
  }

  /**
   * Shows a path.
   *
   * @param path Path.
   */
  setPath(path: PathAsset): void {
    this.path = path;
    this.summary.textContent = pathFieldSummary(this.path);
    this.closed.checked = this.path.closed;
    this.point.show(this.path, this.selected);
  }

  /**
   * Shows the settings of the points or stretches selected in the scene, or
   * hides them when nothing is selected.
   *
   * @param selected Selected points and stretches.
   */
  setSelected(selected: PathPointPanelSelection): void {
    this.selected = selected;
    this.point.show(this.path, selected);
  }

  /** Offers the path as a .aipath download. */
  private save(): void {
    downloadTextFile(
      pathFileWrite(this.path, this.options.label),
      pathFileNameOf(this.options.label),
      'application/json',
    );
  }

  /** Asks for a .aipath file and opens it into the input. */
  private open(): void {
    const picker = document.createElement('input');
    picker.type = 'file';
    picker.accept = `.${PATH_FILE_EXTENSION}`;
    picker.addEventListener('change', () => void this.opened(picker.files?.[0] ?? null));
    picker.click();
  }

  /**
   * Opens a dropped project or desktop .aipath file into the input.
   *
   * @param event Drop event.
   */
  private async dropped(event: DragEvent): Promise<void> {
    event.preventDefault();
    const projectPath = event.dataTransfer?.getData(PANEL_PROJECT_PATH_DRAG_TYPE) ?? '';
    const file = projectPath ? await projectFileRead(projectPath) : (event.dataTransfer?.files?.[0] ?? null);
    await this.opened(file);
  }

  /**
   * Reads a .aipath file into the input.
   *
   * @param file File, or null when none was given.
   */
  private async opened(file: File | null): Promise<void> {
    if (!file) return;
    const read = pathFileNameReadable(file.name)
      ? pathFileRead(await file.text())
      : { error: `Only .${PATH_FILE_EXTENSION} files fit here.` };
    this.message.textContent = 'error' in read ? read.error : '';
    if (!('error' in read)) this.options.onCommit(read.path);
  }
}

/**
 * Describes a path in a few words, such as 4 Points · Closed · 2 Arcs.
 *
 * @param path Path.
 * @returns Summary.
 */
export function pathFieldSummary(path: PathAsset): string {
  const counts = new Map<string, number>();
  for (const segment of path.segments) counts.set(segment.kind, (counts.get(segment.kind) ?? 0) + 1);
  const kinds = [...counts].map(([kind, count]) => `${count} ${kind}`);
  return [`${path.points.length} Points`, path.closed ? 'Closed' : 'Open', ...kinds].join(' · ');
}
