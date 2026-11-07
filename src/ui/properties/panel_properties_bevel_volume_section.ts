import { PanelPropertiesBevelOptions } from './panel_properties_bevel_options.js';
import { modifierBevelOptionsNormalize } from '@/modifier/volume/modifier_volume_bevel_options.js';
import type * as THREE from 'three';
import { modifierStackUiPaint } from '@/modifier/stack/ui/modifier_stack_ui_paint.js';
import type { CommandStack } from '@/commands/command_stack.js';
import { CommandModifierBevelDistanceSet } from '@/modifier/volume/command_modifier_bevel_distance_set.js';
import { ModifierVolumeBevel, type ModifierBevelVolumeSettings } from '@/modifier/volume/modifier_volume_bevel.js';
import { modifierBevelRotationIsIdle } from '@/modifier/volume/modifier_volume_bevel_uv_placement.js';
import {
  MODIFIER_VOLUME_BEVEL_UV_ALIGNED,
  MODIFIER_VOLUME_BEVEL_UV_LARGEST,
  MODIFIER_VOLUME_BEVEL_UV_MAJORITY,
  MODIFIER_VOLUME_BEVEL_UV_NEAREST,
  MODIFIER_VOLUME_BEVEL_UV_NEGATIVE_X,
  MODIFIER_VOLUME_BEVEL_UV_NEGATIVE_Y,
  MODIFIER_VOLUME_BEVEL_UV_NEGATIVE_Z,
  MODIFIER_VOLUME_BEVEL_UV_POSITIVE_X,
  MODIFIER_VOLUME_BEVEL_UV_POSITIVE_Y,
  MODIFIER_VOLUME_BEVEL_UV_POSITIVE_Z,
  MODIFIER_VOLUME_BEVEL_UV_REVERSE,
  MODIFIER_VOLUME_BEVEL_UV_SMALLEST,
  MODIFIER_VOLUME_BEVEL_UV_WINDING,
  MODIFIER_VOLUME_BEVEL_UV_LAYOUT_AXIS,
  MODIFIER_VOLUME_BEVEL_UV_LAYOUT_CONTINUE,
  MODIFIER_VOLUME_BEVEL_UV_LAYOUT_CUBIC,
  MODIFIER_VOLUME_BEVEL_UV_LAYOUT_FRONT,
  MODIFIER_VOLUME_BEVEL_UV_LAYOUT_OVERHEAD,
  MODIFIER_VOLUME_BEVEL_UV_LAYOUT_PROJECT,
  MODIFIER_VOLUME_BEVEL_UV_LAYOUT_SIDE,
  MODIFIER_VOLUME_BEVEL_UV_LAYOUT_STRETCH,
  MODIFIER_VOLUME_BEVEL_UV_LAYOUT_TILE,
  MODIFIER_VOLUME_BEVEL_UV_LAYOUT_TRIM,
  modifierBevelClampUvFlow,
  modifierBevelClampUvLayout,
  modifierBevelClampUvOwner,
  modifierBevelClampUvPivot,
  modifierBevelClampUvSpace,
  MODIFIER_VOLUME_BEVEL_UV_OWNER_SINGLE,
  MODIFIER_VOLUME_BEVEL_UV_OWNER_SPLIT,
  MODIFIER_VOLUME_BEVEL_UV_PIVOT_ANCHOR,
  MODIFIER_VOLUME_BEVEL_UV_PIVOT_CENTER,
  MODIFIER_VOLUME_BEVEL_UV_PIVOT_TILE,
  MODIFIER_VOLUME_BEVEL_UV_SPACE_LOCAL,
  MODIFIER_VOLUME_BEVEL_UV_SPACE_WORLD,
  type ModifierBevelUvFlow,
  type ModifierBevelUvLayout,
  type ModifierBevelUvOwner,
  type ModifierBevelUvPivot,
  type ModifierBevelUvSpace,
} from '@/modifier/volume/modifier_volume_bevel_keys.js';
import { textureChoicesList } from '@/texture/library/texture_choices.js';
import { InputNumeric } from '@/ui/input/input_numeric.js';
import { inputNumericCreateUvField } from '@/ui/input/input_numeric_uv_field.js';
import { UV_OFFSET_NUDGE } from '@/texture/uv/uv_trs_ops.js';
import { InputSelect, type InputSelectChoice } from '@/ui/input/input_select.js';

