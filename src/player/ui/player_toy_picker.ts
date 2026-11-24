import { PLAYER_TOY_GRAPPLE, PLAYER_TOY_KEYBOARD, type PlayerToyKind } from '@/player/toy/player_toy_kind.js';
import { PLAYER_TOY_KINDS, PLAYER_TOY_LABELS } from '@/player/toy/player_toy_models.js';
import { Theme } from '@/theme.js';

/** Selection highlight (the editor's selection orange). */
const PLAYER_TOY_PICKER_ACCENT = '#e86a17';
/** Time the picker stays bright after a change, in milliseconds. */
const PLAYER_TOY_PICKER_BRIGHT_MS = 1600;

/** The picker's slots in key order: empty hands, then the toys. */
export const PLAYER_TOY_PICKER_SLOTS: readonly (PlayerToyKind | null)[] = [
  null,
  ...PLAYER_TOY_KINDS,
  PLAYER_TOY_KEYBOARD,
  PLAYER_TOY_GRAPPLE,
];
/** Name and slot data of empty hands. */
const PLAYER_TOY_PICKER_EMPTY = { label: 'Empty hands', data: 'empty' };

/** Slot icons (24 px, current color); empty hands show an open hand. */
const PLAYER_TOY_PICKER_ICONS: Readonly<Record<PlayerToyKind | 'empty', string>> = {
  empty:
    '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#f4f1e8" stroke-width="1.4"' +
    ' stroke-linecap="round" stroke-linejoin="round"><path d="M8 12V5.5a1.3 1.3 0 0 1 2.6 0V11M10.6 10V4.3a1.3 1.3 0 0 1 2.6 0V11' +
    'M13.2 10.5V5.3a1.3 1.3 0 0 1 2.6 0V12M15.8 11V8a1.3 1.3 0 0 1 2.6 0v5.5c0 4-2.6 6.5-6 6.5-2.7 0-4.3-1.5-5.6-3.6L4.6 13' +
    'a1.3 1.3 0 0 1 2.2-1.4L8 13.5"/></svg>',
  tennis:
    '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.6">' +
    '<circle cx="12" cy="12" r="8.5" fill="#d4f53c" stroke="none"/>' +
    '<path d="M5.2 7.5c3 1.6 3 7.4 0 9M18.8 7.5c-3 1.6-3 7.4 0 9" stroke="#fff"/></svg>',
  soccer:
    '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#222" stroke-width="1">' +
    '<circle cx="12" cy="12" r="8.5" fill="#f4f1e8"/>' +
    '<path d="M12 8.6l3.2 2.3-1.2 3.8h-4l-1.2-3.8z" fill="#222"/>' +
    '<path d="M12 3.5v5.1M15.2 10.9l4.6-1.6M14 14.7l2.8 4M10 14.7l-2.8 4M8.8 10.9l-4.6-1.6"/></svg>',
  plane:
    '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#f4f1e8" stroke-width="1.3"' +
    ' stroke-linejoin="round"><path d="M3 11.5L21 4l-6.5 16-3.2-6.3z" fill="rgba(244,241,232,0.25)"/>' +
    '<path d="M21 4L11.3 13.7"/></svg>',
  keyboard:
    '<svg viewBox="0 0 24 24" width="24" height="24" fill="#f4f1e8" stroke="#222" stroke-width="0.8">' +
    '<rect x="2.5" y="6" width="19" height="12" rx="1"/>' +
    '<path d="M6.3 6v12M10.1 6v12M13.9 6v12M17.7 6v12" fill="none"/>' +
    '<path d="M5.2 6h2.2v7H5.2zM9 6h2.2v7H9zM16.6 6h2.2v7h-2.2z" fill="#222"/></svg>',
  grapple:
    '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke-linecap="round">' +
    '<path d="M4 20L18.5 5.5" stroke="#42d9ff" stroke-width="3.2" opacity="0.45"/>' +
    '<path d="M4 20L18.5 5.5" stroke="#fff" stroke-width="1.2"/>' +
    '<circle cx="19" cy="5" r="2.6" fill="#42d9ff"/><circle cx="4.5" cy="19.5" r="2" fill="#f4f1e8"/></svg>',
};

