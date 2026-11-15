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

| Concept             | Details                                                                                                                                                                      |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Solid CSG group** | Outliner folder under a solid. Combines its children as one compound, then applies the **group operation** into the parent.                                                  |
| **Nesting**         | Groups may contain brushes and other groups. `parentGroupId` on brushes / groups is `null` when parented under the solid root.                                               |
| **Operations**      | Brushes: `brush_operation_set`. Groups: `csg_group_operation_set`. Additive groups look like normal yellow folders; subtractive/intersecting show red/blue badges in the UI. |
| **CSG order**       | Evaluation walks the scene depth-first. Sibling order under a parent matters (`brush_reorder` / `brush_reorder_relative` / `nodeIdBefore` on reparent).                      |

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

**Brush-only tools (no `groupIds`):** `brush_delete`, `select`, `brush_mirror`, `brush_find`. Find groups via `scene_hierarchy_get` / `csg_group_get`.

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

## Core tools

| Tool                                                                                    | Purpose                                                    |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `editor_context_get`                                                                    | Snap, history, selection, coords                           |
| `calculate`                                                                             | Safe arithmetic (`20+(0.5*12)`), no eval                   |
| `solid_model_list` / `solid_model_get` / `brush_get`                                    | Inventory (+ hierarchy on model detail)                    |
| `scene_hierarchy_get` / `csg_group_get` / `selection_get`                               | Tree, group detail, brush+group selection                  |
| `brush_find` / `brush_describe` / `brush_extents_get`                                   | Filter; summaries; half-size + face centers                |
| `space_overlaps_query` / `space_point_query` / `space_neighbors_query` / `measure`      | Spatial planning                                           |
| `brush_transform_preview` / `brush_box_preview`                                         | Dry-run existing or new box bounds                         |
| `space_solid_point_explain` / `space_void_connectivity_query`                           | CSG solid/void; approx cavity path                         |
| `brush_validate` / `solid_model_validate`                                               | Topology checks                                            |
| `solid_model_create` / `brush_box_add` / `brush_boxes_add`                              | Create geometry (`parentGroupId` supported)                |
| `csg_group_create` / `csg_group_operation_set` / `csg_group_ungroup`                    | Hierarchy compounds                                        |
| `scene_hierarchy_reparent` / `csg_group_rename`                                         | Nest / rename groups and brushes                           |
| `build_wall_place` / `build_room_shell_add` / `build_opening_cut` / `build_opening_add` | Walls, rooms, door/window cuts                             |
| `brush_transform_set` / `brush_transforms_set`                                          | Pose edits (`snap:false` for exact)                        |
| `brush_align`                                                                           | Stack on top / hang under / touch side                     |
| `brush_rotate`                                                                          | Rotate in **degrees** (default Y/yaw)                      |
| `brush_rename`                                                                          | Stable names (`start_a_flag`, …)                           |
| `brush_clip` / `brush_split`                                                            | Plane cut / split into two                                 |
| `brush_delete` / `brush_duplicate` / `brush_mirror`                                     | Delete/mirror: brushes only; duplicate supports `groupIds` |
| `brush_reorder` / `brush_reorder_relative`                                              | Sibling order (ends or before/after)                       |
| `solid_model_inverted_world_set` / `select` / `undo` / `redo`                           | Session                                                    |
| `view_capture`                                                                          | Take a picture of the 3D world (JPEG, or PNG link)         |

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
- **Math:** `calculate` with expressions like `"20+(0.5*12)"` — only `+ - * / ( )` and decimals.
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

Solid mutations (including hierarchy create/reparent/rename/ungroup) are **undoable** via `undo` / `redo` and the editor history.

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
