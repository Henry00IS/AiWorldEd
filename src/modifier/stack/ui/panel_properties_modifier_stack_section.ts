import type * as THREE from 'three';
import type { CommandStack } from '@/commands/command_stack.js';
import { InputSelect } from '@/ui/input/input_select.js';
import { MenuContext, type MenuContextItem } from '@/ui/menu/menu_context.js';
import { CommandModifierStackSet } from '@/modifier/stack/command_modifier_stack_set.js';
import { CommandModifierVolumeBake } from '@/modifier/stack/bake/command_modifier_volume_bake.js';
import { modifierStackStatusRead } from '@/modifier/stack/evaluate/modifier_stack_status.js';
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
import type { ModifierStackSettings } from '@/modifier/stack/modifier_stack_types.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { modifierStackPickNoteTake, type ModifierStackPickNote } from '@/modifier/stack/pick/modifier_stack_pick.js';
import { onUiThemeChromeRefresh } from '@/ui/theme/theme_ui_refresh.js';
import { modifierStackUiRepaint } from './modifier_stack_ui_paint.js';
import { ModifierStackAffects } from './modifier_stack_affects.js';
import { ModifierStackCard, type ModifierStackCardActions } from './modifier_stack_card.js';
import { modifierStackUiRow, modifierStackUiText, modifierStackUiTextButton } from './modifier_stack_ui_style.js';

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
  private readonly bakeButton: HTMLButtonElement;
  private cards = new Map<string, ModifierStackCard>();
  private signature = '';
  private volume: THREE.Object3D | null = null;
  private commandStack: CommandStack | null = null;
  private menu: MenuContext | null = null;
  private picked: ModifierStackPickNote | undefined;

  /**
   * Creates the section.
   *
   * @param createSectionContainer Section chrome factory.
   * @param createSectionHeader Header factory.
   */
  constructor(createSectionContainer: () => HTMLElement, createSectionHeader: (title: string) => HTMLElement) {
    this.section = createSectionContainer();
    this.section.style.display = 'none';
    this.section.appendChild(createSectionHeader('Modifier Volume'));
    this.note = modifierStackUiText('div', 'Select a single modifier volume to edit its stack.', true);
    this.status = modifierStackUiText('div', '', true);
    this.cardsHost = document.createElement('div');
    this.affects = new ModifierStackAffects((excludedIds) => this.edit((stack) => ({ ...stack, excludedIds })));
    this.bakeButton = modifierStackUiTextButton(
      'Bake',
      'Turn the result into ordinary brushes and remove this volume',
      () => this.bake(),
    );
    this.grouping.bindCommit(() =>
      this.edit((stack) => ({ ...stack, grouping: this.grouping.getValue() === 'brush' ? 'brush' : 'compound' })),
    );
    this.body = this.createBody();
    Object.assign(this.note.style, { padding: '6px 8px' });
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
   * Shows the section when the selection is only modifier volumes.
   *
   * @param objects Current selection.
   */
  updateFromObjects(objects: readonly THREE.Object3D[]): void {
    const volumes = objects.filter((object) => ModifierVolume.isVolume(object));
    const onlyVolumes = objects.length > 0 && volumes.length === objects.length;
    this.section.style.display = onlyVolumes ? 'block' : 'none';
    const volume = volumes.length === 1 ? (volumes[0] ?? null) : null;
    if (volume !== this.volume) this.picked = volume ? modifierStackPickNoteTake(volume) : undefined;
    this.volume = volume;
    this.note.style.display = onlyVolumes && !this.volume ? 'block' : 'none';
    this.body.style.display = this.volume ? 'block' : 'none';
    this.refresh();
  }

  /** Re-reads the bound volume into every control. */
  refresh(): void {
    if (!this.volume) return;
    const settings = ModifierVolume.read(this.volume);
    this.grouping.setSharedValues([settings.grouping]);
    this.writeStatus(settings);
    this.syncCards(this.volume, settings);
    this.affects.update(this.volume, settings.excludedIds);
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
    Object.assign(toolbar.style, { display: 'flex', gap: '6px', padding: '6px 8px' });
    toolbar.append(
      modifierStackUiTextButton('+ Add modifier', 'Add a modifier to the end of the stack', (event) =>
        this.openAddMenu(event.currentTarget as HTMLElement),
      ),
      this.bakeButton,
    );
    Object.assign(this.status.style, { padding: '0 8px 6px' });
    this.status.title = MODIFIER_STACK_SECTION_CAPTURE_HINT;
    body.append(
      toolbar,
      this.status,
      this.cardsHost,
      modifierStackUiRow(
        'Capture',
        this.grouping.getElement(),
        `Whole groups copy a compound with all its brushes. ${MODIFIER_STACK_SECTION_CAPTURE_HINT}`,
      ),
      this.affects.getElement(),
    );
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
    this.status.textContent =
      (status
        ? `Captures ${status.captured} · makes ${status.derived} brush${status.derived === 1 ? '' : 'es'}${empty}`
        : `Not evaluated yet${empty}`) + this.pickedText(settings);
    this.bakeButton.disabled = settings.modifiers.length === 0;
    this.bakeButton.style.opacity = this.bakeButton.disabled ? '0.5' : '1';
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
   * Pushes one undoable stack edit and refreshes the panel.
   *
   * @param change Builds the next stack from the current one.
   */
  private edit(change: (stack: ModifierStackSettings) => ModifierStackSettings): void {
    if (!this.volume) return;
    const before = ModifierVolume.read(this.volume);
    const after = change(before);
    if (JSON.stringify(after) === JSON.stringify(before)) return;
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
    for (const category of ['generate', 'duplicate', 'shape'] as const) {
      if (items.length > 0) items.push({ kind: 'separator' });
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
   * Opens the per-modifier menu.
   *
   * @param id Modifier id.
   * @param anchor Button under which the menu opens.
   */
  private openCardMenu(id: string, anchor: HTMLElement): void {
    const modifiers = this.volume ? ModifierVolume.read(this.volume).modifiers : [];
    const count = modifiers.length;
    const index = modifiers.findIndex((entry) => entry.id === id);
    this.showMenu(
      [
        this.moveItem('Move up', id, index - 1, index <= 0),
        this.moveItem('Move down', id, index + 1, index >= count - 1),
        this.moveItem('Move to top', id, 0, index <= 0),
        this.moveItem('Move to bottom', id, count, index >= count - 1),
        { kind: 'separator' },
        {
          label: 'Duplicate',
          disabled: count >= MODIFIER_STACK_MAX_MODIFIERS,
          callback: () => this.edit((stack) => modifierStackDuplicate(stack, id)),
        },
        { label: 'Delete', callback: () => this.edit((stack) => modifierStackRemove(stack, id)) },
      ],
      anchor,
    );
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
    this.volume = null;
    this.section.style.display = 'none';
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
    'No modifiers yet. Use + Add modifier: e.g. Stairs, then Bevel, then Mirror.',
    true,
  );
  Object.assign(note.style, { padding: '4px 8px 8px' });
  return note;
}
