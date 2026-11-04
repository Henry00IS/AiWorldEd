# AI World Editor — MCP (desktop)

The Electrobun desktop build can host a **local Model Context Protocol (MCP)** endpoint so external AI clients (Grok Build, Claude Desktop, Cursor, etc.) can inspect and edit **convex solid-model brushes** in the live map.

This is **not** available in the GitHub Pages / browser build.

## Start the server

1. Run the **desktop** app (`bun run desktop:dev` or a packaged Electrobun build).
2. Click the **MCP** icon on the **main toolbar** (rightmost control).
3. Click **Start server**.
4. Copy the **URL** (for example `http://127.0.0.1:18765/mcp`).

No token or password is required. The server only listens on this computer (`127.0.0.1`).

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
- CSG operations: `additive` | `subtractive` | `intersecting`
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

| Concept             | Details                                                                                                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Solid CSG group** | Outliner folder under a solid. Combines its children as one compound, then applies the **group operation** into the parent.                                              |
| **Nesting**         | Groups may contain brushes and other groups. `parentGroupId` on brushes / groups is `null` when parented under the solid root.                                           |
| **Operations**      | Brushes: `set_brush_operation`. Groups: `set_group_operation`. Additive groups look like normal yellow folders; subtractive/intersecting show red/blue badges in the UI. |
| **CSG order**       | Evaluation walks the scene depth-first. Sibling order under a parent matters (`reorder_brushes` / `reorder_brush_relative` / `insertBeforeId` on reparent).              |

### Hierarchy tools

| Tool                   | Purpose                                                                                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `get_scene_hierarchy`  | Full outliner tree (`solid_model` → `csg_group` → `brush`) with operations                                                                        |
| `get_solid_model`      | Flat brush list (evaluation order) **plus** nested `hierarchy`                                                                                    |
| `get_csg_group`        | One group: children, `parentGroupId`, operation                                                                                                   |
| `create_csg_group`     | Group `brushIds` / `groupIds` into a new compound (`parentGroupId`, `operation`, `name`). `parentGroupId` must not be a member or under a member. |
| `set_group_operation`  | Branch op on groups                                                                                                                               |
| `ungroup_csg_groups`   | Dissolve groups; children rise to the former parent                                                                                               |
| `reparent_solid_nodes` | Move nodes under model root or another group (`parentId`, optional `insertBeforeId`)                                                              |
| `rename_group`         | Outliner display name (undoable)                                                                                                                  |
| `add_box_brush`        | Optional `parentGroupId` to spawn under a group                                                                                                   |
| `duplicate_brushes`    | `brushIds` and/or `groupIds` (group clone keeps nesting). `createdIds` = brush ids; group uuids in `data.groupIds`.                               |
| `reorder_brushes`      | `brushIds` and/or `groupIds` → first/last among siblings                                                                                          |

**Brush-only tools (no `groupIds`):** `delete_brushes`, `select`, `mirror_brushes`, `find_brushes`. Find groups via `get_scene_hierarchy` / `get_csg_group`.

**Workflow example:** build wall pieces → `create_csg_group` with those `brushIds` and `operation: "subtractive"` → nest a cutter under that group with `add_box_brush` + `parentGroupId` (or `reparent_solid_nodes`) → `duplicate_brushes` with `groupIds` to copy the whole compound.

Same-solid only: reparent/group never moves a brush out of its solid model root.

## CSG: solid vs brush AABB (critical)

| Tool                                                 | What it measures                                                        |
| ---------------------------------------------------- | ----------------------------------------------------------------------- |
| `query_point` / `query_overlaps` / `query_neighbors` | **Brush volume AABBs** — includes subtractive cutters as hits           |
| `explain_csg_at_point`                               | **Final solid or void** after ordered CSG (use this for doors/cavities) |
| `query_void_connectivity`                            | Approximate path between two voids (coarse grid; not navmesh)           |

**Default workflow (leave `invertedWorld` false):** space starts empty → additive brushes create solid → subtractive brushes carve holes **only where they overlap prior solid**. A floating subtractive that does not overlap an additive does nothing.

**Do not enable `set_inverted_world` for normal room shells / door cuts.** Inverted mode starts the universe solid so subtractives dig space (advanced).

**Doors:** use `add_opening` / `cut_opening` (subtractive boxes through walls), not `clip_brush`. Clip/split change **one brush’s topology** along a world plane (ramps, bevels, permanent cuts).

## Walls, rooms, openings (math)

