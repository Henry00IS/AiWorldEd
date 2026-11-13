import type { PhysicsToyKind } from '@/physics/ball/physics_ball_constants.js';
import { PLAYER_TOY_KINDS, PLAYER_TOY_LABELS } from '@/player/toy/player_toy_models.js';
import { Theme } from '@/theme.js';

/** Selection highlight (the editor's selection orange). */
const PLAYER_TOY_PICKER_ACCENT = '#e86a17';
/** Time the picker stays bright after a change, in milliseconds. */
const PLAYER_TOY_PICKER_BRIGHT_MS = 1600;

/** Slot icons (24 px, current color). */
const PLAYER_TOY_PICKER_ICONS: Readonly<Record<PhysicsToyKind, string>> = {
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
};

/**
 * The play-mode toy picker: a small hotbar at the bottom of the play viewport
 * with one slot per toy. The mouse wheel (or 1-3) moves the selection; it shows
 * the selected toy's name and dims when left alone.
 */
export class PlayerToyPicker {
  private readonly element: HTMLDivElement;
  private readonly label: HTMLDivElement;
  private readonly slots: Map<PhysicsToyKind, HTMLDivElement>;
  private selected: PhysicsToyKind;
  private dimTimer: ReturnType<typeof setTimeout> | null;

  /**
   * Builds the hotbar (detached).
   *
   * @param ownerDocument Document to build in.
   * @param selected Initially selected toy.
   */
  constructor(ownerDocument: Document, selected: PhysicsToyKind) {
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
    PLAYER_TOY_KINDS.forEach((kind, index) => {
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
   * @param kind Selected toy.
   */
  select(kind: PhysicsToyKind): void {
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
   * @param kind Toy kind.
   * @param number Slot number (its key).
   * @returns Slot.
   */
  private buildSlot(ownerDocument: Document, kind: PhysicsToyKind, number: number): HTMLDivElement {
    const slot = ownerDocument.createElement('div');
    slot.setAttribute('role', 'option');
    slot.dataset['toy'] = kind;
    slot.title = PLAYER_TOY_LABELS[kind];
    Object.assign(slot.style, playerToyPickerSlotStyle());
    slot.innerHTML = PLAYER_TOY_PICKER_ICONS[kind];
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
    this.label.textContent = PLAYER_TOY_LABELS[this.selected];
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
 * Steps a selection through the toys, wrapping around.
 *
 * @param kind Current toy.
 * @param step +1 for the next toy, -1 for the previous.
 * @returns New toy.
 */
export function playerToyPickerStep(kind: PhysicsToyKind, step: number): PhysicsToyKind {
  const count = PLAYER_TOY_KINDS.length;
  const index = PLAYER_TOY_KINDS.indexOf(kind);
  return PLAYER_TOY_KINDS[(((index + Math.sign(step)) % count) + count) % count] ?? kind;
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
