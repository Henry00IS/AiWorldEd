import type * as THREE from 'three';
import type { CommandStack } from '@/commands/command_stack.js';
import { InputSelect } from '@/ui/input/input_select.js';
import { MenuContext, type MenuContextItem } from '@/ui/menu/menu_context.js';
import { CommandModifierStackSet } from '@/modifier/stack/command_modifier_stack_set.js';
import { CommandModifierVolumeBake } from '@/modifier/stack/bake/command_modifier_volume_bake.js';
import { modifierStackStatusRead, type ModifierStackStatus } from '@/modifier/stack/evaluate/modifier_stack_status.js';
import { modifierStackKindFind, modifierStackKinds } from '@/modifier/stack/modifier_stack_catalog.js';
import {
  modifierStackAdd,
  modifierStackDuplicate,
  modifierStackMove,
  modifierStackParameterSet,
  modifierStackPatch,
  modifierStackRemove,
} from '@/modifier/stack/modifier_stack_operations.js';
import { MODIFIER_STACK_MAX_MODIFIERS } from '@/modifier/stack/modifier_stack_settings.js';
import type { ModifierStackSettings, ModifierStackValue } from '@/modifier/stack/modifier_stack_types.js';
import { ModifierVolume, modifierVolumeSceneRoot } from '@/modifier/stack/modifier_volume.js';
import { modifierBevelRefreshScene } from '@/modifier/compile/modifier_bevel_scene_refresh.js';
import { curveEditorCloseActive } from '@/curve/ui/curve_editor.js';
import { modifierStackPickNoteTake, type ModifierStackPickNote } from '@/modifier/stack/pick/modifier_stack_pick.js';
import { onUiThemeChromeRefresh } from '@/ui/theme/theme_ui_refresh.js';
import { modifierStackUiRepaint } from './modifier_stack_ui_paint.js';
import { ModifierStackAffects } from './modifier_stack_affects.js';
import { modifierStackHelpersSync } from '@/modifier/stack/helpers/modifier_stack_helpers.js';
import { ModifierStackCard, type ModifierStackCardActions } from './modifier_stack_card.js';
import {
  modifierStackClipboardCardItems,
  modifierStackClipboardVolumeItems,
  type ModifierStackClipboardMenuHost,
} from './modifier_stack_clipboard_menu.js';
import {
  MODIFIER_STACK_UI_GLYPHS,
  modifierStackUiCaption,
  modifierStackUiIconButton,
  modifierStackUiRow,
  modifierStackUiText,
  modifierStackUiTextButton,
} from './modifier_stack_ui_style.js';
import { MODIFIER_STACK_UI_CLASSES, modifierStackUiStylesheetEnsure } from './modifier_stack_ui_layout.js';

/** Explains why volumes only capture authored brushes. */
export const MODIFIER_STACK_SECTION_CAPTURE_HINT =
  "A volume captures authored brushes only, never another volume's output, so volumes cannot feed each other in a loop. Stack modifiers in one volume to chain them.";

/**
 * Inspector for a modifier volume: an ordered stack of collapsible modifier
 * panels with eye toggles, reordering, an Add modifier menu and Bake.
 */
export class PanelPropertiesModifierStackSection {
  private readonly section: HTMLElement;
  private readonly body: HTMLElement;
  private readonly note: HTMLElement;
  private readonly status: HTMLElement;
  private readonly cardsHost: HTMLElement;
  private readonly grouping = new InputSelect(
    [
      { value: 'compound', label: 'Whole groups' },
      { value: 'brush', label: 'Single brushes' },
    ],
    'Capture',
  );
  private readonly affects: ModifierStackAffects;
  private cards = new Map<string, ModifierStackCard>();
  private signature = '';
  private volume: THREE.Object3D | null = null;
  private commandStack: CommandStack | null = null;
  private menu: MenuContext | null = null;
  private picked: ModifierStackPickNote | undefined;
  private previewBefore: ModifierStackSettings | null = null;
  private sceneChanged: (() => void) | null = null;
  private notice = '';
  private readonly title: HTMLElement;
  private readonly volumeRows: HTMLElement;

