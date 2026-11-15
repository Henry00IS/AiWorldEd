import {
  SOLID_SCRIPT_COMMAND_CATEGORIES,
  solidScriptCommands,
} from '@/solid_script/commands/solid_script_command_catalog.js';
import type { SolidScriptCommand } from '@/solid_script/commands/solid_script_command.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptDocumentListing } from '@/solid_script/document/solid_script_document_listing.js';

/** Short description of SolidScript for tool descriptions. */
export const SOLID_SCRIPT_REFERENCE_SUMMARY =
  "SolidScript is AiWorldEd's block script for CSG: a list of lines {command, values}, run top to bottom like the script editor shows them. " +
  'Field values are plain text without quotes: numbers, "x, y, z" lists, [name] for a variable, [=formula] for a calculation. The origin is the centre of the generator, and shapes are centred on it by default. ' +
  'Commands build boxes, balls, cylinders and convex point sets, extrude flat outlines, move/turn/stretch/mirror, join, cut, overlap and wrap shapes, set variables, repeat, branch and reuse named parts. ' +
  'Every shape becomes one convex brush; Difference becomes a CSG group whose first child adds and the rest subtract. ' +
  'Z-up, metres, degrees. Read geometry_script_reference_get once before writing a script: it lists every command, its fields and defaults, what stops it, and common mistakes.';

/** Model part of the reference: coordinates, lines, values and running. */
const SOLID_SCRIPT_REFERENCE_MODEL = `# SolidScript reference

SolidScript is how AiWorldEd describes brush geometry as a script of block lines, the same lines the script editor shows. There is no code text: a script is a list of lines, and each line is one command with its field values.

## Coordinates and units

- Units are metres. Angles are degrees.
- Scripts are Z-up: X is right, Y is forward (away from the viewer), Z is up. The editor is Y-up, so a script point (x, y, z) lands at editor (x, z, -y). geometry_script_build with upAxis "y" keeps the editor's axes as written instead.
- The origin [0, 0, 0] is the centre of the generator's box (for geometry_script_build, the build position). Shapes are centred on it by default, so a shape with no Translate sits in the middle of the generator; no Translate is needed to lift it into the box.
- Cube, Cylinder, Square and Linear Extrude have a Center switch, on by default. Switched off, Cube and Square put their corner on the origin and grow along +X, +Y (+Z), and Cylinder and Linear Extrude stand on the origin and grow along +Z. Sphere and Circle are always centred.
- In a SolidScript generator, placement decides how script metres map to the generator's box: "origin" keeps metres unchanged around the box centre, "fit" scales the whole result evenly to fit the box, "stretch" scales each axis to fill the box; both keep it centred.

## Lines

- Each line is { "command": id, "values": { key: text } }. command is an id from the command list below.
- values are always strings of plain text, without quotes. Fields you leave out keep their defaults. See Field values below.
- A command marked "opens a block" holds the lines after it up to its own { "command": "end" } line; blocks nest. Else sits between an If and its End.
- { "command": "blank" } is an empty line; { "command": "note" } is a note for people. Neither does anything when the script runs.
- Lines are numbered from 1 in list order; errors say "line N: ..." with that number.

## Running

- Every run starts a fresh machine: no variable or setting survives from an earlier run or from another generator.
- Before anything runs, the block structure is checked: a missing End, an End without a block, an Else outside an If, or an unknown command stops the script and builds nothing.
- Lines then run top to bottom. A variable exists from its Set line on; a line above it cannot use it. Setting a name again changes the existing variable, so a Set inside a Repeat can count up across rounds.
- Define Part lines are registered before the run, so Use Part may come before or after its Define Part. Use Part works like a call: the part's lines run, then the script carries on after the Use Part line. The part sees the caller's variables, and Set inside it changes a variable that already exists outside, so a part can hand back results. A part may use itself (recursion) as long as an If stops it; parts nest at most 64 deep. Use Part's name may be a variable, such as "[style]".
- The first mistake stops the script at that line; the error names the line and the field, such as "line 3: Size must be greater than 0".
- A script builds at most 2000 solids, and Repeat runs at most 10000 rounds.

## Field values

Every field is plain text, without quotes, read like this:

- A number: "2", "0.5", "-1".
- A list for positions, sizes and angles: numbers separated by commas, "1, 2, 3". One number fills every axis: "2" means 2, 2, 2.
- Polyhedron and Polygon are blocks: each Point line between them and their End adds one corner (x, y, z; a Polygon ignores z). Point lines may sit inside Repeat, For Each, If and moves such as Translate, so corners can come from loops and formulas. Their optional Points From List field adds the points of a list variable, such as "[corners]"; written out, points are separated by semicolons: "0, 0, 0; 1, 0, 0".
- Lists: Set "points()" adds an item at the end of the list points (creating it), Set "points(2)" changes item 2 (items count from 0, and the next free number appends), "[points(2)]" reads it, "[points().count]" is the number of items and "[points]" is the whole list. An item number past the end stops the script. For Each runs its lines once per item of a list.
- Switches: "true" or "false" (Yes or No also work).
- [name] puts in the value of a variable: "[width]", or "[width], 1, 1" for one axis.
- [=formula] puts in the result of a formula; inside it, write variables as [name] too: "[=[i] * 2]", "[=[width] / 2], 0, [=sin([angle]) * 3]".
- Brackets nest, so a variable name can itself come from variables: "[part[i]]" reads the variable whose name is part followed by the value of i.
- Text fields such as Echo's message mix plain text with them: "Width is [width], area [=[width] * [depth]]".
- $ keeps the next character as typed: $[ and $] write brackets, $$ a dollar sign.
- If's condition is a formula without the leading =: "[i] % 2 == 0", "[width] > 2 && [open]".
- Set's value is a number, a comma list of numbers, true/false, or else plain text.
- Name fields (variable, counter, part names) take a plain name, without brackets; Set's name may also be a list item such as points([i]). Note text is used as typed.
- An unknown [name] stops the script with "line N: ... there is no variable [name]"; a formula that cannot be read stops it with the formula and the reason.

Formulas know: numbers, text in double quotes, true, false, lists in $[ $] brackets, the operators (loosest first) ? :, ||, &&, == !=, < <= > >=, + -, * / %, unary - + !, and the functions sin, cos, tan, asin, acos, atan, atan2 (degrees), abs, sign, ceil, floor, round, sqrt, exp, ln, log (base 10), pow, min, max, norm, cross, len, concat, str, is_undef, is_num, is_list, is_string, is_bool, lookup (lookup(key, table) blends between the two nearest key, value pairs of a table), rands (rands(min, max, count, seed) gives the same random numbers for the same seed), and PI. Lists add item by item and a number times a list scales it.

## Shapes and brushes

- Every shape line becomes exactly one convex brush. Round shapes have a Sides field (3 to 64, default 16) and Sphere a Rings field (2 to 32, default 8), set per line.
- Polyhedron wraps its points in one convex solid; dents are filled.
- Rotate Extrude spins flat outlines around Z (outline X is the radius, Y the height), one brush per side and convex piece. Minkowski grows the first shape by the hull of each later one (round edges with a small Sphere). Resize stretches to an exact size; Matrix applies a 3 by 4 matrix, including shear.
- Return leaves the part it is in; the script carries on after the Use Part line.
- Square, Circle and Polygon are flat outlines and only work inside Linear Extrude; a concave Polygon becomes several convex brushes.
- Difference becomes a CSG group: the first shape inside adds, every later one is cut from it. Intersection becomes a group that keeps only the overlap. Union is flattened into its parent. Hull becomes one convex brush around everything inside.
- Part names become brush and group names in the outliner, so wrap pieces in Define Part for readable names.
`;

