// First, so the generator kinds below load through the catalog.
import { solidScriptGeneratorPieces } from '@/solid_script/language/solid_script_generator_pieces.js';
import { SolidScriptCommand, type SolidScriptCommandParameter } from './solid_script_command.js';
import { solidScriptListingOptions } from './solid_script_command_listing.js';
import { solidScriptParameter, solidScriptParameterCenter } from './solid_script_command_parameters.js';
import type { SolidScriptBlockArguments } from '@/solid_script/language/solid_script_block_arguments.js';
import { solidScriptValueNumber, solidScriptValueText } from '@/solid_script/language/solid_script_value.js';
import type { ModifierStackField } from '@/modifier/stack/modifier_stack_types.js';
import type { ModifierStackKindGenerator } from '@/modifier/stack/kinds/generator/modifier_stack_kind_generator.js';
import { ModifierStackKindCone } from '@/modifier/stack/kinds/generator/primitive/modifier_stack_kind_cone.js';
import { ModifierStackKindCapsule } from '@/modifier/stack/kinds/generator/primitive/modifier_stack_kind_capsule.js';
import { ModifierStackKindTorus } from '@/modifier/stack/kinds/generator/primitive/modifier_stack_kind_torus.js';
import { ModifierStackKindPipe } from '@/modifier/stack/kinds/generator/primitive/modifier_stack_kind_pipe.js';
import { ModifierStackKindPyramid } from '@/modifier/stack/kinds/generator/primitive/modifier_stack_kind_pyramid.js';
import { ModifierStackKindPrism } from '@/modifier/stack/kinds/generator/primitive/modifier_stack_kind_prism.js';
import { ModifierStackKindHollowBox } from '@/modifier/stack/kinds/generator/primitive/modifier_stack_kind_hollow_box.js';
import { ModifierStackKindCurvedStairs } from '@/modifier/stack/kinds/generator/primitive/modifier_stack_kind_curved_stairs.js';
import { ModifierStackKindColumn } from '@/modifier/stack/kinds/generator/modifier_stack_kind_column.js';
import { ModifierStackKindStairs } from '@/modifier/stack/kinds/generator/modifier_stack_kind_stairs.js';
import { ModifierStackKindArch } from '@/modifier/stack/kinds/generator/modifier_stack_kind_arch.js';
import { ModifierStackKindBlastHole } from '@/modifier/stack/kinds/generator/modifier_stack_kind_blast_hole.js';

/** Size of a new generator block's box, in metres. */
const SOLID_SCRIPT_GENERATOR_SIZE = '2, 2, 2';

/**
 * Returns the shape fields of a generator a script block offers: numbers,
 * switches and choices outside the texture, shading and output groups.
 *
 * @param kind Box generator.
 * @returns Fields in inspector order.
 */
function solidScriptGeneratorFields(kind: ModifierStackKindGenerator): ModifierStackField[] {
  return kind.fields.filter(
    (field) =>
      !field.group &&
      !field.hidden &&
      field.key !== 'operation' &&
      (field.type === 'number' || field.type === 'choice' || field.type === 'boolean'),
  );
}

/**
 * Describes a generator field as a script field under the same key and label.
 *
 * @param field Generator field.
 * @returns Script field.
 */
function solidScriptGeneratorParameter(field: ModifierStackField): SolidScriptCommandParameter {
  const hint = field.hint ?? field.label;
  if (field.type === 'boolean')
    return solidScriptParameter(field.key, field.label, 'boolean', String(field.default), hint);
  if (field.type === 'choice') {
    const choices = (field.choices ?? []).map((choice) => `${choice.value} (${choice.label})`).join(', ');
    return solidScriptParameter(
      field.key,
      field.label,
      'message',
      String(field.default),
      `${hint} One of: ${choices}.`,
    );
  }
  const range = field.min !== undefined && field.max !== undefined ? ` From ${field.min} to ${field.max}.` : '';
  const type = field.integer ? 'count' : 'number';
  return solidScriptParameter(field.key, field.label, type, String(field.default), `${hint}${range}`);
}

/**
 * Reads one generator field strictly: a number inside its range, a whole number
 * for counts, Yes or No, or one of the choices.
 *
 * @param args Block fields.
 * @param field Generator field.
 * @returns Parameter value for the generator.
 */
