import { Theme } from '@/theme.js';
import { hexToRgb } from '@/utils/utils_color.js';
import { dialogCardButton, dialogCardStyle, dialogCardTitle } from '@/ui/dialog/dialog_card.js';
import { PanelFloating } from '@/ui/floating_panel/panel_floating.js';
import { showMessageBox } from '@/ui/dialog/dialog_message_box.js';
import { createSettingsSelect, createSettingsTextInput } from '@/ui/settings/settings_form_controls.js';
import type { EditorSettingsStore } from '@/settings/store/editor_settings_store.js';
import { exportTargetFind, exportTargetList, type ExportTarget } from '@/io/export/export_targets.js';
import type { FbxExportEncoding } from '@/io/fbx/fbx_export_types.js';
import { modelExportDownloadsDestination, type ModelExportDestination } from '@/io/export/model_export_destination.js';
import { IconFolderTree } from '@/ui/folder_tree/icon_folder_tree.js';
import {
  MODEL_EXPORT_FILE_NAME_DEFAULT,
  MODEL_EXPORT_FORMATS,
  MODEL_EXPORT_TEXTURE_MODE_LABELS,
  modelExportFileNameCheck,
  modelExportFolderCheck,
  modelExportFormatInfo,
  modelExportTextureMode,
  modelExportTextureModeDefault,
  type ModelExportFormat,
  type ModelExportSettings,
  type ModelExportTextureMode,
} from '@/io/export/model_export_options.js';

/** Options of the Export dialog. */
export interface ModelExportDialogOptions {
  host: HTMLElement;
  store: EditorSettingsStore;
  /**
   * Asks for a folder (null: cancelled); null when the browser has no folder
   * picker.
   */
  pickFolder: (() => Promise<ModelExportDestination | null>) | null;
  /** Folder the last export went to, chosen until another is picked. */
  folder?: ModelExportDestination | null;
  /** Suggested file name without extension. */
  fileName?: string;
}

/** What the user chose. */
export interface ModelExportDialogAnswer {
  format: ModelExportFormat;
  target: ExportTarget;
  /** File name with extension. */
  fileName: string;
  /** File name without extension. */
  baseFileName: string;
  fbxEncoding: FbxExportEncoding;
  textureMode: ModelExportTextureMode;
  /**
   * Textures folder relative to the model ('' beside it); only for Copy Into
   * Directory.
   */
  texturesFolder: string;
  objMaterials: boolean;
  destination: ModelExportDestination;
}

/** Tooltips of the dialog, in sentence case. */
const TOOLTIPS = {
  target: 'The program the file is for. It sets the axes and units the file is written in.',
  formatGltf: 'glTF always uses meters with +Y up, and every program converts it when importing.',
  encoding: 'Binary files are smaller and open everywhere. Some programs cannot read ASCII FBX.',
  materials: 'Writes a .mtl file with the materials and their textures next to the .obj.',
  textures: [
    'Embedded: the textures are stored inside the model file.',
    'Copy Into Directory: the textures are copied into a folder next to the model.',
  ].join('\n'),
  texturesGlb: 'GLB files always hold their textures.',
  texturesNoMaterials: 'Turn on Include Materials (.mtl) to export textures.',
  folder: 'The folder the model is saved in.',
  downloads: 'This browser saves exports to its downloads folder.',
  access: 'Allow access to the folder, or choose another one.',
  fileName: 'Spaces become underscores; the extension is added for you.',
  texturesFolder: 'Folder for the textures, relative to the model. Leave it blank to put them next to the model.',
};

/**
 * Shows the Export dialog. It remembers its choices when the user exports and
 * asks before replacing an existing file.
 *
 * @param options Dialog options.
 * @returns Answer, or null when cancelled.
 */
