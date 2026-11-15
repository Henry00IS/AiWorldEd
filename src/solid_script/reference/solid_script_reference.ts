import {
  SOLID_SCRIPT_COMMAND_CATEGORIES,
  solidScriptCommands,
} from '@/solid_script/commands/solid_script_command_catalog.js';
import type { SolidScriptCommand } from '@/solid_script/commands/solid_script_command.js';

/** Short description of SolidScript for tool descriptions. */
export const SOLID_SCRIPT_REFERENCE_SUMMARY =
  "SolidScript is AiWorldEd's own C-style CSG language: cube, sphere, cylinder, polyhedron (convex hull), linear_extrude of square/circle/polygon, " +
  'hull, union, difference, intersection, translate/rotate/scale/mirror/multmatrix, variables, modules, functions, for, if/else and echo. ' +
  'Every primitive becomes one convex brush; difference becomes a CSG group whose first child adds and the rest subtract. ' +
  'Z-up, units in metres, angles in degrees. Read geometry_script_reference_get once before writing a script: it lists every command, its defaults, ' +
  'what is not supported and the common mistakes.';

/** Language part of the reference: coordinates, grammar, shapes and rules. */
const SOLID_SCRIPT_REFERENCE_LANGUAGE = `# SolidScript reference

SolidScript is the language AiWorldEd uses to describe brush geometry. It reads like other C-style CSG languages, but it is its own language: only what this reference lists works, and some commands behave differently from what you may expect elsewhere (see Common mistakes).

## Coordinates and units

- Units are metres. Angles are degrees.
- Scripts are Z-up: X is right, Y is forward (away from the viewer), Z is up. The editor is Y-up, so a script point (x, y, z) lands at editor (x, z, -y). geometry_script_build with upAxis "y" keeps the editor's axes as written instead.
- cube and square start at the origin and grow along +X, +Y (+Z) unless center = true. cylinder stands on the origin and grows along +Z unless center = true. sphere and circle are centred on the origin.
- In a SolidScript generator, placement decides where script units go in the generator's box: "origin" puts the script origin at the bottom centre of the box with script units unchanged, "fit" scales the whole result evenly to fit the box, "stretch" scales each axis to fill the box.

## Grammar

- A script is a list of statements. A statement ends with ";" or is a block in braces. Comments: // to the end of the line, /* ... */.
- Variables: name = expression; A name holds one value per scope: the last assignment in a scope wins and applies to the whole scope, including lines above it. A loop body or module body is a new scope, so assigning inside a loop does not change the value outside.
- Module call: name(arguments) child; or name(arguments) { children }. Transforms and combinations apply to the one statement or the braced block after them.
- Arguments are positional (cube([1, 2, 3])) or named (cube(size = [1, 2, 3], center = true)). Missing arguments use their defaults.
- Modules: module door(w = 1, h = 2) { cube([w, 0.2, h]); } then door(1.2); children() inside a module builds what the caller put after the call; children(i) builds the i-th child.
- Functions: function area(w, d) = w * d; then x = area(2, 3);
- if (condition) statement else statement
- for (i = [0 : 3]) statement repeats with i = 0, 1, 2, 3. Ranges are [start : end] or [start : step : end], both ends included. for (p = [[0, 0], [2, 1]]) walks a list. for (i = [0 : 2], j = [0 : 1]) nests the loops.
- Expressions: numbers (1, 0.5, 1e-3), strings in double quotes, true, false, undef, vectors [1, 2, 3], ranges, list comprehensions [for (i = [0 : 3]) i * 2].
- Operators, loosest first: ? : (condition), ||, &&, == !=, < <= > >=, + -, * / %, unary - + !. Vector arithmetic works element-wise; a number times a vector scales it. v[0] indexes; v.x, v.y, v.z read the first three items.
- Built-in functions: sin, cos, tan, asin, acos, atan, atan2 (degrees), abs, sign, ceil, floor, round, sqrt, exp, ln, log (base 10), pow, min, max, norm, cross, len, concat, str, is_undef, is_num, is_list, is_string, is_bool.
- Special variables: $fn sets the facet count of round shapes (0 = automatic from $fa, the largest angle per facet, default 12, and $fs, the largest facet size, default 2). At most 128 facets are used. Set them as variables ($fn = 32;) or as arguments (sphere(r = 1, $fn = 32)).
- Prefixes: * before a statement disables it; % disables it too (no preview-only shapes); # and ! are accepted and ignored.
- echo(values) writes a line to the output. assert(condition, message) stops the script with the message when the condition is false.

## Shapes

Every primitive becomes exactly one convex brush.

- cube(size = 1, center = false): size is a number for a cube or [x, y, z].
- sphere(r = 1) or sphere(d = 2): a faceted ball.
- cylinder(h = 1, r = 1, center = false), or r1 / r2 (bottom / top radius) for a cone, or d, d1, d2 diameters. r2 = 0 makes a pointed cone.
- polyhedron(points): the convex hull of the [x, y, z] points. A faces argument is ignored, so concave polyhedra come out filled.
- 2D shapes, only inside linear_extrude: square(size = 1, center = false) with size a number or [x, y]; circle(r = 1) or circle(d = 2); polygon(points, paths): concave outlines are split into convex pieces; with paths, the first path is the outline and the others are holes.
- linear_extrude(height = 1, center = false, scale = 1) { 2D shapes }: extrudes along +Z; scale (number or [x, y]) shrinks or grows the top. Each convex piece becomes one brush.

## Transforms

- translate(v = [x, y, z])
- rotate(a = [x, y, z]): rotates about X, then Y, then Z, around the fixed axes. rotate(a = angle, v = [x, y, z]) rotates about an axis; rotate(angle) alone turns about Z.
- scale(v = [x, y, z]) or scale(number)
- mirror(v = [x, y, z]): mirrors across the plane through the origin with that normal.
- multmatrix(m): a 4x4 (or 3x4) row-major matrix.
- color(...), render() and group() pass their children through unchanged; colour is ignored.

## Combining

- union() { ... } keeps all children; it is flattened into its parent.
- difference() { first; rest } becomes a CSG group: the first child adds, every later child is subtracted from it.
- intersection() { ... } becomes a group of intersecting members: only the space common to all children remains.
- hull() { ... } becomes one convex brush around all its children.
- Module names become brush and group names in the outliner, so wrap parts in modules (module door() { ... }) for readable names.

## Not supported

rotate_extrude, minkowski, offset, text, import, include, use, resize, surface, projection, twist and slices of linear_extrude, let, each, and if or let inside list comprehensions. A script builds at most 2000 solids and may be at most 200000 characters long.
`;

