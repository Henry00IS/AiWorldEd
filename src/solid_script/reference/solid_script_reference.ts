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
  'Field values are plain text without quotes: numbers, "x, y, z" lists, [Name] for a variable, [=formula] for a calculation. The origin is the center of the generator, and solids have their middle on it by default (Center, Center, Center ⭐). ' +
  "Commands build boxes, balls, cylinders and convex point sets, extrude flat paths, move/turn/stretch/mirror, join, cut, overlap and wrap solids, set variables and lists, repeat, branch, reuse named parts, call functions with values and results, offer input settings and buttons in the inspector and check them as they change. Generator blocks build the shapes of the editor's generators (Cone, Torus, Stairs, Arch and more) with their own fields, and mesh blocks build regular editable meshes. " +
  'Every solid such as Cube becomes one convex solid. Mode on a solid is Additive, Subtractive or Intersecting, and the script output is not wrapped in a group, so a Subtractive solid cuts the ones before it in scene CSG order. ' +
  'Y-up like the editor (X right, Z toward the front), metres, degrees. Read geometry_script_reference_get once before writing a script: it lists every command, its fields and defaults, what stops it, and common mistakes.';

/** Model part of the reference: coordinates, lines, values and running. */
const SOLID_SCRIPT_REFERENCE_MODEL = `# SolidScript reference

SolidScript is how AiWorldEd describes solid geometry as a script of block lines, the same lines the script editor shows. There is no code text: a script is a list of lines, and each line is one command with its field values.

## Coordinates and units

- Units are metres. Angles are degrees.
- Scripts use the editor's axes: X is right, Y is up and Z points toward the front (toward the viewer). A script point (x, y, z) is the editor point (x, y, z).
- Flat paths (Square, Circle, Polygon) are drawn with their own X and Y. Linear Extrude lays the drawing on the ground, its Y running to the back (a drawing point (x, y) lands at (x, 0, -y)), and pulls it up along Y. Rotate Extrude stands it up: the path's X is the radius and its Y the height, spun around the Y axis.
- The origin [0, 0, 0] is the center of the generator's box (for geometry_script_build, the build position). Solids have their middle on that origin by default (Center, Center, Center ⭐), so a solid with no Transform is centered in the box; set Anchor to Center, Bottom, Center ⭐ to make it stand on the origin.
- Cube, Sphere, Cylinder, Stairs and the other generator blocks have an Anchor: three words, one per axis, naming the spot of the solid that sits on the origin. X takes Left, Center or Right; Y takes Bottom, Center or Top; Z takes Back, Center or Front. Square and Circle take two words (X, then Left/Front/Back along the drawing), and Linear Extrude takes one (Bottom, Center or Top). The default is Center, Center, Center ⭐ for a solid, so its middle sits on the origin; Square and Circle stay Center, Center, and Linear Extrude defaults to Center. Center, Bottom, Center ⭐ makes a solid stand on the origin, and after Place On Face it sits flush on the face; Left, Bottom, Back puts its corner on the origin. Round shapes anchor on the box of their radius. Polygon and Polyhedron have no Anchor: their points are where they are.
- In a SolidScript generator, placement decides how script metres map to the generator's box: "origin" keeps metres unchanged around the box center, "fit" scales the whole result evenly to fit the box, "stretch" scales each axis to fill the box; both keep it centered.

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
- The script runs from the top. Function, When Input Changes and When Button Pressed blocks are skipped to their End where they stand, and registered before the run, so a Call may come before or after them. Define Part runs where it stands: it builds its lines into a variable of the same name, inside a CSG group, and places nothing. Parts and variables share one set of names, so after Define Part Wall the solids are [Wall]. Mode on a Part or Group defaults to Additive and can be Subtractive, Intersecting or Pass-Through. Group places that CSG group here. Output stamps a snapshot of a part or of solids right where its line sits, including the Part's group and Mode. The Part line must have run already. Later changes to the Part do not reach copies already stamped. Output's Of may be a variable, such as "[Style]".
- The first mistake stops the script at that line; the error names the line and the field, such as "line 3: Size must be greater than 0".
- A script may make at most 10,000 solids, a mesh may have at most 1,000,000 triangles, a list may hold at most 100,000 items, functions and parts may run 256 levels deep, Repeat and For Each run at most 10,000 rounds, and a run stops after 10,000,000 steps of work.

## Field values

Every field is plain text, without quotes, read like this:

- A number: "2", "0.5", "-1".
- A list for positions, sizes and angles: numbers separated by commas, "1, 2, 3". One number fills every axis: "2" means 2, 2, 2.
- Polyhedron, Hull and Polygon are blocks: each Point line between them and their End adds one corner (x, y, z; a Polygon ignores z). Point lines may sit inside Repeat, For Each, If and moves such as Transform, so corners can come from loops and formulas. Their optional Points From List field adds the points of a list variable, such as "[Corners]" or the points Scatter Points writes; written out, points are vectors in brackets separated by commas: "[0, 0, 0], [1, 0, 0]" (a Polygon ignores z). Hull also wraps any solids inside the same way.
- Lists: Set "Points()" adds an item at the end of the list Points (creating it), Set "Points(2)" changes item 2 (items count from 0, and the next free number appends), "[Points(2)]" reads it, "[Points.Count]" is the number of items and "[Points]" is the whole list. An item number past the end stops the script. For Each runs its lines once per item of a list.
- Switches: Yes or No (True or False also work).
- [Name] puts in the value of a variable: "[Width]", or "[Width], 1, 1" for one axis.
- [=formula] puts in the result of a formula; inside it, write variables as [Name] too: "[=[I] * 2]", "[=[Width] / 2], 0, [=Sin([Angle]) * 3]".
- Brackets nest, so a variable name can itself come from variables: "[Part[I]]" reads the variable whose name is part followed by the value of i.
- Text fields such as Echo's message mix plain text with them: "Width is [Width], area [=[Width] * [Depth]]".
- $ keeps the next character as typed: $[ and $] write brackets, $$ a dollar sign, $, a comma inside a list item.
- Fields drop the spaces at their start and end; $ and a space there keep one space each, so "$ $ Hello$ " is two spaces, Hello and one space, and "$ " alone is one space. Spaces in the middle need nothing, and $ and a space in the middle are just those two characters. In the formula editor a Text block shows its spaces as typed and writes them into the field this way.
- Only the commas typed in a field separate list items; a value is never split again, so For Each In [Text], 23 with Text set to Hello, World walks Hello, World and 23. [=Split([Text], ",")] splits text, and [=Parse([Text])] reads text like a typed field: 4,5,5 gives a vector and 5+5 gives 10.
- Moving corners may leave a solid not convex while the script runs, so later lines (by name, variable or Select Objects) can fix it; only the finished output is checked, once, and a warning such as "1 solid is not convex and will not be built" names how many are left out of the scene.
- A script that builds nothing still runs and only warns; an error keeps the output and variables from before it.
- If's condition is a formula without the leading =: "[I] % 2 == 0", "[Width] > 2 && [Open]".
- Variables have no declared type: like a var in other languages, any line may give a variable any kind of value, and a later line may give it another kind. Clear Variable empties it the way that fits what it holds: a list or vector becomes an empty list, a number 0, a Yes/No No, anything else empty text, and a name no line set becomes an empty list; Delete Variable forgets it. Fields that take one of a few words (Anchor, Which, How, a generator's choices, texture and function names) take a Text or a Number, so a Solid or a list there stops the line. A line that gets a kind it cannot use stops in plain words, such as "Of needs a Solid, Face or Text, or a list of them, not a Yes/No", and a formula function such as Abs() given a Solid stops the same way. Every field says which kinds it takes and every variable field says what it gives (listed with the commands below), and the same declarations drive the editor's checks.
- Set's value is a number, true/false or plain text, or, when commas are typed outside brackets, a list of the items, each read the same way: [5, 3, 4], zu, 45, [4, 5, 6] is a list of a vector, a text, a number and a vector, and three plain numbers such as 2, 3, 4 are a vector. $, keeps a comma in a text, so Hello$, World is one text, and Hello, [Name] is a list of two items; a value read from a variable is never split again.
- The editor follows the script without running it to tell what kinds each name may hold at each line: through If and Else (joining both at End), loops (until nothing changes), Functions (per Call, with the kinds of its values, and what each Return gives back) and Parts. An If narrows: inside If [Henry] > 3 (and its Else) Henry is a number, inside If IsNum([V]) V is a Number, inside If [Mode] == "wide" Mode is that text, and a branch no run can take, such as If 1 == 2 or a comparison an Input's declared kind rules out, is skipped. Hover, the Variables tab and autocomplete show every kind a name may hold, such as Number or Text, each with the write that gives it there and its line (Solid: What is made of Cube (line 3).); a wavy underline only marks a value no way through the script can make usable.
- A block's Name names everything it builds: Linear Extrude, Rotate Extrude and Offset given a Name pass it to every piece, and without one each path keeps its own. Point only adds a corner, so it has no Name or Into. A Repeat or For Each counter lives in its loop: a Function called inside the loop does not see it and reads the variable of that name set outside, if any.
- Name fields (variable, counter, part names) take a plain name, without brackets; Set's name may also be a list item such as Points([I]). Every other field reads [names] and [=formulas], a block's Name too (Name takes text or a number); only a Note, plain text where [I] stays [I] and needs no $, and fields naming a variable a line writes, or defining a name or setting read before the run (Function name and inputs, Part name, Input, Input Group and Input Note settings, the input of a handler, Set Input or Show Inputs When), are used as typed. Names ignore case everywhere (variables, Local. and Persistent., system values such as Face.Center, and functions, so CharacterCode is character_code); write them in PascalCase, such as [StepHeight], Function Staircase and Sin(65). A member through a list uses the plural, such as [Object.Vertices.Positions]; on one vertex it is [Vertex.Position].
- Common mistakes get a hint with what was probably meant, built from the text as written, in the error and in the editor before running: math outside a formula such as [K]*2, [[K]*2] or [K*2] (Did you mean to write [=[K]*2]?), =[K]*2 without brackets, a member of a variable the line sees read without its own brackets inside a formula such as [=Edge.Start + 1] (Did you mean to write [=[Edge.Start] + 1]?; a formula reads .X, .Y and .Z of a value itself, any other member only from a name in brackets), a variable of the script written with a $ such as [$Width] (Did you mean to write [Width]?, unless $Width is also a system value), and a system value without its $ such as [Box.Width], never offered for a name a line of the script writes.
- An unknown [Name] stops the script with "line N: ... there is no variable [Name]"; a formula that cannot be read stops it with the formula and the reason.

Formulas know: numbers, text in double quotes, true, false, every name in brackets such as [Width], [$Box.Width] or [Edge.Length] (a word without brackets is only ever a function, such as Sin(5), so [=Width] stops with a hint to write [=[Width]]), lists in brackets such as [0, [1, 1, 1], "Easy"], [], [0] or ["a"] (a bracket with a comma, one number, one text or nothing in it is a list; [Name] and [[Name]] stay names, so a list of one other value is written List([X])), the operators (loosest first) ? :, ||, &&, == !=, < <= > >=, + -, * / %, unary - + !, with % the remainder (such as [I] % 2 == 0 for an even number), and the functions Sin, Cos, Tan, Asin, Acos, Atan, Atan2 (degrees), Abs, Sign, Ceil, Floor, Round, Sqrt, Exp, Ln, Log (base 10), Pow, Min, Max, Norm, Cross, Len, Concat, Str, IsUndef, IsNum, IsList, IsString, IsBool, IsVector, IsSolid, IsMesh, IsFace, IsEdge, IsVertex, IsOutline, IsData, Lookup (Lookup(key, table) blends between the two nearest key, value pairs of a table), Rands (Rands(min, max, count, seed) gives the same random numbers for the same seed), List (List(a, b, ...) makes a list of any number of values, none for an empty one), plus the functions the script defines with Function blocks. Lists add item by item and a number times a list scales it.

## Solids

- Every solid line such as Cube becomes exactly one convex solid. Round ones have a Sides field (3 to 64, default 16) and Sphere a Rings field (2 to 32, default 8), set per line.
- Polyhedron wraps its points in one convex solid; dents are filled.
- Rotate Extrude spins flat paths around Y (path X is the radius, Y the height), one solid per side and convex piece. Minkowski grows the first shape by the hull of each later one (round edges with a small Sphere). Resize stretches existing objects or points to an exact size; Matrix applies a 3 by 4 matrix, including shear. Both are flat Of lines, as are Move By, Move To, Rotate By, Rotate To, Scale By, Scale To, Align To and Mirror.
- Transform changes only the space of the lines between it and its End. Move, Rotate and Scale on that line are applied in that order after On. On takes a face or an object: a face uses the same frame as Place On Face, a solid uses its center with world axes, and leaving On off keeps the parent space. What the lines build is stored in ordinary script space. Transform never groups solids for CSG. Move By, Move To, Rotate By, Rotate To, Scale By, Scale To, Align To, Mirror, Resize and Matrix are flat lines with Of: they change the objects or points in Of, or [$Selected.Objects] when Of is empty. Move By is a literal distance in metres; Move To places the combined center (the middle of the box around the selection) at a point in script space. Rotate By turns around the origin of the current space; Rotate To turns around that center. Scale By multiplies size from the origin of the current space; Scale To stretches about that center to an exact size. Without Into the change happens where the items already are; with Into the originals stay. A building block with Into keeps its result only in that variable until Output places it. An Into that names new faces, edges or points is only a label: the tool still edits in place and the result stays in the world.
- Return leaves the part it is in, so the variable holds only what was built before it.
- Square, Circle and Polygon are flat paths and only work inside Linear Extrude or Rotate Extrude; a concave Polygon becomes several convex solids. Their Into writes the path as an Path value, so Move By Of [Ring] moves exactly that path even when another one has the same Name.
- Mode on a solid generator is Additive, Subtractive or Intersecting, the editor's exact labels; meshes have no Mode. A Subtractive solid cuts the ones before it, and swapping two lines gives the other result, as in the scene. The script output is not wrapped in a group. Hull becomes one convex solid around the solids, Point lines and optional Points From List inside.
- Part names become solid and group names in the outliner, so wrap pieces in Define Part for readable names.
- Generator blocks (Cone, Capsule, Torus, Pipe, Pyramid, Prism, Rhombicuboctahedron, Hollow Box, Curved Stairs, Column, Stairs, Arch, Blast Hole) build the same pieces as the generator of that name: they fill a box of their Size, placed on the origin by their Anchor, and their other fields have the generator's names, ranges and choices. A choice is written as its value, such as "z" for Prism's Axis, and may come from a variable. Sphere and Cylinder are built the same way as the Sphere, Cylinder and Cone generators.

## Meshes

- Mesh blocks build regular editable meshes instead of solids. Mesh holds Vertex lines (a position and an optional texture coordinate) and Face lines (vertex numbers from 0, counter-clockwise seen from outside). Mesh From Solids turns the solids inside it into one mesh, baking their cut result the same way the editor cuts solids, including Subtractive and Intersecting modes and Group; only the solids inside the block are baked, not the rest of the world. Grid Mesh builds a mesh of quads in a plane: Size is width, height and depth, with one length at 0 so the grid is flat (2, 0, 2 on the ground, 2, 2, 0 for a wall facing the front); Columns and Rows are how many faces there are, and Anchor works like Cube.
- Array copies the objects in Of (empty: [$Selected.Objects]) so there are Count in all, the original first: Shape Line steps by Offset, Circle turns around Axis through Center over Angle degrees (360: no copy on the original), Along Path spreads them by length along a Path (Align turns them with it); Into holds only the copies.
- Shade Smooth shades the faces of Of (empty: [$Selected.Objects]; a 🔁 Where per [$Face]) smoothly up to Angle degrees (60), sharper edges stay hard; Angle 0 is flat again; solids only for now.
- Bevel Edges cuts edges of solids and meshes off (Distance per [$Edge], a 🔁 Where); on a mesh corners where bevelled edges meet get a face. Bevel Vertices cuts mesh corners off, Distance along each edge that meets them (per [$Vertex], a Where); a solid stops with the Mesh From Solids hint.
- Transform UVs Pivot Each Face turns and scales every face's UVs about that face's own middle; Center, the default, uses their combined middle.
- Join Meshes joins the meshes in Of (empty: [$Selected.Objects]; a 🔁 Where picks which) into the first, with its Name and texture, and takes the others out; corners stay separate until Merge By Distance.
- Subdivide, Smooth Mesh, Displace, Flip Faces and Merge By Distance change a mesh already built by Mesh or Mesh From Solids. A solid stops them: wrap it in Mesh From Solids first. They work on the meshes in Of, or [$Selected.Objects] when Of is empty. Displace moves the vertices Select Vertices picked, or every point when none are picked, and works out Distance per vertex from a formula that may use [$Vertex], [$X], [$Y], [$Z], [$NX], [$NY], [$NZ], [$Index] and [$Count], where [$X] is the short form of [$Vertex.Position.X] and [$NZ] of [$Vertex.Normal.Z]. Flip Faces flips the faces Select Faces picked, or every face when none are picked. Extrude Face is the one way to pull faces out: on a mesh it moves the faces Select Faces picked.
- Set Positions moves each corner in Of (vertices, or the corners of faces, edges, objects; empty: [$Selected.Vertices], else the corners of [$Selected.Faces]) To a vector worked out per corner, with [$Vertex], [$Index], [$Count], [$X], [$Y], [$Z] (its position) and [$NX], [$NY], [$NZ] (its normal); an optional Where picks which corners move. All corners move together from the shape before the line. A mesh takes any position; a solid is rebuilt around its corners while they stay convex. It equals Set [$Selected.Vertices.Positions] with Of and Where added.
- A script may mix objects. Meshes have no Mode and sit outside the solid pipeline.
- In a SolidScript generator, meshes show as a preview that is not saved, picked or collided with; Bake turns them into mesh objects. geometry_script_build creates them as mesh objects in the same undo step as the solids.

## Solids, faces, edges and corners

- Solids, faces, edges and corners are values, like numbers and text. A face value stays the same face while later lines change the solid: a face split in pieces gives all its pieces, and a face that is cut away gives none.
- Members read their parts with a dot. A solid has .Name, .Faces, .Edges, .Vertices, .Center, .Min, .Max, .Size, .Extents (half the size) and .Mode (Additive, Subtractive or Intersecting: the effective CSG mode in the output, including when Mode was left empty and inherited; Set [Object.Mode] changes it) and .Textures (the library textures its faces use, each once) and .Islands (a list of Face lists, one per group of faces joined by shared edges; a solid is one island, a mesh may have several); a face has .Texture (the library texture it gets: the last Texture Faces on it, else its Texture block; empty for the generator's texture), .Center, .Normal, .Area, .Width, .Height, .Tag, .Tags, .Id (see [$Id]), .Edges, .Vertices, .UVs (a list of U, V, 0 per corner), .Neighbors (the faces of the same object sharing an edge with it) and .Parent (its solid); an edge has .Start, .End, .Center, .Length, .Direction, .Angle (degrees between the normals of its two faces: 0 flat, 90 on a cube; 0 when one face uses it), .SignedAngle (the same, positive on an outer corner and negative on an inner one, so a cube's edges are 90 and the foot of a bump is -90), .IsConvex (Yes on an outer corner), .IsBoundary (Yes on a mesh edge only one face uses; always No on a solid), .Faces and .Parent; a corner has .Position, .Normal, .Faces, .Edges (those meeting at it) and .Parent. Select Edges Where [=[$Edge.Angle] > 30] picks the sharp edges for Bevel Edges, and Where [=[$Edge.SignedAngle] > 30] only the outer ones. A list has .Count, .First and .Last, and [List(0)] is its first item; a list of solids, faces, edges or corners also has .Center, .Min, .Max, .Size and .Extents of all of it, and any other member reads every item, such as [Top.Edges] (the edges of every face in Top, each once) or [Object.Vertices.Positions] (every corner position). A vector has .X, .Y, .Z and .Length; text has .Length and .Words. Example: [$Selected.Faces.First.Normal.Y].
- System values start with $: [$Selected.Objects] (the solids the lines below work on; empty until Select Objects or a Set), [$Selected.Faces], [$Selected.Edges] and [$Selected.Vertices], [$Input.Objects] and the built-in values such as [$Box.Width]. Only the $Selected lists can be set, such as Set [$Selected.Faces] to [Top]. [$Selected.*] carries from round to round of For Each or Repeat, and stays after End. Write a pick Into a variable when you want to keep it through later Select lines. $$, $[ and $] still write $, [ and ].
- Every block that builds objects (solids, generators, Mesh, Hull, the extrudes, Mesh From Solids, Sweep Along Path) has Name, a tag Of fields match, and Into, the variable that gets what it built (one solid, or a list when it builds several). What it builds is added to [$Selected.Objects], also after a Set narrowed that list.
- Per-item fields: a field that can change per item (Where conditions, Displace Distance, Set Positions To, Place At Points Directions, Lift, Align To Normal, Rotation and Scale, Place On Face Lift, Extrude Face Distance and Lift, Inset Face Distance, Scale Faces Factor, Texture Faces Texture, and the fields of Move, Rotate and Scale By and To, Align To, Mirror, Resize and Matrix) is worked out once per item when its formula reads a per-item value, and once for all items otherwise. It has [$Index] (place in the list from 0), [$Id] (a whole number that stays with a face, edge, vertex or point, worked out from where it is, so deleting or reordering other items keeps it; the [$Index] of other items), [$Count], the item ([$Face], [$Edge], [$Vertex], [$Object], [$Point] or [$Item]), [$X], [$Y] and [$Z] (position or center) and, for faces, vertices and points, [$NX], [$NY] and [$NZ] (normal). The transform tools then move each solid, path or point in Of on its own. Where helpers fill in the item: Random(min, max, id, seed) and RandomInt use ID [$Id] and Seed 0 when left off, so [=Random(0.5, 2)] differs per item and [=Random(0, 90, [$Index], 1)] gives an independent value; Chance(probability, id, seed) is Yes for about that share; Spread(from, to, index, count) steps evenly over the items with [$Index] and [$Count]; Along(point, direction, distance) moves a point along a direction.
- Select Faces picks faces of the solids in Of (empty: [$Selected.Objects]) into [$Selected.Faces], and into the variable in Into. Which is a preset that equals a written-out Where: All keeps every face, Facing Up equals Facing([$Face.Normal], Vector(0, 1, 0)), and Top equals HasTag([$Face.Tags], "Top"); also Facing Down, Facing Left, Facing Right, Facing Front, Facing Back and Bottom. Which Between keeps the faces between this Select Faces and the previous one. Where is a condition each remaining face must pass, such as [=Facing([$Face.Normal], Vector(0, 1, 0), 45)] or [=[$Face.Area] > 1], with [$Face] the face being tested, [$Index] its place in the list from 0 and [$Count] how many there are. Left off, Where keeps what Which picked. How is New, Add or Remove. Facing, InBox, Near, EveryNth, HasTag and Chance are Where helpers that work in Where, If and every other condition field. There is no Select In Box command; use InBox() in Where, such as [=InBox([$Face.Center], Vector(0, 0, 0), 2)]. To test whether a solid, face or edge meets a box, use HitsBox([$Object], Center, Size) or Hits([$Object], [Wall]), with How Touching (the default: any contact), Overlapping or Fully Inside.
- Select Edges (Which All or New, and a Where with [$Edge] and [$Index]) and Select Vertices (Which All or New, and a Where with [$Vertex] and [$Index]) pick from the solids, faces or edges in Of (empty: [$Selected.Faces], or [$Selected.Objects] when no faces are picked) into [$Selected.Edges] or [$Selected.Vertices] and Into, with How like Select Faces. Select Objects is the same, with [$Object]. Bevel Edges with an empty Of uses [$Selected.Edges] first.
- Every face has a tag: Top, Bottom or Side. Stairs add Step Tread and Riser, columns add Cap, Bevel Edges adds Bevel and Inset Face adds Inner and Ring.
- For Each [Item] In [List] runs its lines once per item, with the item in [Item] and, when Key is filled, its number from 0 in that variable. In a Data value it runs once per key, with the key in Key and its value in Item.
- Of, on every face line, takes a face, edge, solid or a list of them, or a solid name such as Knob or Input 1 (Name on a solid gives it one, in any case). Empty takes [$Selected.Faces] (or [$Selected.Objects] for lines that work on solids). Of converts what it gets: a solid gives its faces for a face line, a face gives its edges for Bevel Edges; a corner where a face is needed stops the script.
- Project UVs gives the faces Select Faces picked (or the Of field) texture coordinates from Mode Box, Planar, Cylinder or Sphere. Box uses Overhead, Front and Side views, from the way each face looks. Planar uses one plane (From Face, or the same Overhead, Front and Side views). Cylinder and Sphere take Axis and an optional Center. Space is Local or World for Box and Planar, such as Local on a swinging door. Size is metres of one texture repeat. Unwrap lays each face flat with its lowest U and V at 0. Pack Islands fits those islands into 0 to 1. Transform UVs offsets, scales and rotates them about Pivot Center, Tile or Origin, and can set Readable Text and Textures (Move With Shape or World Aligned) on any solid; Offset is tiles of U and V, and on solids from Input Objects it shifts the texture of that copy. Solids stay solids; meshes stay meshes. Cube, Select Faces, Project UVs Mode Box Size 1 is the usual start.
- Place On Face builds the solids inside standing on the face in Of the way solids stand on the ground: Y points out of the face, X runs across it and Z down it.
- Extrude Face adds a solid on each solid face in Of (Lift starts it further out, so it floats off the face) and moves a mesh face; Into gets the new solids, Top their end faces and Sides their side faces. Scale Faces scales each face in Of, or [$Selected.Faces] when Of is empty, about its center; a solid stays a solid, a mesh stays a mesh, and a solid folded so it is not convex is allowed until the script ends. Inset Face insets the faces Select Faces picked, or those in Of, and gives the inner faces in Inner and the ring around them in Ring; it works on a mesh, and a solid stops with a hint to wrap it in Mesh From Solids first. Bevel Edges rounds the edges in Of (the edges of a face or of a solid) and gives the new faces in Into; edges of faces it made itself are skipped, so beveling the edges of every face once equals beveling them all at once. Delete Faces removes the faces Select Faces picked, or those in Of; Delete Edges removes the faces along edges (empty Of: [$Selected.Edges], else the edges of [$Selected.Faces]) and Delete Vertices the faces around corners (empty Of: [$Selected.Vertices], else the corners of [$Selected.Faces]); they work on a mesh, and a solid stops with a hint to wrap it in Mesh From Solids first. A mesh left with no faces is taken out. Delete Objects takes whole solids and meshes (empty Of: [$Selected.Objects]) out of the result and the selection. Each Delete line has a 🔁 Where an item must pass to be taken out. Scatter Points writes points to Into. On chooses how: On Faces (the default) puts Count points on the faces in Of, more on bigger faces, the same for the same Seed, and the way their faces look in Normals, skipping faces back to back against another solid in Of; Inside fills the volume of an object in Of; In Box fills a box of Size; Grid lays Counts points in that box. Empty Of uses [$Selected.Faces]. Place At Points stands the solids inside it at each point in At, and optional Directions turns up along one direction for all points or the matching vector, one per point; Align To Normal stands each copy the way Place On Face would; Directions, Lift, Align To Normal, Rotation and Scale can change per point, with [$Point] (Position and Normal). Into is always a list of what it built, even for one item, and Place On Face writes the same kind of list. Place On Face equals Points From Faces plus Place At Points with Align To Normal. Both skip faces back to back against another solid in Of, as Scatter Points does. Points From Faces, Points From Edges and Points From Vertices write those points and their directions. Find On looks at the faces in Of, or [$Selected.Faces] when Of is empty: Closest (the default) writes the nearest point to From, and Along Ray follows Direction from From and writes the first hit; Into, Distance, Normal, Face and Hit name what it found. Clip cuts the objects in Of, or [$Selected.Objects] when Of is empty, with a plane through Through whose Normal points toward the part cut away; a solid stays a solid, a mesh stays a mesh, and a closed mesh gets a new face over the cut. Path writes a Path, a line of points that is open or closed, to Into (Path by default); Square, Circle and Polygon draw closed Paths, and inside Linear Extrude, Rotate Extrude or Offset a closed Path is filled: Shape Line (the default) walks from From to To, Arc turns around Center facing Normal from Start by Sweep degrees, Spiral also climbs Height and can change radius over Turns, and From Points uses the corners in Points, with Radius rounding them (Sides segments on each); Closed, on Arc and From Points, joins the last back to the first. Count is how many points Line, Arc and Spiral write. Unused fields stay hidden. Sweep Along Path sweeps a profile along any Path, closed or open, or a list of points. [P.Points] is a Path's points, [P.Closed] whether it is closed, and IsPath(value) checks for one; the Path functions and points fields take a Path too.
- Example, a trim on every stair step: Stairs; Select Faces All Where [=HasTag([$Face.Tags], "Step Tread")]; For Each [Step] In [$Selected.Faces]; Place On Face Of [Step]; Cube size [Step.Width], 0.05, 0.03; End; End For Each.

## Inputs, functions and events

- A script may be used as a generator (builds from nothing in a generator node) or as a modifier (kind solidScriptModifier, on an object, group or modifier volume); its uses are stored in the script as uses: {generator, modifier}, and a step whose script does not allow its use reports why (the inspector's Script row shows that reason first, with the script's error in red directly below it). If Used As Modifier (or Generator), with an optional Else, picks lines by use; [$Script.Usage] is Generator or Modifier. [$Box] is the generator or the modifier volume: [$Box.Width], [$Box.Height], [$Box.Depth], [$Box.Size], [$Box.Extents], [$Box.Min] and [$Box.Max] describe its box in the script's space, and [$Box.Position], [$Box.Rotation] and [$Box.Scale] are its pose in the level, in metres and degrees (Rotation is first around X, then Y, then Z, as Rotate To uses). [$Script.Mode] is Additive, Subtractive, Intersecting or Pass-Through: the generator node's or modifier host's mode in the scene. As a modifier the script outputs only what it builds, like a generator, placed around the center of the received solids; [$Input.Objects] lists them as solids named Input 1, Input 2 and so on ([$Input.Objects.Count] is how many; after an Input Objects line, the solids it built), and [$Input.Faces], [$Input.Min], [$Input.Max], [$Input.Size], [$Input.Extents] (half the size) and [$Input.Center] describe them. Until a line builds something, [$Selected.Objects] is the received solids, so Select Faces and the other face lines read them without outputting them. Input Objects outputs the received solids themselves, with their textures and materials, and they act like any solid: a Transform around that line, or a Move By, Move To, Rotate By, Rotate To, Scale By, Scale To, Mirror, Resize, Align To or Matrix of the copy, moves them, Repeat copies them, and Mode on a later solid can cut them (a cut solid keeps its face textures, laid out again), Select Faces finds their faces, and Clip of [$Input.Objects] above the line cuts the received units the same way. To keep textures where they are in the world, or shift the texture of a copy, or keep lettering readable on a mirrored copy, write the solids Into a list and use Transform UVs Textures, Offset and Readable Text Of that list (the Linear Array, Radial Array, Transform Array and Mirror examples under Built-In Modifiers work this way, including Mirror Bisect and Flip). Without an Input Objects line the received solids are gone. Example, slabs off every face (the Push Out Faces example): For Each [Object] In [$Input.Objects]; Select Faces All Of [Object]; Extrude Face By 0.1 Lift 0.25; End For Each.
- Input lines give a script settings, like the fields of a built-in generator: Input Steps, Type Count, Default 8, Minimum 1, Maximum 64 makes a read-only variable [Steps]. In a SolidScript generator the inspector shows one control per Input (Number, Count, Switch, Text, Choice, Button, Curve, Texture or Vector; a Vector shows X, Y and Z fields and gives one vector such as 1, 2, 3; a Number or Count with both Minimum and Maximum also gets a slider; a Texture names a library texture for a Texture block, which paints every face of the solids inside (per object with [$Object] and [$Index]), or for texture_faces, which paints the faces select_faces picked) and geometry_script_generator_set takes their values as inputs, running the When Input Changes blocks like the inspector, and press runs a button's When Button Pressed blocks; Input Group shows the inputs inside under a heading, Input Row puts them side by side, Show Inputs When shows them only while another input has a given value, or any one of several values written with commas, and Input Note shows text among them; When Baked blocks run just before a bake (modifier_stack_bake or the Bake button), and the inputs they set are used for the baked solids only; until a value is set, the Default is used. A value outside the limits stops the script.
- Stop Script ends the whole run there and keeps what was built. Mistakes are never caught: they stop the script at their line. ItemOr(list, index, fallback) reads an item with a fallback.
- A Function block groups lines you can run from other places. Its first line reads "Function Post with inputs X, H", and it ends with "End Function". Its lines only run when something calls it. Call Post with Values "[I], 3" runs it where the Call stands. Inside, read the inputs as [Local.X] and [Local.H]. A Return line gives a value back, such as Return [=[Local.X] + 1], and Call stores it in the variable named in Result In. A formula may also call a Function that builds nothing, such as [=Area(2, 3)]. A function may call itself, but an If must stop it. Functions and parts go at most 256 levels deep.
- Inside a Function, its inputs and every Set Local.Name are its own variables, written [Local.Name]; each call has fresh ones, so recursion and loops never mix them up. Plain names such as [Width] are the script's variables: Set Width changes the one the script has, and a new plain name made in a Function stays after it returns. Local. outside a Function stops the script.
- When Input Changes Steps and When Button Pressed reset blocks run when someone changes the input or presses a button Input in the inspector, before the output is rebuilt, and never during the normal run. They read every input, check it, change it with Set Input Steps to [=Min([Steps], 64)] and explain with Show Message; they may call Functions but may not build solids. Set Input and Show Message only work inside them.
- The debugger shows the call stack while paused or stepping: each running Function and part, the line that called it, and its local variables. Breakpoints work inside Function and handler blocks.
- Names use letters, digits and _. A dot only works where SolidScript gives it a meaning: Local. and Persistent. in front, $ system values such as $Box.Width, and members behind a value, such as [Pos.X], [Heights.Count] or [Face.Center]. Any other dot, such as chicken.soup, stops the script before it runs.
- A vector is one value with an X, Y and Z, written as numbers with commas: 50, 20, 40, or in brackets as [50, 20, 40], the same as [=Vector(50, 20, 40)]. A bracket whose inner brackets work out to exactly three numbers is a vector, so [[X], 0, [=[Z] + 1]] is one too; anything else in brackets names a variable. A list of vectors is [1, 2, 3], [4, 5, 6], while 1, 2, 3, 4, 5, 6 is a list of six numbers. Set Pos to 1, 2, 3 keeps a whole position in one variable; Transform Move [Pos] and Cube of size [Size] take it directly. [Pos.X], [Pos.Y] and [Pos.Z] read one part, and Set Pos.Z to 5 changes one part. In formulas two vectors add, subtract, multiply and divide part by part: [=[Pos] + [0, 1, 0]], [=[$Box.Size] * Vector(1, 0.5, 1)]; a vector and a number scale every part: [=[Pos] * 2], [=[Pos] / 2]; length, normalize, dot, cross, distance and Lerp(a, b, amount) work on them, and Vector(x, y, z) makes one. Members such as [Face.Center] and [Edge.Direction] are vectors too.
- Built-in functions for formulas, by group: ${solidScriptReferenceFunctions()}
- Built-in values every script reads, never sets, as [$Time.Year] in fields or $Time.Year in formulas: ${SOLID_SCRIPT_SYSTEM_GLOBALS.map((value) => `$${value.name} (${value.detail})`).join('; ')}. Box values only exist in a generator; elsewhere they read as 1 with a warning. Time and run values differ on every computer and run, so solids built from them differ between players in a room.
- Strings in formulas escape with $ like field text: $" is a double quote and $$ a dollar sign, so "Say $"Hi$"" is Say "Hi"; a backslash is just a backslash. Inside the quotes only the formula reads a $, so each escape is written once: "costs $$5" is costs $5, and $[ and $] are brackets that stay text. For a new line or a tab use [$Text.NewLine] and [$Text.Tab].
- Remove Item takes an item out of a list: "Points(1)" removes item 1 and moves the later items up, "Points()" removes the last one.
- List blocks change a whole list in plain words: Add Item 5 to Heights (makes the list when it is new), Insert Item 4 into Heights at 1, Remove Value red from colors (Every Copy takes out all of them), Find Item blue in colors, result in where (-1 when it is not there), Filter List [Heights] Where [=[$Item] > 2] Into [Tall], Sort List Heights (numbers small to big, then words A to Z; Biggest First turns it around) and Reverse List Heights. [Heights.Count] is how many items there are.
- Clear Variable empties a variable but keeps its name: a list or vector keeps no items, a number becomes 0, a Yes/No No, anything else empty text. Delete Variable forgets it, so reading it stops the script until a line sets it again.
- [Persistent.Name] is a variable kept with the generator: it is saved with the level, shared in multiplayer and still there next run, stored like an input without a row in the inspector. When Button Pressed and When Input Changes blocks store what they set, such as Set Persistent.Presses to [=[Persistent.Presses] + 1]; the normal build may change it too, but only for that build, so every rebuild gives the same solid. A persistent value that was never set reads as nothing, so IsUndef([Persistent.Presses]) checks for it. Delete Variable Persistent.Presses forgets it.
- Offset grows (Distance above 0) or shrinks (below 0) the flat paths inside it, with round or sharp corners; shrinking and sharp corners need convex paths for now.
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

- geometry_script_build and geometry_script_preview take lines and add the result as plain solids (or report what they would add).
- A SolidScript generator (modifier_generator_create kind solidScript) keeps a named script in the level and rebuilds its solids whenever the script or its box changes. geometry_script_generator_set replaces its name, lines, placement and input values in one undo step; geometry_script_generator_get reads them back with how the editor lists each line, the script's Input lines with their values, Input Group (group) and whether Show Inputs When shows them (shown), the Input Note texts (notes), the solid count and the first error. Turn the result into plain solids with modifier_stack_bake.
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

A row of five columns from one named part, centered on the origin:

${solidScriptReferenceJson(SOLID_SCRIPT_EXAMPLE_COLUMNS)}

The editor lists these lines as:

\`\`\`text
${listed}
\`\`\``;
}

