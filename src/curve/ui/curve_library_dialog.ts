import { Theme } from '@/theme.js';
import { hexToRgb } from '@/utils/utils_color.js';
import { PanelFloating } from '@/ui/floating_panel/panel_floating.js';
import {
  curveLibraryDisplayName,
  curveLibraryListen,
  curveLibrarySourceLabel,
  curveLibrarySourcesList,
  type CurveLibrarySource,
  type CurveLibrarySourceId,
} from '@/curve/library/curve_library.js';
import { panelProjectCompare } from '@/project/ui/panel_project_view.js';

/** What the user chose in the save dialog. */
export type CurveLibrarySaveChoice = { source: CurveLibrarySource; name: string } | { download: string };

/** What the user chose in the load dialog. */
export type CurveLibraryLoadChoice = { source: CurveLibrarySource; fileName: string } | { disk: true };

/** Any choice of the dialog, or null when cancelled. */
type CurveLibraryDialogChoice = CurveLibrarySaveChoice | CurveLibraryLoadChoice | null;

/** Mode of the dialog. */
type CurveLibraryDialogMode = 'save' | 'load';

/** What each location holds, shown under the location buttons. */
const CURVE_LIBRARY_DIALOG_DESCRIPTIONS: Readonly<Record<CurveLibrarySourceId, string>> = {
  project: "This project's AiWorldEd/Curves.",
  remote: "The room owner's curves, shared live and read-only.",
  local: 'Your own AiWorldEd/Curves, kept while you are in the room.',
};

/** Location chosen last, kept while the page lives. */
let curveLibraryDialogLast: CurveLibrarySourceId | null = null;

/**
 * Asks where to save a curve and under which name: the project's curves, or in
 * a room the member's own ("Local") curves, never the owner's read-only
 * "Remote" ones; "Download" keeps the plain file download.
 *
 * @param host Parent element of the modal.
 * @param name Suggested name.
 * @returns Choice, or null when cancelled.
 */
export function curveLibrarySaveAsk(host: HTMLElement, name: string): Promise<CurveLibrarySaveChoice | null> {
  return new Promise((resolve) =>
    new CurveLibraryDialog(host, 'save', name, (choice) => resolve(choice as CurveLibrarySaveChoice | null)).show(),
  );
}

/**
 * Returns the locations a curve can be saved to: every location except the room
 * owner's Remote curves, which members can only read.
 *
 * @returns Locations.
 */
export function curveLibrarySaveSources(): CurveLibrarySource[] {
  return curveLibrarySourcesList().filter((source) => source.id !== 'remote');
}

/**
 * Asks which saved curve to load, or to pick a file from disk.
 *
 * @param host Parent element of the modal.
 * @returns Choice, or null when cancelled.
 */
export function curveLibraryLoadAsk(host: HTMLElement): Promise<CurveLibraryLoadChoice | null> {
  return new Promise((resolve) =>
    new CurveLibraryDialog(host, 'load', '', (choice) => resolve(choice as CurveLibraryLoadChoice | null)).show(),
  );
}

/**
 * Modal Save Curve / Load Curve dialog over the registered curve sources; it
 * follows live changes, such as the room owner's curves arriving.
 */
class CurveLibraryDialog extends PanelFloating {
  private readonly locations = document.createElement('div');
  private readonly note = document.createElement('div');
  private readonly list = document.createElement('div');
  private readonly nameInput = document.createElement('input');
  private readonly confirmButton: HTMLButtonElement;
  private selected: CurveLibrarySourceId | null = null;
  private fileName: string | null = null;
  private settled = false;
  private readonly unlisten: () => void;

  /**
   * Builds the dialog.
   *
   * @param host Parent element.
   * @param mode Save or load.
   * @param name Suggested name (save).
   * @param settle Receives the choice once.
   */
  constructor(
    host: HTMLElement,
    private readonly mode: CurveLibraryDialogMode,
    name: string,
    private readonly settle: (choice: CurveLibraryDialogChoice) => void,
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
    this.nameInput.value = name;
    this.confirmButton = curveLibraryDialogButton(mode === 'save' ? 'Save' : 'Load', true, () => this.confirm());
    this.build();
    this.unlisten = curveLibraryListen(() => this.refresh());
    this.refresh();
  }

  /** Focuses the name field or the confirm button after showing. */
  protected override onAfterShow(): void {
    if (this.mode === 'save') {
      this.nameInput.focus();
      this.nameInput.select();
    } else this.confirmButton.focus();
  }