/**
 * Chamfer controls of one bevel modifier, embedded in the modifier stack
 * inspector. Bound objects are the bevel proxies of the selected volumes.
 */
export class PanelPropertiesBevelVolumeSection {
  private readonly section: HTMLElement;
  private readonly extra: PanelPropertiesBevelOptions;
  private readonly uvInput: InputSelect;
  private readonly layoutInput: InputSelect;
  private readonly textureInput: InputSelect;
  private readonly distanceInput: InputNumeric;
  private readonly segmentsInput: InputNumeric;
  private readonly angleInput: InputNumeric;
  private readonly uvFields: {
    owner: InputSelect;
    pivot: InputSelect;
    space: InputSelect;
    scaleU: InputNumeric;
    scaleV: InputNumeric;
    offsetU: InputNumeric;
    offsetV: InputNumeric;
    rotation: InputNumeric;
  };
  private readonly pivotRow: HTMLElement;
  private commandStack: CommandStack | null;
  private bound: THREE.Object3D[];

  /** Creates the controls; bind proxies before showing them. */
  constructor() {
    this.commandStack = null;
    this.bound = [];
    this.section = document.createElement('div');
    this.extra = this.createExtraOptions();
    this.uvInput = this.createUvInput();
    this.layoutInput = new InputSelect(modifierBevelUvLayoutChoices(), 'Bevel layout');
    this.textureInput = new InputSelect(modifierBevelTextureChoices(''), 'Bevel texture');
    this.distanceInput = inputNumericCreateUvField(0.01, 'Bevel distance');
    this.segmentsInput = inputNumericCreateUvField(1, 'Bevel segments');
    this.angleInput = inputNumericCreateUvField(1, 'Bevel max angle');
    this.uvFields = this.createUvPlacement();
    this.bindCommits();
    this.pivotRow = this.appendRows();
  }

  /** Creates the contextual controls with the existing row and undo adapters. */
  private createExtraOptions(): PanelPropertiesBevelOptions {
    return new PanelPropertiesBevelOptions(
      (label, input) => this.createRow(label, input),
      (patch) =>
        this.commitPatch((settings) => ({
          ...settings,
          options: patch(modifierBevelOptionsNormalize(settings.options)),
        })),
    );
  }

  /**
   * Creates the owner, pivot, scale, offset, and rotation fields.
   *
   * @returns The UV fields.
   */
  private createUvPlacement(): PanelPropertiesBevelVolumeSection['uvFields'] {
    return {
      owner: new InputSelect(modifierBevelUvOwnerChoices(), 'Bevel owner'),
      pivot: new InputSelect(modifierBevelUvPivotChoices(), 'Bevel pivot'),
      space: new InputSelect(modifierBevelUvSpaceChoices(), 'Bevel space'),
      ...this.createUvNumbers(),
    };
  }

  /**
   * Creates the scale, offset, and rotation numbers.
   *
   * @returns The five numeric UV fields.
   */
  private createUvNumbers(): Pick<
    PanelPropertiesBevelVolumeSection['uvFields'],
    'scaleU' | 'scaleV' | 'offsetU' | 'offsetV' | 'rotation'
  > {
    return {
      scaleU: this.createUvNumber('Bevel U scale', 0.25),
      scaleV: this.createUvNumber('Bevel V scale', 0.25),
      offsetU: this.createUvNumber('Bevel U offset', UV_OFFSET_NUDGE),
      offsetV: this.createUvNumber('Bevel V offset', UV_OFFSET_NUDGE),
      rotation: this.createUvNumber('Bevel UV rotation', 1),
    };
  }