/** Tool part of the reference: which tool takes what. */
const SOLID_SCRIPT_REFERENCE_TOOLS = `## Tools

- geometry_script_build and geometry_script_preview take lines and add the result as plain brushes (or report what they would add).
- A SolidScript generator (modifier_generator_create kind solidScript) keeps a named script in the level and rebuilds its brushes whenever the script or its box changes. geometry_script_generator_set replaces its name, lines and placement in one undo step; geometry_script_generator_get reads them back with how the editor lists each line, the solid count and the first error. Turn the result into plain brushes with modifier_stack_bake.
- geometry_script_command_list returns the same commands as JSON.
`;

/** Example and pitfall part of the reference. */
/** Lines of the wall with a doorway example. */
const SOLID_SCRIPT_REFERENCE_DOORWAY: SolidScriptLine[] = [
  { command: 'difference' },
  { command: 'cube', values: { size: '4, 0.2, 3' } },
  { command: 'translate', values: { v: '0, 0, -0.45' } },
  { command: 'cube', values: { size: '1, 0.4, 2.1' } },
  { command: 'end' },
  { command: 'end' },
];

/** Lines of the row of columns example. */
const SOLID_SCRIPT_REFERENCE_COLUMNS: SolidScriptLine[] = [
  { command: 'part', values: { name: 'column' } },
  { command: 'cylinder', values: { h: '3', r1: '0.2', r2: '0.2', sides: '12' } },
  { command: 'end' },
  { command: 'repeat', values: { variable: 'i', from: '0', to: '4' } },
  { command: 'translate', values: { v: '[=[i] * 1.5 - 3], 0, 0' } },
  { command: 'use_part', values: { name: 'column' } },
  { command: 'end' },
  { command: 'end' },
];

