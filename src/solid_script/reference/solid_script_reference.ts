import {
  SOLID_SCRIPT_FUNCTION_DOCS,
  solidScriptFunctionArguments,
  solidScriptFunctionKindsText,
  type SolidScriptFunctionDoc,
} from '@/solid_script/language/solid_script_function_docs.js';
import { solidScriptKindsWords } from '@/solid_script/language/solid_script_kinds.js';
import { SOLID_SCRIPT_SYSTEM_GLOBALS } from '@/solid_script/language/solid_script_system.js';
import {
  SOLID_SCRIPT_EXAMPLE_COLUMNS,
  SOLID_SCRIPT_EXAMPLE_DOORWAY,
} from '@/solid_script/examples/solid_script_examples_basics.js';
import {
  SOLID_SCRIPT_COMMAND_CATEGORIES,
  solidScriptCommands,
} from '@/solid_script/commands/solid_script_command_catalog.js';
import type { SolidScriptCommand, SolidScriptCommandParameter } from '@/solid_script/commands/solid_script_command.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptDocumentListing } from '@/solid_script/document/solid_script_document_listing.js';

/** Short description of SolidScript for tool descriptions. */
export const SOLID_SCRIPT_REFERENCE_SUMMARY =
  "SolidScript is AiWorldEd's block script for CSG: a list of lines {command, values}, run top to bottom like the script editor shows them. " +
  'Field values are plain text without quotes: numbers, "x, y, z" lists, [Name] for a variable, [=formula] for a calculation. The origin is the centre of the generator, and brushes are centred on it by default. ' +
  "Commands build boxes, balls, cylinders and convex point sets, extrude flat outlines, move/turn/stretch/mirror, join, cut, overlap and wrap brushes, set variables and lists, repeat, branch, reuse named parts, call functions with values and results, offer input settings and buttons in the inspector and check them as they change. Generator blocks build the shapes of the editor's generators (Cone, Torus, Stairs, Arch and more) with their own fields, and mesh blocks build regular editable meshes. " +
  'Every solid such as Cube becomes one convex brush; Difference becomes a CSG group whose first child adds and the rest subtract. ' +
  'Y-up like the editor (X right, Z toward the front), metres, degrees. Read geometry_script_reference_get once before writing a script: it lists every command, its fields and defaults, what stops it, and common mistakes.';