/** Generator part of the reference: command lines and their rules. */
const SOLID_SCRIPT_REFERENCE_LINES = `## SolidScript generators and command lines

A SolidScript generator (modifier_generator_create kind solidScript) keeps a named script in the level and rebuilds its brushes whenever the script or its box changes. Its script consists of command lines only, exactly like the palette of the script editor: there are no free lines of code. Each line is { command, values }:

- command is a command id from the list below.
- values are code text by parameter key, always strings: "2", "[1, 2, 3]", "true", "width * 2", "\\"Hello\\"". Parameters you leave out keep their defaults. A value may be any expression of the language, so formulas and variables work inside values.
- A command marked "opens a block" applies to the lines after it until a matching { "command": "end" } line. Every opener needs its own end. else sits between an if and its end.
- { "command": "blank" } is an empty line.
- Line N of the script is line N of the generated source, so errors and debug steps name script lines.

geometry_script_generator_set replaces name, lines and placement in one undo step; geometry_script_generator_get reads them back with the generated source, the solid count and the first error. Turn the result into plain brushes with modifier_stack_bake.
`;

/** Example and pitfall part of the reference. */
const SOLID_SCRIPT_REFERENCE_EXAMPLES = `## Examples

A wall with a doorway, as source for geometry_script_build:

\`\`\`
difference() {
  cube([4, 0.2, 3]);
  translate([1.5, -0.1, 0]) cube([1, 0.4, 2.1]);
}
\`\`\`

A row of columns with a named part:

\`\`\`
module column() { cylinder(h = 3, r = 0.2, $fn = 16); }
for (i = [0 : 4]) translate([i * 1.5, 0, 0]) column();
\`\`\`

The same row as generator lines:

\`\`\`
[{ "command": "part", "values": { "name": "column" } },
 { "command": "cylinder", "values": { "h": "3", "r1": "0.2", "r2": "0.2" } },
 { "command": "end" },
 { "command": "repeat", "values": { "variable": "i", "from": "0", "to": "4", "step": "1" } },
 { "command": "translate", "values": { "v": "[i * 1.5, 0, 0]" } },
 { "command": "use_part", "values": { "name": "column" } },
 { "command": "end" },
 { "command": "end" }]
\`\`\`

## Common mistakes

- Height is Z, not Y: cube([width, depth, height]).
- cube and cylinder are not centred by default; pass center = true or translate them.
- 2D shapes (square, circle, polygon) only work inside linear_extrude, and 3D shapes never do.
- difference keeps only its first child; wrap several positive parts in union() { ... } as the first child.
- Reassigning a variable inside a loop does not accumulate; compute from the loop counter instead (x = i * 2).
- A concave solid cannot be one primitive: build it from several convex parts or cut it with difference. polyhedron always fills concavities.
- rotate([x, y, z]) turns about X first; for one turn about a single axis use rotate([0, 0, 90]).
- In generator lines every opener (transforms, combinations, repeat, if, part) needs its own end line, and values are strings.
- Keep $fn moderate (16 to 32): more facets cost more planes per brush but never more brushes.
`;

/**
 * Describes one editor command for the reference.
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
  const code = command.code(command.valuesDefault()) || '(empty line)';
  return [`- ${command.id}: ${command.label}. ${command.description}${block} Writes: ${code}`, ...values].join('\n');
}

/**
 * Lists the editor commands by palette group, the hidden ones last.
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
 * Returns the full SolidScript reference for assistants: language, command
 * lines with every parameter and default, examples and common mistakes.
 *
 * @returns Markdown text.
 */
export function solidScriptReference(): string {
  return [
    SOLID_SCRIPT_REFERENCE_LANGUAGE,
    SOLID_SCRIPT_REFERENCE_LINES,
    solidScriptReferenceCommands(),
    SOLID_SCRIPT_REFERENCE_EXAMPLES,
  ].join('\n');
}