  /**
   * Creates one numeric UV field.
   *
   * @param label Accessible name.
   * @param step Arrow step.
   * @returns Numeric field.
   */
  private createUvNumber(label: string, step: number): InputNumeric {
    return inputNumericCreateUvField(step, label);
  }

  /**
   * Adds the labeled rows.
   *
   * @returns Pivot row, so it can be hidden while rotation is idle.
   */
  private appendRows(): HTMLElement {
    this.appendCutRows();
    this.appendChartRows();
    return this.appendPivotRow();
  }

  /** Adds the segment, distance, and angle rows. */
  private appendCutRows(): void {
    this.section.appendChild(this.createRow('Segments', this.segmentsInput));
    this.section.appendChild(this.createRow('Distance', this.distanceInput));
    this.section.appendChild(this.createRow('Max Angle', this.angleInput));
    this.extra.appendGeometry(this.section);
  }

  /** Adds the layout, texture, and placement rows. */
  private appendChartRows(): void {
    this.section.appendChild(this.createRow('Layout', this.layoutInput));
    this.section.appendChild(this.createRow('Texture', this.textureInput));
    this.extra.appendCharts(this.section);
    this.section.appendChild(this.createRow('Owner', this.uvFields.owner));
    this.section.appendChild(this.createRow('UV', this.uvInput));
    this.section.appendChild(this.createRow('Space', this.uvFields.space));
    this.appendScaleRows();
  }

  /** Adds the scale, offset, and rotation rows. */
  private appendScaleRows(): void {
    this.section.appendChild(this.createRow('U scale', this.uvFields.scaleU));
    this.section.appendChild(this.createRow('V scale', this.uvFields.scaleV));
    this.section.appendChild(this.createRow('U offset', this.uvFields.offsetU));
    this.section.appendChild(this.createRow('V offset', this.uvFields.offsetV));
    this.section.appendChild(this.createRow('Rotation', this.uvFields.rotation));
  }