/**
 * The play-mode toy picker: a small hotbar at the bottom of the play viewport
 * with an empty-hands slot and one slot per toy. The keys 1-6 (and the wheel in
 * first person) move the selection; it shows the selected slot's name and dims
 * when left alone.
 */
export class PlayerToyPicker {
  private readonly element: HTMLDivElement;
  private readonly label: HTMLDivElement;
  private readonly slots: Map<PlayerToyKind | null, HTMLDivElement>;
  private selected: PlayerToyKind | null;
  private dimTimer: ReturnType<typeof setTimeout> | null;

  /**
   * Builds the hotbar (detached).
   *
   * @param ownerDocument Document to build in.
   * @param selected Initially selected toy (null: empty hands).
   */
  constructor(ownerDocument: Document, selected: PlayerToyKind | null) {
    this.element = ownerDocument.createElement('div');
    this.element.className = 'player-toy-picker';
    this.element.setAttribute('role', 'listbox');
    this.element.setAttribute('aria-label', 'Toy');
    Object.assign(this.element.style, playerToyPickerRootStyle());
    this.label = ownerDocument.createElement('div');
    Object.assign(this.label.style, playerToyPickerLabelStyle());
    const bar = ownerDocument.createElement('div');
    Object.assign(bar.style, playerToyPickerBarStyle());
    this.slots = new Map();
    PLAYER_TOY_PICKER_SLOTS.forEach((kind, index) => {
      const slot = this.buildSlot(ownerDocument, kind, index + 1);
      this.slots.set(kind, slot);
      bar.appendChild(slot);
    });
    this.element.append(this.label, bar);
    this.selected = selected;
    this.dimTimer = null;
    this.render();
  }

  /**
   * Shows the hotbar over a viewport.
   *
   * @param container Viewport content element.
   */
  mount(container: HTMLElement): void {
    const view = container.ownerDocument.defaultView;
    if (view && view.getComputedStyle(container).position === 'static') container.style.position = 'relative';
    container.appendChild(this.element);
    this.brighten();
  }

  /** Hides the hotbar. */
  unmount(): void {
    this.element.remove();
    if (this.dimTimer !== null) clearTimeout(this.dimTimer);
    this.dimTimer = null;
  }

  /**
   * Shows a selection.
   *
   * @param kind Selected toy (null: empty hands).
   */
  select(kind: PlayerToyKind | null): void {
    this.selected = kind;
    this.render();
    this.brighten();
  }

  /**
   * Returns the hotbar element.
   *
   * @returns Element.
   */
  getElement(): HTMLDivElement {
    return this.element;
  }

  /**
   * Builds one slot.
   *
   * @param ownerDocument Document.
   * @param kind Toy kind (null: empty hands).
   * @param number Slot number (its key).
   * @returns Slot.
   */
  private buildSlot(ownerDocument: Document, kind: PlayerToyKind | null, number: number): HTMLDivElement {
    const slot = ownerDocument.createElement('div');
    slot.setAttribute('role', 'option');
    slot.dataset['toy'] = kind ?? PLAYER_TOY_PICKER_EMPTY.data;
    slot.title = playerToyPickerLabel(kind);
    Object.assign(slot.style, playerToyPickerSlotStyle());
    slot.innerHTML = PLAYER_TOY_PICKER_ICONS[kind ?? 'empty'];
    const key = ownerDocument.createElement('span');
    key.textContent = String(number);
    Object.assign(key.style, playerToyPickerKeyStyle());
    slot.appendChild(key);
    return slot;
  }

