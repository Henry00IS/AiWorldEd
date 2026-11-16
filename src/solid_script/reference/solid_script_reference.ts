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
  "Commands build boxes, balls, cylinders and convex point sets, extrude flat outlines, move/turn/stretch/mirror, join, cut, overlap and wrap shapes, set variables and lists, repeat, branch, reuse named parts, call functions with values and results, offer input settings and buttons in the inspector and check them as they change. Generator blocks build the shapes of the editor's generators (Cone, Torus, Stairs, Arch and more) with their own fields, and mesh blocks build regular editable meshes. " +
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
- The script runs from the top. Define Part, Function, When Input Changes and When Button Pressed blocks are skipped to their End where they stand, and registered before the run, so Use Part or a Call may come before or after them. Use Part works like a call: the part's lines run, then the script carries on after the Use Part line. The part sees the caller's variables, and Set inside it changes a variable that already exists outside, so a part can hand back results. A part may use itself (recursion) as long as an If stops it; parts nest at most 64 deep. Use Part's name may be a variable, such as "[style]".
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

Formulas know: numbers, text in double quotes, true, false, lists in $[ $] brackets, the operators (loosest first) ? :, ||, &&, == !=, < <= > >=, + -, * / %, unary - + !, and the functions sin, cos, tan, asin, acos, atan, atan2 (degrees), abs, sign, ceil, floor, round, sqrt, exp, ln, log (base 10), pow, min, max, norm, cross, len, concat, str, is_undef, is_num, is_list, is_string, is_bool, lookup (lookup(key, table) blends between the two nearest key, value pairs of a table), rands (rands(min, max, count, seed) gives the same random numbers for the same seed), and PI, plus the functions the script defines with Function blocks. Lists add item by item and a number times a list scales it.

## Shapes and brushes

- Every shape line becomes exactly one convex brush. Round shapes have a Sides field (3 to 64, default 16) and Sphere a Rings field (2 to 32, default 8), set per line.
- Polyhedron wraps its points in one convex solid; dents are filled.
- Rotate Extrude spins flat outlines around Z (outline X is the radius, Y the height), one brush per side and convex piece. Minkowski grows the first shape by the hull of each later one (round edges with a small Sphere). Resize stretches to an exact size; Matrix applies a 3 by 4 matrix, including shear.
- Return leaves the part it is in; the script carries on after the Use Part line.
- Square, Circle and Polygon are flat outlines and only work inside Linear Extrude; a concave Polygon becomes several convex brushes.
- Difference becomes a CSG group: the first shape inside adds, every later one is cut from it. Intersection becomes a group that keeps only the overlap. Union is flattened into its parent. Hull becomes one convex brush around everything inside.
- Part names become brush and group names in the outliner, so wrap pieces in Define Part for readable names.
- Generator blocks (Cone, Capsule, Torus, Pipe, Pyramid, Prism, Hollow Box, Curved Stairs, Column, Stairs, Arch, Blast Hole) build the same pieces as the generator of that name: they fill a box of their Size, centred on the origin unless Center is off, and their other fields have the generator's names, ranges and choices. A choice is written as its value, such as "z" for Prism's Axis, and may come from a variable. Sphere and Cylinder are built the same way as the Sphere, Cylinder and Cone generators.

## Meshes

- Mesh blocks build regular editable meshes instead of brushes. Mesh holds Vertex lines (a position and an optional texture coordinate) and Face lines (vertex numbers from 0, counter-clockwise seen from outside). Mesh From Shapes turns the solids inside it into one mesh.
- Subdivide, Smooth Mesh, Displace, Extrude Faces, Box UVs and Flip Faces change the mesh made from the lines inside them; solids inside are turned into a mesh first. Displace and Extrude Faces work out their distance per point or face from a formula that may use [x], [y], [z], [nx], [ny], [nz] and [index].
- A script may mix brushes and meshes. A mesh cannot be cut: Difference and Intersection stop the script when a mesh is inside them.
- In a SolidScript generator, meshes show as a preview that is not saved, picked or collided with; Bake turns them into mesh objects. geometry_script_build creates them as mesh objects in the same undo step as the brushes.

## Faces