  /**
   * Creates the section.
   *
   * @param createSectionContainer Section chrome factory.
   * @param createSectionHeader Header factory.
   */
  constructor(createSectionContainer: () => HTMLElement, createSectionHeader: (title: string) => HTMLElement) {
    this.section = createSectionContainer();
    this.section.style.display = 'none';
    this.title = modifierStackUiText('span', '');
    this.section.appendChild(this.createHeader(createSectionHeader('Modifier Volume')));
    this.volumeRows = document.createElement('div');
    this.note = modifierStackUiText('div', 'Select a single modifier volume to edit its stack.', true);
    this.status = modifierStackUiText('div', '', true);
    this.cardsHost = document.createElement('div');
    this.affects = new ModifierStackAffects((excludedIds) => this.edit((stack) => ({ ...stack, excludedIds })));
    this.grouping.bindCommit(() =>
      this.edit((stack) => ({ ...stack, grouping: this.grouping.getValue() === 'brush' ? 'brush' : 'compound' })),
    );
    this.body = this.createBody();
    Object.assign(this.note.style, { padding: '6px' });
    modifierStackUiStylesheetEnsure();
    this.body.classList.add(MODIFIER_STACK_UI_CLASSES.root);
    this.section.append(this.note, this.body);
    onUiThemeChromeRefresh(() => modifierStackUiRepaint(this.section));
  }

  /**
   * Returns the section element.
   *
   * @returns Section root.
   */
  getElement(): HTMLElement {
    return this.section;
  }

  /**
   * Sets the undo stack used for every edit.
   *
   * @param stack Command stack, or null.
   */
  setCommandStack(stack: CommandStack | null): void {
    this.commandStack = stack;
  }

  /**
   * Sets what runs after the section changed the scene structure, such as a
   * bake removing the volume.
   *
   * @param callback Refresh callback, or null.
   */
  setSceneChanged(callback: (() => void) | null): void {
    this.sceneChanged = callback;
  }

  /**
   * Shows the section when the selection is only modifier volumes.
   *
   * @param objects Current selection.
   */
  updateFromObjects(objects: readonly THREE.Object3D[]): void {
    const volumes = objects.filter((object) => ModifierVolume.isVolume(object));
    const onlyVolumes = objects.length > 0 && volumes.length === objects.length;
    this.section.style.display = onlyVolumes ? 'block' : 'none';
    const volume = volumes.length === 1 ? (volumes[0] ?? null) : null;
    if (volume !== this.volume) this.volumeLeave(volume);
    this.volume = volume;
    this.note.style.display = onlyVolumes && !this.volume ? 'block' : 'none';
    this.body.style.display = this.volume ? 'block' : 'none';
    this.refresh();
  }

  /** Re-reads the bound volume into every control. */
  refresh(): void {
    if (!this.volume) return;
    const settings = ModifierVolume.read(this.volume);
    const generator = settings.role === 'generator';
    this.title.textContent = generator ? 'Generator' : 'Modifier Volume';
    this.volumeRows.style.display = generator ? 'none' : '';
    this.grouping.setSharedValues([settings.grouping]);
    this.writeStatus(settings);
    this.syncCards(this.volume, settings);
    this.affects.update(this.volume, settings.excludedIds);
    modifierStackHelpersSync(this.volume, true);
  }

  /**
   * Describes the piece the user clicked to select this volume.
   *
   * @param settings Stack settings.
   * @returns Suffix for the status line, or empty.
   */
  private pickedText(settings: ModifierStackSettings): string {
    const step = settings.modifiers.find((entry) => entry.id === this.picked?.stepId);
    if (!this.picked || !step) return '';
    const source = this.picked.sourceName ? ` from ${this.picked.sourceName}` : '';
    return ` · picked piece: ${step.name}${source} (click again to select the source)`;
  }

  /**
   * Builds the toolbar, cards host and volume-wide settings.
   *
   * @returns Body element.
   */
  private createBody(): HTMLElement {
    const body = document.createElement('div');
    const toolbar = document.createElement('div');
    Object.assign(toolbar.style, { display: 'flex', padding: '2px 6px 6px' });
    toolbar.append(modifierStackAddButton((anchor) => this.openAddMenu(anchor)));
    Object.assign(this.status.style, { padding: '0 6px 6px' });
    this.status.title = MODIFIER_STACK_SECTION_CAPTURE_HINT;
    this.volumeRows.append(
      modifierStackSectionCaption('Volume'),
      modifierStackSectionRow(
        modifierStackUiRow(
          'Capture',
          this.grouping.getElement(),
          `Whole groups copy a compound with all its brushes. ${MODIFIER_STACK_SECTION_CAPTURE_HINT}`,
        ),
      ),
      this.affects.getElement(),
    );
    body.append(toolbar, this.status, this.cardsHost, this.volumeRows);
    return body;
  }