/** Model part of the reference: coordinates, lines, values and running. */
const SOLID_SCRIPT_REFERENCE_MODEL = `# SolidScript reference

SolidScript is how AiWorldEd describes brush geometry as a script of block lines, the same lines the script editor shows. There is no code text: a script is a list of lines, and each line is one command with its field values.

## Coordinates and units

- Units are metres. Angles are degrees.
- Scripts use the editor's axes: X is right, Y is up and Z points toward the front (toward the viewer). A script point (x, y, z) is the editor point (x, y, z).
- Flat outlines (Square, Circle, Polygon) are drawn with their own X and Y. Linear Extrude lays the drawing on the ground, its Y running to the back (a drawing point (x, y) lands at (x, 0, -y)), and pulls it up along Y. Rotate Extrude stands it up: the outline's X is the radius and its Y the height, spun around the Y axis.
- The origin [0, 0, 0] is the centre of the generator's box (for geometry_script_build, the build position). Brushes are centred on it by default, so a brush with no Translate sits in the middle of the generator; no Translate is needed to lift it into the box.
- Cube, Sphere, Cylinder, Stairs and the other generator blocks have an Anchor: three words, one per axis, naming the spot of the brush that sits on the origin. X takes Left, Center or Right; Y takes Bottom, Center or Top; Z takes Back, Center or Front. Square and Circle take two words (X, then Left/Front/Back along the drawing), and Linear Extrude takes one (Bottom, Center or Top). The default is Center everywhere, so shapes are centred and booleans of shapes line up without moving anything. Center, Bottom, Center stands a shape on the origin while it stays centred, so after Place On Face it sits flush on the face; Left, Bottom, Back puts its corner there. Round shapes anchor on the box of their radius. Polygon and Polyhedron have no Anchor: their points are where they are.
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
- Lines then run top to bottom. A variable exists from its Set line on; a line above it cannot use it. Setting a name again changes the existing variable, so a Set inside a Repeat can count up across rounds. A variable first set inside a Repeat, For Each or If, by Set or Add Item, stays after its End.
- The script runs from the top. Define Part, Function, When Input Changes and When Button Pressed blocks are skipped to their End where they stand, and registered before the run, so Use Part or a Call may come before or after them. Use Part works like a call: the part's lines run, then the script carries on after the Use Part line. The part sees the caller's variables, and Set inside it changes a variable that already exists outside, so a part can hand back results. A part may use itself (recursion) as long as an If stops it; parts nest at most 64 deep. Use Part's name may be a variable, such as "[Style]".
- The first mistake stops the script at that line; the error names the line and the field, such as "line 3: Size must be greater than 0".
- A script builds at most 2000 solids, and Repeat runs at most 10000 rounds.

## Field values

Every field is plain text, without quotes, read like this:

- A number: "2", "0.5", "-1".
- A list for positions, sizes and angles: numbers separated by commas, "1, 2, 3". One number fills every axis: "2" means 2, 2, 2.
- Polyhedron, Hull and Polygon are blocks: each Point line between them and their End adds one corner (x, y, z; a Polygon ignores z). Point lines may sit inside Repeat, For Each, If and moves such as Translate, so corners can come from loops and formulas. Their optional Points From List field adds the points of a list variable, such as "[Corners]" or the points Scatter Points writes; written out, points are vectors in brackets separated by commas: "[0, 0, 0], [1, 0, 0]" (a Polygon ignores z). Hull also wraps any brushes inside the same way.
- Lists: Set "Points()" adds an item at the end of the list Points (creating it), Set "Points(2)" changes item 2 (items count from 0, and the next free number appends), "[Points(2)]" reads it, "[Points.Count]" is the number of items and "[Points]" is the whole list. An item number past the end stops the script. For Each runs its lines once per item of a list.
- Switches: Yes or No (True or False also work).
- [Name] puts in the value of a variable: "[Width]", or "[Width], 1, 1" for one axis.
- [=formula] puts in the result of a formula; inside it, write variables as [Name] too: "[=[I] * 2]", "[=[Width] / 2], 0, [=Sin([Angle]) * 3]".
- Brackets nest, so a variable name can itself come from variables: "[Part[I]]" reads the variable whose name is part followed by the value of i.
- Text fields such as Echo's message mix plain text with them: "Width is [Width], area [=[Width] * [Depth]]".
- $ keeps the next character as typed: $[ and $] write brackets, $$ a dollar sign, $, a comma inside a list item.
- Only the commas typed in a field separate list items; a value is never split again, so For Each In [Text], 23 with Text set to Hello, World walks Hello, World and 23. [=Split([Text], ",")] splits text, and [=Parse([Text])] reads text like a typed field: 4,5,5 gives a vector and 5+5 gives 10.
- A script that builds nothing still runs and only warns; an error keeps the output and variables from before it.
- If's condition is a formula without the leading =: "[I] % 2 == 0", "[Width] > 2 && [Open]".
- Variables have no declared type: like a var in other languages, any line may give a variable any kind of value, and a later line may give it another kind. Clear Variable empties it the way that fits what it holds: a list or vector becomes an empty list, a number 0, a Yes/No No, anything else empty text, and a name no line set becomes an empty list; Delete Variable forgets it. Fields that take one of a few words (Anchor, Which, How, a generator's choices, texture and function names) take a Text or a Number, so a Brush or a list there stops the line. A line that gets a kind it cannot use stops in plain words, such as "Of needs a Brush, Face or Text, or a list of them, not a Yes/No", and a formula function such as Abs() given a Brush stops the same way. Every field says which kinds it takes and every variable field says what it gives (listed with the commands below), and the same declarations drive the editor's checks.
- Set's value is a number, true/false or plain text, or, when commas are typed outside brackets, a list of the items, each read the same way: [5, 3, 4], zu, 45, [4, 5, 6] is a list of a vector, a text, a number and a vector, and three plain numbers such as 2, 3, 4 are a vector. $, keeps a comma in a text, so Hello$, World is one text, and Hello, [Name] is a list of two items; a value read from a variable is never split again.
- The editor follows the script without running it to tell what kinds each name may hold at each line: through If and Else (joining both at End), loops (until nothing changes), Functions (per Call, with the kinds of its values, and what each Return gives back) and Parts. An If narrows: inside If [Henry] > 3 (and its Else) Henry is a number, inside If IsNum([V]) V is a Number, inside If [Mode] == "wide" Mode is that text, and a branch no run can take, such as If 1 == 2 or a comparison an Input's declared kind rules out, is skipped. Hover, the Variables tab and autocomplete show every kind a name may hold, such as Number or Text, each with the write that gives it there and its line (Brush: What is made of Cube (line 3).); a wavy underline only marks a value no way through the script can make usable.
- A block's Name names everything it builds: Linear Extrude, Rotate Extrude and Offset given a Name pass it to every piece, and without one each outline keeps its own. Point only adds a corner, so it has no Name or Into. A Repeat or For Each counter lives in its loop: a Function called inside the loop does not see it and reads the variable of that name set outside, if any.
- Name fields (variable, counter, part names) take a plain name, without brackets; Set's name may also be a list item such as Points([I]). Every other field reads [names] and [=formulas], a block's Name and a Note too (Name takes text or a number); only fields naming a variable a line writes, or defining a name or setting read before the run (Function name and inputs, Part name, Input, Input Group and Input Note settings, the input of a handler, Set Input or Show Inputs When), are used as typed. Names ignore case everywhere (variables, Local. and Persistent., system values such as Face.Center, and functions, so CharacterCode is character_code); write them in PascalCase, such as [StepHeight], Function Staircase and Sin(65).
- Common mistakes get a hint with what was probably meant, built from the text as written, in the error and in the editor before running: math outside a formula such as [K]*2, [[K]*2] or [K*2] (Did you mean to write [=[K]*2]?), =[K]*2 without brackets, and a system value without its $ such as [Box.Width].
- An unknown [Name] stops the script with "line N: ... there is no variable [Name]"; a formula that cannot be read stops it with the formula and the reason.

Formulas know: numbers, text in double quotes, true, false, lists in $[ $] brackets, the operators (loosest first) ? :, ||, &&, == !=, < <= > >=, + -, * / %, unary - + !, and the functions Sin, Cos, Tan, Asin, Acos, Atan, Atan2 (degrees), Abs, Sign, Ceil, Floor, Round, Sqrt, Exp, Ln, Log (base 10), Pow, Min, Max, Norm, Cross, Len, Concat, Str, IsUndef, IsNum, IsList, IsString, IsBool, Lookup (Lookup(key, table) blends between the two nearest key, value pairs of a table), Rands (Rands(min, max, count, seed) gives the same random numbers for the same seed), and PI, plus the functions the script defines with Function blocks. Lists add item by item and a number times a list scales it.

## Brushes

- Every solid line such as Cube becomes exactly one convex brush. Round ones have a Sides field (3 to 64, default 16) and Sphere a Rings field (2 to 32, default 8), set per line.
- Polyhedron wraps its points in one convex solid; dents are filled.
- Rotate Extrude spins flat outlines around Y (outline X is the radius, Y the height), one brush per side and convex piece. Minkowski grows the first shape by the hull of each later one (round edges with a small Sphere). Resize stretches to an exact size; Matrix applies a 3 by 4 matrix, including shear.
- Return leaves the part it is in; the script carries on after the Use Part line.
- Square, Circle and Polygon are flat outlines and only work inside Linear Extrude; a concave Polygon becomes several convex brushes.
- Difference becomes a CSG group: the first brush inside adds, every later one is cut from it. Intersection becomes a group that keeps only the overlap. Union is flattened into its parent. Hull becomes one convex brush around the brushes, Point lines and optional Points From List inside.
- Part names become brush and group names in the outliner, so wrap pieces in Define Part for readable names.
- Generator blocks (Cone, Capsule, Torus, Pipe, Pyramid, Prism, Hollow Box, Curved Stairs, Column, Stairs, Arch, Blast Hole) build the same pieces as the generator of that name: they fill a box of their Size, placed on the origin by their Anchor, and their other fields have the generator's names, ranges and choices. A choice is written as its value, such as "z" for Prism's Axis, and may come from a variable. Sphere and Cylinder are built the same way as the Sphere, Cylinder and Cone generators.

## Meshes

- Mesh blocks build regular editable meshes instead of brushes. Mesh holds Vertex lines (a position and an optional texture coordinate) and Face lines (vertex numbers from 0, counter-clockwise seen from outside). Mesh From Brushes turns the solids inside it into one mesh.
- Subdivide, Smooth Mesh, Displace, Extrude Faces, Box UVs and Flip Faces change the mesh made from the lines inside them; solids inside are turned into a mesh first. Displace and Extrude Faces work out their distance per point or face from a formula that may use [X], [Y], [Z], [Nx], [Ny], [Nz] and [Index].
- A script may mix brushes and meshes. A mesh cannot be cut: Difference and Intersection stop the script when a mesh is inside them.
- In a SolidScript generator, meshes show as a preview that is not saved, picked or collided with; Bake turns them into mesh objects. geometry_script_build creates them as mesh objects in the same undo step as the brushes.

## Brushes, faces, edges and corners

- Brushes, faces, edges and corners are values, like numbers and text. A face value stays the same face while later lines change the brush: a face split in pieces gives all its pieces, and a face that is cut away gives none.
- Members read their parts with a dot. A brush has .Name, .Faces, .Edges, .Vertices, .Center, .Min, .Max, .Size and .Extents (half the size); a face has .Center, .Normal, .Area, .Width, .Height, .Tag, .Tags, .Edges, .Vertices and .Parent (its brush); an edge has .Start, .End, .Middle, .Length, .Direction, .Faces and .Parent; a corner has .Position, .Normal and .Parent. A list has .Count, .First and .Last, and [List(0)] is its first item; a list of brushes, faces, edges or corners also has .Center, .Min, .Max, .Size and .Extents of all of it, and any other member reads every item, such as [Top.Edges] (the edges of every face in Top, each once). A vector has .x, .y, .z and .Length; text has .Length and .Words. Example: [$Selected.Faces.First.Normal.y].
- .Data keeps your own values on a brush, face, edge or corner: Set [Face.Data.Height] to 2, then read [Face.Data.Height]; a key that was never set reads as empty text. Set on a list writes every item, also a list a member gives: Set [Brush.Edges.Data.Kind] to trim marks every edge of the brush, Set [Brush.Faces(0).Edges.Data.Kind] only the edges of its first face, and [Brush.Edges.Data.Kind] reads one value per edge. The key may come from a variable: [Face.Data.[Key]]. The members themselves, such as .Edges or .Center, can only be read. A face split in pieces passes its Data on to them.
- System values start with $: [$Selected.Brushes] (the brushes the lines below work on; every brush built so far until a Set changes it), [$Selected.Faces], [$Selected.Edges] and [$Selected.Vertices], [$Input.Brushes] and the built-in values such as [$Box.Width]. Only the $Selected lists can be set, such as Set [$Selected.Faces] to [Top]. A For Each or Repeat round gets its own copy of them, so the picks made inside are gone after the round. $$, $[ and $] still write $, [ and ].
- Every block that builds brushes or meshes (solids, generators, Mesh, Hull, the extrudes, Mesh From Brushes, Curve To Mesh) has Name, a tag Of fields match, and Into, the variable that gets what it built (one brush, or a list when it builds several). What it builds is added to [$Selected.Brushes], also after a Set narrowed that list.
- Select Faces picks faces of the brushes in Of (empty: [$Selected.Brushes]; inside a round that built something, what the round built) into [$Selected.Faces], and into the variable in Into. Which is All, Facing Up, Facing Down, Facing Left, Facing Right, Facing Front, Facing Back (Within allows a slope in degrees), Facing (Detail gives a direction such as 0, 1, 0 for up), Tagged (Detail gives a name), Biggest or Smallest (Detail gives how many), Number (Detail gives face numbers) or Where (Detail gives a condition such as [=[Face.Area] > 1], with [Face] the face being tested). How is New, Add or Remove.
- Select Edges (Which All, Longest, Shortest or Where with [Edge]) and Select Vertices (All or Where with [Vertex]) pick from the brushes, faces or edges in Of (empty: [$Selected.Faces], or [$Selected.Brushes] when no faces are picked) into [$Selected.Edges] or [$Selected.Vertices] and Into, with How like Select Faces. Bevel Edges with an empty Of uses [$Selected.Edges] first.
- Every face has a tag: Top, Bottom or Side. Stairs add Step Tread and Riser, columns add Cap, Bevel Edges adds Bevel and Inset Face adds Inner and Ring.
- For Each [Item] In [List] runs its lines once per item, with the item in [Item] and, when Key is filled, its number from 0 in that variable. In a Data value it runs once per key, with the key in Key and its value in Item.
- Of, on every face line, takes a face, edge, brush or a list of them, or a brush name such as Knob or Input 1 (Name on a brush gives it one, in any case). Empty takes [$Selected.Faces] (or [$Selected.Brushes] for lines that work on brushes). Of converts what it gets: a brush gives its faces for a face line, a face gives its edges for Bevel Edges; a corner where a face is needed stops the script.
- Place On Face builds the brushes inside standing on the face in Of the way brushes stand on the ground: Y points out of the face, X runs across it and Z down it.
- Extrude Face adds a brush on each brush face in Of (Lift starts it further out, so it floats off the face) and moves a mesh face; Into gets the new brushes, Top their end faces and Sides their side faces. Inset Face turns a brush into a mesh and gives the inner faces in Inner and the ring around them in Ring. Bevel Edges rounds the edges in Of (the edges of a face or of a brush) and gives the new faces in Into; edges of faces it made itself are skipped, so beveling the edges of every face once equals beveling them all at once. Delete Faces turns a brush into a mesh without them. Scatter Points writes points to Into. Where chooses how: On Faces (the default) puts Count points on the faces in Of, more on bigger faces, the same for the same Seed, and the way their faces look in Normals; Inside fills the volume of a brush or mesh in Of; In Box fills a box of Size; Grid lays Counts points in that box. Empty Of uses [$Selected.Faces]. Place At Points stands the brushes inside it at each point in At, and optional Directions turns up along the matching vector, one per point.
- Example, a trim on every stair step: Stairs; Select Faces Tagged Step Tread; For Each [Step] In [$Selected.Faces]; Place On Face Of [Step]; Cube size [Step.Width], 0.05, 0.03; End; End For Each.

## Inputs, functions and events

- A script may be used as a generator (builds from nothing in a generator node) or as a modifier (kind solidScriptModifier, on a brush, mesh, group or modifier volume); its uses are stored in the script as uses: {generator, modifier}, and a step whose script does not allow its use reports why (the inspector's Script row shows that reason first, with the script's error in red directly below it). If Used As Modifier (or Generator), with an optional Else, picks lines by use; [$Script.Usage] is Generator or Modifier. As a modifier the script outputs only what it builds, like a generator, placed around the centre of the received brushes; [$Input.Brushes] lists them as brushes named Input 1, Input 2 and so on ([$Input.Brushes.Count] is how many; after an Input Brushes line, the brushes it built), and [$Input.Faces], [$Input.Min], [$Input.Max], [$Input.Size], [$Input.Extents] (half the size) and [$Input.Center] describe them. Until a line builds something, [$Selected.Brushes] is the received brushes, so Select Faces and the other face lines read them without outputting them. Input Brushes outputs the received brushes themselves, with their textures and materials, and they act like any brush: the blocks around it move them, Repeat copies them, Union, Difference and Intersection cut them (a cut brush keeps its face textures, laid out again), and Select Faces finds their faces (the Shear, Linear Array, Radial Array, Transform Array and Mirror examples under Built-In Modifiers work this way). Without an Input Brushes line the received brushes are gone. Example, slabs off every face (the Push Out Faces example): For Each [Brush] In [$Input.Brushes]; Select Faces All Of [Brush]; Extrude Face by 0.1 Lift 0.25; End For Each.
- Input lines give a script settings, like the fields of a built-in generator: Input Steps, Type count, Default 8, Minimum 1, Maximum 64 makes a read-only variable [Steps]. In a SolidScript generator the inspector shows one control per Input (number, count, switch, text, choice, button, curve, texture or vector; a vector shows X, Y and Z fields and gives one vector such as 1, 2, 3; a number or count with both Minimum and Maximum also gets a slider; a texture names a library texture for a Texture block, which paints every face of the brushes inside, or for texture_faces, which paints the faces select_faces picked) and geometry_script_generator_set takes their values as inputs, running the When Input Changes blocks like the inspector, and press runs a button's When Button Pressed blocks; Input Group shows the inputs inside under a heading, Input Row puts them side by side, Show Inputs When shows them only while another input has a value, and Input Note shows text among them; When Baked blocks run just before a bake (modifier_stack_bake or the Bake button), and the inputs they set are used for the baked brushes only; until a value is set, the Default is used. A value outside the limits stops the script.
- Stop Script ends the whole run there and keeps what was built. Mistakes are never caught: they stop the script at their line. ItemOr(list, index, fallback) reads an item with a fallback.
- A Function block groups lines you can run from other places. Its first line reads "Function Post with inputs X, H", and it ends with "End Function". Its lines only run when something calls it. Call Post with Values "[I], 3" runs it where the Call stands. Inside, read the inputs as [Local.X] and [Local.H]. A Return line gives a value back, such as Return [=[Local.X] + 1], and Call stores it in the variable named in Result In. A formula may also call a Function that builds nothing, such as [=Area(2, 3)]. A function may call itself, but an If must stop it. Functions and parts go at most 64 levels deep.
- Inside a Function, its inputs and every Set Local.Name are its own variables, written [Local.Name]; each call has fresh ones, so recursion and loops never mix them up. Plain names such as [Width] are the script's variables: Set Width changes the one the script has, and a new plain name made in a Function stays after it returns. Local. outside a Function stops the script.
- When Input Changes Steps and When Button Pressed reset blocks run when someone changes the input or presses a button Input in the inspector, before the output is rebuilt, and never during the normal run. They read every input, check it, change it with Set Input Steps to [=Min([Steps], 64)] and explain with Show Message; they may call Functions but may not build brushes. Set Input and Show Message only work inside them.
- The debugger shows the call stack while paused or stepping: each running Function and part, the line that called it, and its local variables. Breakpoints work inside Function and handler blocks.
- Names use letters, digits and _. A dot only works where SolidScript gives it a meaning: Local. and Persistent. in front, $ system values such as $Box.Width, and members behind a value, such as [Pos.x], [Heights.Count] or [Face.Center]. Any other dot, such as chicken.soup, stops the script before it runs.
- A vector is one value with an x, y and z, written as numbers with commas: 50, 20, 40, or in brackets as [50, 20, 40], the same as [=Vector(50, 20, 40)]. A bracket whose inner brackets work out to exactly three numbers is a vector, so [[X], 0, [=[Z] + 1]] is one too; anything else in brackets names a variable. A list of vectors is [1, 2, 3], [4, 5, 6], while 1, 2, 3, 4, 5, 6 is a list of six numbers. Set Pos to 1, 2, 3 keeps a whole position in one variable; Translate by [Pos] and Cube of size [Size] take it directly. [Pos.x], [Pos.y] and [Pos.z] read one part, and Set Pos.z to 5 changes one part. In formulas two vectors add, subtract, multiply and divide part by part: [=[Pos] + $[0, 1, 0$]], [=[$Box.Size] * Vector(1, 0.5, 1)]; a vector and a number scale every part: [=[Pos] * 2], [=[Pos] / 2]; length, normalize, dot, cross, distance and Lerp(a, b, amount) work on them, and Vector(x, y, z) makes one. Members such as [Face.Center] and [Edge.Direction] are vectors too.
- Built-in functions for formulas, by group: ${solidScriptReferenceFunctions()}
- Built-in values every script reads, never sets, as [$Time.Year] in fields or Time.Year in formulas: ${SOLID_SCRIPT_SYSTEM_GLOBALS.map((value) => `${value.name} (${value.detail})`).join('; ')}. Box values only exist in a generator; elsewhere they read as 1 with a warning. Time and run values differ on every computer and run, so brushes built from them differ between players in a room.
- Strings in formulas take \\n for a new line and \\t for a tab.
- Remove Item takes an item out of a list: "Points(1)" removes item 1 and moves the later items up, "Points()" removes the last one.
- List blocks change a whole list in plain words: Add Item 5 to Heights (makes the list when it is new), Insert Item 4 into Heights at 1, Remove Value red from colors (Every Copy takes out all of them), Find Item blue in colors, result in where (-1 when it is not there), Sort List Heights (numbers small to big, then words A to Z; Biggest First turns it around) and Reverse List Heights. [Heights.Count] is how many items there are.
- Clear Variable empties a variable but keeps its name: a list or vector keeps no items, a number becomes 0, a Yes/No No, anything else empty text. Delete Variable forgets it, so reading it stops the script until a line sets it again.
- [Persistent.Name] is a variable kept with the generator: it is saved with the level, shared in multiplayer and still there next run, stored like an input without a row in the inspector. When Button Pressed and When Input Changes blocks store what they set, such as Set Persistent.Presses to [=[Persistent.Presses] + 1]; the normal build may change it too, but only for that build, so every rebuild gives the same brush. A persistent value that was never set reads as nothing, so IsUndef([Persistent.Presses]) checks for it. Delete Variable Persistent.Presses forgets it.
- Offset grows (Distance above 0) or shrinks (below 0) the flat outlines inside it, with round or sharp corners; shrinking and sharp corners need convex outlines for now.
`;

