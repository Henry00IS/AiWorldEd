import type * as THREE from 'three';
import type { CommandStack } from '@/commands/command_stack.js';
import { InputSelect } from '@/ui/input/input_select.js';
import { InputNumeric } from '@/ui/input/input_numeric.js';
import { ModifierVolumeBlacklistList } from '@/modifier/volume/ui/modifier_volume_blacklist_list.js';
import { SolidModelRegistry } from '@/solid/model/solid_model_registry.js';
import { generatorKindFind } from '../modifier_generator_catalog.js';
import { generatorSettingsNormalize } from '../modifier_generator_settings.js';
import { ModifierGeneratorVolume, generatorSceneRoot } from '../modifier_generator_volume.js';
import { generatorCaptureUnits, generatorStatus } from '../modifier_generator_expansion.js';
import { CommandModifierGeneratorSettings } from '../command_modifier_generator_settings.js';
import type { GeneratorSettings, GeneratorField, GeneratorValue } from '../modifier_generator_types.js';

/** Context-aware inspector for one authored generator selector. */
export class PanelPropertiesGeneratorSection {
  private volume: THREE.Object3D | undefined;
  private stack: CommandStack | null = null;
  private signature = '';
  private readonly fields = new Map<string, { row: HTMLElement; write: (value: GeneratorValue) => void }>();
  readonly element: HTMLElement;
  private readonly content = document.createElement('div');
  private readonly status = document.createElement('div');
  private readonly targets = new ModifierVolumeBlacklistList();
  /**
   * Builds inspector chrome. @param container Section factory. @param header
   * Header factory.
   */
  constructor(container: () => HTMLElement, header: (title: string) => HTMLElement) {
    this.element = container();
    this.element.append(header('Generator Volume'), this.content, this.status, this.targets.getElement());
    this.element.style.display = 'none';
    this.status.style.cssText = 'padding:8px;font:12px monospace;white-space:normal';
    this.targets.bindToggle((id, checked) => this.toggleTarget(id, checked));
  }
  /** Sets the shared history stack. @param stack Undo stack. */
  setCommandStack(stack: CommandStack | null): void {
    this.stack = stack;
  }
  /**
   * Refreshes applicable fields without interrupting typing. @param objects
   * Current selection.
   */
  updateFromObjects(objects: THREE.Object3D[]): void {
    this.volume =
      objects.length === 1 && objects[0] && ModifierGeneratorVolume.isVolume(objects[0]) ? objects[0] : undefined;
    this.element.style.display = this.volume ? 'block' : 'none';
    if (!this.volume) return;
    const settings = ModifierGeneratorVolume.read(this.volume);
    const kind = generatorKindFind(settings.kind);
    const signature = `${settings.kind}:${kind?.fields.filter((field) => !field.visible || field.visible(settings)).map((field) => field.key)}:${settings.count > 1}`;
    if (signature !== this.signature) {
      this.signature = signature;
      this.buildFields(settings);
    }
    for (const [key, field] of this.fields) field.write(this.valueRead(settings, key));
    const status = generatorStatus.get(this.volume);
    this.status.textContent =
      status?.error ||
      `${kind?.label ?? 'Unavailable type'} · ${status?.copies ?? 0} derived placements. Authored sources only; outputs never feed back. Original remains in place.`;
    this.refreshTargets(settings);
  }
  /** Chooses common and strategy fields. @param settings Current values. */
  private buildFields(settings: GeneratorSettings): void {
    this.content.replaceChildren();
    this.fields.clear();
    const kind = generatorKindFind(settings.kind);
    const common: GeneratorField[] = [
      { key: 'enabled', label: 'Enabled', type: 'boolean', default: true },
      { key: 'count', label: 'Count incl. original', type: 'number', default: 3 },
      { key: 'space', label: 'Basis', type: 'choice', default: 'volume', choices: ['volume', 'world'] },
      { key: 'grouping', label: 'Capture', type: 'choice', default: 'compound', choices: ['compound', 'brush'] },
      { key: 'uv', label: 'UV policy', type: 'choice', default: 'copied', choices: ['copied', 'world'] },
    ];
    for (const field of common) if (field.key !== 'count' || !kind?.count) this.appendField(field, false);
    for (const field of kind?.fields ?? [])
      if ((!field.visible || field.visible(settings)) && settings.count > 1) this.appendField(field, true);
  }
  /**
   * Creates one themed field. @param definition Field schema. @param parameter
   * Strategy versus common field.
   */
  private appendField(definition: GeneratorField, parameter: boolean): void {
    const key = parameter ? `parameters.${definition.key}` : definition.key;
    const row = document.createElement('label');
    row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:4px 8px;font:12px monospace';
    const caption = document.createElement('span');
    caption.textContent = definition.label;
    caption.style.flex = '1';
    row.append(caption);
    const write = definition.type === 'number' ? this.appendNumber(row, key) : this.appendChoice(row, key, definition);
    this.fields.set(key, { row, write });
    this.content.append(row);
  }
  /** Adds a numeric editor. @param row Parent. @param key Settings path. */
  private appendNumber(row: HTMLElement, key: string): (value: GeneratorValue) => void {
    const input = new InputNumeric({ ariaLabel: `Generator ${key}`, width: '100px' });
    input.bindCommit(() => {
      const result = input.parse();
      if (result.kind === 'value') this.commit(key, result.value);
    });
    row.append(input.getElement());
    return (value) => input.setNumber(Number(value), 0);
  }
  /**
   * Adds choices or a boolean switch. @param row Parent. @param key Path.
   *
   * @param definition Schema.
   */
  private appendChoice(row: HTMLElement, key: string, definition: GeneratorField): (value: GeneratorValue) => void {
    const choices = definition.type === 'boolean' ? ['true', 'false'] : (definition.choices ?? []);
    const input = new InputSelect(
      choices.map((value) => ({ value, label: value })),
      `Generator ${key}`,
    );
    input.bindCommit(() =>
      this.commit(key, definition.type === 'boolean' ? input.getValue() === 'true' : input.getValue()),
    );
    row.append(input.getElement());
    return (value) => input.setSharedValues([String(value)]);
  }
  /** Reads one scalar. @param settings Current state. @param key Property path. */
  private valueRead(settings: GeneratorSettings, key: string): GeneratorValue {
    if (key.startsWith('parameters.')) return settings.parameters[key.slice(11)] ?? '';
    return settings[key as 'count' | 'space' | 'grouping' | 'uv' | 'enabled'];
  }
  /**
   * Pushes a single validated property edit. @param key Path. @param value New
   * scalar.
   */
  private commit(key: string, value: GeneratorValue): void {
    if (!this.volume || !this.stack) return;
    const before = ModifierGeneratorVolume.read(this.volume);
    const patch = key.startsWith('parameters.')
      ? { ...before, parameters: { ...before.parameters, [key.slice(11)]: value } }
      : { ...before, [key]: value };
    this.stack.push(new CommandModifierGeneratorSettings(this.volume, before, generatorSettingsNormalize(patch)));
    this.updateFromObjects([this.volume]);
  }
  /**
   * Edits an authored source exclusion. @param id Source UUID. @param checked
   * Included flag.
   */
  private toggleTarget(id: string, checked: boolean): void {
    if (!this.volume || !this.stack) return;
    const before = ModifierGeneratorVolume.read(this.volume);
    const excludedIds = checked ? before.excludedIds.filter((entry) => entry !== id) : [...before.excludedIds, id];
    this.stack.push(new CommandModifierGeneratorSettings(this.volume, before, { ...before, excludedIds }));
    this.updateFromObjects([this.volume]);
  }
  /**
   * Requeries current spatial sources, retaining excluded rows. @param settings
   * Capture policy.
   */
  private refreshTargets(settings: GeneratorSettings): void {
    if (!this.volume) return;
    const root = generatorSceneRoot(this.volume);
    const sources = new Map<string, THREE.Object3D>();
    for (const model of SolidModelRegistry.collectUnder(root)) {
      const units = generatorCaptureUnits(model.getBrushes(), model.root, this.volume, {
        ...settings,
        excludedIds: [],
      });
      for (const unit of units.keys()) sources.set(unit.uuid, unit);
    }
    for (const id of settings.excludedIds) {
      const node = root.getObjectByProperty('uuid', id);
      if (node) sources.set(id, node);
    }
    this.targets.setRows(
      [...sources.values()].map((node) => ({
        id: node.uuid,
        name: node.name,
        depth: 0,
        checked: !settings.excludedIds.includes(node.uuid),
      })),
    );
  }
}
