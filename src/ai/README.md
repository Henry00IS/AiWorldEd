# AI World Editor — MCP

The Electrobun desktop build can host a **local Model Context Protocol (MCP)** endpoint so external AI clients (Grok Build, Claude Desktop, Cursor, etc.) can inspect and edit **convex solid-model brushes** in the live map.

The browser build (GitHub Pages) cannot host a server, so it uses the **online server** instead; the desktop app can use either (see [Online server](#online-server-browser-and-desktop)).

## Start the server

1. Run the **desktop** app (`bun run desktop:dev` or a packaged Electrobun build).
2. Click the **MCP** icon on the **main toolbar** (rightmost control).
3. Click **Start Server**.
4. Copy the **URL** (for example `http://127.0.0.1:18765/mcp`).

No token or password is required. The server only listens on this computer (`127.0.0.1`).

## Online server (browser and desktop)

The same MCP dialog works in the browser: **Start Server** asks the collaboration relay to forward MCP requests to this editor tab, **Stop** ends that. In the desktop app pick **Online Server (Relay)** in the dialog's **Server** menu (the default stays **Local Server**).

- The URL holds a private 64-character token, e.g. `https://aiworlded.00labs.net/ws/mcp/<token>` (`/wsdev/mcp/<token>` on the dev relay). It is created once, stored in this browser, and stays the same until you click **New Token**.
- Add that URL to your AI tool exactly like the local URL; no headers are needed. Anyone with the URL can edit the map while MCP is started, so keep it private.
- The editor must be connected to the relay (Collaborate → Connect). Only one tab can use a token at a time.
- Each reply has to fit in one relay message (about 1 MiB). Local Link (PNG) is only in the menu when the desktop app uses the local server; online, the dialog offers Online Link instead.

## Connect Grok Build

In `~/.grok/config.toml` (or via `grok mcp add`):

```toml
[mcp_servers.aiworlded]
url = "http://127.0.0.1:18765/mcp"
enabled = true
```

Use the exact URL from the dialog if the port is not `18765`.

CLI equivalent:

```bash
grok mcp add --transport http aiworlded http://127.0.0.1:18765/mcp
```

Keep the editor open with MCP started while Grok uses the tools.

## Coordinate system

- Three.js **right-handed**, **Y-up**
- Brush transforms are **model-local** unless a field is labeled world
- CSG operations: `additive` | `subtractive` | `intersecting`; CSG groups also take `passthrough` (a plain folder: its children combine in the parent as if they were not grouped)
- Brush **order** is evaluation order (first → last), depth-first over the hierarchy

## Solid hierarchy (outliner / CSG groups)

Solid models are trees, not flat brush lists:

```
solid_model
├── brush (additive | subtractive | intersecting)
├── csg_group (operation when the group combines into its parent)
│   ├── brush
│   └── csg_group
│       └── brush
└── brush
```

| Concept             | Details                                                                                                                                                                                                                                |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Solid CSG group** | Outliner folder under a solid. Combines its children as one compound, then applies the **group operation** into the parent.                                                                                                            |
| **Nesting**         | Groups may contain brushes and other groups. `parentGroupId` on brushes / groups is `null` when parented under the solid root.                                                                                                         |
| **Operations**      | Brushes: `brush_operation_set`. Groups: `csg_group_operation_set`. Additive groups look like normal yellow folders; subtractive/intersecting show red/blue badges in the UI; passthrough groups show an open folder with a gray badge. |
| **CSG order**       | Evaluation walks the scene depth-first. Sibling order under a parent matters (`brush_reorder` / `brush_reorder_relative` / `nodeIdBefore` on reparent).                                                                                |

### Hierarchy tools

| Tool                       | Purpose                                                                                                                                           |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scene_hierarchy_get`      | Full outliner tree (`solid_model` → `csg_group` → `brush`) with operations                                                                        |
| `solid_model_get`          | Flat brush list (evaluation order) **plus** nested `hierarchy`                                                                                    |
| `csg_group_get`            | One group: children, `parentGroupId`, operation                                                                                                   |
| `csg_group_create`         | Group `brushIds` / `groupIds` into a new compound (`parentGroupId`, `operation`, `name`). `parentGroupId` must not be a member or under a member. |
| `csg_group_operation_set`  | Branch op on groups                                                                                                                               |
| `csg_group_ungroup`        | Dissolve groups; children rise to the former parent                                                                                               |
| `scene_hierarchy_reparent` | Move nodes under model root or another group (`parentId`, optional `nodeIdBefore`)                                                                |
| `csg_group_rename`         | Outliner display name (undoable)                                                                                                                  |
| `brush_box_add`            | Optional `parentGroupId` to spawn under a group                                                                                                   |
| `brush_duplicate`          | `brushIds` and/or `groupIds` (group clone keeps nesting). `createdIds` = brush ids; group uuids in `data.groupIds`.                               |
| `brush_reorder`            | `brushIds` and/or `groupIds` → first/last among siblings                                                                                          |

**Brush-only tools (no `groupIds`):** `brush_delete`, `selection_set`, `brush_mirror`, `brush_find`. Find groups via `scene_hierarchy_get` / `csg_group_get`.

**Workflow example:** build wall pieces → `csg_group_create` with those `brushIds` and `operation: "subtractive"` → nest a cutter under that group with `brush_box_add` + `parentGroupId` (or `scene_hierarchy_reparent`) → `brush_duplicate` with `groupIds` to copy the whole compound.

Same-solid only: reparent/group never moves a brush out of its solid model root.

## CSG: solid vs brush AABB (critical)

| Tool                                                                   | What it measures                                                        |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `space_point_query` / `space_overlaps_query` / `space_neighbors_query` | **Brush volume AABBs** — includes subtractive cutters as hits           |
| `space_solid_point_explain`                                            | **Final solid or void** after ordered CSG (use this for doors/cavities) |
| `space_void_connectivity_query`                                        | Approximate path between two voids (coarse grid; not navmesh)           |

**Default workflow (leave `invertedWorld` false):** space starts empty → additive brushes create solid → subtractive brushes carve holes **only where they overlap prior solid**. A floating subtractive that does not overlap an additive does nothing.

**Do not enable `solid_model_inverted_world_set` for normal room shells / door cuts.** Inverted mode starts the universe solid so subtractives dig space (advanced).

**Doors:** use `build_opening_add` / `build_opening_cut` (subtractive boxes through walls), not `brush_clip`. Clip/split change **one brush’s topology** along a world plane (ramps, bevels, permanent cuts).

## Walls, rooms, openings (math)

| Piece                  | Placement rule                                                                                                                                                                                                                                                                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `build_wall_place`     | Centerline `from`→`to` on XZ. Box size `{thickness, height, length}`. Yaw = `atan2(dx, dz)` so local **+Z** follows the segment. Bottom = `baseY` (default 0).                                                                                                                                                                        |
| `build_room_shell_add` | Exterior AABB `size`; `position` is center (default floor on y=0). Front wall at **+Z**, back **−Z**, left **−X**, right **+X**. Side walls are shortened so corners do not double-stack.                                                                                                                                             |
| `build_opening_cut`    | Subtractive box; **position is the hole center**, `size` is full extents. No auto wall align.                                                                                                                                                                                                                                         |
| `build_opening_add`    | Prefer **`targetBrushId`** = wall brush. Snaps cut to wall **midplane**, uses wall thickness as flush depth (exact, no overcut), reorders cut **after** that wall. `sillHeight` = bottom of hole → center Y = sill + height/2. Doors skip bottom frame strip. **Axis-aligned walls only** (not diagonal `build_wall_place` segments). |

**Door example:** build room → `brush_find` nameContains `wall_front` → `build_opening_add` with `kind: "door"`, `targetBrushId`, `sillHeight` = floor top, `size: { width, height }`, `position` along the wall (x/z of doorway center; y ignored when sillHeight set), `snap: false`.

## Geometry language: SolidScript (`geometry_script_build`)

Describing brushes beats computing clip planes. A SolidScript is a list of block lines, the same lines the script editor shows: each line is `{ "command": id, "values": { key: text } }`, and there is no code text. `geometry_script_build` takes such `lines` and adds the result as CSG brushes and groups, plus regular mesh objects for mesh blocks, in one undo step; `geometry_script_preview` runs the same lines and returns the tree without changing the scene. `geometry_script_reference_get` returns the full reference for assistants: coordinates and units, how lines nest, values and formulas, every command with its fields, defaults and what stops it, examples and common mistakes. Builds sync in multiplayer like any user edit.

License: the block machine and the formula parser are an independent implementation. No third-party source code, grammar files, tests or examples are used, and no dependency was added; the code is MIT like the rest of the editor.

How it runs:

- Every run starts a fresh machine, so nothing carries over from an earlier run or another generator.
- The block structure is checked first; a missing `end`, a stray `end` or `else`, or an unknown command builds nothing.
- Lines then run top to bottom, each with its own step. A variable exists from its `variable` (Set) line on. Variables have no declared type, like `var`: any line may give a variable any kind, and `clear_variable` empties it to fit what it holds (a list or vector `[]`, a number 0, a Yes/No No, anything else empty text; an unset name becomes `[]`). Fields that take one of a few words (anchors, choices, `which`, `how`, texture and function names) take a Text or a Number. A `repeat` counter runs from `from` up to but not including `to`: from 0 to 10 is 0 to 9, and from 0 to 0 runs no round. A loop counter is not seen by a Function called inside the loop. Commas typed outside brackets make a list, each item read on its own: `[5,3,4],zu,45,[4,5,6]` is a vector, a text, a number and a vector, `2,3,4` stays a vector, `Hello$, World` is one text, and a value read from a variable is never split again. Every command field declares the kinds it takes (`accepts`) and every variable field what it gives (`writes.gives`) in the same parameter list that builds its configurator; built-in formula functions declare their argument and result kinds in their docs. Runtime kind errors read those declarations (`Of needs a Brush, Face or Text, or a list of them, not a Yes/No`), and the editor's flow analysis (If/Else joins, loops to a fixed point, Functions per call, narrowing by If conditions such as `[X] > 3` or `IsNum([X])`, skipped impossible branches) shows the union of kinds in hover, Variables and autocomplete, each with the write that reaches there and its line (`Brush: What is made of **Cube** (line 3).`), and squiggles only what is certain. The reference lists each field's kinds. Errors say `line N: ...`, with N the position in `lines`, counting from 1. A run may make at most 10,000 brushes, a mesh may have at most 1,000,000 triangles, a list may hold at most 100,000 items, functions and parts may run 256 levels deep, Repeat and For Each run at most 10,000 rounds, and a run stops after 10,000,000 steps of work.

Field values are plain text without quotes: a number `"2"`, a list `"1, 2, 3"`, a vector in brackets `"[1, 2, 3]"` (any bracket that works out to exactly three numbers, such as `"[[X], 0, 2]"`), a list of vectors `"[1, 2, 3], [4, 5, 6]"`, points `"[0, 0, 0], [2, 0, 0], [1, 2, 0]"` (flat paths ignore z), `"Yes"`/`"No"`, `[Name]` for a variable (`"[Width], 1, 1"`), `[=formula]` for a calculation (`"[=[I] * 2], 0, 0"`), and text mixing them (`"Width is [Width]"`). Brackets nest, `$[`, `$]` and `$$` write literal characters and `$,` a comma inside a list item; only typed commas separate items and a value is never split again (`"[Text], 23"` with Text `Hello, World` is two items; `[=Split([Text], ",")]` splits it and `[=Parse([Text])]` reads it like a typed field, so `4,5,5` gives a vector and `5+5` gives 10), a script that builds nothing only gets a warning, and If's condition is a formula without the `=` (`"[I] % 2 == 0"`). An unknown variable or unreadable formula stops the script at its line.

How it maps:

- Every solid line such as `cube` becomes one convex brush. Spheres, cylinders and circles are faceted; each has its own `sides` field (and `rings` for spheres).
- Mode on a solid is Additive, Subtractive or Intersecting, and the script output is not wrapped in a group, so a Subtractive solid cuts the ones before it in scene CSG order. Meshes have no Mode. `hull` becomes one convex solid around the solids, Point lines and optional Points From List inside. `clip` cuts solids and meshes with a plane: a solid is re-hulled and stays a solid, a mesh stays a mesh.
- Part names (`part` / `output`) become brush and group names, so wrap pieces in parts for a readable outliner.
- As a modifier (kind `solidScriptModifier`), a script outputs only what it builds, like a generator: an `input_objects` line outputs the received brushes, which then act like any brush (a `transform` around that line, or a `move_by`, `move_to`, `rotate_by`, `rotate_to`, `scale_by`, `scale_to`, `mirror`, `resize`, `align` or `matrix` of the copy, moves them; Repeat copies them; a Subtractive or Intersecting Mode cuts them, faces keep their textures). `transform_uvs` Textures keeps those textures on their faces (Move With Shape) or where they are in the world (World Aligned); Offset (tiles) shifts the texture of such a copy, and Readable Text keeps lettering readable on a mirrored copy; it works on any brush. Clip of `[$Input.Objects]` above that line cuts the received units the same way. The script reads them without outputting them: `[$Input.Objects]` lists them as `Input 1`, `Input 2`…, and the `of` field of every face block takes a brush name, one of those, a brush, face or edge value or a list of them. The Examples window rebuilds Shear, Linear Array, Radial Array, Transform Array and Mirror this way, including Mirror Bisect and Flip, and those Inputs match the built-in inspectors.
- Objects (solids and meshes), faces, edges and corners are values. Members read their parts: `[Object.Name]`, `[Object.Faces]`, `[Face.Normal]`, `[Face.Edges]`, `[Edge.Length]`, `[Vertex.Position]`, `[List.Count]`, `[List.First]`, and bounds such as `[Faces.Center]` of a whole list; `[Face.Data.Key]` keeps user values; Set through a list writes every item, such as Set `Object.Edges.Data.Kind` to `trim` for every edge of a brush, while members such as `.Edges` or `.Center` stay read-only. System values start with `$`: `[$Selected.Objects]`, `[$Selected.Faces]`, `[$Input.Objects]`, `[$Box.Width]`. Select Faces Where tests each face as `[$Face]` with `[$Index]` its number from 0; Select Edges uses `[$Edge]` and Select Vertices uses `[$Vertex]`. Which Between on Select Objects, Select Faces, Select Edges or Select Vertices keeps what was built between this Select and the previous one of the same kind; How New, Add or Remove is a separate field. `[$X]` and `[$NZ]` are short forms of `[$Vertex.Position.X]` and `[$Vertex.Normal.Z]` (or `[$Face.Normal.Z]`) when that element is filled in. Fields worked out once per element (Select Faces Where, Displace Distance) are declared with `each` and shown with a 🔁 icon. `.Data` holds only user values; built-in facts are members. `point` builds nothing and has no `label` or `into`; a `label` on `linear_extrude`, `rotate_extrude` or `offset` names every piece they build. Every building block (solids, generators, `mesh`, `hull`, extrudes) takes `label` (its Name, text or a number; it reads `[names]` and `[=formulas]` like any field, so `"[Width]"` with Width 15 names it `15` and a Brush there stops with `Name needs a Text or Number, not a Brush`) and `into` (the variable that gets the brush). Every field reads names and formulas except those naming a variable a line writes and those defining a name or setting read before the run (function and part names, function inputs, input settings, the input of a handler, `set_input` or `show_inputs_when`). `for_each` (`variable`, `list`, optional `key`) walks any list, and `select_faces`, `select_edges`, `select_vertices`, `extrude_face` (`into`, `top`, `sides`), `inset_face` (`inner`, `ring`), `bevel_edges` (`into`), `scale_faces` and `scatter_points` (`into`, `normals`; Where is On Faces, Inside, In Box or Grid) write their results to variables. `scale_faces` scales each picked face about its center; a brush stays a brush, a mesh stays a mesh. `place_on_face` and `place_at_points` stand the brushes inside them on a face or at a list of points. `extrude_face` with `lift` floats the new brush off the face. `find_on` looks for the closest point on faces or a ray hit. Formula functions include `Noise(x, y, z, scale, seed)` (a smooth field from 0 to 1), `PathAt`, `PathDirection`, `TrimPath`, `Shuffle` and `Nearest`. `show_inputs_when` shows the inputs inside only while another input has a given value, or any one of several values written with commas. `[$Box.Extents]` and `[$Input.Extents]` are half of `[$Box.Size]` and `[$Input.Size]`.- SolidScript uses the editor's axes: X right, Y up, Z toward the front. Units are metres; Rotate turns about X, then Y, then Z.
- Per-item fields (Where, Displace Distance, Extrude/Inset Distance, Scale Faces Factor, Texture Faces Texture, Place At Points Directions/Lift/Align/Rotation/Scale, Place On Face Lift, and Move/Rotate/Scale By/To) work out once per item when the formula reads a per-item value, otherwise once for all. Every item has `[$Index]` (list position from 0), `[$Count]`, the item (`[$Face]`, `[$Vertex]`, `[$Point]` etc.), `[$X]/[$Y]/[$Z]` (position or center) and, for faces/vertices/points, `[$NX]/[$NY]/[$NZ]` (normal). `[$Point]` has Position and Normal, not just a vector.
- The Where helpers in the formula editor have sensible per-item defaults: `Random(min, max, id, seed)` defaults ID to `[$Index]`, Seed to 0; give a different Seed for an independent stream. `Chance(0.3)` is Yes for about 3 in 10 items, `Spread(0, 90)` steps evenly from 0 to 90 over the items (Index `[$Index]`, Count `[$Count]`), and `Along(point, direction, distance)` walks a distance along a direction. Example: Extrude Face Distance `[=Random(0.2, 1)]`, or Place At Points Lift `[=[$Index] * 0.1]`. Scatter Points calls its placement-mode field `on`, not `where`. Set Positions has a per-corner `offset` added after `to` (`offset: 0, 0.5, 0` lifts without writing `[$Vertex.Position] + …`), and every corner reads the shape before the line. Place At Points has a per-point `where` (`[=[$X] > 0]`) that builds only at points passing it; skipped points keep their `[$Index]`.
- The origin is the center of the generator's box (or the build `position`), and brushes have their middle on that origin by default (`anchor: "Center, Center, Center"`). `anchor: "Center, Bottom, Center"` makes a brush stand on the origin, and `anchor: "Left, Bottom, Back"` puts its corner there, so a brush needs no Transform to sit on the origin.
- `operation: "subtractive"` with a `modelId` carves the result out of existing brushes.
- `transform` changes only the space of the lines between it and its `end` (Move, Rotate and Scale on that line, after On). `move_by`, `move_to`, `rotate_by`, `rotate_to`, `scale_by`, `scale_to`, `align`, `mirror`, `resize` and `matrix` are flat Of tools: they change the solids, meshes or points in `of`, or `[$Selected.Objects]` when Of is left off, and do not take an `end`.
- `grid_mesh` builds a flat grid of faces, for a floor or a terrain to `displace`. `path` writes a Path, open or closed, along a line, arc, spiral or points; `square`, `circle` and `polygon` draw closed ones, the extrudes and `offset` fill closed ones, and `sweep_along_path` sweeps a profile along any of them. Mesh blocks (`mesh` with `vertex` and `face` lines, and `mesh_from_solids`) are the way a shape becomes a mesh. `mesh_from_solids` bakes the solids inside it into one mesh, including Subtractive and Intersecting cuts, the same way the editor cuts brushes. The mesh tools `subdivide`, `mesh_smooth`, `displace`, `flip_faces`, `triangulate`, `split_edges` and `merge_by_distance` then change that mesh; they stop on a brush and say to wrap it in `mesh_from_solids` first. Pick with `select_faces`, `select_edges` or `select_vertices`, then operate: `extrude_face` pulls the picked faces (a new slab brush, or a moved mesh face), `displace` moves the picked vertices or every point when none are picked. Project UVs, Unwrap, Pack Islands and Transform UVs are face blocks too: they give the faces Select Faces picked texture coordinates (Box, Planar, Cylinder or Sphere; or an unwrap, pack or UV transform, including Readable Text and Textures Move With Shape or World Aligned) and keep brushes as brushes, meshes as meshes. `[Face.UVs]` is the list of U, V, 0 per corner. A script can mix brushes and meshes; a mesh has no Mode and is not cut by Subtractive or Intersecting brushes. In a SolidScript generator the meshes show as a preview until Bake turns them into mesh objects.

Room with a doorway:

```solid-script
[
  { "command": "cube", "values": { "size": "4, 3, 0.2", "anchor": "Center, Center, Center" } },
  { "command": "transform", "values": { "move": "0, -0.45, 0" } },
  { "command": "cube", "values": { "size": "1, 2.1, 0.4", "anchor": "Center, Center, Center", "mode": "Subtractive" } },
  { "command": "end" }
]
```

Stairs:

```solid-script
[
  { "command": "repeat", "values": { "variable": "I", "from": "0", "to": "10" } },
  { "command": "transform", "values": { "move": "0, [=[I] * 0.3], [=([I] + 1) * 0.09]" } },
  { "command": "cube", "values": { "size": "1.2, 0.3, [=([I] + 1) * 0.18]" } },
  { "command": "end" },
  { "command": "end" }
]
```

Rounded rock as a mesh:

```solid-script
[
  { "command": "mesh_from_solids" },
  { "command": "cube", "values": { "size": "2, 1.5, 1" } },
  { "command": "end" },
  { "command": "select_objects" },
  { "command": "subdivide", "values": { "levels": "2" } },
  { "command": "mesh_smooth", "values": { "rounds": "4" } }
]
```

Irregular rock from a point list:

```solid-script
[
  { "command": "scatter_points", "values": { "on": "In Box", "count": "16", "seed": "4", "size": "2, 1.2, 2", "into": "Spots" } },
  { "command": "hull", "values": { "points": "[Spots]" } },
  { "command": "end" }
]
```

Hilly floor:

```solid-script
[
  { "command": "grid_mesh", "values": { "size": "8, 0, 8", "columns": "8", "rows": "8" } },
  { "command": "select_objects" },
  { "command": "displace", "values": { "distance": "[=0.4 * (Noise(Vector([$X], 0, [$Z]), 3, 2) * 2 - 1)]" } }
]
```

## SolidScript generator

A SolidScript generator keeps a named SolidScript inside the level and rebuilds its brushes whenever the script or its box changes, like the other generators. The Examples window holds showcase scripts, small lessons (an irregular rock from Hull, a tapered box, a rounded rail, a hilly floor) and the built-in generators and modifiers rebuilt line by line. Create one with `modifier_generator_create` and kind `solidScript`. `geometry_script_generator_set` replaces its `name`, `lines` and `placement`, sets `inputs` (running the script's When Input Changes blocks, whose messages come back as `notices`) and can `press` a button input. `geometry_script_generator_get` reads them back with how the editor lists each line, the solid count and the first error. `geometry_script_command_list` lists the commands with their fields, defaults, hints, manual and what stops each.

In the editor, the generator's first inspector row is its script: it shows the script name and size, Edit Script opens the script editor, Load… picks a script from `AiWorldEd/Scripts`, and an `.aiscript` file dragged from the project browser or the desktop onto the row replaces the script (one undo step). The script is stored in the generator, so it syncs in multiplayer and keeps working without the file. Scripts are saved as `.aiscript` files in `AiWorldEd/Scripts`. Each file is a zip that holds `script.json` (`format: "aiworlded.solidscript"`, `version`, `name`, `blocks`, `resources`), and `resources/` is reserved for embedded files. The generic Convert to Brush button and `modifier_stack_bake` turn the generated brushes and groups into plain ones.

## Generators, modifiers and curves

- `modifier_kind_list` with `kindId` lists every property of a kind. Each entry gives key, label, type, range, choices, default and the inspector tooltip, plus the kind's presets. The list is read from the same field descriptors the inspector draws, so new inspector fields show up in MCP by themselves.
- `modifier_generator_create` adds a generator inside a solid model: Cylinder, Cone, Sphere, Capsule, Torus, Pipe, Pyramid, Prism, Rhombicuboctahedron, Icosphere, Hollow Box, Column, Stairs, Curved Stairs, Arch, Blast Hole, Solid Script, Path. `modifier_stack_bake` on the node is Convert to Brush. `modifier_volume_create` adds a scene-level modifier volume from an Add menu template.
- `modifier_parameters_set` validates like the inspector does. Unknown keys are refused with the valid list. Numbers are clamped to their range with a warning. Objects are referenced by id, and curves are given as curve data. Bevel options use `options.<name>` keys.
- Curve properties, such as a column `profile`, are edited with the `curve_*` tools. Coordinates run 0..1: x along the curve and y the value, y up. Segment i joins points i and i+1. `curve_get` reports handles as absolute positions, and `curve_point_set` takes them the same way.

### Curve paths: SVG path subset (`curve_path_set`)

`curve_path_set` draws a curve line with [SVG path data](https://www.w3.org/TR/SVG2/paths.html#PathData), the standard 2D path syntax. Supported commands:

- `M x y`, given once at the start.
- `L`, `H` and `V` for straight segments.
- `Q` and `T` for quadratic segments, `C` and `S` for cubic Bezier segments.
- Lower case means relative coordinates. `Z` is ignored.

x must increase along the path. Arcs (`A`) are refused.

```svg-path
M 0 0.8 L 0.1 0.8 C 0.2 0.8 0.2 0.5 0.3 0.5 L 0.9 0.5 Q 1 0.5 1 0.7
```

That path is a column profile with a wide base that flares out again at the top.

## Textures and UVs

`texture_list` lists the texture ids. `texture_face_list` lists a brush's faces with surface index, world normal and center, whether the face is visible in the built result, its texture and its UV fields as the UV editor shows them. `texture_face_assign` and the `texture_uv_*` tools run the same undoable commands as the texture browser and UV editor. Offsets are in meters: 0.25 is a quarter tile at scale 1.

## Menus

`editor_menu_list` reads every visible menu entry live from the same declarative entries the menus draw. That covers the toolbar menus (Edit, Add, CSG) and the viewport Object, Align, Mode, Select, Mesh, Vertex, Edge and Face menus. Menus added later appear without MCP changes. `editor_menu_run` runs an entry exactly like a click on the current selection.

File and Collaborate entries are listed but refused, so no AI client can load a scene or change a shared session. Entries that open a dialog (label ending in "…") are refused too.

## Tools

Tool names follow the AGENTS.md naming rule: `category_subject_verb` in snake_case, category first and verb last (`brush_box_add`, `modifier_parameters_set`, `texture_uv_rotate`). Arguments are camelCase with the category first where it adds meaning (`modelId`, `parentGroupId`, `surfaceIndices`). Tools are listed in this order: groups from editor context to helpers, and within a group reads before edits. There are no legacy aliases.

### editor

Editor context, and every menu entry of the editor: list and run.

| Tool                 | Purpose                                                                                                                                                                                                   |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `editor_context_get` | Call first.                                                                                                                                                                                               |
| `editor_menu_list`   | Lists every visible editor menu entry (toolbar menus such as Edit, Add, CSG and the viewport Object, Align, Mode, Select, Mesh, Vertex, Edge, Face menus) with path, enabled state, shortcut and tooltip. |
| `editor_menu_run`    | Runs a menu entry exactly like a click, on the current selection and mode (undoable, synced in multiplayer).                                                                                              |

### history

Undo and redo; every editing tool is one undo step.

| Tool           | Purpose                                                  |
| -------------- | -------------------------------------------------------- |
| `history_undo` | Undoes the last editor step, exactly like Ctrl+Z.        |
| `history_redo` | Redoes the last undone editor step, exactly like Ctrl+Y. |

### selection

Read or replace the object selection the user sees.

| Tool            | Purpose                                                        |
| --------------- | -------------------------------------------------------------- |
| `selection_get` | Returns the selected brushIds, CSG groupIds and solidModelIds. |
| `selection_set` | Replaces the object selection with the given brushes.          |

### snap

Grid, rotation and scale snap settings that placement tools follow.

| Tool                | Purpose                                                                                             |
| ------------------- | --------------------------------------------------------------------------------------------------- |
| `snap_settings_get` | Returns whether snapping is on, the grid interval, the rotation step in degrees and the scale step. |

### scene

The outliner hierarchy of solid models, CSG groups and brushes; reparenting.

| Tool                       | Purpose                                                                                                               |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `scene_hierarchy_get`      | Solid outliner tree: solid_model → csg_group (with operation) → brush (with operation).                               |
| `scene_hierarchy_reparent` | Move solid brushes and/or CSG groups under a solid model root or another CSG group in the same solid (outliner drag). |

### geometry

Geometry languages: describe solids as a SolidScript and get ordered CSG brushes and groups in one undo step.

| Tool                            | Purpose                                                                                                                |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `geometry_script_preview`       | Dry run of geometry_script_build: runs SolidScript lines and returns the brush/group tree without changing the scene.  |
| `geometry_script_build`         | Builds solids from SolidScript block lines as CSG brushes and groups in one undo step.                                 |
| `geometry_script_reference_get` | Returns the full SolidScript reference: line model, every command with fields and defaults, examples, common mistakes. |
| `geometry_script_command_list`  | Lists the SolidScript commands: id, category, fields with hints, manual, what stops each, and an example line.         |
| `geometry_script_generator_get` | Reads the name, block lines, placement, solid count and first error of a SolidScript generator.                        |
| `geometry_script_generator_set` | Replaces the name, command lines and placement of a SolidScript generator in one undo step.                            |

### solid_model

Solid models: containers whose brushes combine by CSG in order.

| Tool                             | Purpose                                                                                                                  |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `solid_model_list`               | List solid models with brush counts and world bounds.                                                                    |
| `solid_model_get`                | Full solid model: ordered CSG brush list (evaluation order) plus nested hierarchy tree (solid root → csg_group → brush). |
| `solid_model_validate`           | Validate all brushes and report simple CSG warnings.                                                                     |
| `solid_model_create`             | Create a solid model with one additive unit box brush.                                                                   |
| `solid_model_inverted_world_set` | ADVANCED.                                                                                                                |

### csg_group

CSG groups: outliner folders that combine their children, then apply their own operation.

| Tool                      | Purpose                                                                                              |
| ------------------------- | ---------------------------------------------------------------------------------------------------- |
| `csg_group_get`           | One solid CSG compound group: operation, parentGroupId, childBrushIds, childGroupIds.                |
| `csg_group_create`        | Group solid brushes and/or nested CSG groups into a new solid CSG compound (same as outliner Group). |
| `csg_group_operation_set` | Set CSG operation on solid CSG groups (branch ops).                                                  |
| `csg_group_rename`        | Rename a solid CSG group (outliner display name).                                                    |
| `csg_group_ungroup`       | Dissolve solid CSG groups; children reparent to the former group parent (solid root or outer group). |

### brush

Convex brushes: read, find, create boxes, transform, clip, split, order, delete.

| Tool                      | Purpose                                                                                                                                                          |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `brush_get`               | One brush summary (includes parentGroupId), or full vertices/planes when detail=full.                                                                            |
| `brush_find`              | Filter brushes without dumping everything.                                                                                                                       |
| `brush_describe`          | One-line human summary: kind (thin vertical pole, flat panel/flag), approx size and center.                                                                      |
| `brush_extents_get`       | Half-size (halfExtents), full size, center, bounds, and six face centers (plusX/minusX/plusY/minusY/plusZ/minusZ) for alignment math without hand-halving AABBs. |
| `brush_bounds_get`        | World AABB for one brush or all brushes (optional model filter).                                                                                                 |
| `brush_validate`          | Validate convex brush topology for one brush.                                                                                                                    |
| `brush_box_preview`       | Dry-run create: same TRS fields as brush_box_add but does not create.                                                                                            |
| `brush_transform_preview` | Dry-run: predicted world bounds/size/center for a proposed position/rotationDegrees/scale without applying.                                                      |
| `brush_box_add`           | Add a convex box brush, or a wedge brush with `shape: wedge`.                                                                                                    |
| `brush_boxes_add`         | Batch create many box or wedge brushes.                                                                                                                          |
| `brush_duplicate`         | Duplicate brushes and/or solid CSG groups (groupIds clones the whole nested compound).                                                                           |
| `brush_mirror`            | Mirror across X or Z.                                                                                                                                            |
| `brush_operation_set`     | Set CSG operation on brushes.                                                                                                                                    |
| `brush_transform_set`     | Set brush local position / rotationDegrees / scale (any subset).                                                                                                 |
| `brush_transforms_set`    | Move/rotate/scale several brushes in one call.                                                                                                                   |
| `brush_align`             | Attach brushId to targetBrushId without hand-computing half-widths.                                                                                              |
| `brush_rotate`            | Simple brush rotate in degrees.                                                                                                                                  |
| `brush_rename`            | Set a stable display name (e.g.                                                                                                                                  |
| `brush_clip`              | Plane-clip ONE brush topology (not CSG subtract).                                                                                                                |
| `brush_split`             | Split ONE brush into two along a WORLD plane (same plane args as brush_clip).                                                                                    |
| `brush_reorder`           | Move brushes and/or solid CSG groups to first or last among siblings under their own parent (outliner To First/Last).                                            |
| `brush_reorder_relative`  | Move one brush before or after another (by brushIdRelative or nameRelative).                                                                                     |
| `brush_delete`            | Delete brushes by id (undoable).                                                                                                                                 |

### build

Architectural helpers: walls, room shells, doors and windows.

| Tool                   | Purpose                                                         |
| ---------------------- | --------------------------------------------------------------- |
| `build_wall_place`     | Vertical wall from {x,z}→{x,z}.                                 |
| `build_room_shell_add` | Hollow room shell: floor + four wall panels + optional ceiling. |
| `build_opening_add`    | Door/window through an axis-aligned wall.                       |
| `build_opening_cut`    | Minimal subtractive hole.                                       |

### modifier

Modifier stacks: kinds and parameters with tooltips, modifier volumes, generators (Cylinder, Cone, Sphere, Capsule, Torus, Pipe, Pyramid, Prism, Rhombicuboctahedron, Hollow Box, Column, Stairs, Curved Stairs, Arch, Blast Hole), buttons, entries, parameters, presets, bake.

| Tool                          | Purpose                                                                                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `modifier_kind_list`          | Lists modifier kinds and volume templates.                                                                                                       |
| `modifier_holder_list`        | Lists every object with a modifier stack: modifier volumes, generator nodes, brushes and CSG groups.                                             |
| `modifier_stack_get`          | One stack: settings, transform and every modifier with its parameter values (inactive ones listed apart) and its buttons with their last status. |
| `modifier_volume_create`      | Creates a scene-level modifier volume from a template; it changes the brushes inside its box.                                                    |
| `modifier_generator_create`   | Creates a generator (every kind in the list above) inside a solid model; it builds brushes filling its box.                                      |
| `modifier_entry_add`          | Adds a modifier to a stack, optionally with parameters.                                                                                          |
| `modifier_entry_remove`       | Removes a modifier from a stack.                                                                                                                 |
| `modifier_entry_move`         | Moves a modifier to another stack position (the generator stays first).                                                                          |
| `modifier_entry_duplicate`    | Duplicates a modifier right after itself.                                                                                                        |
| `modifier_entry_set`          | Enables, disables or renames a modifier.                                                                                                         |
| `modifier_parameters_set`     | Sets parameters of a modifier.                                                                                                                   |
| `modifier_preset_apply`       | Applies one of the kind's presets (ids from modifier_kind_list with kindId).                                                                     |
| `modifier_stack_settings_set` | Sets stack-wide settings: enabled, grouping (compound treats all inside brushes as one shape, brush works per brush) and ignored objects.        |
| `modifier_action_run`         | Presses a modifier's inspector button (type action), such as Physics Shatter Simulate or Reset, like a click.                                    |
| `modifier_stack_bake`         | Bakes a holder's modifiers into plain editable brushes and removes the stack (one undo step).                                                    |

### curve

Curves of modifier parameters (column profiles): read, SVG path, points, handles, segments, presets, markers.

| Tool                 | Purpose                                                                                                                                                                                                                                                                           |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `curve_get`          | One curve: points with absolute handle positions, segments (segment i joins points i and i+1), markers and raw data.                                                                                                                                                              |
| `curve_set`          | Replaces a whole curve with curve data as curve_get returns it in data.                                                                                                                                                                                                           |
| `curve_path_set`     | Draws a curve line with SVG path data: M x y once, then L, H, V (straight), Q, T (quadratic) and C, S (cubic Bezier), lower case relative; Z is ignored.                                                                                                                          |
| `curve_preset_list`  | Lists the curve parameter's presets (id, label, group, tooltip).                                                                                                                                                                                                                  |
| `curve_preset_apply` | Replaces the curve with a preset.                                                                                                                                                                                                                                                 |
| `curve_point_add`    | Inserts a point on the curve at x (keeping its shape), optionally moved to y.                                                                                                                                                                                                     |
| `curve_point_set`    | Moves a point and/or its handles; handles are absolute positions as curve_get reports them.                                                                                                                                                                                       |
| `curve_point_delete` | Deletes an inner point.                                                                                                                                                                                                                                                           |
| `curve_segment_set`  | Changes segments: mode (linear, quadratic, bezier), detail (steps), section (cross-section shape), side (mirror, negative, positive, custom), fixedDepth, blend and section properties (cornerSize, cornerSides, polygonSides, armWidth, armWidthEnd, straight, twist, rotation). |
| `curve_marker_set`   | Switches, moves or sizes the Base (bottom) or Top marker that splits a fixed-height base or top part off the curve.                                                                                                                                                               |
| `curve_mirror`       | Mirrors the curve left to right (x becomes 1 - x).                                                                                                                                                                                                                                |
| `curve_flip`         | Flips the curve upside down (y becomes 1 - y).                                                                                                                                                                                                                                    |

### texture

Textures and UVs: list textures, read brush faces, assign textures, set, align, scale, offset, rotate and reset UVs.

| Tool                  | Purpose                                                                                                                    |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `texture_list`        | Lists texture ids and labels in the texture library, plus textures the level uses whose files are missing.                 |
| `texture_face_list`   | Lists a brush's faces: surfaceIndex, world normal and center, visible in the built result, textureId, align and UV fields. |
| `texture_face_assign` | Assigns a texture to brush faces (all faces when surfaceIndices is omitted); UVs stay.                                     |
| `texture_uv_set`      | Sets UV fields on brush faces; only the given fields change.                                                               |
| `texture_uv_align`    | Projects UVs like the UV editor align buttons: floor, wall, ceiling, face or auto.                                         |
| `texture_uv_reset`    | Resets UVs to the default projection; textures stay.                                                                       |
| `texture_uv_scale`    | Multiplies the U or V scale of each face (2 doubles the tile size).                                                        |
| `texture_uv_offset`   | Shifts the U or V offset of each face by meters (0.25 is a quarter tile at scale 1).                                       |
| `texture_uv_rotate`   | Rotates the UVs of each face by degrees.                                                                                   |

### space

Spatial questions: what is at a point, overlaps, neighbors, distances, solid or void.

| Tool                            | Purpose                                                                                                           |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `space_point_query`             | Brush volumes whose world AABB contains a point (NOT final CSG).                                                  |
| `space_solid_point_explain`     | TRUE solid\|void at a world point via ordered CSG (respects additive/subtractive/intersecting and invertedWorld). |
| `space_overlaps_query`          | AABB overlap of brush volumes (NOT final CSG solid).                                                              |
| `space_neighbors_query`         | Nearest brush centers within radius.                                                                              |
| `space_distance_measure`        | Distance between brushes/points, or size of one brush.                                                            |
| `space_void_connectivity_query` | APPROXIMATE only: do two void points connect? Line sample then coarse grid BFS.                                   |

### view

Pictures of the world from any camera.

| Tool           | Purpose                                                 |
| -------------- | ------------------------------------------------------- |
| `view_capture` | Take a picture of the 3D world (JPEG, default 256×256). |

### math

Arithmetic helper; rarely needed when brushes are described with geometry_script_build.

| Tool             | Purpose                                                               |
| ---------------- | --------------------------------------------------------------------- |
| `math_calculate` | Evaluates an arithmetic expression with + - * / and parentheses, e.g. |

### Seeing the world (`view_capture`)

**What it does:** Renders one still image of the world and returns it as a **JPEG**. The editor viewports are not moved or changed. In **solid** shading, the default checker texture is replaced with **white** for the capture only; faces with real assigned textures keep those maps.

**Requirements:** AiWorldEd must be running with MCP started (toolbar **MCP** → **Start Server**). MCP always runs inside the app; there is no separate browser MCP.

**Size limits (important):** Many MCP clients cap tool results near **20KB** (Grok Build default is 20_000 bytes). A full 512×512 PNG is far too large and gets **truncated**, which shows up as “image bytes are truncated” / “payload too large”.  
`view_capture` therefore:

- Defaults to **256×256 JPEG**
- Lowers JPEG quality first; if still too large, **halves** resolution repeatedly: 512→256→128→64→**32**, then gives up
- Max requested `size` is **512**

If you need larger images in Grok Build, raise the client cap, for example in `~/.grok/config.toml`:

```toml
[mcp]
max_output_bytes = 200000
```

**How to frame the camera** (simple first):

| Approach                        | Arguments                                                                        | Behavior                                 |
| ------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------- |
| **Focus a brush (recommended)** | `brushId` or `nameContains`                                                      | **Centers** the image on that subject    |
| Camera side                     | `view`: `iso` (default) / `front` / `back` / `top` / `bottom` / `left` / `right` | Which side to look from                  |
| Pull farther back               | `distanceOffset`                                                                 | Extra distance after fit                 |
| Whole solid model               | `modelId` only                                                                   | Frames that model’s **final CSG mesh**   |
| Free camera                     | `position` + `lookAt`                                                            | Exact pose                               |
| Point only                      | `lookAt` (+ optional `distanceOffset`, `view`)                                   | Camera on that side looking at the point |
| Default                         | no framing args                                                                  | Frames all solids’ CSG results           |

**Framing rules:**

- Brush focus always puts the subject **bounds center on the optical axis** (image center).
- If `nameContains` / `brushId` matches **nothing**, the tool **errors** (does not silently frame the whole map).
- Whole-model / world framing uses CSG **result** bounds (or additive brushes), not floating subtractive cutters.

**Shading** (`shading`):

| Value             | Look                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------ |
| `solid` (default) | Materials; default checker → white                                                   |
| `overlap`         | Brush hull overdraw (cyan additive / warm subtractive); intersections stack brighter |
| `flat`            | Unlit flat gray                                                                      |

(Legacy `wireframe` is accepted and mapped to `overlap`.)

**Optional:** `size` (32–512, default 256), `fov` (default 60), `padding` (default 1.15), `helpersInclude` (default false).

**What you get back:**

1. Text JSON: `ok`, `message`, camera position/lookAt, size, framed brush ids, compression flags
2. Image content: `image/jpeg` (the picture itself)

**Image delivery** (MCP dialog → _capture_view images_, saved in the browser): **Embed images** returns the small JPEG above. **Localhost links** renders a lossless PNG at the full requested size and returns `links: ["http://127.0.0.1:<port>/transfer/<id>"]`, served by the local MCP host for one hour. **Public links** shares the PNG as a transfer link through the editor's one relay connection (opened on startup, reconnected automatically, the same one rooms use; the relay must announce `transfer`) (`https://<relay>/ws/transfer/<id>`, one hour, dies when the editor disconnects); when the relay is unavailable the capture falls back to an embedded JPEG with a warning.

**Local debug UI:** every successful `view_capture` is also stored in the floating **AI Captures** window (toolbar button next to **Detached Viewport**). Open it to inspect thumbnails, camera summary, shading, and size. Use **Clear** to drop the history (max 48 images).

**Example — look at a wall by name (preferred):**

```json
{
  "nameContains": "wall_front",
  "view": "front",
  "distanceOffset": 2
}
```

**Example — free camera:**

```json
{
  "position": { "x": 0, "y": 5, "z": 10 },
  "lookAt": { "x": 0, "y": 0, "z": 0 },
  "shading": "overlap"
}
```

### AI level-building tips

- **Names (brushes):** pass `name` on `brush_box_add` / `brush_boxes_add`, or `brush_rename`, then `brush_find` with `nameContains`.
- **Names (groups):** `csg_group_rename` / `csg_group_create` `name`; locate with `scene_hierarchy_get` (not `brush_find`).
- **Shapes:** `brush_find` shape filter accepts `thin`/`pole`, `flat`/`panel`/`flag`, `tall`, `long`, `box`.
- **Place on pole:** `brush_align` with `mode: "top"`, `gap: 0` (optional `center: true`).
- **Exact coords:** `brush_transform_set` / `brush_box_add` with `snap: false` or `exact: true` so `-17.125` is not rounded to `-17`.
- **Assemblies:** `brush_duplicate` with many `brushIds`, or `groupIds` for whole compounds; use `data.groupIds` after group clone. `brush_mirror` is brush ids only.
- **Groups:** prefer `csg_group_create` + `csg_group_operation_set` over flattening; inspect with `scene_hierarchy_get` before reparenting.
- **Nest under group:** `brush_box_add` with `parentGroupId`, or `scene_hierarchy_reparent` after create.
- **Math:** prefer `geometry_script_build`; `math_calculate` evaluates expressions like `"20+(0.5*12)"` when needed.
- **Half extents:** `brush_extents_get` for face centers when aligning openings or stacking props.
- **Preview:** `brush_transform_preview` / `brush_box_preview` return predicted world bounds without mutating.
- **Rooms:** `build_room_shell_add` then `build_opening_add` with **`targetBrushId`** on a wall brush (not bare `build_opening_cut` unless you compute midplane yourself).
- **Doors:** set `sillHeight` to the floor top; omit bottom frame automatically; do not enable mullions.
- **CSG order:** `build_opening_add` + `targetBrushId` reorders the cut after the wall; otherwise use `brush_reorder_relative` / `nameAfter`.
- **Mirror:** X-mirror flips yaw to −yaw; Z-mirror uses π − yaw.
- **Solid/void:** always `space_solid_point_explain` before trusting space is empty or solid; AABB queries list cutter volumes too.
- **Subtractives:** must overlap additive solid (and evaluate after it) or they are wasted; `solid_model_validate` warns when they do not.
- **Clip/split:** world plane on one brush for bevels/splits — not a substitute for doorway CSG.

**Clip plane tips:** prefer `axis` + `distance` (e.g. cut at `y=0` with `axis: "y", distance: 0`). `frontKeep: true` (default) keeps the **+axis** side.

**Transform tips:** use **degrees** (`rotationDegrees`, `brush_rotate.degrees`), not radians. When snap is on, positions and angles snap to the editor grid / rotation step (default 15°) unless you pass `snap: false`.

Solid mutations (including hierarchy create/reparent/rename/ungroup) are **undoable** via `history_undo` / `history_redo` and the editor history.

## Not in this build

- **`capture_section`** — orthographic 2D section slices (top/front/side) are not a separate tool yet; use `view_capture` with a free camera for now.
- **Separate tag system** — use stable `name` strings instead of a second metadata channel.
- **Exact navmesh void paths** — connectivity uses a capped grid / line sample only.

## Architecture

- **Bun process** (`src/ai/server/`): hand-rolled Streamable HTTP + JSON-RPC
- **Webview** (`src/ai/client/`): `EditorApi` facade over existing solid commands
- Bridge: Electrobun RPC (`startMcpServer` / `invokeEditorTool`)
- UI: main toolbar **MCP** button → simple dialog with Start / URL / Copy
- Online server (`src/ai/client/relay/`, `src/collaboration/mcp/`): `mcp.listen` / `mcp.request` / `mcp.response` over the relay WebSocket, answered by the same JSON-RPC handler (`mcp_jsonrpc_answer.ts`) and tool dispatch as the local server

- `flip_faces` and `triangulate` take faces or meshes in Of, filtered per face by Where. `split_edges` cuts mesh faces apart along edges filtered by Where, without moving corners; the copies can move apart later.

- Extrude Face has a per-face Direction (empty uses the normal). Individual Yes, the default, pulls every mesh face on its own; No pulls touching faces as one region, with walls only around its border. At a corner shared by several picked faces, the move is their average. On solids, negative Distance builds a Subtractive slab sunk into the solid, never a mesh. Top and Sides keep the faces the line made.

- Sort List has an optional per-item By, such as [=[$Y]] for height or [=Random(0, 1)] for a seeded shuffle. It evaluates every key before sorting, keeps the order of equal keys, and Biggest First reverses the comparison. Without By it orders the items themselves.
- Warn adds its Message, with [Name] and [=formula] filled in, to the warnings in the Output and inspector and keeps running. Kind Stop ends the script with that message as its error. Put it inside If to warn only on bad input.
- Output has an Enabled (Yes by default); No stamps nothing without stopping, so Output [Post] Enabled [=[Steps] > 0] switches one stamp off by formula.
- List(index) stops when the index is not in the list and names the valid range. ItemOr(list, index, fallback) returns its fallback instead. ItemClamp(list, index) uses the first or last item outside the range. ItemWrap(list, index) wraps around, so -1 is the last item and Count is the first; [=ItemWrap([Points], [$Index] + 1)] reads the next point of a closed loop.
- Duplicate(list, counts, output) repeats every item of a list, such as points, edges or faces, Counts times (one number, or one per item; 0 leaves an item out). Output Copy gives each result's copy number from 0 and Source the position it came from, so Duplicate([Points], 3) and Duplicate([Points], 3, "Copy") line up for lifting each copy by its number.
- CurveAt(curve, x) with a vector x maps every axis through the curve, such as CurveAt([Profile], [$Position]); for a different curve per axis, build Vector(CurveAt([CurveX], [$Position].X), CurveAt([CurveY], [$Position].Y), CurveAt([CurveZ], [$Position].Z)).
- RadialTile(position, segments, output, roundness) cuts the plane round the Z axis into equal wedges, the first centred on X: Output Segment gives the wedge number, Angle its centre in degrees, Local the position turned into its wedge and Width the arc length at that distance, so Checker(RadialTile([$Face.Center], 8, "Local")) repeats one pattern in every wedge; Roundness from 0 to 1 bends the straight edges Local X draws across a wedge into arcs.
- Chunks(list, sizes) splits a flat list into lists in list order: one Size gives chunks of that many with the last taking what is left, a list of Sizes must add up to the whole list, so For Each over Chunks([Points], List(3, 2)) builds one path per chunk.
- **Points** writes Count points to Into, a list of vectors. Its 🔁 At is worked out once per point with [$Index] (from 0) and [$Count], so [=Vector(Cos([$Index] * 45) * 3, 0, Sin([$Index] * 45) * 3)] makes a ring without Repeat and Add Item. Count 0 makes an empty list.
- **Randomize** gives every object or point in Of (empty: [$Selected.Objects]) its own random move of up to Move metres either way per axis, turn of up to Turn degrees either way, and one Scale factor between the two given (such as 0.8, 1.2), about its own center. ID ([=[$Id]] by default) and Seed pick the numbers, so the same ID and Seed always give the same change and deleting one item keeps the rest. It has Where and Into like the other transform tools.
- **Points From Path** spreads points along a Path or point list into Into: By Count (Count points from start to end) or By Spacing (one every Spacing metres, keeping the end). A closed Path does not repeat its start. Optional Directions gets the way the path runs at each point (use it as Place At Points Forward), and Amounts how far along each is, 0 to 1; times PathLength([Path]) that is the distance along. To read a path by metres, write PathAt([Path], [Metres] / PathLength([Path])).
- Select Faces, Select Objects, Select Edges and Select Vertices have an optional **Rest**. It writes the items the line looked at but did not pick, such as Select Faces Facing Up Into [Top] Rest [Sides], so one line splits them in two, like Separate Geometry.
- **Separate Mesh** cuts the faces in Of that pass its 🔁 Where (empty Of: [$Selected.Faces], else all faces of [$Selected.Objects]) off into a new mesh with the same Name, texture and mode. The faces left stay in the old mesh. Into gets the new meshes and Rest the old ones. A mesh whose faces all go stays whole, and a solid stops with the Mesh From Solids hint.
- **Duplicate Faces** copies every mesh face in Of that passes its 🔁 Where 🔁 Count times (0 copies none) into loose one-face meshes on top of it, with its UVs, Name, texture and mode, numbered from 0 under [Object.Data.Copy]; the meshes copied from stay. Without Into the copies join the result. A solid stops the line: wrap it in Mesh From Solids first.
- [Face.Island] is the number of the island (faces joined through shared edges) a face belongs to in its object, from 0 in the order of [Object.Islands], so a per-item field can vary per island, such as Texture Faces Texture [=Pick([$Face.Island], "Brick", "Stone")] or Select Faces Where [=[$Face.Island] == 1]. Blocks that bake their lines (Mesh From Solids, the extrudes, Hull) bake the latest version of what lines inside them built, including later Move By or Set Positions edits.
- To swap one texture for another, repaint only the faces that have it: Texture Faces Texture "stone" Of [Wall] Where [=[$Face.Texture] == "brick"].
- Nearest takes an optional Skip index: Nearest([Points], [$Point], [$Index]) is the nearest other point, never the point itself, and -1 when there is no other.
- Find On has Target (with Closest: Faces, Edges or Corners), Max Distance (a find further away is a miss; empty finds at any distance) and Sample, a 🔁 value read on the face found with [$Face] and written to Sampled, one per item for a list, such as Find On Along Ray From [Spots] Direction 0, -1, 0 Sample [=[$Face.Texture]] Sampled [Ground]. Blend Corners reads Sample at every corner of that face with [$FaceCorner] and blends the numbers or vectors by where the point lies, such as Sample [=[$FaceCorner.UV]] Blend Corners for the texture coordinates under the point.
- Blur Data Key Heat Rounds 3 Of [Faces] averages a .Data number or vector of each face, edge or corner with its neighbors (faces sharing an edge, edges or corners sharing a corner, among those in Of); every round reads the round before, and empty Of uses [$Selected.Faces].
- Array numbers what it makes under .Data.Copy: 0 for the original and 1 on for each copy, so a later line can vary by it, such as Move By [=Vector(0, [$Item.Data.Copy] * 0.2, 0)] Of [Copies].
- The 🔁 Count of Array may vary per object, with [$Object] and [$Index], such as Count [=[$Index] + 2].
- Merge By Distance has Mode All (any corners closer than Distance) or Connected (only the two ends of an edge shorter than Distance, so separate parts that nearly touch stay apart), and a 🔁 Weld Where a corner must pass to be welded, such as [=[$Vertex.Position.Y] > 0].
- Sweep Along Path has a 🔁 Twist: degrees the profile turns about the path at each path point, such as [=[$Index] * 15] for a twisted rope; As Mesh suits it best, since a twisted stretch bends its sides.
- Sweep Along Path As Mesh has Fill Caps (Yes by default): No leaves the two ends of an open path open, like a tube.
- Tag Faces Roof gives the faces in Of (empty: [$Selected.Faces]) a tag of your own, which [$Face.Tags] and HasTag then find and which stays through moves and cuts; the 🔁 Tag may change per face, and Remove takes it off again.
- Scale Faces has a 🔁 Center (left off: the center of each face) and a 🔁 Axis that scales only along that direction, such as Axis 1, 0, 0 to make faces narrower but not shorter.
- Scatter Points On Faces writes to Rotations, when named, the turn that stands a shape up on the face under each point, in X, Y, Z degrees as Rotation reads them.
- Align To has Axis (X, Y or Z: which axis of the items points along Direction, Y by default) and Amount (0 to 1, the share of the turn to take, so 0.5 leans halfway).
- RotateBy(rotation, by, local) composes two X, Y, Z degree turns: By turns in world space, or in the rotated space when Local is true, which adding the angles does not do.
- For Each has a 🔁 Where an item must pass, with [$Item] the item, for the lines inside to run for it, such as Where [=[$Item.Normal.Y] > 0.5]; Key still counts in the whole list.
- Function inputs may have defaults, such as W, D = 1: a call may leave those off, and they take the value after =. Numbers, Yes/No, quoted text and [lists] are read as values. Inputs with a default come last.
- A Function reruns for each item when its formula is used per item, such as in a Where or a per-face field: [$Local.X] holds that item's value each time.
- Scatter Points Ids writes a steady number for each point, worked out from where it lies, so Random seeded by it stays with a point when Count grows or other points are removed.
- Path From Points Radius can change per corner with [$Index] and [$Point], such as [=[$Index] * 0.1]; a corner with 0 stays sharp. Limit Radius Yes shrinks radii that do not fit so rounded corners never overlap.
- Path Shape Smooth bends a gentle curve through every point in Points (Sides segments per stretch, Closed joins the ends); Shape Bezier runs From to To, leaving From toward From Handle and coming into To from To Handle, with Count points.
- Path From Edges joins edges that share corners into a list of Paths (closed when they go all the way round, broken where three or more meet); Path From Faces gives the edges round each face as a closed Path. Both take Of and Where.
- Fill Paths builds a flat mesh of triangles that fills closed Paths (or one loop of points): a path inside another is a hole, one inside that is filled again. The mesh faces the way the biggest path runs round.
- Fill Points builds a mesh of triangles between loose points, covering their convex hull: the points are laid flat on the plane facing Normal (0, 1, 0 by default) to pick triangles whose circles hold no other point, and keep their heights. Points at the same place on that plane are kept once; Groups, one per point, fills every group on its own; at most 5000 points.
- Fill Paths Rule: Even-Odd (the default) makes every path inside a filled one a hole; Non-Zero fills inside a path that runs the same way as the one round it and cuts a hole only where the paths round a spot add up to 0. Paths that cross each other are not split where they cross. Fill Points Edges [=List(List(0, 2))] keeps pairs of point numbers, from 0, as edges of the mesh, split where they run through a point, and stops when two of them cross; Faces Regions joins the triangles between Edges and the border into one face each, points inside a region left loose.
- Unwrap Seams [=[$Edge.Angle] > 45] cuts the UVs open only along edges that pass it: faces joined by other edges stay in one island, each folded open from its neighbour so lengths and angles stay true. Pack (Yes by default) then packs the islands into 0 to 1 as Pack Islands does, Margin apart; Pack No keeps them at Size, metres to one texture repeat.
- Unwrap Method: Unfold (the default) folds each face of a Seams island open from its neighbour, true to size but cracked where the surface curves; Conformal keeps every joined corner joined and spreads the stretch over the island so angles stay as true as the surface allows, the two corners farthest apart keeping their unfolded places. Unwrap now lays its islands side by side along U, a whole number of repeats apart, so no two share a spot and packing keeps them apart. Any other Method stops the run.
- Subdivide Crease [=[$Edge.Angle] > 60] keeps edges that pass it sharp while Smooth rounds the rest; Keep Corners holds the corners of an open mesh in place.
- Extrude Edges pulls mesh edges out into new four-sided faces, Distance metres along Direction (or the way the faces at each corner face), sharing corners so a chain becomes one strip; the new faces are picked.
- Number helpers: Log(number, base) takes any base (10 when left off); Sinh, Cosh and Tanh work per axis; Gcd and Lcm of whole numbers; Xor of two tests; BitAnd, BitOr and BitXor; Median and Range of a list of numbers; StdDev and Variance of a list of numbers or vectors, with an optional Groups list giving each item the spread of its own group.
- Waves and coordinates: Smootherstep(edge_low, edge_high, value); Saw(value) and Triangle(value) repeat every whole step; Checker(position, scale) gives 1 in odd squares of a checkerboard; FlipToward(vector, reference); FromCylinder(radius, degrees, height), FromSphere(radius, yaw, pitch), ToCylinder(vector) and ToSphere(vector) around the up (Y) axis; RingPoint(degrees, size, height) is a point on the oval that fits size (a width number, or the X and Z of a vector), turning counter-clockwise seen from above; Slerp(from, to, amount) turns one direction toward another at an even angle rate.
- Random turns: RandomDirection(id, seed) gives a unit direction and RandomRotation(id, seed) an evenly spread rotation in degrees (X then Y then Z); in a per-item field the ID is the item. First(list, count) and Last(list, count) take several items.
- Ranges and slices: Clamp(value, min, max) swaps reversed limits; Lerp(from, to, amount) accepts a vector amount when blending vectors; Slice(list or text, start, count) also takes characters of text, counted from 0.
- Points From Path: a Count of 0 or 1 is raised to 2, so both ends of the path always get a point.
- DivFloor(a, b) divides and rounds down, below 0 too, so DivFloor(a, b) * b + Mod(a, b) is a; Round(a / b) and Ceil(a / b) round the other ways. Facing() is the way to compare two directions by angle.
- Remap(value, from_low, from_high, to_low, to_high, clamp, steps): Steps snaps the result to the nearest of Steps + 1 even levels across the target range; 0 or left off slides smoothly.
- Remap also takes Ease after Steps: Linear (the default), Smoothstep or Smootherstep. The latter two blend gently at the edges.
- Star (2D Shapes) draws a flat star: Points tips at the Outer radius, an inner corner at the Inner radius halfway between each two, Twist turning the inner corners in degrees, and Anchor like Circle.
- Path Line by direction and length: set To to Along(From, Direction, Length). Path Spiral turns clockwise from above with negative Turns.
- Nearest(points, point, skip, groups, group): Groups gives a group number per point and Group the one to search, so only points of the same group are found.
- Scatter Points By Density: each triangle draws from its own random stream, so raising Density keeps every point a lower Density gave and only adds more.
- Scatter Points Keep is a 🔁 chance from 0 to 1 per point, with [$Point] the point, that it stays: each point draws one steady number from its Id and the Seed, so raising Keep only adds points, and Keep [=Noise([$Point.Position], 0.2)] thins points into patches.
- Pack Islands: faces that share a corner with the same UV, such as faces Unwrap Seams kept joined, now pack as one island; Margin (default 0.001) is the gap between islands as a share of the square; Rotate (Yes by default) turns each island so it takes the least room, as Unwrap does when it packs; Bottom Left and Top Right give the area to fill, 0 to 1 when left off.
- Pack Islands Method: Bounding Box (the default) packs the islands' boxes in rows; Convex Hull places each island, largest first, as low as its convex hull fits on the islands placed before, so slanted sides nest; Exact Shape does so by the faces themselves, so an island can sit in another's notch. With Rotate Yes these two also try quarter and half turns. Any other word stops the run.
- Texture Faces works on meshes: each texture becomes one of the mesh's texture slots and each face points at its slot; one slot is the whole-mesh texture as before.
- Icosphere Mesh: a mesh sphere of even triangles with Radius and Subdivisions (1 to 7), and a matching Icosphere generator for the world editor; both share one shape module.
- MatrixMultiply(a, b), MatrixDeterminant(matrix) and MatrixTranspose(matrix).
- MatrixAt(matrix, row, column) reads one of the sixteen numbers, rows and columns from 0 to 3.
- Corner values: [Face.Angles] gives the angle at each corner in degrees, in vertex order; [Vertex.IsUVSplit] and [Edge.IsUVSplit] tell whether the faces there give different UVs.
- Cluster(points, distance, groups) groups close points, giving each the index of the point its cluster started from.
- Merge Points welds mesh corners that share a Merge ID into one at their average position, with Pick Where.
- Scale Faces scales faces that share corners as one island, by their average Factor about their average Center.
- Scale Edges grows or shrinks edges, joined ones as one island about their average midpoint.
- InvertRotation, RotationAxis, RotationAngle and MixRotation work on turns in X, Y, Z degrees.
- Select Shortest Paths picks the edges of the cheapest way from Start corners to the nearest End corner, with a Cost per edge, and can write the next corner and the total cost of every corner to Nexts and Costs.
- Select Group Boundaries picks the edges between two faces whose Group value differs, such as Group [=[$Face.Normal.Y] > 0.9] for the rim of a top; an edge with one face is no boundary.
- Face Groups splits faces into groups joined through edges, stopping at edges that pass Cut.
- Set Handles bends a path into Bezier stretches between per-point handles; Set Path Type turns a path Poly or Bezier; Path.HandlesLeft and Path.HandlesRight read them.
- Sweep Along Path takes an optional Up per Point: the profile's up faces it on each stretch, else it turns as little as possible from the stretch before.
- ClusterConnected(points, starts, ends, distance) groups points joined by edges whose cluster middles are closer than Distance.
- Brick(position, scale, seed, output, mortar, width, height, offset, smooth) gives brick mortar or a per-brick Tint; Magic(position, scale, depth, distortion) gives swirling colour bands.
- Rename Data moves a .Data value to a new key and Remove Data removes one key, on faces, edges or corners.
- A Dictionary keeps values under keys, made with Make Dictionary Into Prices Keys Wood, Stone Values 5, 7 and read like .Data: [Prices.Data.Wood]. Add Entry Key Wood Value 5 To Prices puts a value under a key (making the Dictionary when it is new), Remove Entry Key Wood From Prices takes a key out, and Merge Dictionary [Extra] Into Prices adds every key of another Dictionary. Keys are names: letters, digits and _, not starting with a digit.
- PrincipalAxes(points, output, groups) gives the main axes, spread or middle of a point cloud, or of the group of each point with Groups; MatrixSvd(matrix, output) gives the stretches S and the turns U and V of a matrix.
- Dual Mesh swaps the faces and corners of a mesh, with Keep Boundaries for open edges.
- Find On How At UV finds the point on the faces whose texture coordinates are the U and V of From.
- Set Handle Type places path handles by Type Auto, Vector, Align or Free, on Side Both, Left or Right, for points that pass Pick Where, and the path keeps each type: read them with [Path.HandleTypesLeft] and [Path.HandleTypesRight], Free until set. A straight path made Bezier gets Vector and a whole-path curve Align; handles moved by Set Handles turn Auto into Align and Vector into Free, and new points from Subdivide Path get Align.
- Set Tilt tilts a path per point; [Path.Tilts] reads it back and Sweep Along Path turns the profile by it on top of Twist.
- Set Path Normal stores the way a Path's up side faces: Mode Minimum Twist (the default) turns it as little as it can, Up keeps it facing up, and Free gives each point a 🔁 Normal, blended along curved stretches and turned with the path. Sweep Along Path uses it when its own Up is empty, and [Path.Normals] reads it back, one per point the path passes.
- Set Path Type also makes Catmull Rom paths through every point and NURBS paths pulled toward them; curved paths keep their shape either way.
- Gabor gives wavy streaks: Value, Phase or Intensity of random wave bumps that follow Orientation as much as Anisotropy says.
- BitNot, BitShift and BitRotate join BitAnd, BitOr and BitXor.
- A face corner is one face's use of a vertex, so a cube corner has three. Face.FaceCorners lists them around the face, Vertex.FaceCorners gives one per face at that vertex and Edge.FaceCorners the corner each face at the edge leaves it from. A FaceCorner has Face, Vertex, Index (its number around the face), Position, Normal (its face's normal), Angle, UV, NextEdge (the edge it leaves along), PreviousEdge (the edge it arrives along), NextCorner and PreviousCorner (the corners after and before it, wrapping around the face) and Ring (the corners of its face in order starting with this one, so Ring(2) is two corners on); For Each over them names the round [$FaceCorner]. Set [K.UV] to 0.5, 0.25 changes the UV only that face gives the vertex, so the other faces there keep theirs; Set [Ks.UV] on a list works it out per corner with [$Item] and [$Index]. Only meshes keep a UV per face corner: on a solid use Face.UVs.
- Face.IsPlanar is Yes when a face's corners spread less than a centimetre along its normal, and Face.Warp gives that spread in metres, so [=[Face.Warp] < 0.001] picks a tighter limit; solid faces are always flat. Edge.IsManifold is Yes when exactly two faces meet at an edge, so open borders and edges shared by three or more faces are No.
- Gradient(position, type) fades from 0 to 1 across space, held between 0 and 1: Linear (the default) along X, Quadratic, Easing, Diagonal along X and Y, Spherical and Quadratic Sphere from 1 in the middle to 0 a metre away, and Radial once around Z.
- Set Path Closed joins the last point of a Path back to its first (Closed Yes) or opens it there (No), into Into: a straight path gets a straight stretch, a curved one a Bezier stretch with handles a third of the way along; tilts and the curve kind stay.
- Set Path Resolution draws every curved stretch of a Path in Resolution steps, keeping its points, handles, tilts and closing; read it with [Path.Resolution], which is 12 until set.
- Subdivide Path puts Cuts new points evenly inside each stretch of a Path, into Into, keeping its shape: Bezier stretches split along their curve, a Catmull Rom path gets points on its curve, and straight stretches and NURBS paths get points on the line. Cuts is a 🔁 whole number per point for the stretch that starts there; below 0 counts as none. New points get the tilt between their neighbours.
- Path Shape Quadratic runs from From to To pulled toward Middle, in Count points.
