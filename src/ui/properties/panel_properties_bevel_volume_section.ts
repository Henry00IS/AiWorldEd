import type * as THREE from 'three';
import type { CommandStack } from '@/commands/command_stack.js';
import { Theme } from '@/theme.js';
import { CommandModifierBevelDistanceSet } from '@/modifier/volume/command_modifier_bevel_distance_set.js';
import { ModifierVolumeBevel, type ModifierBevelVolumeSettings } from '@/modifier/volume/modifier_volume_bevel.js';
import { InputNumeric } from '@/ui/input/input_numeric.js';

/** Inspector section for bevel volume chamfer controls. */
export class PanelPropertiesBevelVolumeSection {
  private readonly section: HTMLElement;
  private readonly distanceInput: InputNumeric;
  private readonly segmentsInput: InputNumeric;
  private readonly angleInput: InputNumeric;
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
    this.segmentsInput = new InputNumeric({ width: '72px', ariaLabel: 'Bevel segments', step: 1 });
    this.angleInput = new InputNumeric({ width: '72px', ariaLabel: 'Bevel angle', step: 1 });
    this.distanceInput.bindCommit(() => this.commitDistance());
    this.segmentsInput.bindCommit(() => this.commitSegments());
    this.angleInput.bindCommit(() => this.commitAngle());
    this.section.appendChild(this.createRow('Distance', this.distanceInput));
    this.section.appendChild(this.createRow('Segments', this.segmentsInput));
    this.section.appendChild(this.createRow('Angle', this.angleInput));
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
    const settings = this.bound.map((volume) => ModifierVolumeBevel.readSettings(volume));
    this.distanceInput.setSharedValues(
      settings.map((entry) => entry.distance),
      2,
    );
    this.segmentsInput.setSharedValues(
      settings.map((entry) => entry.segments),
      0,
    );
    this.angleInput.setSharedValues(
      settings.map((entry) => entry.angleDegrees),
      1,
    );
  }

  /**
   * Builds one labeled numeric row.
   *
   * @param labelText Row caption.
   * @param input Numeric field.
   * @returns Row element.
   */
  private createRow(labelText: string, input: InputNumeric): HTMLElement {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.gap = '8px';
    row.style.padding = '0 8px 8px';
    const label = document.createElement('span');
    label.textContent = labelText;
    label.style.color = Theme.buttonTextColor;
    label.style.fontFamily = 'monospace';
    label.style.fontSize = '12px';
    label.style.width = '72px';
    row.appendChild(label);
    row.appendChild(input.getElement());
    return row;
  }

  /** Writes a committed distance through the undo stack. */
  private commitDistance(): void {
    const next = this.distanceInput.parseNumberOrNull();
    if (next === null) return;
    this.commitPatch((settings) => ({ ...settings, distance: Math.max(0, next) }));
  }

  /** Writes a committed segment count through the undo stack. */
  private commitSegments(): void {
    const next = this.segmentsInput.parseNumberOrNull();
    if (next === null) return;
    this.commitPatch((settings) => ({ ...settings, segments: Math.round(next) }));
  }

  /** Writes a committed angle limit through the undo stack. */
  private commitAngle(): void {
    const next = this.angleInput.parseNumberOrNull();
    if (next === null) return;
    this.commitPatch((settings) => ({ ...settings, angleDegrees: next }));
  }

  /**
   * Pushes one settings edit for every bound volume.
   *
   * @param patch Builds the next settings from the current ones.
   */
  private commitPatch(patch: (settings: ModifierBevelVolumeSettings) => ModifierBevelVolumeSettings): void {
    if (this.bound.length === 0) return;
    const changes = this.bound.map((volume) => {
      const before = ModifierVolumeBevel.readSettings(volume);
      return { volume, before, after: patch(before) };
    });
    const command = new CommandModifierBevelDistanceSet(changes);
    if (this.commandStack) this.commandStack.push(command);
    else command.execute();
  }
}