/**
 * Lists the built-in functions by group for the reference.
 *
 * @returns Groups such as "Text: pad_left(text, width, fill) fills in front up
 *   to a width".
 */
function solidScriptReferenceFunctions(): string {
  const groups = new Map<string, string[]>();
  for (const [key, doc] of Object.entries(SOLID_SCRIPT_FUNCTION_DOCS))
    groups.set(doc.group, [...(groups.get(doc.group) ?? []), solidScriptReferenceFunction(key, doc)]);
  return [...groups].map(([group, entries]) => `${group}: ${entries.join(' ')}`).join(' ');
}

/**
 * Describes one built-in function with the kinds its definition declares.
 *
 * @param key Function key, such as abs.
 * @param doc Its definition.
 * @returns Text such as "Abs(number: Number) gives Number: The number without
 *   its minus sign."
 */
function solidScriptReferenceFunction(key: string, doc: SolidScriptFunctionDoc): string {
  const name = doc.usage.replace(/\(.*$/, '');
  const inputs = solidScriptFunctionArguments(key).map(
    (argument) => `${argument.name}: ${solidScriptFunctionKindsText(argument.type)}`,
  );
  return `${name}(${inputs.join(', ')}) gives ${solidScriptFunctionKindsText(doc.gives)}: ${doc.summary}`;
}

/** Tool part of the reference: which tool takes what. */
const SOLID_SCRIPT_REFERENCE_TOOLS = `## Tools

- geometry_script_build and geometry_script_preview take lines and add the result as plain brushes (or report what they would add).
- A SolidScript generator (modifier_generator_create kind solidScript) keeps a named script in the level and rebuilds its brushes whenever the script or its box changes. geometry_script_generator_set replaces its name, lines, placement and input values in one undo step; geometry_script_generator_get reads them back with how the editor lists each line, the script's Input lines with their values, Input Group (group) and whether Show Inputs When shows them (shown), the Input Note texts (notes), the solid count and the first error. Turn the result into plain brushes with modifier_stack_bake.
- geometry_script_command_list returns the same commands as JSON.
`;

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
  const listed = solidScriptDocumentListing(solidScriptDocumentCreate(SOLID_SCRIPT_EXAMPLE_COLUMNS)).join('\n');
  return `## Examples

A wall with a doorway:

${solidScriptReferenceJson(SOLID_SCRIPT_EXAMPLE_DOORWAY)}

A row of five columns from one named part, centred on the origin:

${solidScriptReferenceJson(SOLID_SCRIPT_EXAMPLE_COLUMNS)}

The editor lists these lines as:

\`\`\`text
${listed}
\`\`\``;
}