  /** Highlights the selected slot and names it. */
  private render(): void {
    this.slots.forEach((slot, kind) => {
      const active = kind === this.selected;
      slot.setAttribute('aria-selected', String(active));
      slot.style.border = `1px solid ${active ? PLAYER_TOY_PICKER_ACCENT : 'transparent'}`;
      slot.style.background = active ? Theme.outlinerSelectedColor : Theme.viewportToolbarButtonHover;
    });
    this.label.textContent = playerToyPickerLabel(this.selected);
  }

  /** Shows the hotbar fully, then dims it after a while. */
  private brighten(): void {
    this.element.style.opacity = '1';
    this.label.style.visibility = 'visible';
    if (this.dimTimer !== null) clearTimeout(this.dimTimer);
    this.dimTimer = setTimeout(() => {
      this.element.style.opacity = '0.55';
      this.label.style.visibility = 'hidden';
      this.dimTimer = null;
    }, PLAYER_TOY_PICKER_BRIGHT_MS);
  }
}

/**
 * Steps a selection through the slots, empty hands included, wrapping around.
 *
 * @param kind Current toy (null: empty hands).
 * @param step +1 for the next slot, -1 for the previous.
 * @returns New toy, or null for empty hands.
 */
export function playerToyPickerStep(kind: PlayerToyKind | null, step: number): PlayerToyKind | null {
  const count = PLAYER_TOY_PICKER_SLOTS.length;
  const index = PLAYER_TOY_PICKER_SLOTS.indexOf(kind);
  return PLAYER_TOY_PICKER_SLOTS[(((index + Math.sign(step)) % count) + count) % count] ?? null;
}

/**
 * Returns the name of a slot.
 *
 * @param kind Toy kind (null: empty hands).
 * @returns Name.
 */
function playerToyPickerLabel(kind: PlayerToyKind | null): string {
  if (kind === PLAYER_TOY_KEYBOARD) return 'Keyboard';
  if (kind === PLAYER_TOY_GRAPPLE) return 'Grapple beam';
  return kind === null ? PLAYER_TOY_PICKER_EMPTY.label : PLAYER_TOY_LABELS[kind];
}

/**
 * Style of the hotbar: bottom center over the viewport, never catching the
 * mouse.
 *
 * @returns Inline style.
 */
function playerToyPickerRootStyle(): Partial<CSSStyleDeclaration> {
  return {
    position: 'absolute',
    left: '50%',
    bottom: '14px',
    transform: 'translateX(-50%)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
    pointerEvents: 'none',
    userSelect: 'none',
    fontFamily: Theme.uiFontFamily,
    transition: 'opacity 250ms ease',
    zIndex: '5',
  };
}

/**
 * Style of the name label above the slots.
 *
 * @returns Inline style.
 */
function playerToyPickerLabelStyle(): Partial<CSSStyleDeclaration> {
  return {
    fontSize: '12px',
    color: Theme.buttonTextColor,
    background: Theme.viewportLabelBackgroundColor,
    padding: '2px 8px',
    borderRadius: '4px',
  };
}

/**
 * Style of the slot row.
 *
 * @returns Inline style.
 */
function playerToyPickerBarStyle(): Partial<CSSStyleDeclaration> {
  return {
    display: 'flex',
    gap: '4px',
    padding: '4px',
    background: Theme.viewportToolbarBackground,
    border: `1px solid ${Theme.viewportToolbarBorder}`,
    borderRadius: '6px',
  };
}

/**
 * Style of one slot.
 *
 * @returns Inline style.
 */
function playerToyPickerSlotStyle(): Partial<CSSStyleDeclaration> {
  return {
    position: 'relative',
    width: '40px',
    height: '40px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '4px',
    boxSizing: 'border-box',
  };
}

/**
 * Style of the key number in a slot corner.
 *
 * @returns Inline style.
 */
function playerToyPickerKeyStyle(): Partial<CSSStyleDeclaration> {
  return {
    position: 'absolute',
    left: '3px',
    top: '1px',
    fontSize: '9px',
    color: Theme.statusBarTextColor,
  };
}