  /**
   * Writes the capture and output summary.
   *
   * @param settings Current stack.
   */
  private writeStatus(settings: ModifierStackSettings): void {
    const status = this.volume ? modifierStackStatusRead(this.volume) : null;
    const empty = settings.modifiers.length === 0 ? ' · add a modifier to start' : '';
    const made = status ? `${status.derived} brush${status.derived === 1 ? '' : 'es'}` : '';
    const sources = status ? `${status.captured} source${status.captured === 1 ? '' : 's'} → ` : '';
    const summary = settings.role === 'generator' ? `Builds ${made}` : `${sources}${made}`;
    this.status.textContent =
      (status ? `${summary}${this.skippedText(status)}${empty}` : `Not evaluated yet${empty}`) +
      this.pickedText(settings) +
      (this.notice ? ` · ${this.notice}` : '');
  }

  /**
   * Describes touching brushes left out because they are invalid. Also names
   * brushes kept unbevelled because their bevel would be invalid.
   *
   * @param status Volume feedback.
   * @returns Summary suffix, or empty.
   */
  private skippedText(status: ModifierStackStatus): string {
    const skipped = status.skipped
      ? ` · ${status.skipped} invalid brush${status.skipped === 1 ? '' : 'es'} skipped`
      : '';
    const unbevelled = status.unbevelled ? ` · ${status.unbevelled} kept unbevelled (bevel would be invalid)` : '';
    return skipped + unbevelled;
  }

  /**
   * Rebuilds cards when the stack's shape changed, then updates them.
   *
   * @param volume Bound volume.
   * @param settings Current stack.
   */
  private syncCards(volume: THREE.Object3D, settings: ModifierStackSettings): void {
    const signature = `${volume.uuid}|${settings.modifiers.map((entry) => `${entry.id}:${entry.kind}:${entry.name}`).join(',')}`;
    if (signature !== this.signature) this.rebuildCards(volume, settings);
    this.signature = signature;
    const reports = modifierStackStatusRead(volume)?.steps ?? [];
    settings.modifiers.forEach((entry, index) => {
      const card = this.cards.get(entry.id);
      card?.update(entry, modifierStackKindFind(entry.kind), reports[index], this.commandStack);
      card?.setPicked(entry.id === this.picked?.stepId);
    });
  }

  /**
   * Recreates every card in stack order.
   *
   * @param volume Bound volume.
   * @param settings Current stack.
   */
  private rebuildCards(volume: THREE.Object3D, settings: ModifierStackSettings): void {
    this.cards = new Map(
      settings.modifiers.map((entry) => [
        entry.id,
        new ModifierStackCard(volume, entry, modifierStackKindFind(entry.kind), this.cardActions()),
      ]),
    );
    this.cardsHost.replaceChildren(...[...this.cards.values()].map((card) => card.getElement()));
    if (settings.modifiers.length === 0) this.cardsHost.appendChild(modifierStackEmptyNote());
  }

  /**
   * Returns the callbacks cards raise.
   *
   * @returns Card actions.
   */
  private cardActions(): ModifierStackCardActions {
    return {
      onToggleEnabled: (id) =>
        this.edit((stack) =>
          modifierStackPatch(stack, id, { enabled: !stack.modifiers.find((entry) => entry.id === id)?.enabled }),
        ),
      onToggleExpanded: (id) => this.toggleExpanded(id),
      onMenu: (id, anchor) => this.openCardMenu(id, anchor),
      onParameter: (id, key, value) => this.edit((stack) => modifierStackParameterSet(stack, id, key, value)),
      onPreview: (id, key, value) => this.preview(id, key, value),
      onDrop: (dragged, target, after) => this.edit((stack) => modifierStackDropMove(stack, dragged, target, after)),
      commandStack: () => this.commandStack,
    };
  }