/** Mistakes assistants make most. */
const SOLID_SCRIPT_REFERENCE_MISTAKES = `## Common mistakes

- Height is Y, as in the editor: Cube size is [Width, height, depth], and [$Box.Size] is width, height and depth of the generator or modifier volume box; [$Box.Extents] is half of it, from the center to the sides, and [$Box.Min] and [$Box.Max] are those corners in the script's space.
- Solids have their middle on the origin (the generator's center) by default; do not add a Transform to lift them into the box. Set anchor to "Center, Bottom, Center ⭐" to make a solid stand on the origin, or "Left, Bottom, Back" to put its corner there.
- Flat paths (square, circle, polygon) only work inside linear_extrude, and solids never do.
- A Subtractive solid cuts the Additive ones before it.
- Repeat counts from From up to but not including To, adding Step: Repeat [I] From 0 To 5 (Exclusive) runs with 0, 1, 2, 3 and 4, From 0 To 0 runs no round, and From 5 To 0 Step -1 runs 5 down to 1. To run N times write From 0 To [N].
- Every block (Transform, Repeat, If, Part, Mesh From Solids and the other openers) needs its own end line. Move By, Move To, Rotate By, Rotate To, Scale By, Scale To, Align To, Mirror, Resize and Matrix are flat lines with Of, and do not take an End.
- A variable can only be used below its Set line.
- Values are strings, even numbers: "2", not 2. Never put quotes or [ ] around a list: "1, 2, 3", not "[1, 2, 3]".
- Variables need brackets everywhere: "[Width]", and "[=[Width] * 2]" inside a formula; Echo text needs no quotes.
- A concave solid cannot be one solid: build it from several convex parts or cut it with a Subtractive solid.
- Rotate turns about X first, then Y, then Z; for one turn about the upright axis use "0, 90, 0".
- Keep Sides moderate (12 to 32): more sides cost more planes per solid but never more solids.
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