  /** Builds title, locations, list, name field and buttons. */
  private build(): void {
    const root = this.root;
    root.className = 'editor-message-box-panel';
    root.dataset['curveLibraryDialog'] = this.mode;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    Object.assign(root.style, {
      width: '380px',
      padding: '18px 20px 16px',
      borderRadius: '10px',
      background: `linear-gradient(180deg, ${hexToRgb(Theme.toolbarBackground)} 0%, ${hexToRgb(Theme.toolbarBackgroundEnd)} 100%)`,
      border: '1px solid rgba(255,255,255,0.1)',
      boxShadow: '0 18px 48px rgba(0,0,0,0.65)',
      color: Theme.buttonTextColor,
      boxSizing: 'border-box',
      fontFamily: Theme.uiFontFamily,
      fontSize: '12px',
    });
    const title = document.createElement('h2');
    title.textContent = this.mode === 'save' ? 'Save Curve' : 'Load Curve';
    Object.assign(title.style, { margin: '0 0 12px', fontSize: '15px', fontWeight: '600', color: '#f0f0f0' });
    Object.assign(this.locations.style, { display: 'flex', gap: '6px', marginBottom: '8px' });
    this.locations.setAttribute('role', 'tablist');
    Object.assign(this.note.style, { color: '#c8a070', minHeight: '16px', marginBottom: '6px', lineHeight: '1.35' });
    this.list.setAttribute('role', 'listbox');
    this.list.dataset['curveLibraryList'] = 'true';
    Object.assign(this.list.style, {
      height: '168px',
      overflowY: 'auto',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: '6px',
      background: 'rgba(0,0,0,0.22)',
      marginBottom: '10px',
    });
    root.append(title, this.locations, this.note, this.list);
    if (this.mode === 'save') root.append(this.nameRow());
    root.append(this.buttonRow());
    root.addEventListener('mousedown', (event) => event.stopPropagation());
    root.addEventListener('keydown', (event) => this.key(event));
    this.getBackdropElement()?.addEventListener('mousedown', (event) => {
      if (event.target === this.getBackdropElement()) this.finish(null);
    });
  }

