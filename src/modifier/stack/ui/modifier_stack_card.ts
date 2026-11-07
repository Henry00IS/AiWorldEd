import type * as THREE from 'three';
import type { CommandStack } from '@/commands/command_stack.js';
import { IconOutlinerVisibility } from '@/outliner/ui/icon_outliner_visibility.js';
import { PanelPropertiesBevelVolumeSection } from '@/ui/properties/panel_properties_bevel_volume_section.js';
import { getActiveUiThemePalette } from '@/ui/theme/theme_ui_palette.js';
import { modifierStackUiPaint } from './modifier_stack_ui_paint.js';
import type { ModifierStackKind } from '@/modifier/stack/kinds/modifier_stack_kind.js';
import { modifierStackBevelProxy } from '@/modifier/stack/evaluate/modifier_stack_bevel_proxy.js';
import type {
  ModifierStackEntry,
  ModifierStackStepReport,
  ModifierStackValue,
} from '@/modifier/stack/modifier_stack_types.js';
import { ModifierStackFieldRows } from './modifier_stack_field_rows.js';
import { MODIFIER_STACK_UI_GLYPHS, modifierStackUiIconButton, modifierStackUiText } from './modifier_stack_ui_style.js';

/** MIME type carrying a dragged modifier id. */
export const MODIFIER_STACK_DRAG_TYPE = 'application/x-modifier-stack-entry';

/** Callbacks a card raises; the section turns them into undoable edits. */
export interface ModifierStackCardActions {
  /** Flips the eye of a modifier. */
  onToggleEnabled: (id: string) => void;
  /** Folds or unfolds a modifier panel. */
  onToggleExpanded: (id: string) => void;
  /** Opens the modifier menu under an anchor. */
  onMenu: (id: string, anchor: HTMLElement) => void;
  /** Commits one parameter. */
  onParameter: (id: string, key: string, value: ModifierStackValue) => void;
  /** Drops a dragged modifier before or after this one. */
  onDrop: (draggedId: string, targetId: string, after: boolean) => void;
  /** Returns the undo stack used by embedded bevel controls. */
  commandStack: () => CommandStack | null;
}

/** Layout of a card header row. */
const MODIFIER_STACK_CARD_HEADER_STYLE: Partial<CSSStyleDeclaration> = {
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  padding: '3px 4px',
  cursor: 'pointer',
  userSelect: 'none',
};