| Piece            | Placement rule                                                                                                                                                                                                                                                                                                                  |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `place_wall`     | Centerline `from`→`to` on XZ. Box size `{thickness, height, length}`. Yaw = `atan2(dx, dz)` so local **+Z** follows the segment. Bottom = `baseY` (default 0).                                                                                                                                                                  |
| `add_room_shell` | Exterior AABB `size`; `position` is center (default floor on y=0). Front wall at **+Z**, back **−Z**, left **−X**, right **+X**. Side walls are shortened so corners do not double-stack.                                                                                                                                       |
| `cut_opening`    | Subtractive box; **position is the hole center**, `size` is full extents. No auto wall align.                                                                                                                                                                                                                                   |
| `add_opening`    | Prefer **`targetBrushId`** = wall brush. Snaps cut to wall **midplane**, uses wall thickness as flush depth (exact, no overcut), reorders cut **after** that wall. `sillHeight` = bottom of hole → center Y = sill + height/2. Doors skip bottom frame strip. **Axis-aligned walls only** (not diagonal `place_wall` segments). |

**Door example:** build room → `find_brushes` nameContains `wall_front` → `add_opening` with `kind: "door"`, `targetBrushId`, `sillHeight` = floor top, `size: { width, height }`, `position` along the wall (x/z of doorway center; y ignored when sillHeight set), `snap: false`.

## Core tools

| Tool                                                              | Purpose                                                    |
| ----------------------------------------------------------------- | ---------------------------------------------------------- |
| `get_editor_context`                                              | Snap, history, selection, coords                           |
| `calculate`                                                       | Safe arithmetic (`20+(0.5*12)`), no eval                   |
| `list_solid_models` / `get_solid_model` / `get_brush`             | Inventory (+ hierarchy on model detail)                    |
| `get_scene_hierarchy` / `get_csg_group` / `get_selection`         | Tree, group detail, brush+group selection                  |
| `find_brushes` / `describe_brush` / `half_extents`                | Filter; summaries; half-size + face centers                |
| `query_overlaps` / `query_point` / `query_neighbors` / `measure`  | Spatial planning                                           |
| `preview_transform` / `preview_new_box`                           | Dry-run existing or new box bounds                         |
| `explain_csg_at_point` / `query_void_connectivity`                | CSG solid/void; approx cavity path                         |
| `validate_brush` / `validate_solid_model`                         | Topology checks                                            |
| `create_solid_model` / `add_box_brush` / `add_box_brushes`        | Create geometry (`parentGroupId` supported)                |
| `create_csg_group` / `set_group_operation` / `ungroup_csg_groups` | Hierarchy compounds                                        |
| `reparent_solid_nodes` / `rename_group`                           | Nest / rename groups and brushes                           |
| `place_wall` / `add_room_shell` / `cut_opening` / `add_opening`   | Walls, rooms, door/window cuts                             |
| `set_brush_transform` / `batch_set_brush_transform`               | Pose edits (`snap:false` for exact)                        |
| `align_brush`                                                     | Stack on top / hang under / touch side                     |
| `rotate_brush`                                                    | Rotate in **degrees** (default Y/yaw)                      |
| `rename_brush`                                                    | Stable names (`start_a_flag`, …)                           |
| `clip_brush` / `split_brush`                                      | Plane cut / split into two                                 |
| `delete_brushes` / `duplicate_brushes` / `mirror_brushes`         | Delete/mirror: brushes only; duplicate supports `groupIds` |
| `reorder_brushes` / `reorder_brush_relative`                      | Sibling order (ends or before/after)                       |
| `set_inverted_world` / `select` / `undo` / `redo`                 | Session                                                    |
| `capture_view`                                                    | Take a picture of the 3D world (JPEG, or PNG link)         |

### Seeing the world (`capture_view`)

**What it does:** Renders one still image of the world and returns it as a **JPEG**. The editor viewports are not moved or changed. In **solid** shading, the default checker texture is replaced with **white** for the capture only; faces with real assigned textures keep those maps.

**Requirements:** AiWorldEd must be running with MCP started (toolbar **MCP** → **Start server**). MCP always runs inside the app; there is no separate browser MCP.

**Size limits (important):** Many MCP clients cap tool results near **20KB** (Grok Build default is 20_000 bytes). A full 512×512 PNG is far too large and gets **truncated**, which shows up as “image bytes are truncated” / “payload too large”.  
`capture_view` therefore:

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

**Optional:** `size` (32–512, default 256), `fov` (default 60), `padding` (default 1.15), `includeHelpers` (default false).