  /**
   * Builds the name field of the save dialog.
   *
   * @returns Row.
   */
  private nameRow(): HTMLElement {
    const row = document.createElement('label');
    Object.assign(row.style, { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' });
    row.append('Name');
    this.nameInput.type = 'text';
    this.nameInput.setAttribute('aria-label', 'Curve name');
    Object.assign(this.nameInput.style, {
      flex: '1',
      background: '#2a2a2a',
      color: '#f0f0f0',
      border: '1px solid #4a4a4a',
      borderRadius: '4px',
      padding: '5px 6px',
      font: 'inherit',
    });
    this.nameInput.addEventListener('input', () => this.buttonsRefresh());
    const extension = document.createElement('span');
    extension.textContent = '.aicurve';
    extension.style.color = '#9a9a9a';
    row.append(this.nameInput, extension);
    return row;
  }

  /**
   * Builds the button row.
   *
   * @returns Row.
   */
  private buttonRow(): HTMLElement {
    const row = document.createElement('div');
    Object.assign(row.style, { display: 'flex', gap: '8px', alignItems: 'center' });
    const other =
      this.mode === 'save'
        ? curveLibraryDialogButton('Download', false, () => this.finish({ download: this.nameInput.value.trim() }))
        : curveLibraryDialogButton('From Disk…', false, () => this.finish({ disk: true }));
    other.title =
      this.mode === 'save' ? 'Save the curve as a downloaded .aicurve file' : 'Load a .aicurve file from disk';
    const spacer = document.createElement('div');
    spacer.style.flex = '1';
    row.append(
      other,
      spacer,
      curveLibraryDialogButton('Cancel', false, () => this.finish(null)),
      this.confirmButton,
    );
    return row;
  }

  /** Redraws locations, the list and the buttons from the current sources. */
  private refresh(): void {
    const sources = this.sources();
    if (this.selected === null || !sources.some((source) => source.id === this.selected))
      this.selected = this.defaultSource(sources)?.id ?? null;
    this.locations.replaceChildren(
      ...sources.map((source) => {
        const button = curveLibraryDialogButton(curveLibrarySourceLabel(source.id), source.id === this.selected, () => {
          this.selected = source.id;
          curveLibraryDialogLast = source.id;
          this.fileName = null;
          this.refresh();
        });
        button.dataset['curveSource'] = source.id;
        button.setAttribute('role', 'tab');
        button.setAttribute('aria-selected', source.id === this.selected ? 'true' : 'false');
        return button;
      }),
    );
    if (sources.length === 0) this.locations.textContent = 'No project or room is open.';
    this.listRefresh();
    this.buttonsRefresh();
  }

  /**
   * Picks the location to show first: the last one chosen, else the first
   * writable one when saving, else the first.
   *
   * @param sources Available sources.
   * @returns Source, or undefined.
   */
  private defaultSource(sources: CurveLibrarySource[]): CurveLibrarySource | undefined {
    const last = sources.find((source) => source.id === curveLibraryDialogLast);
    if (last && (this.mode === 'load' || last.writable())) return last;
    return (this.mode === 'save' ? sources.find((source) => source.writable()) : undefined) ?? sources[0];
  }

  /** Redraws the curve list of the chosen location. */
  private listRefresh(): void {
    const source = this.source();
    const entries = [...(source?.list() ?? [])].sort((a, b) => panelProjectCompare(a.fileName, b.fileName));
    if (this.fileName !== null && !entries.some((entry) => entry.fileName === this.fileName)) this.fileName = null;
    if (entries.length === 0) {
      const empty = document.createElement('div');
      empty.textContent = source ? 'No curves saved here yet.' : '';
      Object.assign(empty.style, { padding: '10px', color: '#9a9a9a' });
      this.list.replaceChildren(empty);
      return;
    }
    this.list.replaceChildren(
      ...entries.map((entry) => {
        const row = document.createElement('div');
        row.setAttribute('role', 'option');
        row.dataset['curveFile'] = entry.fileName;
        const chosen = entry.fileName === this.fileName;
        row.setAttribute('aria-selected', chosen ? 'true' : 'false');
        row.textContent = curveLibraryDisplayName(entry.fileName);
        row.title = entry.fileName;
        Object.assign(row.style, {
          padding: '4px 10px',
          cursor: 'pointer',
          background: chosen ? 'rgba(232, 106, 23, 0.25)' : '',
        });
        row.addEventListener('click', () => {
          this.fileName = entry.fileName;
          if (this.mode === 'save') this.nameInput.value = curveLibraryDisplayName(entry.fileName);
          this.listRefresh();
          this.buttonsRefresh();
        });
        row.addEventListener('dblclick', () => this.confirm());
        return row;
      }),
    );
  }

  /** Enables the confirm button and explains read-only locations. */
  private buttonsRefresh(): void {
    const source = this.source();
    const reason = this.mode === 'save' && source && !source.writable() ? (source.readOnlyReason?.() ?? null) : null;
    this.note.textContent = reason ?? (source ? CURVE_LIBRARY_DIALOG_DESCRIPTIONS[source.id] : '');
    this.note.style.color = reason ? '#c8a070' : '#9a9a9a';
    this.confirmButton.disabled =
      source === null ||
      (this.mode === 'save' ? !source.writable() || this.nameInput.value.trim() === '' : this.fileName === null);
    this.confirmButton.style.opacity = this.confirmButton.disabled ? '0.45' : '1';
    this.confirmButton.style.cursor = this.confirmButton.disabled ? 'default' : 'pointer';
  }

  /**
   * Returns the chosen location.
   *
   * @returns Source, or null.
   */
  private source(): CurveLibrarySource | null {
    return this.sources().find((source) => source.id === this.selected) ?? null;
  }

  /**
   * Returns the locations this dialog offers: all for loading, the writable
   * kinds for saving.
   *
   * @returns Locations.
   */
  private sources(): CurveLibrarySource[] {
    return this.mode === 'save' ? curveLibrarySaveSources() : curveLibrarySourcesList();
  }

  /** Settles with the chosen curve or name. */
  private confirm(): void {
    const source = this.source();
    if (this.confirmButton.disabled || source === null) return;
    curveLibraryDialogLast = source.id;
    if (this.mode === 'save') this.finish({ source, name: this.nameInput.value.trim() });
    else if (this.fileName !== null) this.finish({ source, fileName: this.fileName });
  }

  /**
   * Handles Escape and Enter; other keys stay with the dialog.
   *
   * @param event Key press.
   */
  private key(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.finish(null);
    } else if (event.key === 'Enter' && !(event.target instanceof HTMLButtonElement)) {
      event.preventDefault();
      this.confirm();
    }
    event.stopPropagation();
  }

  /**
   * Closes once with a result.
   *
   * @param choice Choice, or null when cancelled.
   */
  private finish(choice: CurveLibraryDialogChoice): void {
    if (this.settled) return;
    this.settled = true;
    this.unlisten();
    this.hide(true);
    this.settle(choice);
    queueMicrotask(() => this.dispose());
  }
}

/**
 * Creates a dialog button.
 *
 * @param label Text.
 * @param primary True for the highlighted button.
 * @param onClick Click handler.
 * @returns Button.
 */
function curveLibraryDialogButton(label: string, primary: boolean, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  Object.assign(button.style, {
    minWidth: '64px',
    padding: '6px 12px',
    borderRadius: '6px',
    border: primary ? `1px solid ${hexToRgb(Theme.selectionColor)}` : '1px solid rgba(255,255,255,0.12)',
    background: primary ? 'rgba(232, 106, 23, 0.28)' : 'rgba(255,255,255,0.06)',
    color: '#f2f2f2',
    cursor: 'pointer',
    fontFamily: Theme.uiFontFamily,
    fontSize: '12px',
    fontWeight: '600',
  });
  button.addEventListener('click', onClick);
  return button;
}