/** Mistakes assistants make most. */
const SOLID_SCRIPT_REFERENCE_MISTAKES = `## Common mistakes

- Height is Y, as in the editor: Cube size is [Width, height, depth], and [$Box.Size] is width, height and depth; [$Box.Extents] is half of it, from the centre to the sides.
- Brushes are centred on the origin (the generator's centre) by default; do not add a Translate to lift them into the box. Set anchor to words such as "Center, Bottom, Center" to stand a brush on the origin, or "Left, Bottom, Back" to put its corner there.
- Flat outlines (square, circle, polygon) only work inside linear_extrude, and solids never do.
- Difference keeps only its first brush and cuts the rest; to keep several brushes, put them in a Union as the first line inside.
- Every block (transforms, combinations, repeat, if, part) needs its own end line.
- A variable can only be used below its Set line.
- Values are strings, even numbers: "2", not 2. Never put quotes or [ ] around a list: "1, 2, 3", not "[1, 2, 3]".
- Variables need brackets everywhere: "[Width]", and "[=[Width] * 2]" inside a formula; Echo text needs no quotes.
- A concave solid cannot be one brush: build it from several convex parts or cut it with Difference.
- Rotate turns about X first, then Y, then Z; for one turn about the upright axis use "0, 90, 0".
- Keep Sides moderate (12 to 32): more sides cost more planes per brush but never more brushes.
`;