**What you get back:**

1. Text JSON: `ok`, `message`, camera position/lookAt, size, framed brush ids, compression flags
2. Image content: `image/jpeg` (the picture itself)

**Image delivery** (MCP dialog → _capture_view images_, saved in the browser): **Embed images** returns the small JPEG above. **Localhost links** renders a lossless PNG at the full requested size and returns `links: ["http://127.0.0.1:<port>/transfer/<id>"]`, served by the local MCP host for one hour. **Public links** shares the PNG as a transfer link through the editor's one relay connection (opened on startup, reconnected automatically, the same one rooms use; the relay must announce `transfer`) (`https://<relay>/ws/transfer/<id>`, one hour, dies when the editor disconnects); when the relay is unavailable the capture falls back to an embedded JPEG with a warning.

**Local debug UI:** every successful `capture_view` is also stored in the floating **AI Captures** window (toolbar button next to **Detached Viewport**). Open it to inspect thumbnails, camera summary, shading, and size. Use **Clear** to drop the history (max 48 images).

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

- **Names (brushes):** pass `name` on `add_box_brush` / `add_box_brushes`, or `rename_brush`, then `find_brushes` with `nameContains`.
- **Names (groups):** `rename_group` / `create_csg_group` `name`; locate with `get_scene_hierarchy` (not `find_brushes`).
- **Shapes:** `find_brushes` shape filter accepts `thin`/`pole`, `flat`/`panel`/`flag`, `tall`, `long`, `box`.
- **Place on pole:** `align_brush` with `mode: "top"`, `gap: 0` (optional `center: true`).
- **Exact coords:** `set_brush_transform` / `add_box_brush` with `snap: false` or `exact: true` so `-17.125` is not rounded to `-17`.
- **Assemblies:** `duplicate_brushes` with many `brushIds`, or `groupIds` for whole compounds; use `data.groupIds` after group clone. `mirror_brushes` is brush ids only.
- **Groups:** prefer `create_csg_group` + `set_group_operation` over flattening; inspect with `get_scene_hierarchy` before reparenting.
- **Nest under group:** `add_box_brush` with `parentGroupId`, or `reparent_solid_nodes` after create.
- **Math:** `calculate` with expressions like `"20+(0.5*12)"` — only `+ - * / ( )` and decimals.
- **Half extents:** `half_extents` for face centers when aligning openings or stacking props.
- **Preview:** `preview_transform` / `preview_new_box` return predicted world bounds without mutating.
- **Rooms:** `add_room_shell` then `add_opening` with **`targetBrushId`** on a wall brush (not bare `cut_opening` unless you compute midplane yourself).
- **Doors:** set `sillHeight` to the floor top; omit bottom frame automatically; do not enable mullions.
- **CSG order:** `add_opening` + `targetBrushId` reorders the cut after the wall; otherwise use `reorder_brush_relative` / `insertAfterName`.
- **Mirror:** X-mirror flips yaw to −yaw; Z-mirror uses π − yaw.
- **Solid/void:** always `explain_csg_at_point` before trusting space is empty or solid; AABB queries list cutter volumes too.
- **Subtractives:** must overlap additive solid (and evaluate after it) or they are wasted; `validate_solid_model` warns when they do not.
- **Clip/split:** world plane on one brush for bevels/splits — not a substitute for doorway CSG.

**Clip plane tips:** prefer `axis` + `distance` (e.g. cut at `y=0` with `axis: "y", distance: 0`). `keepFront: true` (default) keeps the **+axis** side.

**Transform tips:** use **degrees** (`rotationDegrees`, `rotate_brush.degrees`), not radians. When snap is on, positions and angles snap to the editor grid / rotation step (default 15°) unless you pass `snap: false`.

Solid mutations (including hierarchy create/reparent/rename/ungroup) are **undoable** via `undo` / `redo` and the editor history.

## Not in this build

- **`capture_section`** — orthographic 2D section slices (top/front/side) are not a separate tool yet; use `capture_view` with a free camera for now.
- **Separate tag system** — use stable `name` strings instead of a second metadata channel.
- **Exact navmesh void paths** — connectivity uses a capped grid / line sample only.

## Architecture

- **Bun process** (`src/ai/server/`): hand-rolled Streamable HTTP + JSON-RPC
- **Webview** (`src/ai/client/`): `EditorApi` facade over existing solid commands
- Bridge: Electrobun RPC (`startMcpServer` / `invokeEditorTool`)
- UI: main toolbar **MCP** button → simple dialog with Start / URL / Copy