  /**
   * Folds or unfolds a card. Panel state is stored with the volume but is not
   * an undo step and does not re-evaluate the scene.
   *
   * @param id Modifier id.
   */
  private toggleExpanded(id: string): void {
    if (!this.volume) return;
    const stack = ModifierVolume.read(this.volume);
    const entry = stack.modifiers.find((candidate) => candidate.id === id);
    if (entry) ModifierVolume.write(this.volume, modifierStackPatch(stack, id, { expanded: !entry.expanded }));
    this.refresh();
  }

  /**
   * Shows a parameter while it is dragged: the volume and scene update at once,
   * and the edit that ends the drag becomes one undo step from the state before
   * the drag.
   *
   * @param id Modifier id.
   * @param key Parameter key.
   * @param value Dragged value.
   */
  private preview(id: string, key: string, value: ModifierStackValue): void {
    if (!this.volume) return;
    const current = ModifierVolume.read(this.volume);
    this.previewBefore ??= current;
    ModifierVolume.write(this.volume, modifierStackParameterSet(current, id, key, value));
    modifierStackHelpersSync(this.volume, true);
    if (this.volume.parent) modifierBevelRefreshScene(modifierVolumeSceneRoot(this.volume));
  }

  /**
   * Puts the volume back after a drag that ended where it started.
   *
   * @param before Stack before the drag.
   */
  private previewRevert(before: ModifierStackSettings): void {
    if (!this.volume || JSON.stringify(ModifierVolume.read(this.volume)) === JSON.stringify(before)) return;
    ModifierVolume.write(this.volume, before);
    if (this.volume.parent) modifierBevelRefreshScene(modifierVolumeSceneRoot(this.volume));
    this.refresh();
  }

  /**
   * Closes the open curve editor and notes the picked piece when the edited
   * volume changes.
   *
   * @param next Newly bound volume, or null.
   */
  private volumeLeave(next: THREE.Object3D | null): void {
    this.notice = '';
    curveEditorCloseActive();
    if (this.volume) modifierStackHelpersSync(this.volume, false);
    this.previewBefore = null;
    this.picked = next ? modifierStackPickNoteTake(next) : undefined;
  }

  /**
   * Pushes one undoable stack edit and refreshes the panel.
   *
   * @param change Builds the next stack from the current one.
   */
  private edit(change: (stack: ModifierStackSettings) => ModifierStackSettings): void {
    if (!this.volume) return;
    this.notice = '';
    const before = this.previewBefore ?? ModifierVolume.read(this.volume);
    this.previewBefore = null;
    const after = change(ModifierVolume.read(this.volume));
    if (JSON.stringify(after) === JSON.stringify(before)) return this.previewRevert(before);
    const command = new CommandModifierStackSet(this.volume, before, after);
    if (this.commandStack) this.commandStack.push(command);
    else command.execute();
    this.refresh();
  }

  /**
   * Opens the Add modifier menu, grouped by category.
   *
   * @param anchor Button under which the menu opens.
   */
  private openAddMenu(anchor: HTMLElement): void {
    const full = this.volume ? ModifierVolume.read(this.volume).modifiers.length >= MODIFIER_STACK_MAX_MODIFIERS : true;
    const items: MenuContextItem[] = [];
    for (const [category, heading] of MODIFIER_STACK_ADD_MENU_SECTIONS) {
      items.push({ kind: 'heading', label: heading });
      for (const kind of modifierStackKinds.filter((candidate) => candidate.category === category))
        items.push({
          label: kind.label,
          disabled: full,
          callback: () => this.edit((stack) => modifierStackAdd(stack, kind.id)),
        });
    }
    this.showMenu(items, anchor);
  }

  /**
   * Adds the volume actions button to the section header, right-aligned.
   *
   * @param header Section header.
   * @returns The same header.
   */
  private createHeader(header: HTMLElement): HTMLElement {
    Object.assign(header.style, { display: 'flex', alignItems: 'center', gap: '4px' });
    const title = this.title;
    title.append(...header.childNodes);
    Object.assign(title.style, { fontSize: '', fontFamily: '' });
    Object.assign(title.style, { flex: '1', minWidth: '0', overflow: 'hidden', textOverflow: 'ellipsis' });
    const actions = modifierStackUiIconButton(MODIFIER_STACK_UI_GLYPHS.more, 'Volume actions', (event) =>
      this.openVolumeMenu(event.currentTarget as HTMLElement),
    );
    actions.title = 'Volume actions: bake to brushes, fold or unfold every modifier';
    header.append(title, actions);
    return header;
  }