  /**
   * Adds the pivot row.
   *
   * @returns Pivot row.
   */
  private appendPivotRow(): HTMLElement {
    const pivotRow = this.createRow('Pivot', this.uvFields.pivot);
    this.section.appendChild(pivotRow);
    return pivotRow;
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
   * Binds the bevel proxies to edit and refreshes every field.
   *
   * @param proxies Bevel proxies, one per selected volume.
   */
  bind(proxies: readonly THREE.Object3D[]): void {
    this.bound = proxies.slice();
    if (this.bound.length > 0) this.writeSharedFields();
  }

  /**
   * Builds the UV-flow select.
   *
   * @returns Select field.
   */
  private createUvInput(): InputSelect {
    return new InputSelect(modifierBevelUvFlowChoices(), 'Bevel UV');
  }

  /** Binds commit handlers for every field. */
  private bindCommits(): void {
    this.uvInput.bindCommit(() => this.commitUvFlow());
    this.layoutInput.bindCommit(() => this.commitUvLayout());
    this.textureInput.bindCommit(() => this.commitTexture());
    this.distanceInput.bindCommit(() => this.commitDistance());
    this.segmentsInput.bindCommit(() => this.commitSegments());
    this.angleInput.bindCommit(() => this.commitAngle());
    this.bindUvPlacement();
  }

  /** Binds the scale, offset, and rotation fields. */
  private bindUvPlacement(): void {
    this.uvFields.scaleU.bindCommit(() => this.commitUvScale(this.uvFields.scaleU, 'uvScaleU'));
    this.uvFields.scaleV.bindCommit(() => this.commitUvScale(this.uvFields.scaleV, 'uvScaleV'));
    this.uvFields.offsetU.bindCommit(() => this.commitUvOffset(this.uvFields.offsetU, 'uvOffsetU'));
    this.uvFields.offsetV.bindCommit(() => this.commitUvOffset(this.uvFields.offsetV, 'uvOffsetV'));
    this.uvFields.rotation.bindCommit(() => this.commitUvOffset(this.uvFields.rotation, 'uvRotation'));
    this.uvFields.owner.bindCommit(() => this.commitUvOwner());
    this.uvFields.pivot.bindCommit(() => this.commitUvPivot());
    this.uvFields.space.bindCommit(() => this.commitUvSpace());
  }

  /**
   * Writes a nonzero UV scale.
   *
   * @param input Scale field.
   * @param key Settings field.
   */
  private commitUvScale(input: InputNumeric, key: 'uvScaleU' | 'uvScaleV'): void {
    const next = this.readCommittedNumber(input);
    if (next === null) return;
    if (next === 0) {
      this.writeSharedFields();
      return;
    }
    this.commitPatch((settings) => ({ ...settings, [key]: next }));
  }

  /**
   * Writes a UV offset or rotation.
   *
   * @param input Offset or rotation field.
   * @param key Settings field.
   */
  private commitUvOffset(input: InputNumeric, key: 'uvOffsetU' | 'uvOffsetV' | 'uvRotation'): void {
    const next = this.readCommittedNumber(input);
    if (next === null) return;
    this.commitPatch((settings) => ({ ...settings, [key]: next }));
  }

  /**
   * Reads a committed number. Invalid or empty text restores the fields.
   *
   * @param input Numeric field.
   * @returns Parsed number, or null when the field is skipped or invalid.
   */
  private readCommittedNumber(input: InputNumeric): number | null {
    const next = input.parseNumberOrNull();
    if (next !== null) return next;
    this.writeSharedFields();
    return null;
  }

  /** Writes the curve owner. */
  private commitUvOwner(): void {
    const next = modifierBevelUvOwnerFromSelect(this.uvFields.owner.getValue());
    if (!next) return;
    this.commitPatch((settings) => ({ ...settings, uvOwner: next }));
  }

  /** Writes the rotation pivot. */
  private commitUvPivot(): void {
    const next = modifierBevelUvPivotFromSelect(this.uvFields.pivot.getValue());
    if (!next) return;
    this.commitPatch((settings) => ({ ...settings, uvPivot: next }));
  }

  /** Writes the UV space. */
  private commitUvSpace(): void {
    const next = modifierBevelUvSpaceFromSelect(this.uvFields.space.getValue());
    if (!next) return;
    this.commitPatch((settings) => ({ ...settings, uvSpace: next }));
  }

  /** Copies the bound volumes into the fields. */
  private writeSharedFields(): void {
    const settings = this.bound.map((volume) => ModifierVolumeBevel.readSettings(volume));
    this.uvInput.setSharedValues(settings.map((entry) => entry.uvFlow));
    this.layoutInput.setSharedValues(settings.map((entry) => entry.uvLayout));
    this.writeTextureField(settings);
    this.writeNumericFields(settings);
    this.writeUvPlacement(settings);
    this.extra.update(settings, this.bound, this.distanceInput);
    this.refreshPivotRow(settings);
  }

  /**
   * Hides the pivot when every bound rotation is a whole turn.
   *
   * @param settings Settings for each bound volume.
   */
  private refreshPivotRow(settings: readonly ModifierBevelVolumeSettings[]): void {
    const turning = settings.some((entry) => !modifierBevelRotationIsIdle(entry.uvRotation));
    this.pivotRow.style.display = turning ? 'flex' : 'none';
  }

  /**
   * Copies the numeric settings into the fields.
   *
   * @param settings Settings for each bound volume.
   */
  private writeNumericFields(settings: readonly ModifierBevelVolumeSettings[]): void {
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
   * Copies UV scale, offset, and rotation into the fields.
   *
   * @param settings Settings for each bound volume.
   */
  private writeUvPlacement(settings: readonly ModifierBevelVolumeSettings[]): void {
    this.writeUvChoices(settings);
    this.writeUvScale(settings);
    this.writeUvShift(settings);
  }

  /**
   * Copies the owner and pivot into the selects.
   *
   * @param settings Settings for each bound volume.
   */
  private writeUvChoices(settings: readonly ModifierBevelVolumeSettings[]): void {
    this.uvFields.owner.setSharedValues(settings.map((entry) => entry.uvOwner));
    this.uvFields.pivot.setSharedValues(settings.map((entry) => entry.uvPivot));
    this.uvFields.space.setSharedValues(settings.map((entry) => entry.uvSpace));
  }

  /**
   * Copies the tile size into the scale fields.
   *
   * @param settings Settings for each bound volume.
   */
  private writeUvScale(settings: readonly ModifierBevelVolumeSettings[]): void {
    this.uvFields.scaleU.setSharedValues(
      settings.map((entry) => entry.uvScaleU),
      2,
    );
    this.uvFields.scaleV.setSharedValues(
      settings.map((entry) => entry.uvScaleV),
      2,
    );
  }

  /**
   * Copies the shift and rotation into the fields.
   *
   * @param settings Settings for each bound volume.
   */
  private writeUvShift(settings: readonly ModifierBevelVolumeSettings[]): void {
    this.uvFields.offsetU.setSharedValues(
      settings.map((entry) => entry.uvOffsetU),
      2,
    );
    this.uvFields.offsetV.setSharedValues(
      settings.map((entry) => entry.uvOffsetV),
      2,
    );
    this.uvFields.rotation.setSharedValues(
      settings.map((entry) => entry.uvRotation),
      1,
    );
  }

  /**
   * Builds one labeled row.
   *
   * @param labelText Row caption.
   * @param input Field that exposes its element.
   * @returns Row element.
   */
  private createRow(labelText: string, input: { getElement(): HTMLElement }): HTMLElement {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.gap = '4px';
    row.style.padding = '0 8px 8px';
    row.appendChild(this.createRowLabel(labelText));
    row.appendChild(this.stretchField(input.getElement()));
    return row;
  }

  /**
   * Creates a caption that fits the longest bevel label.
   *
   * @param labelText Row caption.
   * @returns Caption element.
   */
  private createRowLabel(labelText: string): HTMLElement {
    const label = document.createElement('span');
    label.textContent = labelText;
    label.style.width = '9ch';
    label.style.flexShrink = '0';
    this.paintCaption(label);
    return label;
  }

  /**
   * Paints a row caption.
   *
   * @param label Caption element.
   */
  private paintCaption(label: HTMLElement): void {
    modifierStackUiPaint(label, 'text');
    label.style.fontFamily = 'monospace';
    label.style.fontSize = '12px';
  }

  /**
   * Lets a field use the width left beside its caption.
   *
   * @param field Input element.
   * @returns The same element.
   */
  private stretchField(field: HTMLElement): HTMLElement {
    field.style.flex = '1';
    field.style.minWidth = '0';
    field.style.width = '100%';
    field.style.maxWidth = 'none';
    return field;
  }

  /** Writes a committed UV flow through the undo stack. */
  private commitUvFlow(): void {
    const next = modifierBevelUvFlowFromSelect(this.uvInput.getValue());
    if (!next) return;
    this.commitPatch((settings) => ({ ...settings, uvFlow: next }));
  }

  /** Writes a committed UV layout through the undo stack. */
  private commitUvLayout(): void {
    const next = modifierBevelUvLayoutFromSelect(this.layoutInput.getValue());
    if (!next) return;
    this.commitPatch((settings) => ({ ...settings, uvLayout: next }));
  }

  /** Writes a committed bevel texture through the undo stack. */
  private commitTexture(): void {
    const value = this.textureInput.getValue();
    if (value === '') return;
    const textureId = value === MODIFIER_BEVEL_TEXTURE_INHERIT ? '' : value;
    this.commitPatch((settings) => ({ ...settings, textureId }));
  }

  /**
   * Refreshes the texture list and selects the shared value.
   *
   * @param settings Settings for each bound volume.
   */
  private writeTextureField(settings: readonly ModifierBevelVolumeSettings[]): void {
    const ids = settings.map((entry) => entry.textureId);
    this.textureInput.setChoices(modifierBevelTextureChoices(ids.find((id) => id !== '') ?? ''));
    this.textureInput.setSharedValues(ids.map(modifierBevelTextureSelectValue));
  }

  /** Writes a committed distance through the undo stack. */
  private commitDistance(): void {
    const next = this.readCommittedNumber(this.distanceInput);
    if (next === null) return;
    this.commitPatch((settings) => ({ ...settings, distance: Math.max(0, next) }));
  }

  /** Writes a committed segment count through the undo stack. */
  private commitSegments(): void {
    const next = this.readCommittedNumber(this.segmentsInput);
    if (next === null) return;
    this.commitPatch((settings) => ({ ...settings, segments: Math.round(next) }));
  }

  /** Writes a committed angle limit through the undo stack. */
  private commitAngle(): void {
    const next = this.readCommittedNumber(this.angleInput);
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
    this.writeSharedFields();
  }
}

/** Hover text for each UV flow, in menu order. */
const MODIFIER_BEVEL_UV_FLOW_CHOICES: InputSelectChoice[] = [
  modifierBevelUvChoice(
    MODIFIER_VOLUME_BEVEL_UV_WINDING,
    'Winding',
    'Strips follow face order. A corner takes the wall that borders it most, and every piece of that corner stays on that wall.',
  ),
  modifierBevelUvChoice(
    MODIFIER_VOLUME_BEVEL_UV_REVERSE,
    'Reverse Winding',
    'Same corner rule as Winding. When two walls border a corner equally, the later face wins instead of the earlier one.',
  ),
  modifierBevelUvChoice(
    MODIFIER_VOLUME_BEVEL_UV_LARGEST,
    'Largest',
    'The larger wall wins. The whole corner beside it takes that wall, not a mix of neighbors.',
  ),
  modifierBevelUvChoice(
    MODIFIER_VOLUME_BEVEL_UV_SMALLEST,
    'Smallest',
    'The smaller wall wins. The whole corner beside it takes that wall.',
  ),
  modifierBevelUvChoice(
    MODIFIER_VOLUME_BEVEL_UV_MAJORITY,
    'Majority',
    'Each new face follows the wall it shares the longest edge with. A corner still stays on one wall.',
  ),
  modifierBevelUvChoice(
    MODIFIER_VOLUME_BEVEL_UV_NEAREST,
    'Nearest',
    'Each new face follows the wall plane closest to its center. A corner uses that rule once for the whole corner.',
  ),
  modifierBevelUvChoice(
    MODIFIER_VOLUME_BEVEL_UV_ALIGNED,
    'Aligned',
    'Each new face follows the wall pointing most nearly the same way. A corner uses the wall closest to the corner direction.',
  ),
  modifierBevelUvChoice(
    MODIFIER_VOLUME_BEVEL_UV_POSITIVE_Y,
    '+Y',
    'The wall facing world up wins. Its texture continues down the curves and across the whole corner.',
  ),
  modifierBevelUvChoice(
    MODIFIER_VOLUME_BEVEL_UV_NEGATIVE_Y,
    '-Y',
    'The wall facing world down wins. Its texture continues onto the curves and the whole corner.',
  ),
  modifierBevelUvChoice(
    MODIFIER_VOLUME_BEVEL_UV_POSITIVE_X,
    '+X',
    'The wall facing world +X wins. Its texture continues onto the curves and the whole corner.',
  ),
  modifierBevelUvChoice(
    MODIFIER_VOLUME_BEVEL_UV_NEGATIVE_X,
    '-X',
    'The wall facing world -X wins. Its texture continues onto the curves and the whole corner.',
  ),
  modifierBevelUvChoice(
    MODIFIER_VOLUME_BEVEL_UV_POSITIVE_Z,
    '+Z',
    'The wall facing world +Z wins. Its texture continues onto the curves and the whole corner.',
  ),
  modifierBevelUvChoice(
    MODIFIER_VOLUME_BEVEL_UV_NEGATIVE_Z,
    '-Z',
    'The wall facing world -Z wins. Its texture continues onto the curves and the whole corner.',
  ),
];

/**
 * Lists the UV flow choices.
 *
 * @returns Select entries.
 */
function modifierBevelUvFlowChoices(): InputSelectChoice[] {
  return MODIFIER_BEVEL_UV_FLOW_CHOICES;
}

/**
 * Builds one UV flow entry.
 *
 * @param value Stored flow.
 * @param label Menu label.
 * @param title Hover text.
 * @returns Select entry.
 */
function modifierBevelUvChoice(value: string, label: string, title: string): InputSelectChoice {
  return { value, label, title };
}

/**
 * Accepts a select value only when it names a UV flow.
 *
 * @param value Select value.
 * @returns Flow, or null when the value is blank.
 */
function modifierBevelUvFlowFromSelect(value: string): ModifierBevelUvFlow | null {
  const flow = modifierBevelClampUvFlow(value);
  if (value !== flow) return null;
  return flow;
}

/** Select value that keeps each bevel on its parent texture. */
const MODIFIER_BEVEL_TEXTURE_INHERIT = 'inherit';

/** Hover text for each UV layout, in menu order. */
const MODIFIER_BEVEL_UV_LAYOUT_CHOICES: InputSelectChoice[] = [
  modifierBevelUvChoice(
    MODIFIER_VOLUME_BEVEL_UV_LAYOUT_CONTINUE,
    'Continue',
    'Folds the parent texture across the bevel so the pattern keeps going around the cut.',
  ),
  modifierBevelUvChoice(
    MODIFIER_VOLUME_BEVEL_UV_LAYOUT_TILE,
    'Tile',
    'Repeats the texture in world units along the authored edge and across its whole profile. Use Continue to preserve the parent pattern at the cut.',
  ),
  modifierBevelUvChoice(
    MODIFIER_VOLUME_BEVEL_UV_LAYOUT_TRIM,
    'Trim',
    'Fits one texture across the whole profile and repeats it along the authored edge in world units. Use Continue to preserve the parent pattern at the cut.',
  ),
  modifierBevelUvChoice(
    MODIFIER_VOLUME_BEVEL_UV_LAYOUT_STRETCH,
    'Stretch',
    'Stretches one copy of the texture over the whole curve.',
  ),
  modifierBevelUvChoice(
    MODIFIER_VOLUME_BEVEL_UV_LAYOUT_PROJECT,
    'Project',
    'Uses the parent face projection flat, without wrapping around the cut.',
  ),
  modifierBevelUvChoice(
    MODIFIER_VOLUME_BEVEL_UV_LAYOUT_CUBIC,
    'Cubic',
    'Lays a world-unit grid across the whole curve so every segment shares one pattern.',
  ),
  modifierBevelUvChoice(
    MODIFIER_VOLUME_BEVEL_UV_LAYOUT_OVERHEAD,
    'Overhead',
    'Projects from above using X and Z in the selected Space. Local follows the brush; World stays fixed to the map.',
  ),
  modifierBevelUvChoice(
    MODIFIER_VOLUME_BEVEL_UV_LAYOUT_FRONT,
    'Front',
    'Projects from the front using X and Y in the selected Space. Local follows the brush; World stays fixed to the map.',
  ),
  modifierBevelUvChoice(
    MODIFIER_VOLUME_BEVEL_UV_LAYOUT_SIDE,
    'Side',
    'Projects from the side using Z and Y in the selected Space. Local follows the brush; World stays fixed to the map.',
  ),
  modifierBevelUvChoice(
    MODIFIER_VOLUME_BEVEL_UV_LAYOUT_AXIS,
    'Axis',
    'Projects from whichever of Overhead, Front, or Side is closest to each face normal.',
  ),
];

/**
 * Lists the UV layout choices.
 *
 * @returns Select entries.
 */
function modifierBevelUvLayoutChoices(): InputSelectChoice[] {
  return MODIFIER_BEVEL_UV_LAYOUT_CHOICES;
}

/**
 * Accepts a select value only when it names a UV layout.
 *
 * @param value Select value.
 * @returns Layout, or null when the value is blank.
 */
function modifierBevelUvLayoutFromSelect(value: string): ModifierBevelUvLayout | null {
  const layout = modifierBevelClampUvLayout(value);
  if (value !== layout) return null;
  return layout;
}

/**
 * Lists the curve owner choices.
 *
 * @returns Select entries.
 */
function modifierBevelUvOwnerChoices(): InputSelectChoice[] {
  return [
    modifierBevelUvChoice(
      MODIFIER_VOLUME_BEVEL_UV_OWNER_SPLIT,
      'Split',
      'Each end of the curve keeps its wall. U follows the parent that owns that half.',
    ),
    modifierBevelUvChoice(
      MODIFIER_VOLUME_BEVEL_UV_OWNER_SINGLE,
      'Single',
      'One parent owns the whole curve. U runs along the edge and V runs across it. Reverse picks the other wall.',
    ),
  ];
}

/**
 * Accepts a select value only when it names a curve owner.
 *
 * @param value Select value.
 * @returns Owner, or null when the value is blank.
 */
function modifierBevelUvOwnerFromSelect(value: string): ModifierBevelUvOwner | null {
  const owner = modifierBevelClampUvOwner(value);
  if (value !== owner) return null;
  return owner;
}

/**
 * Lists the rotation pivot choices.
 *
 * @returns Select entries.
 */
function modifierBevelUvPivotChoices(): InputSelectChoice[] {
  return [
    modifierBevelUvChoice(MODIFIER_VOLUME_BEVEL_UV_PIVOT_ANCHOR, 'Anchor', 'Rotates around the start of the curve.'),
    modifierBevelUvChoice(MODIFIER_VOLUME_BEVEL_UV_PIVOT_CENTER, 'Center', 'Rotates around the middle of the curve.'),
    modifierBevelUvChoice(
      MODIFIER_VOLUME_BEVEL_UV_PIVOT_TILE,
      'Tile',
      'Rotates around the middle of the texture tile.',
    ),
  ];
}

/**
 * Accepts a select value only when it names a rotation pivot.
 *
 * @param value Select value.
 * @returns Pivot, or null when the value is blank.
 */
function modifierBevelUvPivotFromSelect(value: string): ModifierBevelUvPivot | null {
  const pivot = modifierBevelClampUvPivot(value);
  if (value !== pivot) return null;
  return pivot;
}

/**
 * Lists the UV space choices.
 *
 * @returns Select entries.
 */
function modifierBevelUvSpaceChoices(): InputSelectChoice[] {
  return [
    modifierBevelUvChoice(
      MODIFIER_VOLUME_BEVEL_UV_SPACE_LOCAL,
      'Local',
      'Follows the brush. Turning it keeps the texture put, and scale still changes world length.',
    ),
    modifierBevelUvChoice(
      MODIFIER_VOLUME_BEVEL_UV_SPACE_WORLD,
      'World',
      'Follows the map. Turning a brush turns these directions.',
    ),
  ];
}

/**
 * Accepts a select value only when it names a UV space.
 *
 * @param value Select value.
 * @returns Space, or null when the value is blank.
 */
function modifierBevelUvSpaceFromSelect(value: string): ModifierBevelUvSpace | null {
  const space = modifierBevelClampUvSpace(value);
  if (value !== space) return null;
  return space;
}

/**
 * Lists Inherit, the library's textures and the level's missing ones.
 *
 * @param extraId Stored id to keep visible when the library does not list it.
 * @returns Select entries.
 */
function modifierBevelTextureChoices(extraId: string): InputSelectChoice[] {
  return [{ value: MODIFIER_BEVEL_TEXTURE_INHERIT, label: 'Inherit' }, ...textureChoicesList([extraId])];
}

/**
 * Maps a stored texture id to the select value.
 *
 * @param textureId Stored id. Empty inherits.
 * @returns Select value.
 */
function modifierBevelTextureSelectValue(textureId: string): string {
  return textureId === '' ? MODIFIER_BEVEL_TEXTURE_INHERIT : textureId;
}