/**
 * Writes example lines as the JSON a tool takes, one line per row.
 *
 * @param lines Example lines.
 * @returns Code block.
 */
function solidScriptReferenceJson(lines: readonly SolidScriptLine[]): string {
  const rows = lines.map((line) => JSON.stringify(line).replaceAll('":', '": ').replaceAll(',"', ', "'));
  return `\`\`\`\n[${rows.join(',\n ')}]\n\`\`\``;
}

/**
 * Returns the examples, each as tool JSON, the last also as the editor lists
 * it.
 *
 * @returns Section text.
 */
function solidScriptReferenceExamples(): string {
  const listed = solidScriptDocumentListing(solidScriptDocumentCreate(SOLID_SCRIPT_REFERENCE_COLUMNS)).join('\n');
  return `## Examples

A wall with a doorway:

${solidScriptReferenceJson(SOLID_SCRIPT_REFERENCE_DOORWAY)}

A row of five columns from one named part, centred on the origin:

${solidScriptReferenceJson(SOLID_SCRIPT_REFERENCE_COLUMNS)}

The editor lists these lines as:

\`\`\`text
${listed}
\`\`\``;
}

/** Mistakes assistants make most. */
const SOLID_SCRIPT_REFERENCE_MISTAKES = `## Common mistakes

- Height is Z, not Y: Cube size is [width, depth, height].
- Shapes are centred on the origin (the generator's centre) by default; do not add a Translate to lift them into the box. Set center to "false" to place a corner (or the base) on the origin instead.
- Flat outlines (square, circle, polygon) only work inside linear_extrude, and solids never do.
- Difference keeps only its first shape and cuts the rest; to keep several shapes, put them in a Union as the first line inside.
- Every block (transforms, combinations, repeat, if, part) needs its own end line.
- A variable can only be used below its Set line.
- Values are strings, even numbers: "2", not 2. Never put quotes or [ ] around a list: "1, 2, 3", not "[1, 2, 3]".
- Variables need brackets everywhere: "[width]", and "[=[width] * 2]" inside a formula; Echo text needs no quotes.
- A concave solid cannot be one shape: build it from several convex parts or cut it with Difference.
- Rotate turns about X first, then Y, then Z; for one turn about a single axis use "0, 0, 90".
- Keep Sides moderate (12 to 32): more sides cost more planes per brush but never more brushes.
`;

/**
 * Describes one command for the reference, with the same help the editor shows.
 *
 * @param command Command.
 * @returns Markdown list item.
 */
function solidScriptReferenceCommand(command: SolidScriptCommand): string {
  const block = command.nesting === 'open' ? ' Opens a block.' : '';
  const values = command.parameters.map(
    (parameter) =>
      `  - ${parameter.key} (${parameter.label}, ${parameter.type}, default ${parameter.default}): ${parameter.hint}`,
  );
  const stops = command.stops.length > 0 ? [`  - Stops on: ${command.stops.join(' ')}`] : [];
  const listed = command.listingText(command.valuesDefault()) || '(empty line)';
  return [
    `- ${command.id}: ${command.label}. ${command.description}.${block} Listed as: ${listed}`,
    `  ${command.manual}`,
    ...values,
    ...stops,
  ].join('\n');
}

/**
 * Lists the commands by palette group, the hidden ones last.
 *
 * @returns Markdown section.
 */
function solidScriptReferenceCommands(): string {
  const groups = SOLID_SCRIPT_COMMAND_CATEGORIES.map((category) => {
    const commands = solidScriptCommands.filter((command) => command.category === category && command.inPalette);
    return `### ${category}\n\n${commands.map(solidScriptReferenceCommand).join('\n')}`;
  });
  const hidden = solidScriptCommands.filter((command) => !command.inPalette).map(solidScriptReferenceCommand);
  return ['## Commands', ...groups, `### Structure lines\n\n${hidden.join('\n')}`].join('\n\n');
}

/**
 * Returns the full SolidScript reference for assistants: the line model,
 * running rules, every command with its fields, examples and common mistakes.
 *
 * @returns Markdown text.
 */
export function solidScriptReference(): string {
  return [
    SOLID_SCRIPT_REFERENCE_MODEL,
    SOLID_SCRIPT_REFERENCE_TOOLS,
    solidScriptReferenceCommands(),
    solidScriptReferenceExamples(),
    SOLID_SCRIPT_REFERENCE_MISTAKES,
  ].join('\n');
}