function solidScriptGeneratorValue(args: SolidScriptBlockArguments, field: ModifierStackField): unknown {
  if (field.type === 'boolean') return args.flag(field.key);
  if (field.type === 'choice') {
    const text = solidScriptValueText(args.value(field.key));
    const values = (field.choices ?? []).map((choice) => choice.value);
    if (!values.includes(text)) throw args.error(field.key, `must be one of ${values.join(', ')}`, text);
    return text;
  }
  const number = solidScriptValueNumber(args.value(field.key));
  if (number === undefined) throw args.error(field.key, 'must be a number', args.value(field.key));
  if (field.integer && !Number.isInteger(number)) throw args.error(field.key, 'must be a whole number', number);
  if ((field.min !== undefined && number < field.min) || (field.max !== undefined && number > field.max))
    throw args.error(field.key, `must be from ${field.min} to ${field.max}`, number);
  return number;
}

/**
 * Builds the script block of one box generator. It fills a box like the
 * generator node does and takes the generator's own fields.
 *
 * @param kind Box generator.
 * @returns Command.
 */
function solidScriptGeneratorCommand(kind: ModifierStackKindGenerator): SolidScriptCommand {
  const fields = solidScriptGeneratorFields(kind);
  return new SolidScriptCommand({
    id: kind.id,
    label: kind.label,
    category: 'Generators',
    description: `Build a ${kind.label.toLowerCase()} like the generator`,
    manual: `${kind.description} The script block fills a box of the given width (X), depth (Y) and height (Z) in metres, centred on the origin; switch Center off to put the box corner there instead. Its other fields are the ones the ${kind.label} generator shows in the inspector, with the same names, so a script can change them with variables and formulas. Textures come from the generator holding the script. Example: a ${kind.label} block with Size 2, 2, 3 fills a box two metres wide and three metres tall around the origin.`,
    stops: [
      'A size of 0 or less on any axis.',
      'A number outside the range its field allows, or a count with decimals.',
      'A choice that is not one of the listed values.',
    ],
    parameters: [
      solidScriptParameter(
        'size',
        'Size',
        'vector3',
        SOLID_SCRIPT_GENERATOR_SIZE,
        'Width (X), depth (Y) and height (Z) of the box it fills, in metres.',
      ),
      solidScriptParameterCenter(),
      ...fields.map(solidScriptGeneratorParameter),
    ],
    listing: (read) => [
      kind.label,
      read.value('size'),
      ...solidScriptListingOptions([
        !read.on('center') && ['Not Centered'],
        ...fields.map((field) => read.changed(field.key) && [`${field.label} `, read.value(field.key)]),
      ]),
    ],
    execute: (run) => {
      const args = run.fields();
      const [x, y, z] = args.vector('size', [2, 2, 2]) as [number, number, number];
      for (const value of [x, y, z]) args.positive('size', value);
      const parameters = Object.fromEntries(fields.map((field) => [field.key, solidScriptGeneratorValue(args, field)]));
      const min = args.flag('center') ? ([-x / 2, -y / 2, -z / 2] as const) : ([0, 0, 0] as const);
      const pieces = solidScriptGeneratorPieces(kind.id, parameters, { size: [x, y, z], min });
      const role = 'direction' in parameters ? `${kind.id} ${String(parameters['direction'])}` : kind.id;
      return pieces
        .flatMap((points) => run.solid(points))
        .map((shape) => (shape.kind === 'solid' ? { ...shape, role } : shape));
    },
  });
}

/** Commands that build the shapes of the box generators. */
export const SOLID_SCRIPT_COMMANDS_GENERATORS: readonly SolidScriptCommand[] = [
  new ModifierStackKindCone(),
  new ModifierStackKindCapsule(),
  new ModifierStackKindTorus(),
  new ModifierStackKindPipe(),
  new ModifierStackKindPyramid(),
  new ModifierStackKindPrism(),
  new ModifierStackKindHollowBox(),
  new ModifierStackKindCurvedStairs(),
  new ModifierStackKindColumn(),
  new ModifierStackKindStairs(),
  new ModifierStackKindArch(),
  new ModifierStackKindBlastHole(),
].map(solidScriptGeneratorCommand);
