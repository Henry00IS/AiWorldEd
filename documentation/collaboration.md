# Collaboration

AiWorldEd can share a scene with other people in real time. Everyone in a room edits the same world. Each object can only be changed by the person who has it selected, and the selection outline shows everyone who is editing what.

Collaboration is **optional**. If you never open the **Collaborate** menu, the editor makes no network connection and loads none of the collaboration code (see [Offline cost](#offline-cost)).

## Quick start

1. Open **Collaborate > Create room…**, enter **Your name** (up to 12 characters, remembered in the browser), pick a room name (up to 128 characters; the suggestion is "Henry's room", "James' room" for a name ending in s, or "My room" without a name), and choose **Public** or **Private**. A private room gets a strong generated password. Use **New** to make another one, **Show** to reveal it, and **Copy** to copy it. The dialog checks the name and password as you type. The password is a plain text field masked with CSS, not a browser password field, so browsers and password managers do not offer to save it; the field only exists while **Private** is selected.
2. Your current scene becomes the room scene. You are the room **owner**.
3. Others open **Collaborate > Browse rooms…**, choose your room, and select **Join**. The room browser updates live while it is open (rooms appear, close and change their member count without a refresh) and has a search box that filters by room name and owner name as you type. A room whose name does not contain its owner's name is shown as "<owner>'s <room name>" (for example "Henry's Awesome room", or "Slanders' Awesome room" for a name ending in s); this is display only, the room keeps its name. The join dialog asks for your name (prefilled from last time) and, for a private room, the password.
4. Before joining, the editor asks you to confirm **Discard local work?**, because the room scene replaces whatever you have open. Save first (**File > Save**) if you want to keep it.
5. To leave, use **Collaborate > Leave room**. If the owner leaves, the room ends.

The status chip in the status bar (styled like the other status bar labels) shows the connection state. The states are Offline, Connecting, Online (no room), Joining, Synchronizing, Room, and Reconnecting. When you are in a room, the chip also shows one colored dot per member (your own dot has a white ring; hover a dot for the name), and selecting the chip opens the member list. Every member has a color, chosen so that it never looks like the editor's orange selection color.

## Names, colors and presence

- **Names** are at most 12 characters. Leave the field empty to get a relay-assigned name such as `User 7`. The name is stored in the browser under `aiworlded.collaboration.displayName`.
- **Unique in a room.** When someone in the room already uses your name (ignoring upper and lower case), the relay adds a number: `Henry`, `Henry2`, `Henry3`, … A name that would grow past 12 characters is shortened first (`HenryHenryHe` → `HenryHenryH2`).
- **Fixed while in a room.** The name you joined with stays until you leave. The relay refuses renames inside a room, and the name field in Collaboration settings is read-only there.
- **Colors.** The relay gives every member the lowest color slot that is free in the room, so the members present at the same time never share a color. Each slot maps to a fixed color, which is used for the member dot, the selection and lock outlines, the camera gizmo and the character tint.
- **Cameras.** Each other member's 3D (perspective) viewport camera is drawn as a small camera frustum in their color, pointing where they look, with a name tag above it. Gizmos keep a minimum on-screen size and are drawn in every viewport, including detached ones. In each viewport a camera gizmo and its name tag fade out as they get close to that viewport's camera (hidden within 0.5 m, fully shown beyond 2 m), so a member whose camera sits at or near yours never tints your view. They are not part of the scene: they cannot be selected, are never saved and do not affect CSG.
- **Play mode.** A member who is playing appears as a copy of the player character tinted in their color, with a name tag above the head, instead of their play camera. The copy swings its legs in a simple walk cycle while it moves and stands in its rest pose when it stops.
- **Bonus data only.** Presence is sent at most 5 times a second, only when something moved, and it is dropped rather than queued whenever edits are being sent. It can lag or skip a beat without affecting editing.

## Editing rules

- **Select to edit.** Selecting an object locks it for you. Other members see your color on that object in every viewport and in the outliner. They cannot select it, and if they try, the status bar says who is editing it.
- Every change needs the lock: moving, rotating, scaling, edit mode, CSG and brush edits, renaming, visibility, materials, textures and UVs, reparenting in the outliner, grouping, and deleting.
- **Containers.** Selecting an object also locks it for everything inside it, and marks its parents as "in use". You cannot select a group or model while someone edits something inside it, and you cannot select an object inside a group someone else has selected. Siblings stay editable side by side. Moving an object into a group, grouping, and ungrouping need every object involved and the target container to be free; otherwise the whole change is refused and nothing moves.
- **New objects** (create, duplicate, import) belong to whoever made them and stay locked for that person until they next change their selection or click empty space (Esc), so creation tools can keep editing them.
- **Live transforms.** While you drag a gizmo, your movement streams to everyone about 30 times a second. When you release, the final value is committed.
- **Undo and redo are per user.** `Ctrl+Z` only undoes your own changes. If the undo would touch an object that someone else now holds, or has changed since, it is refused and the status bar says why, for example "Cannot undo: Bob is editing an affected object". Objects an undo brings back are released right away, so others can edit them.
- **Rejected edits are reverted.** Sometimes a change cannot be applied, for example if two people race for the same object or a script edits an object you do not hold. The change is undone locally and the agreed state is restored.
- **New** and **Load** are disabled while you are in a room. Leave the room first.

## Textures

- **The owner is the only texture source.** Textures come from the owner's texture folder. When you join, your texture browser is emptied and fills with the owner's textures as your scene needs them. While you are in a room as a member, **Open folder** is refused with "Only the room owner provides textures. Leave the room to open your own folder." This keeps one source of truth: two members can never show different images for the same texture name.
- **Changing folders mid-session.** When the owner opens another folder or reloads the current one, members are told which of the textures they already received changed or disappeared (by content hash, so unchanged files are not sent again). Changed textures are downloaded again and the objects using them update; textures missing from the new folder show the checker. Transfers of old content still in flight are cancelled and never applied. Notices are sent at most every 2 seconds, so rapid switching settles on the last folder.
- Members who join later simply receive the owner's current folder. When the owner leaves, members keep the textures they received and may open their own folder again.

## Room chat

Open the chat with **Collaborate → Room chat** or the **💬 Chat** button in the status bar, which appears while you are in a room. The chat is a normal editor window: move it, resize it, or close it.

- **Live only.** The relay keeps no chat history. You see the messages sent while you are in the room. They are gone when you leave, and messages older than one hour are removed from the window automatically.
- **Look.** Messages appear at the bottom. Each group starts with a round avatar showing two letters of the sender's name in their member color, the name and the time in your own time zone. Further messages from the same person within five minutes are joined tightly below; a new sender starts a new group with a gap. Hover a message for the full date.
- **Scrolling.** The window follows new messages while you are at the bottom. If you scrolled up to read, it stays put and shows a "↓ N new messages" button instead.
- **Sending.** Enter sends; Shift+Enter starts a new line. One message every 5 seconds: until then the Send button is grayed out with a countdown and Enter does nothing. The relay enforces this too, and if it refuses a message (too fast, too long, empty), your text stays in the field with a short explanation. Messages are at most 2000 characters and 20 lines. The 😀 button opens an emoji grid that inserts at the caret.
- **Notifications.** While the window is closed, a new message shows a small notification with the sender and a preview, and the status bar button counts unread messages. Several messages in a row are merged into one notification ("3 new messages from Henry and Ann"). Click the notification or the button to open the chat.
- **Safety.** Messages are shown as plain text only. Markup such as `<script>` or `<img onerror=…>` appears as typed and never runs. The relay removes control, bidirectional override and zero-width characters, so a message cannot reorder or hide text.

## Owner disconnects and reconnecting

- If your connection drops, the editor reconnects automatically. It waits a little longer after each failed attempt and makes up to 8 attempts. Once it reconnects, it rejoins the room and loads the current room scene; changes you made while disconnected are replaced.
- If the owner's connection drops, members are warned and offered **Save locally**, so nobody loses work if the room cannot be restored.
- The **Disconnected** dialog only appears when you lose a room you were in. **Continue offline** closes it and leaves the session; **Save locally** also saves the scene. Only one such dialog is shown at a time.
- When you are only browsing rooms and the server cannot be reached, or the connection drops, there is no dialog: the rooms window says **Can't reach the collaboration server** and offers **Retry**, and the editor stays usable.

## Server address

| Where the editor runs                                                      | Default relay URL                  |
| -------------------------------------------------------------------------- | ---------------------------------- |
| Debug session on `localhost`, `127.0.0.1`, `::1` or `*.localhost`          | `wss://aiworlded.00labs.net/wsdev` |
| GitHub Pages (or any other hosted origin)                                  | `wss://aiworlded.00labs.net/ws`    |
| Desktop app (`views://` page, or the standalone updater bridge is present) | `wss://aiworlded.00labs.net/ws`    |

The choice uses the same environment detection as the updater: `src/updater/runtime_environment.ts` (`runtimeEnvironmentDetect`) checks for the desktop updater bridge (`getStandaloneUpdaterBridge`) and the page origin. `/wsdev` is the dev relay, where changes to the server are tried first; `/ws` is the live relay.

To use a different relay, open **Collaborate > Collaboration settings…** and change **Server URL**. Leave it empty to go back to the default. The setting is stored in the browser under `aiworlded.collaboration.serverUrl`. The same dialog sets the display name other members see.

## For developers

### Architecture

All collaboration code lives in `src/collaboration/`. The relay server is a separate repository, `aiworlded-server`.

| Layer   | Files                                                                                                       | Role                                                                                                                                                    |
| ------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Loader  | `loader/loader_collaboration_menu.ts`                                                                       | The only module loaded at startup. It builds the Collaborate menu and imports the controller with a dynamic `import()` the first time the menu is used. |
| Config  | `config/config_collaboration_server.ts`                                                                     | Relay URL defaults and override, display name.                                                                                                          |
| Runtime | `runtime/controller_collaboration_runtime.ts`, `runtime/runtime_collaboration_client.ts`                    | Dialogs, connection, create, join, leave, reconnect with capped backoff, owner-loss handling.                                                           |
| Net     | `net/socket_collaboration_client.ts`, `net/outbox_collaboration_bucket.ts`, `net/stream_collaboration_*.ts` | JSON request/reply over WebSocket, a token-bucket send rate, keepalive, and windowed binary streams for textures.                                       |
| Session | `session/session_collaboration_*.ts`                                                                        | One room: snapshot, edit loop, locks, per-user history, texture transfer, remote selection visuals.                                                     |
| Sync    | `sync/*.ts`                                                                                                 | Scene replica, diff tracker, revert, edit outbox, live ticker, order keys, lock table, roster.                                                          |
| Scene   | `scene/node_collaboration_*.ts`                                                                             | Maps the editor scene (meshes, groups, solid models, brushes) to wire nodes and applies remote states.                                                  |
| Chat    | `chat/*_collaboration_chat.ts`                                                                              | Room chat window (a `PanelFloating`), message list, composer with cooldown, emoji grid, notification and status bar button.                             |
| Shared  | `shared/*.ts`                                                                                               | Protocol definitions, binary frames, password and room-name policies. These are generated copies of the relay's `src/shared/` (see below).              |
| UI      | `ui/*.ts`                                                                                                   | Room browser and the create, password, and settings dialogs, plus the status chip and member list, in the PanelFloating style.                          |

Editor hooks outside `src/collaboration/`:

- `CommandStack.observerSet()` lets per-user history take over undo and redo.
- `ManagerSelection.selectionAdmissionSet()` refuses selections of objects that other members hold.
- The outliner shows remote holders. Renaming, the eye and padlock buttons, and the context menu on a row you have not selected first select that row and take its lock, then apply. When someone else holds the row, the edit is refused up front with "… is being edited by …" and nothing is applied or reverted.
- `layout_collaboration_host.ts` adapts the editor to `HostCollaborationEditor` and blocks New and Load while in a room.

Each hook is `null` until a room starts.

**Wire model.** Each scene object is one node, identified by `object.uuid`:

- a mesh or group entry;
- a solid model group;
- or a brush.

A node's state is the shallow scene-file entry (`SceneSerializer.entryBuildShallow`) plus:

- its parent;
- a fractional sibling order key;
- its lock flag;
- for solid models and brushes, their codec data.

**Diff-based sync.**

1. Every 250 ms, and right after each command, the tracker compares the scene with the agreed baselines. It uses cheap fingerprints: pose, name, visibility, geometry and attribute versions, and material.
2. Changed nodes that you hold, or that you just created, become `upsert` operations. Removed nodes that you hold become `delete` operations.
3. Changes to nodes you do not hold are restored from the baseline at once.

Because sync works by diffing the scene, every mutation path is covered, including ones that bypass the command stack, such as the MCP `editor_api` or scripts.

**Ordering.**

- The relay gives every edit a room sequence number and broadcasts edits in that order. All clients apply them in the same order, and your own edits come back as acknowledgements.
- Locks are granted by the relay, so two clients can never both hold a node.
- If the relay rejects an edit, the client reverts the changes that later edits did not replace.

**Joining.**

1. The owner sends a snapshot of the scene.
2. The joiner buffers live edits until the snapshot is applied, then replays them.
3. Texture files the scene uses are streamed from the owner on demand, four streams per member, with flow-control credit.

Rooms are isolated by the relay: messages never cross rooms.

### Presence

Presence is a separate, low-priority binary frame kind (`0xA7`, kind `2`) defined in the shared file `src/collaboration/shared/presence_frame.ts`. The code is in `src/collaboration/presence/`.

- **Frame.** Client frame: `[0xA7][2][version 1][count]` followed by up to 6 entries of 18 bytes. Each entry is an id (u8), a position (3 × f32), a rotation (smallest-three quaternion packed into a u32) and a field of view (u8 degrees; 0 marks the play-mode character). The relay inserts the sender's user id (u32) after the count. One camera is 22 bytes up and 26 bytes down; the frame size is `4 + 18n` bytes up and `8 + 18n` bytes down. A frame with 0 entries clears the sender's presence.
- **Sender** (`sender_collaboration_presence.ts`). It samples every 100 ms and sends about every 200 ms (5 Hz). Half a sample of timer slack is accepted, so a tick that fires slightly early still sends; frames never leave faster than every 150 ms. It sends only when a position moved more than 1 cm, a rotation turned more than 0.5°, a field of view changed or the set of cameras changed. Because the comparison is against the last frame actually sent, the final resting pose always goes out (trailing update). `SocketCollaborationClient.sendPresence` drops the frame unless the socket is open, no edit is queued, `bufferedAmount` is at most 1 KiB and the rate bucket allows it; nothing is ever queued. Sending starts only after the snapshot is applied.
- **Relay.** Validates the frame strictly (closing with `4001` on malformed frames), applies its own rate limit (10 frames/s, burst 20) on top of the general message limits, keeps only the latest frame per sender and recipient, delivers it only while the recipient's outbound queue is idle, hands the latest frames to a joiner after its snapshot and purges a member's presence on leave.
- **Compatibility.** The relay advertises presence with `welcome.limits.presencePerSecond`. Against older relays the editor sends neither presence frames nor the `displayName` field of `room.create`/`room.join`, which those relays would reject; the hello name still applies.
- **Receiver** (`receiver_collaboration_presence.ts`). It keeps one item per member and entry id in `SharedWorldScene.helpersRoot` (outside the world, so every pane, including detached ones, renders it). Items carry `userData.isCollaborationPresence`, have a no-op raycast and are skipped by `isEditorHelperObject` consumers. The animation loop runs only while a remote member's item is still moving, correcting or walking; network traffic is unchanged by smoothing.
- **Smoothing** (`buffer_`, `interpolation_` and `pose_collaboration_presence.ts`). Each item keeps a buffer of the last 8 poses. A pose is timestamped on arrival, snapped to the expected 200 ms send grid when it arrives within ±100 ms of it (moving half way toward the real arrival time, because a late timer on the sender delays both the pose and its arrival), so jitter and bunched packets do not show. Items render 280 ms in the past and interpolate between the two surrounding poses (linear position, slerp rotation). When packets are late or missing, the item extrapolates along the last velocity for at most 250 ms, scaled down when the member was slowing (so stops do not overshoot), holds for 300 ms and then eases back to the last received pose within 200 ms. After a silence of 600 ms the stream restarts from the held pose instead of jumping. A new pose that disagrees with what is shown is blended in over about 100 ms (exponential correction) instead of popping. Moves of more than 5 m (teleports), the first pose and entering or leaving play mode snap immediately.
- **Remote walk** (`gait_collaboration_presence.ts`). A remote character's thighs and knees swing with a phase driven by the smoothed distance travelled (1.6 m stride) and an amplitude that follows the speed (none below 0.15 m/s). It is display only; the full local locomotion and IK do not run for remote members.
- **Colors** (`sync/color_collaboration_oklch.ts`). Slot `n` uses OKLCH with hue `(100 + frac(0.52 + n·φ⁻¹)·285) mod 360` (golden-ratio steps over a hue range that skips the orange selection band), lightness cycling through 0.74, 0.64 and 0.84, and chroma 0.17 reduced by binary search until the color fits in sRGB.
- **Offline cost.** All presence code is in `src/collaboration/`, loaded with the rest of the collaboration code.

### Mutation audit

Every scene mutation needs the selection lock on the objects it changes. Selecting an object requests the lock on it and its whole subtree (see Hierarchical locks below); selecting a solid model's result mesh locks the whole model, while selecting a single brush locks only that brush. A change to an object you do not hold is restored from the agreed state within 250 ms, with the status "Select an object before changing it…". New objects are the only exception: they belong to their creator, who holds them automatically.

| Mutation path (commands)                                                                                                                                  | How it is synced                                                                                            |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Gizmo translate, rotate, scale; numeric position, rotation and scale fields; align and snap; bounds resize; hinge pose (`command_transform_*`)            | Live pose about 30 Hz while dragging, then an upsert on commit; lock required                               |
| Texture-locked transform, apply transform (`command_transform_texture_locked`, `command_object_apply_transform`)                                          | Pose, geometry and UV changes in one upsert; lock required                                                  |
| Edit mode (vertex, edge, face positions and topology), bevel, clip, extrude, split, hull (`command_component_*`, `command_mesh_clip/faces_extrude/split`) | Geometry change shows up in the fingerprint and is sent as an upsert of the encoded buffer; lock required   |
| Bevel volume create and distance (`command_modifier_bevel_*`)                                                                                             | Entry upsert of the modifier settings and geometry; lock required                                           |
| Mesh CSG (union, subtract, intersect) (`command_mesh_csg_boolean`)                                                                                        | Result mesh created (owned by its creator) and inputs deleted or changed; locks required for the inputs     |
| Solid model and terrain create (`command_solid_model_create`, `command_terrain_create`, `command_primitive_create`)                                       | New nodes, auto-locked for their creator                                                                    |
| Solid brushes: add, duplicate, delete, reorder, operation, clip, split, hull; group operation (`command_solid_*`)                                         | Brush and solid-group nodes, plus order keys; lock on the brushes or group required (added brushes are new) |
| Inverted solid world                                                                                                                                      | Solid-group upsert; model lock required                                                                     |
| Create, duplicate, paste, import (`command_object_duplicate`, scene import)                                                                               | New nodes are created and auto-locked for their creator                                                     |
| Delete (`command_object_delete`, `command_object_hierarchy_delete`)                                                                                       | Delete operation; refused and restored if the node or a descendant is held by someone else                  |
| Group and ungroup, outliner drag reparent, sibling order (`command_object_group/ungroup/reparent/objects_reparent`)                                       | Parent and order-key change; locks on the moved nodes                                                       |
| Rename (outliner, properties; `command_object_rename`)                                                                                                    | Lock required; the outliner refuses to start renaming a node held by someone else                           |
| Visibility and lock flag (outliner eye and padlock, properties; `command_object_visibility_toggle`)                                                       | Entry upsert; lock required                                                                                 |
| Materials, colors, textures, face texture maps, UV transform and smear (`command_object_color_set`, `command_texture_*`)                                  | Entry or brush upsert; textures streamed by id; lock required                                               |
| Undo and redo (`command_undo_batch` and the per-user history)                                                                                             | Per-user history; refused with a status message when the step touches objects others hold or changed        |
| New scene, Load scene                                                                                                                                     | Blocked while in a room                                                                                     |
| MCP `editor_api` tools                                                                                                                                    | Networked through `ToolsCollaborationGuard`: locks taken all-or-nothing, structured errors (see MCP below)  |
| Scripts and other stack bypasses                                                                                                                          | Caught by the diff: synced if the object is held or new, otherwise reverted                                 |
| Editor helpers (player figurine and character rig, overlays, rulers, clip previews)                                                                       | Never synced: `isEditorHelperObject` children are skipped by the node index                                 |

Objects held by others are checked with a cheap fingerprint instead of a full encode: parent, name, visibility, lock flag, pose, geometry uuid and attribute versions, material uuid, color and texture, face texture map table, brush operation and brush preview geometry, and the inverted-world flag. Held objects are fully re-encoded and compared, so nothing you change on your own selection is missed.

### Hierarchical locks

The relay does not know the scene tree, so the editor sends it (`hierarchy_collaboration_locks.ts`, `session_collaboration_locks.ts`):

- **Selection.** The selected objects and their whole subtrees are locked exclusively (`ids`); every ancestor that is not itself exclusive is locked shared (`shared`). Brush nodes use the brush id, so selecting one brush shares its solid model.
- **Relay rules.** An id can be shared by several members, but an exclusive request is refused while someone else shares it (`{id, by, shared:true}`: `by` edits something inside it), and a shared request is refused while someone else holds it exclusively. `lock.acquire` is all-or-nothing, so a refused selection changes nothing.
- **Create and reparent.** `create` and `reparent` ops carry `p`, the new parent chain. The relay rejects the edit with `lock_conflict` when another member holds any of those ids exclusively, and otherwise gives the sender shared locks on the chain.
- **Client checks first.** The outliner drag, grouping and ungrouping check the moved subtrees and the target chain before applying (`tracker_collaboration_commit.ts`, `panel_outliner.ts`), so a conflict is refused up front with "Can't edit "Group": "Cube" inside it is being edited by Bob" instead of being reverted.
- **Messages.** Selecting a container whose child is held: `Can't edit "A": "B" inside it is being edited by Bob`. Selecting inside a held container: `Can't edit "B": "A" around it is being edited by Bob`. Moving into a held container: `Can't move "B" into "A": it is being edited by Bob`. Relay rejection: "Change rejected: another member is editing an object or container it touches; reverted".
- **Deletes.** The relay releases the locks of deleted ids without telling the sender, so the sender drops them locally too (`syncCollaborationDeleted`).
- **Created objects** stay locked by their creator until the next selection change or a clear of an already empty selection (imports included), because creation tools keep editing what they made.

### MCP (AI) tools in a room

Every MCP tool that is not a known read (`editor_api_tool_kinds.ts`) runs through `ToolsCollaborationGuard` (`session_collaboration_tools.ts`) as the local user:

1. If the room is not synchronized: `{ok:false, error:'offline'}` and nothing runs.
2. The tool runs; its changes are held back and compared with the agreed state.
3. If a touched object, a deleted object, or a container a created or moved object enters is held by someone else, the changes are thrown away and the result is `{ok:false, error:'locked', object, holder, message}`, for example `"Crate" or something inside it is being edited by Bob; nothing was changed`.
4. Otherwise the touched objects nobody holds are locked all-or-nothing, the edit is sent and confirmed by the relay, and the extra locks are released. A relay rejection becomes `{ok:false, error:'rejected', message}`.
5. A `select` of a held object and an `undo`/`redo` refused because of another member also return `error:'locked'` with the holder.

The AI therefore always learns when a networked change did not happen, and why.

### Coverage matrix

Every user-facing operation is tested against the real relay with two or three clients (`runtime_collaboration_relay_coverage/import/hierarchy/mcp/live_shape/undo_steps/textures.test.ts`). Each row checks that the change syncs to everyone, that the locks are taken, that it is refused while another member holds the object, and that undo and redo work and converge.

| Operation                                                               | Syncs | Locks | Refused under conflict                 | Undo / redo                                      |
| ----------------------------------------------------------------------- | ----- | ----- | -------------------------------------- | ------------------------------------------------ |
| Rename, visibility, lock flag, material color                           | yes   | yes   | yes                                    | yes; redo refused while held                     |
| Transform                                                               | yes   | yes   | yes                                    | yes; redo refused while held                     |
| Edit mode vertex move (mesh document path)                              | yes   | yes   | yes                                    | yes; redo refused while held                     |
| Face texture map (UV)                                                   | yes   | yes   | yes                                    | yes; redo refused while held                     |
| Group, ungroup                                                          | yes   | yes   | yes, also for a held child             | yes; redo refused while held                     |
| Outliner drag reparent, reorder                                         | yes   | yes   | yes, also for a held target or child   | yes; redo refused while held                     |
| Duplicate                                                               | yes   | new   | source must be selectable              | yes; redo needs no lock (creation)               |
| Clip, mesh CSG                                                          | yes   | yes   | yes                                    | yes; redo refused while held                     |
| Solid brush operation                                                   | yes   | yes   | yes                                    | yes; redo refused while held                     |
| VMF import, OBJ import                                                  | yes   | new   | others refused until importer moves on | yes; undo refused while someone holds the import |
| Selecting a container with a held child, or a child of a held container | n/a   | yes   | yes, with the child's name             | n/a                                              |
| MCP tools (create, move, rename, delete, select, undo)                  | yes   | yes   | `error:'locked'` with holder           | MCP undo refused while held                      |
| Rotate, scale (gizmo and numeric fields)                                | yes   | yes   | yes                                    | yes; one undo step per numeric commit            |
| Delete                                                                  | yes   | yes   | yes, also for a held descendant        | yes; redo refused while held                     |
| Bevel volume create and distance                                        | yes   | new   | parent must be free                    | yes; redo refused while held                     |
| Brush Edit Mode vertex / face drag (live shape)                         | yes   | yes   | yes                                    | yes; brush, selection and overlay kept           |
| Drag cancelled, member leaves mid-drag                                  | yes   | freed | n/a                                    | receivers drop the preview                       |
| Member joins mid-drag                                                   | yes   | yes   | n/a                                    | joiner gets the committed state, then the drag   |
| Owner changes the texture folder                                        | yes   | n/a   | owner only                             | n/a; members re-fetch changed textures           |

**Tool audit.** Every viewport tool was checked for three things: acting on an object the user does not hold, keeping a stale copy of other objects' geometry, and what happens when the tool's target is removed by another member. Held objects cannot be changed or deleted by others (the relay refuses it), so a tool that works only on the selection is safe while it runs.

| Tool                                                 | Acts on                             | In a room                                                                                                             | Other objects' geometry                                       |
| ---------------------------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Move, rotate, scale gizmo, bounds gizmo, modal G/R/S | selection                           | held                                                                                                                  | snap reads the live scene                                     |
| Vertex / edge / face snap while dragging             | selection                           | held                                                                                                                  | held target dropped after any remote change (no ghost snap)   |
| Hinge, face align, face seat                         | the clicked brush or object (fixed) | the click selects the source first; refused with the holder's name if someone else has it                             | target cache rebuilt after any remote change                  |
| Face mode: pick, texture, UV slide, smear, extrude   | the picked faces (fixed)            | picking a face selects its object (a solid result locks the model); refused faces stay unpicked                       | face list refreshed and stale picks pruned after remote edits |
| Edit mode (select, move, loop cut, edge cut, merge)  | the mesh in edit mode               | needs the lock to enter; selection locked while active                                                                | component snap as above                                       |
| Clip plane, CSG, hull, bridge, duplicate             | selection                           | held; clip ends when the selection changes                                                                            | none                                                          |
| Primitive creation, terrain, import                  | new objects                         | parent must be free                                                                                                   | placement raycasts the live scene                             |
| Grid align pickers (face, edge, vertex origin)       | the local grid only                 | read only, not networked                                                                                              | live raycast per click                                        |
| CAD rulers, measure overlays                         | selection                           | read only                                                                                                             | refreshed on selection change                                 |
| Outliner row toggles (visibility, lock, rename)      | the row                             | the row is selected first and the edit runs only if the lock is granted                                               | none                                                          |
| Outliner row click, Shift/Ctrl add (fixed)           | the rows                            | a refused click leaves the previous rows highlighted, so the outliner never shows a row as yours that you do not hold | none                                                          |

Decision: tools that used to act on whatever was under the pointer now act on the selection. Offline the click simply selects the object, so the workflow is unchanged; in a room the selection takes the locks all-or-nothing through the normal admission and shows the standard refusal message. Remote edits bump a scene revision (`snap_scene_revision.ts`) from the same apply path that rebuilds the solid models, and the snap and align caches compare it before each query. Tests: `snap_drag_hold.test.ts` (remote move and delete mid-drag), `snap_align_claim.test.ts`, `face_selection_claim.test.ts`, `outliner_admission_selection.test.ts`.

Not available in a room, by design or because the editor has no such feature:

- **New** and **Load** are blocked ("Leave the online room before replacing the scene").
- The editor has no drag-and-drop file import, no object paste (only duplicate), and no world settings or layers, so there is nothing to network for them.

**Concurrent creates.** Sibling order is (order key, id). Two members that add an object at the end of the same list at the same moment produce the same key; the id breaks the tie and both keep their keys, so every client shows the same order without re-keying back and forth.

### Keeping shared code in sync

The relay and the editor share the protocol and policy modules. Treat the relay's `src/shared/` as the source of truth. Do not edit the copies in `src/collaboration/shared/`. Instead, regenerate them:

```bash
bun run collab:shared:sync                              # copy from ../aiworlded-server
AIWORLDED_SERVER_DIR=/path/to/aiworlded-server bun run collab:shared:sync
bun run collab:shared:check                             # fail (exit 1) when a copy is stale
```

The script rewrites import extensions, adds the generated-file header, and formats the copies with the editor's Prettier settings.

### Running a local relay

Debug sessions use the hosted dev relay (`wss://aiworlded.00labs.net/wsdev`) by default, so no local relay is needed. To use a relay of your own, start it from the `aiworlded-server` checkout (for example on port 8081 with a development-only `FORWARDED_SECRET` and the `http://localhost:5179` origin allowed), then set **Collaborate > Collaboration settings… > Server URL** to `ws://127.0.0.1:8081/ws`. The tests take the relay from `AIWORLDED_COLLAB_URL`.

### Offline cost

- The startup bundle contains only the Collaborate menu stub and the URL config.
- The controller, sockets, dialogs, and sync engine are loaded with a dynamic `import()`.
  - The production build sets `inlineDynamicImports: true` so that GitHub Pages serves a single `index.js`. The collaboration code is therefore inside that file, but wrapped in a lazy module initializer. None of it is evaluated until the Collaborate menu is first used.
  - Dev servers and builds without `inlineDynamicImports` fetch it as a separate chunk.
- Offline, the editor's hot paths pay one `null` check each:
  - `CommandStack` observer;
  - selection admission;
  - outliner remote holders.
- `tests/collaboration/loader/loader_collaboration_offline.test.ts` enforces this:
  - no module outside `src/collaboration/` value-imports collaboration code except the loader and the config;
  - building the menu does not import the runtime or open a socket;
  - offline undo, redo, and selection behave as before.
- `bunx vitest bench --run tests/collaboration/loader` measures the command stack with and without an observer. The two results were within noise of each other: about 73k and 76k push-and-clear ops/s.

### Tests

| Command               | Covers                                                                                                                                                           |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun run testrun`     | Everything. The relay integration tests are skipped unless `AIWORLDED_COLLAB_URL` is set (they then also skip when that relay does not answer).                  |
| `bun run test:collab` | Collaboration only, against the dev relay `wss://aiworlded.00labs.net/wsdev` (or `AIWORLDED_COLLAB_URL`). The relay must answer (`AIWORLDED_COLLAB_REQUIRED=1`). |

- **Unit tests** (`tests/collaboration/**`): config, policies, order keys, lock table, roster colors, history, state parsing, selection admission, outbox and streams, socket client, error texts, replica round trips, and one test per mutation type. Each mutation type is tested in three ways:
  - synced under the lock;
  - reverted while someone else holds the object;
  - concurrent edits by two members.
- **Integration tests** (`tests/collaboration/runtime/*relay*.test.ts`) run several editor harnesses against the real relay, in up to two rooms with three or four members each. They cover:
  - snapshots and late joiners;
  - live and committed transforms;
  - creates, deletes, duplicates, groups and reparenting;
  - rename under the lock, and rename without it being reverted;
  - material, visibility, vertex and face texture edits;
  - three members editing every mutation category at the same time (transform, color, visibility, rename, create, vertex, face UV, group, duplicate, brush move, brush operation, brush add, delete) and converging to the same scene and sibling order;
  - ten rapid rounds of concurrent edits;
  - lock refusal naming the holder, a four-member lock race with exactly one winner, and hand-over on release;
  - per-user undo, undo refused while someone else holds the object, and rejected edits;
  - owner loss (offline warning, scene kept), private passwords and reconnects;
  - two busy rooms editing at once without seeing each other's changes, members or locks;
  - the coverage matrix above, VMF and OBJ import, hierarchical lock conflicts and MCP structured errors;
  - presence: a joiner receives the latest camera pose, follows its movement, sees a play-mode member as a character instead of a camera, and loses the presence when the member leaves. These tests are skipped when the relay does not advertise presence.
- **Chat unit tests** (`tests/collaboration/chat/`): message parsing, ordering, grouping, the message cap and the one-hour expiry, follow-at-bottom versus the new messages button, the cooldown (Enter and Send blocked, relay retry time), refusal texts, notification merging, the emoji insert at the caret, and rendering of `<script>`, `<img onerror>`, RTL override and zero-width text as plain text.
- **Chat integration tests** (`tests/collaboration/runtime/runtime_collaboration_relay_chat.test.ts`): welcome limits, `Henry` / `henry2` numbering and shortening, delivery with cleaned text, the rate limit with its retry time, invalid messages and room isolation.
- **Presence unit tests** (`tests/collaboration/presence/`): throttle and deadband, interpolation, the sender's rate and frame size, receiver helper flags, colors, removal, the tinted character copy, and frustum geometry.

### Manual multi-tab test

1. Start the dev server on `:5179` (it uses the `/wsdev` relay). Open four tabs at `http://localhost:5179`.
2. **Tab A:** use **Collaborate > Collaboration settings…** to set the name to "Alice". Then **Create room…**, name it "Room 1", Public. Add a few cubes and a solid model first.
3. **Tab B:** set the name to "Bob", then **Browse rooms…** and **Join** "Room 1". Confirm the discard prompt. Bob should see Alice's scene, including textures.
4. **Tab C:** set the name to "Carol" and create "Room 2" as Private. Copy the password.
5. **Tab D:** set the name to "Dave" and join "Room 2" with the password. A wrong password must fail with "Wrong password."
6. In **A**, select a cube.
   - In **B**, the cube shows Alice's color in all viewports and in the outliner. Clicking it in B says "… is being edited by Alice".
   - Drag the gizmo in A. B follows smoothly while you drag and ends at the same values after you release.
7. In **B**, select another object. Then do each of the following in turn, and check after each one that A matches B:
   - rename it;
   - change its color or texture;
   - edit vertices in edit mode;
   - group it;
   - reparent it in the outliner;
   - duplicate it;
   - delete the duplicate.
8. Run CSG and brush edits in A on a solid model. B must match.
9. Press `Ctrl+Z` in B. Only Bob's own changes are undone. Then:
   - Select one of Bob's earlier objects in A.
   - Press `Ctrl+Z` in B. The undo is refused with a status message.
10. **Isolation:** make edits in C and D. Rooms 1 and 2 never see each other's changes, members, or locks.
11. **Reconnect:** a member whose connection drops shows **Reconnecting…**, rejoins the same room, and receives the current room scene. Any changes made while it was disconnected are replaced. This is covered by the relay integration tests. The relay keeps rooms in memory, so if you restart the relay process itself, every tab reconnects to the server but the rooms are gone, and members see **Could not rejoin the room**.
12. **Owner loss:** close tab A. B shows the owner-disconnect warning with **Save locally**.
13. **Leave:** in D, choose **Collaborate > Leave room**. Carol's member list updates.
14. **Presence:** in A and B, orbit the 3D viewport. Each tab shows the other's camera as a frustum in the member's color with a name tag, following within a fraction of a second. Open a detached viewport; the gizmos show there too. Enter play mode in B: A sees a tinted character with Bob's name tag instead of the camera. Leave in B: the character and camera disappear in A.
