import { PanelFloating } from '@/ui/floating_panel/panel_floating.js';
import { dialogCardButton, dialogCardStyle, dialogCardTitle } from '@/ui/dialog/dialog_card.js';
import { createSettingsSelect } from '@/ui/settings/settings_form_controls.js';
import type { EditorSettingsStore } from '@/settings/store/editor_settings_store.js';
import { exportTargetFind, exportTargetList, type ExportTarget } from '@/io/export/export_targets.js';

/** Tooltip of the Source Program field. */
const OBJ_IMPORT_SOURCE_TOOLTIP =
  'This OBJ file does not say which axes and units it uses. Choose the program that wrote it so it comes in upright and at the right size.';

/**
 * Asks which program wrote an OBJ file without an objmeta comment and remembers
 * the answer.
 *
 * @param host Parent element.
 * @param store Settings store.
 * @returns The source program, or null when cancelled.
 */
export function objImportDialogShow(host: HTMLElement, store: EditorSettingsStore): Promise<ExportTarget | null> {
  return new Promise((resolve) => {
    const dialog = new DialogObjImport(host, store, (answer) => {
      resolve(answer);
      queueMicrotask(() => dialog.dispose());
    });
    dialog.show();
  });
}

/** Modal OBJ import dialog with the Source Program choice. */
class DialogObjImport extends PanelFloating {
  private readonly select: HTMLSelectElement;
  private readonly keyDown: (event: KeyboardEvent) => void;
  private settled = false;

  constructor(
    host: HTMLElement,
    private readonly store: EditorSettingsStore,
    private readonly settle: (answer: ExportTarget | null) => void,
  ) {
    super(host, {
      corner: 'top-left',
      modal: true,
      centered: true,
      draggable: false,
      closeOnEscape: false,
      closeOnBackdropClick: false,
      stackLayer: 'modal',
      backdropClassName: 'editor-message-box-backdrop',
    });
    const targets = exportTargetList();
    const current = exportTargetFind(store.getImportSettings().objSourceTargetId).id;
    this.select = createSettingsSelect(
      targets.map((target) => ({ value: target.id, label: target.label })),
      current,
      () => undefined,
    );
    this.select.dataset['objImport'] = 'source';
    this.select.title = OBJ_IMPORT_SOURCE_TOOLTIP;
    this.keyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        this.finish(null);
      } else if (event.key === 'Enter') {
        event.preventDefault();
        this.confirm();
      }
    };
    this.build();
  }

  protected override onAfterShow(): void {
    document.addEventListener('keydown', this.keyDown);
    this.select.focus();
  }

  protected override onAfterHide(): void {
    document.removeEventListener('keydown', this.keyDown);
  }

  /** Lays out the title, the field and the buttons. */
  private build(): void {
    const root = this.root;
    root.className = 'editor-obj-import-dialog';
    dialogCardStyle(root, '380px', 'editor-obj-import-title');
    const title = dialogCardTitle('editor-obj-import-title', 'Import OBJ');
    const row = document.createElement('div');
    Object.assign(row.style, { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '18px' });
    const label = document.createElement('span');
    label.textContent = 'Source Program';
    label.title = OBJ_IMPORT_SOURCE_TOOLTIP;
    Object.assign(label.style, { flex: '0 0 112px', fontSize: '12px', color: '#c8c8c8' });
    this.select.style.flex = '1 1 auto';
    row.append(label, this.select);
    const buttons = document.createElement('div');
    Object.assign(buttons.style, { display: 'flex', gap: '8px', justifyContent: 'flex-end' });
    const cancel = dialogCardButton('Cancel', false, () => this.finish(null));
    cancel.dataset['objImport'] = 'cancel';
    const confirm = dialogCardButton('Import', true, () => this.confirm());
    confirm.dataset['objImport'] = 'confirm';
    buttons.append(cancel, confirm);
    root.append(title, row, buttons);
  }

  /** Remembers the choice and answers with it. */
  private confirm(): void {
    this.store.setImportSettings({ objSourceTargetId: this.select.value });
    this.finish(exportTargetFind(this.select.value));
  }

  /** @param answer Answer. */
  private finish(answer: ExportTarget | null): void {
    if (this.settled) return;
    this.settled = true;
    this.hide(true);
    this.settle(answer);
  }
}