/**
 * Says what kinds a field takes and, for a field naming a variable, what the
 * variable gets, read from the command's declarations.
 *
 * @param command Command.
 * @param parameter Field.
 * @returns Text starting with a space, empty for a field taking any value.
 */
function solidScriptReferenceKinds(command: SolidScriptCommand, parameter: SolidScriptCommandParameter): string {
  const takes = parameter.accepts === 'Any' ? '' : ` Takes ${solidScriptKindsWords(parameter.accepts)}.`;
  const gives = parameter.writes?.gives;
  if (!gives) return takes;
  if (gives.rule === 'defines')
    return ' Defines a name or setting the editor reads before the script runs, so it is used as typed.';
  const kind = gives.rule === 'kind' ? `${gives.kind}: ` : '';
  const what = 'what' in gives ? gives.what : SOLID_SCRIPT_REFERENCE_GIVES[gives.rule];
  const plain = what
    .replace(/\*\*/g, '')
    .replace(/\{command\}/g, command.label)
    .replace(/\{(\w+)\}/g, 'its $1');
  return `${takes} The variable it names gives ${kind}${plain}.`;
}

/** What a variable field does to a variable that no kind describes. */
const SOLID_SCRIPT_REFERENCE_GIVES: Readonly<Record<'kept' | 'emptied' | 'shrunk' | 'forgotten' | 'read', string>> = {
  kept: 'the kinds it held, changed in place',
  emptied: 'the empty form of what it held: a list [], a number 0, a Yes/No No, anything else empty text',
  shrunk: 'the kinds it held with items taken out, which may leave an empty list',
  forgotten: 'nothing: the variable is forgotten',
  read: 'nothing new: the variable is only read',
};

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
      `  - ${parameter.key} (${parameter.label}, ${parameter.type}, default ${parameter.default}): ${parameter.hint}${solidScriptReferenceKinds(command, parameter)}`,
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
