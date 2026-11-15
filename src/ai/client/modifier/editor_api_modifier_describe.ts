import type { ModifierStackKind } from '@/modifier/stack/kinds/modifier_stack_kind.js';
import { MODIFIER_GENERATOR_NODE_KINDS } from '@/modifier/stack/modifier_generator_node.js';
import type { ModifierStackField } from '@/modifier/stack/modifier_stack_types.js';
import { modifierVolumeTemplates } from '@/modifier/stack/modifier_volume_templates.js';
import {
  MODIFIER_BEVEL_SETTINGS_FIELDS,
  type ModifierBevelField,
} from '@/modifier/volume/modifier_volume_bevel_fields.js';
import {
  MODIFIER_BEVEL_OPTION_FIELDS,
  type ModifierBevelOptionField,
} from '@/modifier/volume/modifier_volume_bevel_option_fields.js';
import { MODIFIER_STACK_KIND_BEVEL } from '@/modifier/volume/modifier_volume_record.js';

/** Plain description of one modifier parameter, as MCP lists it. */
export interface ModifierParameterDescription {
  key: string;
  label: string;
  type: string;
  hint: string;
  default?: unknown;
  group?: string;
  choices?: { value: string; label: string; hint?: string }[];
  min?: number;
  max?: number;
  integer?: boolean;
  /** True when the parameter only applies for some values of other parameters. */
  conditional?: boolean;
  /** Ids of the curve presets a curve parameter offers. */
  curvePresetIds?: string[];
}

/**
 * Describes one declarative modifier field.
 *
 * @param field Field.
 * @returns Description.
 */
export function modifierFieldDescribe(field: ModifierStackField): ModifierParameterDescription {
  return {
    key: field.key,
    label: field.label,
    type: field.type,
    hint: field.hint ?? '',
    default: field.default,
    ...(field.group ? { group: field.group } : {}),
    ...(field.choices
      ? { choices: field.choices.map((choice) => ({ value: choice.value, label: choice.label })) }
      : {}),
    ...(field.min !== undefined ? { min: field.min } : {}),
    ...(field.max !== undefined ? { max: field.max } : {}),
    ...(field.integer ? { integer: true } : {}),
    ...(field.visible ? { conditional: true } : {}),
    ...(field.curvePresets ? { curvePresetIds: field.curvePresets.map((preset) => preset.id) } : {}),
  };
}

/**
 * Describes one main bevel setting.
 *
 * @param field Bevel field.
 * @returns Description.
 */
function modifierBevelFieldDescribe(field: ModifierBevelField): ModifierParameterDescription {
  return {
    key: field.key,
    label: field.label,
    type: field.type,
    hint: field.title,
    ...(field.default !== undefined ? { default: field.default } : {}),
    ...(field.choices ? { choices: modifierBevelChoicesDescribe(field.choices) } : {}),
    ...(field.min !== undefined ? { min: field.min } : {}),
    ...(field.max !== undefined ? { max: field.max } : {}),
    ...(field.integer ? { integer: true } : {}),
  };
}

/**
 * Describes one contextual bevel option, keyed options.<name>.
 *
 * @param field Option field.
 * @returns Description.
 */
function modifierBevelOptionDescribe(field: ModifierBevelOptionField): ModifierParameterDescription {
  const choices = field.choices && field.choices.length > 0 ? modifierBevelChoicesDescribe(field.choices) : undefined;
  return {
    key: `options.${field.key}`,
    label: field.label,
    type: choices ? 'choice' : field.key === 'capTextureId' ? 'texture' : 'number',
    hint: field.title,
    group: 'Options',
    ...(choices ? { choices } : {}),
    ...(field.when !== 'always' ? { conditional: true } : {}),
  };
}

/**
 * Describes bevel choices.
 *
 * @param choices Choices with hover text.
 * @returns Plain choices.
 */
function modifierBevelChoicesDescribe(
  choices: readonly { value: string; label: string; title?: string }[],
): NonNullable<ModifierParameterDescription['choices']> {
  return choices.map((choice) => ({
    value: choice.value,
    label: choice.label,
    ...(choice.title ? { hint: choice.title } : {}),
  }));
}

/**
 * Describes every parameter of a kind; bevel uses its own descriptor because
 * its inspector is custom.
 *
 * @param kind Modifier kind.
 * @returns Parameter descriptions, hidden fields left out.
 */
export function modifierKindParametersDescribe(kind: ModifierStackKind): ModifierParameterDescription[] {
  if (kind.id === MODIFIER_STACK_KIND_BEVEL) {
    return [
      ...MODIFIER_BEVEL_SETTINGS_FIELDS.map(modifierBevelFieldDescribe),
      ...MODIFIER_BEVEL_OPTION_FIELDS.map(modifierBevelOptionDescribe),
    ];
  }
  return kind.fields.filter((field) => !field.hidden).map(modifierFieldDescribe);
}

/**
 * Describes a modifier kind for MCP clients.
 *
 * @param kind Modifier kind.
 * @param detailed True includes every parameter and preset.
 * @returns Plain description.
 */
export function modifierKindDescribe(kind: ModifierStackKind, detailed: boolean): Record<string, unknown> {
  const generator = MODIFIER_GENERATOR_NODE_KINDS.includes(kind.id);
  return {
    id: kind.id,
    label: kind.label,
    category: kind.category,
    description: kind.description,
    generator,
    placement: generator ? 'generator node only (modifier_generator_create)' : 'volume, brush or CSG group stack',
    ...(detailed
      ? {
          parameters: modifierKindParametersDescribe(kind),
          presets: kind.presets.map((preset) => ({
            id: preset.id,
            label: preset.label,
            hint: preset.tooltip,
            parameters: preset.parameters,
          })),
        }
      : { parameterCount: modifierKindParametersDescribe(kind).length, presetCount: kind.presets.length }),
  };
}

/**
 * Describes the Add menu's modifier volume templates.
 *
 * @returns Template ids, labels and the kinds they start with.
 */
export function modifierVolumeTemplatesDescribe(): { id: string; label: string; kinds: string[] }[] {
  return modifierVolumeTemplates.map((template) => ({
    id: template.id,
    label: template.label,
    kinds: [...template.kinds],
  }));
}
