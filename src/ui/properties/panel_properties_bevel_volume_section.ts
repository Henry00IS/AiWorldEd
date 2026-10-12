import type * as THREE from 'three';
import type { CommandStack } from '@/commands/command_stack.js';
import { CommandModifierBevelDistanceSet } from '@/modifier/volume/command_modifier_bevel_distance_set.js';
import { ModifierVolumeBevel } from '@/modifier/volume/modifier_volume_bevel.js';
import { InputNumeric } from '@/ui/input/input_numeric.js';

/** Inspector section for bevel volume chamfer distance. */
export class PanelPropertiesBevelVolumeSection {
  private readonly section: HTMLElement;
  private readonly distanceInput: InputNumeric;
  private commandStack: CommandStack | null;
  private bound: THREE.Object3D[];

  /**
   * Creates the section.
   *
   * @param createSectionContainer Section chrome factory.
   * @param createSectionHeader Header factory.
   */
  constructor(createSectionContainer: () => HTMLElement, createSectionHeader: (title: string) => HTMLElement) {
    this.commandStack = null;
    this.bound = [];
    this.section = createSectionContainer();
    this.section.style.display = 'none';
    this.section.appendChild(createSectionHeader('Bevel Volume'));
    this.distanceInput = new InputNumeric({ width: '72px', ariaLabel: 'Bevel distance', step: 0.01 });
    this.distanceInput.bindCommit(() => this.commitDistance());
    this.section.appendChild(this.createRow());
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
   * Sets the undo stack used by distance edits.
   *
   * @param stack Command stack.
   */
  setCommandStack(stack: CommandStack | null): void {
    this.commandStack = stack;
  }

  /**
   * Shows the section when every selected object is a bevel volume.
   *
   * @param objects Current selection.
   */
  updateFromObjects(objects: readonly THREE.Object3D[]): void {
    this.bound = objects.filter((object) => ModifierVolumeBevel.isVolume(object));
    const onlyVolumes = objects.length > 0 && this.bound.length === objects.length;
    this.section.style.display = onlyVolumes ? 'block' : 'none';
    if (!onlyVolumes) return;
    const distances = this.bound.map((volume) => ModifierVolumeBevel.readDistance(volume));
    this.distanceInput.setSharedValues(distances, 2);
  }

  /**
   * Builds the distance row.
   *
   * @returns Row element.
   */
  private createRow(): HTMLElement {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.gap = '8px';
    row.style.padding = '0 8px 8px';
    const label = document.createElement('span');
    label.textContent = 'Distance';
    label.style.fontFamily = 'monospace';
    label.style.fontSize = '11px';
    row.appendChild(label);
    row.appendChild(this.distanceInput.getElement());
    return row;
  }

  /** Writes a committed distance through the undo stack. */
  private commitDistance(): void {
    const next = this.distanceInput.parseNumberOrNull();
    if (next === null || this.bound.length === 0) return;
    const changes = this.bound.map((volume) => ({
      volume,
      before: ModifierVolumeBevel.readDistance(volume),
      after: Math.max(0, next),
    }));
    const command = new CommandModifierBevelDistanceSet(changes);
    if (this.commandStack) this.commandStack.push(command);
    else command.execute();
  }
}