- Select Faces picks faces of the shapes built above it, in plain words. Which is All, Facing Up, Facing Down, Facing Left, Facing Right, Facing Front, Facing Back (Within allows a slope in degrees), Facing (Detail gives a direction such as 0, 0, 1), Tagged (Detail gives a name), Biggest or Smallest (Detail gives how many), Number (Detail gives face numbers) or Where (Detail gives a condition such as [=[Face.Area] > 1]). How is New, Add or Remove.
- Every face has a name: Top, Bottom or Side. Stairs add Step Tread and Riser, columns add Cap.
- For Each Selected Face runs its lines once per picked face. Inside, the read-only values [Face.Index], [Face.Number], [Face.Center], [Face.Normal], [Face.Width], [Face.Height], [Face.Area] and [Face.Tag] describe it; [Face.Center(2)] is the height of its middle.
- For Each Vertex gives [Vertex.Index], [Vertex.Position] and [Vertex.Normal]; For Each Edge gives [Edge.Index], [Edge.Start], [Edge.End], [Edge.Middle], [Edge.Length] and [Edge.Direction].
- Place On Face builds the shapes inside standing on the face of the round: Z points out of the face, X runs across it, Y up it.
- Extrude Face, Inset Face, Bevel Edges and Delete Faces work on the face of the round, or else on every picked face. Extrude Face adds a brush on a brush face and moves a mesh face. Inset Face and Delete Faces turn a brush into a mesh. Bevel Edges works on brushes.
- Formulas can read any face, corner or edge of the shapes above: face_count(), face_center(n), face_normal(n), face_width(n), face_height(n), face_area(n), face_tag(n), vertex_count(), vertex_position(n), vertex_normal(n), edge_count(), edge_start(n), edge_end(n), edge_middle(n) and edge_length(n). Numbers count from 0.
- Example, a trim on every stair step: Stairs; Select Faces Tagged Step Tread; For Each Selected Face; Place On Face; Cube size [Face.Width], 0.05, 0.03; End For Each.

## Inputs, functions and events

- Input lines give a script settings, like the fields of a built-in generator: Input steps, Type count, Default 8, Minimum 1, Maximum 64 makes a read-only variable [steps]. In a SolidScript generator the inspector shows one control per Input (number, count, switch, text, choice, or button) and geometry_script_generator_set takes their values as inputs; until a value is set, the Default is used. A value outside the limits stops the script.
- A Function block groups lines you can run from other places. Its first line reads "Function post with inputs x, h", and it ends with "End Function". Its lines only run when something calls it. Call post with Values "[i], 3" runs it where the Call stands. Inside, read the inputs as [local.x] and [local.h]. A Return line gives a value back, such as Return [=[local.x] + 1], and Call stores it in the variable named in Result In. A formula may also call a Function that builds nothing, such as [=area(2, 3)]. A function may call itself, but an If must stop it. Functions and parts go at most 64 levels deep.
- Inside a Function, its inputs and every Set local.name are its own variables, written [local.name]; each call has fresh ones, so recursion and loops never mix them up. Plain names such as [width] are the script's variables: Set width changes the one the script has, and a new plain name made in a Function stays after it returns. local. outside a Function stops the script.
- When Input Changes steps and When Button Pressed reset blocks run when someone changes the input or presses a button Input in the inspector, before the shape is rebuilt, and never during the normal run. They read every input, check it, change it with Set Input steps to [=min([steps], 64)] and explain with Show Message; they may call Functions but may not build shapes. Set Input and Show Message only work inside them.
- The debugger shows the call stack while paused or stepping: each running Function and part, the line that called it, and its local variables. Breakpoints work inside Function and handler blocks.
- Remove Item takes an item out of a list: "points(1)" removes item 1 and moves the later items up, "points()" removes the last one.
- List blocks change a whole list in plain words: Add Item 5 to heights (makes the list when it is new), Insert Item 4 into heights at 1, Remove Value red from colors (Every Copy takes out all of them), Find Item blue in colors, result in where (-1 when it is not there), Sort List heights (numbers small to big, then words A to Z; Biggest First turns it around) and Reverse List heights. [heights().count] is how many items there are.
- Clear Variable empties a variable but keeps its name: a list keeps no items, anything else becomes empty text. Delete Variable forgets it, so reading it stops the script until a line sets it again.
- [persistent.name] is a variable kept with the generator: it is saved with the level, shared in multiplayer and still there next run, stored like an input without a row in the inspector. When Button Pressed and When Input Changes blocks store what they set, such as Set persistent.presses to [=[persistent.presses] + 1]; the normal build may change it too, but only for that build, so every rebuild gives the same shape. A persistent value that was never set reads as nothing, so is_undef([persistent.presses]) checks for it. Delete Variable persistent.presses forgets it.
- Offset grows (Distance above 0) or shrinks (below 0) the flat outlines inside it, with round or sharp corners; shrinking and sharp corners need convex outlines for now.
`;

/** Tool part of the reference: which tool takes what. */
const SOLID_SCRIPT_REFERENCE_TOOLS = `## Tools

- geometry_script_build and geometry_script_preview take lines and add the result as plain brushes (or report what they would add).
- A SolidScript generator (modifier_generator_create kind solidScript) keeps a named script in the level and rebuilds its brushes whenever the script or its box changes. geometry_script_generator_set replaces its name, lines, placement and input values in one undo step; geometry_script_generator_get reads them back with how the editor lists each line, the script's Input lines with their values, the solid count and the first error. Turn the result into plain brushes with modifier_stack_bake.
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