  /**
   * Opens the volume actions menu: bake, copy and paste modifiers, and fold or
   * unfold every card.
   *
   * @param anchor Button under which the menu opens.
   */
  private openVolumeMenu(anchor: HTMLElement): void {
    const empty = !this.volume || ModifierVolume.read(this.volume).modifiers.length === 0;
    this.showMenu(
      [
        { label: 'Bake to brushes', disabled: empty, callback: () => this.bake() },
        { kind: 'separator' },
        ...modifierStackClipboardVolumeItems(this.clipboardHost()),
        { kind: 'separator' },
        { label: 'Unfold all', disabled: empty, callback: () => this.foldAll(true) },
        { label: 'Fold all', disabled: empty, callback: () => this.foldAll(false) },
      ],
      anchor,
    );
  }

  /**
   * Folds or unfolds every card without an undo step.
   *
   * @param expanded True to unfold.
   */
  private foldAll(expanded: boolean): void {
    if (!this.volume) return;
    const stack = ModifierVolume.read(this.volume);
    ModifierVolume.write(this.volume, {
      ...stack,
      modifiers: stack.modifiers.map((entry) => ({ ...entry, expanded })),
    });
    this.refresh();
  }

  /**
   * Locates a modifier for its menu. A generator node's generator is pinned at
   * the top: it cannot move, be duplicated, or be deleted, and nothing moves
   * above it.
   *
   * @param id Modifier id.
   * @returns Stack size, index, first movable index, and whether it is pinned.
   */
  private cardPlace(id: string): { count: number; index: number; top: number; pinned: boolean } {
    const settings = this.volume ? ModifierVolume.read(this.volume) : null;
    const index = settings?.modifiers.findIndex((entry) => entry.id === id) ?? -1;
    const top = settings?.role === 'generator' ? 1 : 0;
    return { count: settings?.modifiers.length ?? 0, index, top, pinned: index < top };
  }

  /**
   * Opens the per-modifier menu.
   *
   * @param id Modifier id.
   * @param anchor Button under which the menu opens.
   */
  private openCardMenu(id: string, anchor: HTMLElement): void {
    const { count, index, top, pinned } = this.cardPlace(id);
    this.showMenu(
      [
        this.moveItem('Move up', id, index - 1, pinned || index <= top),
        this.moveItem('Move down', id, index + 1, pinned || index >= count - 1),
        this.moveItem('Move to top', id, top, pinned || index <= top),
        this.moveItem('Move to bottom', id, count, pinned || index >= count - 1),
        { kind: 'separator' },
        {
          label: 'Duplicate',
          disabled: pinned || count >= MODIFIER_STACK_MAX_MODIFIERS,
          callback: () => this.edit((stack) => modifierStackDuplicate(stack, id)),
        },
        { label: 'Delete', disabled: pinned, callback: () => this.edit((stack) => modifierStackRemove(stack, id)) },
        { kind: 'separator' },
        ...this.cardClipboardItems(id),
      ],
      anchor,
    );
  }

  /**
   * Builds a card's clipboard entries.
   *
   * @param id Modifier id.
   * @returns Menu items, or none when the modifier is gone.
   */
  private cardClipboardItems(id: string): MenuContextItem[] {
    const entry = this.volume ? ModifierVolume.read(this.volume).modifiers.find((other) => other.id === id) : undefined;
    return entry ? modifierStackClipboardCardItems(this.clipboardHost(), entry) : [];
  }

  /**
   * Returns what the clipboard menu entries use of this panel.
   *
   * @returns Clipboard menu host.
   */
  private clipboardHost(): ModifierStackClipboardMenuHost {
    return {
      read: () => (this.volume ? ModifierVolume.read(this.volume) : null),
      edit: (change) => this.edit(change),
      notice: (text) => {
        this.notice = text;
        if (this.volume) this.writeStatus(ModifierVolume.read(this.volume));
      },
    };
  }