export function modelExportDialogShow(options: ModelExportDialogOptions): Promise<ModelExportDialogAnswer | null> {
  return new Promise((resolve) => {
    const dialog = new DialogModelExport(options, (answer) => {
      resolve(answer);
      queueMicrotask(() => dialog.dispose());
    });
    dialog.show();
  });
}

/** Modal Export dialog. */
class DialogModelExport extends PanelFloating {
  private settings: ModelExportSettings;
  private destination: ModelExportDestination | null;
  private fileName: string;
  private settled = false;
  /** Whether a folder picker or the replace question is open. */
  private busy = false;
  private readonly fields = document.createElement('div');
  private readonly error = document.createElement('div');
  private readonly exportButton: HTMLButtonElement;
  private readonly keyDown: (event: KeyboardEvent) => void;

  constructor(
    private readonly options: ModelExportDialogOptions,
    private readonly settle: (answer: ModelExportDialogAnswer | null) => void,
  ) {
    super(options.host, {
      corner: 'top-left',
      modal: true,
      centered: true,
      draggable: false,
      closeOnEscape: false,
      closeOnBackdropClick: false,
      stackLayer: 'modal',
      backdropClassName: 'editor-message-box-backdrop',
    });
    this.settings = options.store.getExportSettings();
    this.settings.targetId = exportTargetFind(this.settings.targetId).id;
    this.destination = options.pickFolder === null ? modelExportDownloadsDestination() : (options.folder ?? null);
    this.fileName = options.fileName ?? MODEL_EXPORT_FILE_NAME_DEFAULT;
    this.exportButton = dialogButton('Export', 'export', true, () => void this.confirm());
    this.keyDown = (event) => {
      if (this.busy) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        this.finish(null);
      } else if (event.key === 'Enter' && !(event.target instanceof HTMLButtonElement)) {
        event.preventDefault();
        void this.confirm();
      }
    };
    this.build();
    this.render();
  }

  protected override onAfterShow(): void {
    document.addEventListener('keydown', this.keyDown);
    const first = this.root.querySelector<HTMLElement>('[data-model-export="target"]');
    (first ?? this.root.querySelector<HTMLElement>('[data-model-export="format"]'))?.focus();
  }

  protected override onAfterHide(): void {
    document.removeEventListener('keydown', this.keyDown);
  }

  /** Lays out the title, the field area, the error line and the buttons. */
  private build(): void {
    const root = this.root;
    root.className = 'editor-model-export-dialog';
    dialogCardStyle(root, '460px', 'editor-model-export-title');
    const title = dialogCardTitle('editor-model-export-title', 'Export');
    Object.assign(this.fields.style, { display: 'flex', flexDirection: 'column', gap: '9px' });
    this.error.dataset['modelExport'] = 'error';
    this.error.setAttribute('role', 'alert');
    Object.assign(this.error.style, { minHeight: '18px', margin: '10px 0 8px', fontSize: '12px', color: '#f0a090' });
    const buttons = document.createElement('div');
    Object.assign(buttons.style, { display: 'flex', gap: '8px', justifyContent: 'flex-end' });
    buttons.append(
      dialogButton('Cancel', 'cancel', false, () => this.finish(null)),
      this.exportButton,
    );
    root.append(title, this.fields, this.error, buttons);
  }

  /** Rebuilds the fields for the current choices. */
  private render(): void {
    const format = this.settings.format;
    const mode = this.textureMode();
    const rows: HTMLElement[] = this.gltf() ? [this.formatRow()] : [this.targetRow(), this.formatRow()];
    if (format === 'fbx') rows.push(this.encodingRow());
    if (format === 'obj') rows.push(this.materialsRow());
    rows.push(this.texturesRow());
    rows.push(this.folderRow());
    rows.push(this.fileNameRow());
    if (mode === 'copy' && this.texturesUsed() && this.options.pickFolder !== null) rows.push(this.texturesFolderRow());
    const focused =
      document.activeElement instanceof HTMLElement ? document.activeElement.dataset['modelExport'] : undefined;
    this.fields.replaceChildren(...rows);
    if (focused !== undefined) this.root.querySelector<HTMLElement>(`[data-model-export="${focused}"]`)?.focus();
    this.validate();
  }

  /** @returns Texture mode of the chosen format. */
  private textureMode(): ModelExportTextureMode {
    return modelExportTextureMode(this.settings, this.settings.format);
  }

  /**
   * @returns Whether the export writes textures (OBJ without materials does
   *   not).
   */
  private texturesUsed(): boolean {
    return this.settings.format !== 'obj' || this.settings.objMaterials;
  }

  /** @returns Whether the chosen format is glTF, which has no target program. */
  private gltf(): boolean {
    return this.settings.format === 'gltf' || this.settings.format === 'glb';
  }

  /** @returns Target Program row. */
  private targetRow(): HTMLElement {
    const select = createSettingsSelect(
      exportTargetList().map((target) => ({ value: target.id, label: target.label })),
      this.settings.targetId,
      (value) => {
        this.settings.targetId = value;
        this.render();
      },
    );
    select.title = TOOLTIPS.target;
    select.dataset['modelExport'] = 'target';
    return this.row('target', 'Target Program', select.title, select);
  }

  /** @returns Format row. */
  private formatRow(): HTMLElement {
    const select = createSettingsSelect(
      MODEL_EXPORT_FORMATS.map((format) => ({ value: format.id, label: format.label })),
      this.settings.format,
      (value) => {
        this.settings.format = value as ModelExportFormat;
        this.render();
      },
    );
    select.dataset['modelExport'] = 'format';
    select.title = this.gltf() ? TOOLTIPS.formatGltf : '';
    return this.row('format', 'Format', select.title, select);
  }

  /** @returns FBX Encoding row. */
  private encodingRow(): HTMLElement {
    const select = createSettingsSelect(
      [
        { value: 'binary', label: 'Binary (Recommended)' },
        { value: 'ascii', label: 'ASCII' },
      ],
      this.settings.fbxEncoding,
      (value) => (this.settings.fbxEncoding = value as FbxExportEncoding),
    );
    select.dataset['modelExport'] = 'encoding';
    select.title = TOOLTIPS.encoding;
    return this.row('encoding', 'Encoding', TOOLTIPS.encoding, select);
  }

  /** @returns OBJ Include Materials row. */
  private materialsRow(): HTMLElement {
    const label = document.createElement('label');
    Object.assign(label.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '7px',
      fontSize: '12px',
      cursor: 'pointer',
    });
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = this.settings.objMaterials;
    box.dataset['modelExport'] = 'materials';
    box.style.accentColor = hexToRgb(Theme.selectionColor);
    box.style.margin = '0';
    box.addEventListener('change', () => {
      this.settings.objMaterials = box.checked;
      this.render();
    });
    label.append(box, 'Include Materials (.mtl)');
    label.title = TOOLTIPS.materials;
    return this.row('materials', '', TOOLTIPS.materials, label);
  }

  /** @returns Textures row. */
  private texturesRow(): HTMLElement {
    const format = this.settings.format;
    const modes = modelExportFormatInfo(format).textureModes;
    const mode = this.textureMode();
    const select = createSettingsSelect([], '', (value) => {
      if (format !== 'glb') this.settings.textureModes[format] = value as ModelExportTextureMode;
      this.render();
    });
    modes.forEach((entry) => {
      const label = MODEL_EXPORT_TEXTURE_MODE_LABELS[entry];
      const isDefault = modes.length > 1 && entry === modelExportTextureModeDefault(this.settings.targetId, format);
      select.append(new Option(isDefault ? `${label} (Default)` : label, entry));
    });
    select.value = mode;
    select.dataset['modelExport'] = 'textures';
    select.disabled = modes.length === 1 || !this.texturesUsed();
    select.title =
      format === 'glb' ? TOOLTIPS.texturesGlb : !this.texturesUsed() ? TOOLTIPS.texturesNoMaterials : TOOLTIPS.textures;
    return this.row('textures', 'Textures', select.title, select);
  }

  /** @returns Folder row: the picked folder, or Downloads. */
  private folderRow(): HTMLElement {
    const pick = this.options.pickFolder;
    const button = dialogButton(this.destination?.label ?? 'Choose Folder…', 'folder', false, () => {
      if (pick === null || this.busy) return;
      this.busy = true;
      void pick()
        .then((destination) => {
          if (destination !== null) this.destination = destination;
        })
        .finally(() => {
          this.busy = false;
          if (!this.settled) this.render();
        });
    });
    Object.assign(button.style, { width: '100%', textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis' });
    button.disabled = pick === null;
    button.title =
      pick === null
        ? TOOLTIPS.downloads
        : this.destination === null
          ? TOOLTIPS.folder
          : `${TOOLTIPS.folder} Click to choose another.`;
    if (this.destination !== null && pick !== null) button.prepend(folderGlyph());
    return this.row('folder', 'Folder', button.title, button);
  }

  /** @returns File Name row with the extension shown after the field. */
  private fileNameRow(): HTMLElement {
    const input = createSettingsTextInput(this.fileName, 'File Name', () => undefined);
    input.dataset['modelExport'] = 'file-name';
    input.spellcheck = false;
    input.title = TOOLTIPS.fileName;
    input.addEventListener('input', () => {
      this.fileName = input.value;
      this.validate();
    });
    const extension = document.createElement('span');
    extension.textContent = `.${modelExportFormatInfo(this.settings.format).extension}`;
    Object.assign(extension.style, { fontSize: '12px', color: '#9a9a9a', flex: '0 0 auto' });
    const control = document.createElement('div');
    Object.assign(control.style, { display: 'flex', alignItems: 'center', gap: '6px' });
    input.style.flex = '1 1 auto';
    input.style.minWidth = '0';
    control.append(input, extension);
    return this.row('file-name', 'File Name', TOOLTIPS.fileName, control);
  }

  /** @returns Textures Folder row. */
  private texturesFolderRow(): HTMLElement {
    const input = createSettingsTextInput(this.settings.texturesFolder, 'Textures Folder', () => undefined);
    input.dataset['modelExport'] = 'textures-folder';
    input.placeholder = 'Next to the model';
    input.spellcheck = false;
    input.title = TOOLTIPS.texturesFolder;
    input.addEventListener('input', () => {
      this.settings.texturesFolder = input.value;
      this.validate();
    });
    return this.row('textures-folder', 'Textures Folder', TOOLTIPS.texturesFolder, input);
  }

  /**
   * Builds a labeled row.
   *
   * @param name Row name.
   * @param label Label text ('' for none).
   * @param tooltip Label tooltip.
   * @param control Control.
   * @param top Whether the label sits at the top (tall controls).
   * @returns Row.
   */
  private row(name: string, label: string, tooltip: string, control: HTMLElement, top = false): HTMLElement {
    const row = document.createElement('div');
    row.dataset['modelExportRow'] = name;
    Object.assign(row.style, { display: 'flex', alignItems: top ? 'flex-start' : 'center', gap: '12px' });
    const text = document.createElement('span');
    text.textContent = label;
    text.title = tooltip;
    Object.assign(text.style, {
      flex: '0 0 112px',
      fontSize: '12px',
      color: '#c8c8c8',
      paddingTop: top ? '4px' : '0',
    });
    control.style.flex = '1 1 auto';
    control.style.minWidth = '0';
    row.append(text, control);
    return row;
  }

  /** @returns The problem that blocks the export, or null. */
  private problem(): string | null {
    const name = modelExportFileNameCheck(this.fileName, modelExportFormatInfo(this.settings.format).extension);
    if (name.error !== null) return `File name: ${name.error}`;
    if (this.textureMode() === 'copy' && this.texturesUsed() && this.options.pickFolder !== null) {
      const folder = modelExportFolderCheck(this.settings.texturesFolder);
      if (folder.error !== null) return `Textures folder: ${folder.error}`;
    }
    return null;
  }

  /** Shows the blocking problem and enables Export when there is none. */
  private validate(): void {
    const problem = this.problem();
    this.error.textContent = problem ?? '';
    const ready = problem === null && this.destination !== null;
    this.exportButton.disabled = !ready;
    this.exportButton.style.opacity = ready ? '1' : '0.45';
    this.exportButton.style.cursor = ready ? 'pointer' : 'default';
    this.exportButton.title = ready || problem !== null ? '' : 'Choose a folder first.';
  }

  /** Asks before replacing a file, then answers with the choices. */
  private async confirm(): Promise<void> {
    if (this.exportButton.disabled || this.busy) return;
    const format = this.settings.format;
    const info = modelExportFormatInfo(format);
    const fileName = modelExportFileNameCheck(this.fileName, info.extension).value;
    const mode = this.textureMode();
    const destination = this.destination!;
    this.busy = true;
    if (!(await this.destinationAccess(destination))) {
      this.busy = false;
      return;
    }
    const exists = await destination.exists(fileName);
    const replace =
      !exists ||
      (await showMessageBox({
        host: this.options.host,
        title: 'Replace File?',
        message: `${fileName} already exists in ${destination.label}. Replacing it overwrites the file${mode === 'copy' ? ' and textures with the same names' : ''}.`,
        confirmLabel: 'Replace',
        cancelLabel: 'Cancel',
      }));
    this.busy = false;
    if (!replace) return;
    const texturesFolder =
      mode === 'copy' && this.options.pickFolder !== null
        ? modelExportFolderCheck(this.settings.texturesFolder).value
        : '';
    if (mode === 'copy' && this.options.pickFolder !== null) this.settings.texturesFolder = texturesFolder;
    this.options.store.setExportSettings(this.settings);
    this.finish({
      format,
      target: exportTargetFind(this.settings.targetId),
      fileName,
      baseFileName: fileName.slice(0, -(info.extension.length + 1)),
      fbxEncoding: this.settings.fbxEncoding,
      textureMode: mode,
      texturesFolder,
      objMaterials: this.settings.objMaterials,
      destination,
    });
  }

  /**
   * Makes sure the export may write to its folder, asking the browser again
   * when access lapsed, and explains a refusal.
   *
   * @param destination Destination.
   * @returns True when writing is allowed.
   */
  private async destinationAccess(destination: ModelExportDestination): Promise<boolean> {
    const allowed = (await destination.access?.()) ?? true;
    if (!allowed) this.error.textContent = `${destination.label}: ${TOOLTIPS.access}`;
    return allowed;
  }

  /** @param answer Answer. */
  private finish(answer: ModelExportDialogAnswer | null): void {
    if (this.settled) return;
    this.settled = true;
    this.hide(true);
    this.settle(answer);
  }
}

/**
 * Builds the closed folder icon of the folder tree, for the Folder button.
 *
 * @returns Icon element.
 */
function folderGlyph(): HTMLElement {
  const glyph = document.createElement('span');
  glyph.innerHTML = IconFolderTree.closed();
  Object.assign(glyph.style, { display: 'inline-flex', marginRight: '6px', verticalAlign: '-2px', flex: '0 0 auto' });
  return glyph;
}

/**
 * Builds a dialog button tagged with its data name.
 *
 * @param label Text.
 * @param name Data name.
 * @param primary Whether it is the main action.
 * @param onClick Click handler.
 * @returns Button.
 */
function dialogButton(label: string, name: string, primary: boolean, onClick: () => void): HTMLButtonElement {
  const button = dialogCardButton(label, primary, onClick);
  button.dataset['modelExport'] = name;
  return button;
}