/** Single-line text that truncates with an ellipsis. */
const MODIFIER_STACK_CARD_ELLIPSIS_STYLE: Partial<CSSStyleDeclaration> = {
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

/** Collapsible inspector panel of one modifier. */
export class ModifierStackCard {
  private readonly element: HTMLElement;
  private readonly body: HTMLElement;
  private readonly eye: HTMLButtonElement;
  private readonly chevron: HTMLButtonElement;
  private readonly summary: HTMLElement;
  private readonly report: HTMLElement;
  private readonly fields: ModifierStackFieldRows | null;
  private readonly bevel: PanelPropertiesBevelVolumeSection | null;
  private readonly volume: THREE.Object3D;
  private entry: ModifierStackEntry;

  /**
   * Builds the card.
   *
   * @param volume Owning modifier volume.
   * @param entry Modifier entry.
   * @param kind Installed kind, or undefined when it is unknown.
   * @param actions Card callbacks.
   */
  constructor(
    volume: THREE.Object3D,
    entry: ModifierStackEntry,
    kind: ModifierStackKind | undefined,
    actions: ModifierStackCardActions,
  ) {
    this.volume = volume;
    this.entry = entry;
    this.element = modifierStackCardShell();
    this.eye = modifierStackUiIconButton('', 'Show or mute this modifier', () =>
      actions.onToggleEnabled(this.entry.id),
    );
    this.chevron = modifierStackUiIconButton('', 'Fold or unfold', () => actions.onToggleExpanded(this.entry.id));
    this.summary = modifierStackUiText('span', '', true);
    this.report = modifierStackUiText('div', '', true);
    this.body = document.createElement('div');
    this.fields =
      kind && kind.fields.length > 0
        ? new ModifierStackFieldRows(kind.fields, (key, value) => actions.onParameter(this.entry.id, key, value))
        : null;
    this.bevel = kind && kind.fields.length === 0 ? new PanelPropertiesBevelVolumeSection() : null;
    this.element.appendChild(this.createHeader(kind, actions));
    this.assembleBody(kind);
    this.bindDrop(actions);
  }

  /**
   * Returns the card element.
   *
   * @returns Card root.
   */
  getElement(): HTMLElement {
    return this.element;
  }

  /**
   * Refreshes the card from its entry and the latest evaluation feedback.
   *
   * @param entry Modifier entry.
   * @param kind Installed kind, or undefined.
   * @param report Feedback of the last evaluation, or undefined.
   * @param commandStack Undo stack for embedded bevel controls.
   */
  update(
    entry: ModifierStackEntry,
    kind: ModifierStackKind | undefined,
    report: ModifierStackStepReport | undefined,
    commandStack: CommandStack | null,
  ): void {
    this.entry = entry;
    this.eye.innerHTML = entry.enabled ? IconOutlinerVisibility.openEye() : IconOutlinerVisibility.hiddenEye();
    modifierStackUiPaint(this.eye, entry.enabled ? 'eyeOn' : 'eyeOff');
    this.chevron.innerHTML = entry.expanded ? MODIFIER_STACK_UI_GLYPHS.open : MODIFIER_STACK_UI_GLYPHS.closed;
    this.summary.textContent = kind ? kind.summary(entry.parameters) : 'unknown type';
    this.body.style.display = entry.expanded ? 'block' : 'none';
    this.element.style.opacity = entry.enabled ? '1' : '0.6';
    this.fields?.update(entry.parameters);
    this.bevel?.setCommandStack(commandStack);
    if (entry.expanded) this.bevel?.bind([modifierStackBevelProxy(this.volume, entry)]);
    this.writeReport(report);
  }

  /**
   * Builds the header: grip, chevron, name, summary, eye and menu.
   *
   * @param kind Installed kind.
   * @param actions Card callbacks.
   * @returns Header element.
   */
  private createHeader(kind: ModifierStackKind | undefined, actions: ModifierStackCardActions): HTMLElement {
    const header = document.createElement('div');
    Object.assign(header.style, MODIFIER_STACK_CARD_HEADER_STYLE);
    header.addEventListener('click', () => actions.onToggleExpanded(this.entry.id));
    const name = modifierStackUiText('span', this.entry.name);
    Object.assign(name.style, { fontWeight: 'bold', ...MODIFIER_STACK_CARD_ELLIPSIS_STYLE });
    name.title = kind?.description ?? 'This modifier type is not installed.';
    Object.assign(this.summary.style, { flex: '1', minWidth: '0', ...MODIFIER_STACK_CARD_ELLIPSIS_STYLE });
    const menu = modifierStackUiIconButton(MODIFIER_STACK_UI_GLYPHS.more, 'Modifier menu', (event) =>
      actions.onMenu(this.entry.id, event.currentTarget as HTMLElement),
    );
    header.append(this.createGrip(), this.chevron, name, this.summary, this.eye, menu);
    return header;
  }

  /**
   * Creates the drag handle that starts reordering.
   *
   * @returns Grip element.
   */
  private createGrip(): HTMLElement {
    const grip = document.createElement('span');
    grip.innerHTML = MODIFIER_STACK_UI_GLYPHS.grip;
    grip.title = 'Drag to reorder';
    grip.draggable = true;
    Object.assign(grip.style, {
      cursor: 'grab',
      display: 'inline-flex',
      padding: '0 2px',
      opacity: '0.7',
      lineHeight: '0',
    });
    modifierStackUiPaint(grip, 'text');
    grip.addEventListener('click', (event) => event.stopPropagation());
    grip.addEventListener('dragstart', (event) => {
      event.dataTransfer?.setData(MODIFIER_STACK_DRAG_TYPE, this.entry.id);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    });
    return grip;
  }

  /**
   * Fills the collapsible body.
   *
   * @param kind Installed kind.
   */
  private assembleBody(kind: ModifierStackKind | undefined): void {
    this.body.style.padding = '6px 0 2px';
    modifierStackUiPaint(this.body, 'divider');
    if (!kind)
      this.body.appendChild(
        modifierStackUiText(
          'div',
          'This modifier type is not installed in this build; it passes its input through.',
          true,
        ),
      );
    if (this.fields) this.body.appendChild(this.fields.getElement());
    if (this.bevel) this.body.appendChild(this.bevel.getElement());
    Object.assign(this.report.style, { padding: '0 8px 6px' });
    this.body.appendChild(this.report);
    this.element.appendChild(this.body);
  }

  /**
   * Shows output counts or a warning from the last evaluation.
   *
   * @param report Step feedback.
   */
  private writeReport(report: ModifierStackStepReport | undefined): void {
    this.report.textContent = report
      ? report.error || `Outputs ${report.outputs} brush${report.outputs === 1 ? '' : 'es'}`
      : '';
    modifierStackUiPaint(this.report, report?.error ? 'error' : 'text');
  }

  /**
   * Accepts dropped modifiers, inserting before or after by pointer height.
   *
   * @param actions Card callbacks.
   */
  private bindDrop(actions: ModifierStackCardActions): void {
    const clear = (): void => {
      this.element.style.boxShadow = 'none';
    };
    this.element.addEventListener('dragover', (event) => {
      if (!event.dataTransfer?.types.includes(MODIFIER_STACK_DRAG_TYPE)) return;
      event.preventDefault();
      const after = modifierStackCardDropAfter(this.element, event);
      const accent = getActiveUiThemePalette().selectionBorderColor;
      this.element.style.boxShadow = after ? `inset 0 -2px 0 ${accent}` : `inset 0 2px 0 ${accent}`;
    });
    this.element.addEventListener('dragleave', clear);
    this.element.addEventListener('drop', (event) => {
      clear();
      const dragged = event.dataTransfer?.getData(MODIFIER_STACK_DRAG_TYPE);
      if (!dragged) return;
      event.preventDefault();
      actions.onDrop(dragged, this.entry.id, modifierStackCardDropAfter(this.element, event));
    });
  }
}

/**
 * Creates the rounded card container.
 *
 * @returns Card element.
 */
function modifierStackCardShell(): HTMLElement {
  const card = document.createElement('div');
  Object.assign(card.style, { margin: '0 8px 6px', borderRadius: '6px', overflow: 'hidden' });
  return modifierStackUiPaint(card, 'card');
}

/**
 * Returns whether the pointer is in the lower half of a card.
 *
 * @param card Card element.
 * @param event Drag event.
 * @returns True to insert after the card.
 */
function modifierStackCardDropAfter(card: HTMLElement, event: DragEvent): boolean {
  const bounds = card.getBoundingClientRect();
  return event.clientY > bounds.top + bounds.height / 2;
}