  /**
   * Builds one move entry of the per-modifier menu.
   *
   * @param label Menu label.
   * @param id Modifier id.
   * @param target Destination index.
   * @param disabled Whether the move is unavailable.
   * @returns Menu item.
   */
  private moveItem(label: string, id: string, target: number, disabled: boolean): MenuContextItem {
    return { label, disabled, callback: () => this.edit((stack) => modifierStackMove(stack, id, target)) };
  }

  /**
   * Shows a menu under an anchor, replacing any open one.
   *
   * @param items Menu items.
   * @param anchor Anchor element.
   */
  private showMenu(items: MenuContextItem[], anchor: HTMLElement): void {
    this.menu?.dispose();
    this.menu = new MenuContext(this.section, items);
    const bounds = anchor.getBoundingClientRect();
    this.menu.show(bounds.left, bounds.bottom + 2);
  }

  /** Bakes the bound volume through the undo stack. */
  private bake(): void {
    if (!this.volume) return;
    const command = new CommandModifierVolumeBake(this.volume);
    if (this.commandStack) this.commandStack.push(command);
    else command.execute();
    modifierStackHelpersSync(this.volume, false);
    this.volume = null;
    this.section.style.display = 'none';
    this.sceneChanged?.();
  }
}

/**
 * Moves a dropped modifier before or after a target.
 *
 * @param stack Current stack.
 * @param dragged Dragged modifier id.
 * @param target Target modifier id.
 * @param after True to insert after the target.
 * @returns Next stack.
 */
export function modifierStackDropMove(
  stack: ModifierStackSettings,
  dragged: string,
  target: string,
  after: boolean,
): ModifierStackSettings {
  if (dragged === target) return stack;
  const rest = stack.modifiers.filter((entry) => entry.id !== dragged);
  const index = rest.findIndex((entry) => entry.id === target);
  return index < 0 ? stack : modifierStackMove(stack, dragged, index + (after ? 1 : 0));
}

/**
 * Creates the note shown in an empty stack.
 *
 * @returns Note element.
 */
function modifierStackEmptyNote(): HTMLElement {
  const note = modifierStackUiText(
    'div',
    'No modifiers yet. Use Add modifier: e.g. Stairs, then Bevel, then Mirror.',
    true,
  );
  Object.assign(note.style, { padding: '4px 6px 8px' });
  return note;
}

/**
 * Add-menu sections: catalog category and its heading. Column, Stairs, and Arch
 * are generator nodes added from Add Brush, not volume modifiers.
 */
const MODIFIER_STACK_ADD_MENU_SECTIONS = [
  ['duplicate', 'Duplicate'],
  ['shape', 'Finish'],
] as const;

/**
 * Creates the full-width Add modifier button: a plus icon and a label that
 * never wraps.
 *
 * @param onOpen Opens the menu under the button.
 * @returns Button element.
 */
function modifierStackAddButton(onOpen: (anchor: HTMLElement) => void): HTMLButtonElement {
  const button = modifierStackUiTextButton('', 'Add a modifier to the end of the stack', (event) =>
    onOpen(event.currentTarget as HTMLElement),
  );
  const icon = document.createElement('span');
  icon.innerHTML = MODIFIER_STACK_UI_GLYPHS.plus;
  Object.assign(icon.style, { display: 'inline-flex', flexShrink: '0' });
  const label = document.createElement('span');
  label.textContent = 'Add modifier';
  label.className = MODIFIER_STACK_UI_CLASSES.ellipsis;
  button.append(icon, label);
  Object.assign(button.style, { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' });
  Object.assign(button.style, { minWidth: '0', whiteSpace: 'nowrap', height: '26px', padding: '0 8px' });
  return button;
}

/**
 * Creates a section-level caption aligned with the toolbar.
 *
 * @param text Caption text.
 * @returns Caption element.
 */
function modifierStackSectionCaption(text: string): HTMLElement {
  const caption = modifierStackUiCaption(text);
  caption.style.padding = '6px 6px 4px';
  return caption;
}

/**
 * Aligns a row with the section edge instead of a card's inner edge.
 *
 * @param row Row element.
 * @returns The same row.
 */
function modifierStackSectionRow(row: HTMLElement): HTMLElement {
  row.style.padding = '0 6px 6px';
  return row;
}
