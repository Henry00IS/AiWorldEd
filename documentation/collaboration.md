# Collaboration

AiWorldEd can share a scene with other people in real time. Everyone in a room edits the same world at the same time, much like a shared spreadsheet: selections never block anyone, and only an edit that is running right now (a drag, a multi-click tool, Edit Mode) briefly protects its objects.

Collaboration is **optional**, but the editor is always online: it connects to the relay on startup (browser and desktop) and reconnects in the background whenever the connection drops, so rooms, chat and MCP public links are ready. This one connection is shared by browsing, rooms, chat and transfer links. See [Connection](#connection) for the retry rules, **Disconnect** / **Connect** and the settings. The collaboration code is loaded in the background after the editor has started (see [Offline cost](#offline-cost)).

## Quick start

1. Open **Collaborate > Create Room…**, enter **Your name** (up to 12 characters, remembered in the browser), pick a room name (up to 128 characters; the suggestion is "Henry's room", "James' room" for a name ending in s, or "My room" without a name), and choose **Public** or **Private**. A private room gets a strong generated password. Use **New** to make another one, **Show** to reveal it, and **Copy** to copy it. The dialog checks the name and password as you type. The password is a plain text field masked with CSS, not a browser password field, so browsers and password managers do not offer to save it; the field only exists while **Private** is selected.
2. Your current scene becomes the room scene. You are the room **owner**.
3. Others open **Collaborate > Browse Rooms…**, choose your room, and select **Join**. The room browser updates live while it is open (rooms appear, close and change their member count without a refresh) and has a search box that filters by room name and owner name as you type. A room whose name does not contain its owner's name is shown as "<owner>'s <room name>" (for example "Henry's Awesome room", or "Slanders' Awesome room" for a name ending in s); this is display only, the room keeps its name. The join dialog asks for your name (prefilled from last time) and, for a private room, the password.
4. Before joining, the editor asks you to confirm **Discard local work?**, because the room scene replaces whatever you have open. Save first (**File > Save**) if you want to keep it.
5. To leave, use **Collaborate > Leave Room**. If the owner leaves, the room ends and you choose how to keep your copy of the scene (see [Owner disconnects](#owner-disconnects-and-reconnecting)).

The status chip in the status bar (styled like the other status bar labels) shows the connection state. The states are Offline, Connecting, Online, Joining, Synchronizing, Room, and Reconnecting; the chip is there from startup. Online also shows how many editors are connected to the relay worldwide (for example "Online · 15 Worldwide 🌐"); relays with the `stats` capability send it in the welcome and then at most every 5 seconds when it changes. When you are in a room, the chip also shows one colored dot per member (your own dot has a white ring; hover a dot for the name), and selecting the chip opens the member list. Every member has a color, chosen so that it never looks like the editor's orange selection color.

## Names, colors and presence

- **Names** are at most 12 characters. Leave the field empty to get a relay-assigned name such as `User 7`. The name is stored in the browser under `aiworlded.collaboration.displayName`.
- **Unique in a room.** When someone in the room already uses your name (ignoring upper and lower case), the relay adds a number: `Henry`, `Henry2`, `Henry3`, … A name that would grow past 12 characters is shortened first (`HenryHenryHe` → `HenryHenryH2`).
- **Fixed while in a room.** The name you joined with stays until you leave. The relay refuses renames inside a room, and the name field in Collaboration Settings is read-only there.
- **Colors.** The relay gives every member the lowest color slot that is free in the room, so the members present at the same time never share a color. Each slot maps to a fixed color, which is used for the member dot, the selection and edit outlines, the camera gizmo and the character tint.
- **Cameras.** Each other member's 3D (perspective) viewport camera is drawn as a small camera frustum in their color, pointing where they look, with a name tag above it. Gizmos keep a minimum on-screen size and are drawn in every viewport, including detached ones. In each viewport a camera gizmo and its name tag fade out as they get close to that viewport's camera (hidden within 0.5 m, fully shown beyond 2 m), so a member whose camera sits at or near yours never tints your view. They are not part of the scene: they cannot be selected, are never saved and do not affect CSG.
- **Play mode.** A member who is playing appears as a copy of the player character tinted in their color, with a name tag above the head, instead of their play camera. The copy swings its legs in a simple walk cycle while it moves and stands in its rest pose when it stops.
- **Tennis balls.** In play mode, a left click throws a tennis ball in your color. Your editor simulates your balls and everyone else shows them a quarter second in the past. See [Play mode physics](navigation.md#play-mode-physics).
- **Bonus data only.** Presence is sent at most 5 times a second, only when something moved, and it is dropped rather than queued whenever edits are being sent. It can lag or skip a beat without affecting editing.

## Editing rules

AiWorldEd follows the Google Sheets model: everyone can look at, select and change everything, and only an edit that is running right now is protected.

- **Selecting never locks.** Several members can select the same object. Other members' selections are drawn as outlines in their color with their name, in every viewport and in the outliner. A member who is editing an object right now (holds its edit lease, see below) is drawn with a fully opaque outline drawn on top and the tag "Bob · editing"; in the outliner a selected row gets a thin marker in the member's color and an edited row a full colored row.
- **An edit takes a short lease.** Dragging a gizmo, running a multi-click tool (hinge, face align and seat, vertex snap, bevel) or entering Edit Mode asks the relay for a lease on the objects being edited. It covers the object and everything inside it, and marks its containers as "in use". The lease ends when you release the mouse, finish or cancel the tool, or leave Edit Mode. If your editor stops answering (closed laptop, lost connection, frozen tab), the lease ends about 5 seconds later and everyone else sees the object go back to its last committed state.
- **Everything else is a one-shot edit.** Renaming, visibility, the padlock flag, colors, materials, textures and UVs, reparenting in the outliner, grouping and deleting need no lease. They apply immediately and are sent to everyone. When two members change the same field at the same moment, the one that reaches the relay last wins; different fields of the same object both survive (Bob's rename and Alice's color change on the same cube are both kept).
- **Only a running edit blocks.** A one-shot edit is refused only while another member's lease covers the object, its contents or (for a move) the target container. The status bar names the holder: "Can't edit Crate yet: Bob is editing it; try again when they are done". If you are still holding the mouse button, the editor tries again by itself the moment Bob finishes.
- **Moves and renames follow the object.** Edits are addressed by object id, not by path, so a color change still lands on the cube after someone else dragged it into another group.
- **Deleted objects.** An edit of an object someone else deleted is dropped with a notice ("Your change to Crate was dropped: Bob deleted it"). You cannot delete an object while someone else is dragging it or something inside it.
- **Undo and redo are per user.** `Ctrl+Z` undoes only your own changes, field by field: it puts back the values you changed and leaves fields others changed after you alone where you did not touch them. If an object you changed was deleted by someone else, that part of the undo is skipped with a notice ("skipped Crate: another member deleted it"); undo never brings back objects another member deleted. An undo that would touch an object under someone else's running edit is refused and names them.
- **One operation at a time.** A member holds at most one lease. Starting a new drag replaces the previous one. Editing objects outside the running lease while it runs is refused, and sending far more edits than a person can make throttles and finally disconnects the sender (see [Abuse detection](#abuse-detection)).
- **When an edit is refused or lost** the tool is cancelled cleanly: the preview snaps back, the selection stays, and a short message says why ("Your edit of Crate timed out and was reverted; try again", "Too many operations at once; wait a moment and try again").
- **New** and **Load…** are disabled while you are in a room. Leave the room first.

### Compared with Google Sheets

| Situation                                                        | Google Sheets                                    | AiWorldEd                                                                                              |
| ---------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Two people select the same cell or object                        | Both see each other's colored outline and name   | Same                                                                                                   |
| Two people type into the same cell                               | Last committed value wins                        | Same, per field, in relay order                                                                        |
| One moves cells while another is still typing a formula into one | The formula follows the cell to its new place    | The pending edit is addressed by id and lands on the object in its new place                           |
| One deletes a row another is editing                             | The other's edit is lost                         | The edit is dropped with a notice naming who deleted it                                                |
| Undo                                                             | Per user                                         | Per user, field-level, never resurrects another member's delete                                        |
| Continuous operation (dragging a range)                          | Not protected; the result is whatever lands last | Protected by a 5-second lease, because tools such as hinge and vertex snap read the geometry they edit |
| Someone disappears mid-edit                                      | Their uncommitted text is lost                   | Their lease expires after about 5 s and the preview is reverted for everyone                           |

## Textures

- **The owner's project is the room's texture source.** Textures come from the owner's [project folder](project_folder.md). When you join, your texture browser is emptied and lists every texture the owner offers, and the Project panel shows the owner's project read-only. While you are in a room as a member, opening your own project or texture folder is refused with "Only the room owner provides textures. Leave the room to open your own folder." This keeps one source of truth: two members can never show different images for the same texture.
- **Members get textures and curves only.** The owner's scenes, models and autosaves never leave the owner's computer; only images and saved curves (see [Curves](#curves)) are sent, and only to members of the room.
- **Live from disk.** When the owner pastes, changes, renames or deletes an image in the project folder (in the editor or outside it, for example in a file manager), every member sees it within a few seconds: new textures appear in the browser, changed ones update on every object, removed ones show the pink missing checker (their paths stay in the scene). Members download textures in the background a few at a time, so they are ready before anyone applies them. [Embedded textures](project_folder.md#imported-textures) of the owner's level, which are identified by content hash (`embedded:<sha256>.<ext>`), show the names the owner imported them under (for example `cardboard.png`) in the Texture Browser and the Project panel; members treat these names as plain text, drop control characters and cut them at 120 characters.
- **Bulk changes.** Copying hundreds of files at once is sent as one update, at most every 2 seconds. Members fetch the images in parallel within the relay's rate limits; 500 new textures reach two members in under a minute.
- **Changing projects mid-session.** When the owner opens another project, members are told which textures changed or disappeared (by content hash, so unchanged files are not sent again). Transfers of old content still in flight are cancelled and never applied.
- Members who join later simply receive the owner's current textures. The owner's textures only live for the session: when you leave or the room ends they are dropped, nothing stays behind on your computer, and objects keep their texture paths, shown as [missing textures](project_folder.md#missing-textures) until those files are in your own project. Your own project folder comes back.
- A member keeps at most 4096 distinct textures per room session.
- **Members cannot add textures to a room.** The editor offers no way to send a texture to the owner, and the owner ignores any texture or snapshot transfer a member tries to start. When a member imports a GLB or FBX model in a room, its embedded and referenced images are not stored or sent, and the faces show the pink missing checker. An embedded image is referenced by the id the owner's import of the same image gives (`embedded:<sha256>.<ext>`), and so is an image file the model names when the member can read it from their own open project folder (only its hash is used; the image stays with the member). The faces update by themselves for the owner and every member, the member who imported the model included, without reloading or importing again, once the owner has the same bytes: by importing the same model, or as any image file in the project (for example `props/crate.png`). An image file the member cannot read is referenced by its file name (for example `sign.png`): it resolves once the owner's project has exactly one texture of that name, a file anywhere in the project or an embedded texture imported under that name. Share such images with the owner another way (for example in chat).
- **Chat files never land on disk by themselves.** A file sent in chat stays a download link until somebody explicitly downloads or saves it.

## Curves

- **The owner's saved curves are shared live.** Curves saved in the owner's `AiWorldEd/Curves` folder reach every member and update when the owner saves, changes or deletes one (also outside the editor). In the Project panel a member sees the virtual **Curves** item with two folders: **Remote** (the owner's curves) and **Local** (the member's own `AiWorldEd/Curves`, from the project put away while in the room). The owner sees the project's curves directly under **Curves**.
- **Remote is read-only for every member, editors included.** Members browse and load Remote curves; nothing a member sends can write into the owner's project, and the owner ignores any curve message from a member except a request for the list, which it answers only by sending that member its shared list (at most every two seconds and ten times per member). A member asks for the list as soon as it is in the room, again after a reconnect, and again while no list arrived, so a member who joins while the owner has many curves always gets them all. The owner answers at once from memory, also while it is still sharing other changes. In the curve editor, **Load** offers Remote and Local, while **Save** always goes to Local (Remote is not offered). An existing curve of the same name is only replaced after a **Yes** in the **Overwrite Curve?** question.
- **Copy from Remote to Local.** Drag a Remote curve tile onto the Local folder, or right-click it and choose **Copy to Local**. Copies ask before overwriting too. Nothing copies or drops onto Remote.
- Curves larger than 64 KB are not shared. Remote curves live only for the session; copy them to Local to keep them.

## Snapshots and restoring the scene

The room owner can set the whole room back to an earlier state, for example after someone deleted half the level by accident or on purpose.

- **The room is saved automatically.** Room saves appear in [Level History](project_folder.md#level-history) as **Collaborative Room**, beside the level saves. Every member's editor makes a snapshot into its own Level History once the room is fully joined (the room's scene is loaded), and another one on every **Ctrl+S** or **Save As**. The owner's editor also saves every 5 minutes while something changes and right before another member makes a large change (20 or more deletions, or a quarter of the scene, at most every 30 seconds). Those saves are autosaves, or a snapshot when 30 minutes passed since the last snapshot. The rules of levels apply: the newest 4 autosaves of each room, snapshots for 14 days, starred saves forever. With a writable project folder open, the saves are written into `AiWorldEd/.Local/History/` and survive a browser crash; otherwise they are kept in memory for the room session.
- **Restore.** Choose **Collaborate → Level History…**. Only the owner can restore a save of the room: pick **Restore** on a save of the room, or double-click it; it applies at once for everyone, after the room's unsaved changes are saved.
- **For everyone, as one step.** The restore is sent as one edit under a single edit lease, so every member sees the scene change. It is one undo step: **Ctrl+Z** on the owner's editor undoes the whole restore.
- **Objects in use are kept.** Objects another member is editing right now (their running edit lease covers them), and objects inside a group someone is editing, are left as they are. The owner is told how many objects were skipped and who holds them. Restore again once they are released.
- Snapshots contain the scene only, not the textures, which stay in the owner's project.

## Room chat

Open the chat with **Collaborate → Room Chat** or the **💬 Chat** button in the status bar, which appears while you are in a room. The chat is a normal editor window: move it, resize it, or close it.

- **Live only.** The relay keeps no chat history. You see the messages sent while you are in the room. They are gone when you leave, and messages older than one hour are removed from the window automatically.
- **Look.** Messages appear at the bottom. Each group starts with a round avatar showing two letters of the sender's name in their member color, the name and the time in your own time zone. Further messages from the same person within five minutes are joined tightly below; a new sender starts a new group with a gap. Hover a message for the full date.
- **Scrolling.** The window follows new messages while you are at the bottom. If you scrolled up to read, it stays put and shows a "↓ N new messages" button instead.
- **Sending.** Enter sends; Shift+Enter starts a new line. One message every 5 seconds: until then the Send button is grayed out with a countdown and Enter does nothing. The relay enforces this too, and if it refuses a message (too fast, too long, empty), your text stays in the field with a short explanation. Messages are at most 2000 characters and 20 lines. The 😀 button opens an emoji grid that inserts at the caret.
- **Notifications.** While the window is closed, a new message shows a small notification with the sender and a preview, and the status bar button counts unread messages. Several messages in a row are merged into one notification ("3 new messages from Henry and Ann"). Click the notification or the button to open the chat.
- **Safety.** Messages are shown as plain text only. Markup such as `<script>` or `<img onerror=…>` appears as typed and never runs. The relay removes control, bidirectional override and zero-width characters, so a message cannot reorder or hide text.
- **Sharing files.** The 📎 button picks a file; downloads are limited to 100 MiB. It never leaves your computer until someone downloads it: the editor keeps it in memory and the relay streams it from you on demand through a link `https://<relay>/ws/transfer/<id>` (or `/wsdev/…`). Images and videos are shown in the chat (hover for download and copy link buttons); other files show a box with the name, size, **COPY LINK** and **DOWNLOAD**. A link stops working when you disconnect or lose the connection, or after one hour, and the chat then shows the file as no longer available. The relay checks the size only when someone downloads the file, because it cannot trust the sender: a file over 100 MiB never disconnects you, the link answers a page saying **This file exceeds the 100 MiB limit.**, and the chat card shows the same text instead of the preview. **DOWNLOAD** asks the relay first (a `HEAD` request) and only then starts the download in the same tab; when the file is too large or gone it only shows the reason in the card and opens nothing. Opening a link shows images, videos, audio and PDFs in the browser (videos can seek); other files download, and **DOWNLOAD** always downloads. One file every 5 seconds. The relay cleans the file name and type before anyone downloads it.

## Connection

- **Always online.** The editor connects on startup and stays connected. When the connection drops, or fails to open, it tries again at once and then at most once every 5 seconds (plus up to 0.4 s of random delay, so many editors do not retry in step); there is no growing backoff. The window's `online` event and waking a hidden tab bring a waiting retry forward, still never more than one attempt per 5 seconds. Between attempts the chip shows **Offline**, during one **Connecting...**.
- **Collaborate > Disconnect** is the only way to go fully offline. In a room it first asks to leave it, like **Leave Room** (an owner then gets the **Save** / **Continue** dialog). Offline, everything in the Collaborate menu is grayed out except **Collaboration Settings...**, and the item reads **Connect**. Nothing reconnects until you choose **Connect** or save the settings. The choice is stored in `localStorage` (`aiworlded.collaboration.offline`), so an editor you disconnected also starts offline; an editor that was never disconnected starts online.
- **Collaboration Settings** are grayed out (and refuse to open) while you are in a room, so the relay never changes under a room. Saving them outside a room drops the connection and connects again at once with the new URL and name; this also ends a manual Disconnect. Events of the old connection are ignored, so quick repeated changes end on the last URL with one socket.

## Owner disconnects and reconnecting

- If your connection drops in a room, the editor reconnects automatically, with the 5 second cooldown, and makes up to 8 attempts. Once it reconnects, it rejoins the room and loads the current room scene; changes you made while disconnected are replaced. After 8 failed attempts the room is lost, and the editor keeps reconnecting in the background as in the lobby.
- **When the owner leaves or the room closes**, every member keeps their copy of the scene; it is never discarded, and the editor stays online. One dialog offers **Save** (saves the scene locally) and **Continue** (keeps it open unsaved).
- The **Disconnected** dialog appears when you lose a room you were in, including the owner whose own connection drops. It offers the same **Save** and **Continue**. Only one such dialog is shown at a time, even when several reasons arrive together.
- When you are not in a room and the server cannot be reached, or the connection drops, there is no dialog and the editor keeps reconnecting in the background: the rooms window says **Cannot reach the relay at …** (with the address) and offers **Retry**, and the editor stays usable.
- When a relay refuses the editor, the message says why instead of showing a close code, once per kind of refusal. A refusal that retrying cannot fix (4009 origin, 4010 forwarding secret, 4008 protocol version) stops the retries; the menu then offers **Connect** to try again after the relay or the settings were fixed. A connection limit (4011) or a full relay (4005) can clear on its own, so the editor retries every 5 seconds without showing the message again:

  | Close code | Message                                                                                                                         |
  | ---------- | ------------------------------------------------------------------------------------------------------------------------------- |
  | 4009       | This relay doesn't allow editors from _this page's origin_. Ask its admin to add it to `ALLOWED_ORIGINS`.                       |
  | 4010       | The relay's reverse proxy sent the wrong forwarding secret; the admin must check `FORWARDED_SECRET`.                            |
  | 4011       | Too many connections from your address.                                                                                         |
  | 4005       | The relay is full (it reached its connection limit).                                                                            |
  | 1006       | Before the socket opened: cannot reach the relay at _URL_; check the address, that it runs and that its certificate is trusted. |

## Server address

| Where the editor runs                                                      | Default relay URL                  |
| -------------------------------------------------------------------------- | ---------------------------------- |
| Debug session on `localhost`, `127.0.0.1`, `::1` or `*.localhost`          | `wss://aiworlded.00labs.net/wsdev` |
| GitHub Pages (or any other hosted origin)                                  | `wss://aiworlded.00labs.net/ws`    |
| Desktop app (`views://` page, or the standalone updater bridge is present) | `wss://aiworlded.00labs.net/ws`    |

The choice uses the same environment detection as the updater: `src/updater/runtime_environment.ts` (`runtimeEnvironmentDetect`) checks for the desktop updater bridge (`getStandaloneUpdaterBridge`) and the page origin. `/wsdev` is the dev relay, where changes to the server are tried first; `/ws` is the live relay.

To use a different relay, open **Collaborate > Collaboration Settings…** and change **Server URL**. Leave it empty to go back to the default. The setting is stored in the browser under `aiworlded.collaboration.serverUrl`. The same dialog sets the display name other members see.

### Self-hosted relays

- **Link.** Add `?relay=` to the editor address to use another relay for that page load, without changing the saved setting, for example `https://<editor address>/?relay=wss://relay.example.com`. Only `ws://` and `wss://` URLs are accepted; anything else is ignored. The link wins over the saved Server URL.
- **Build.** `VITE_COLLABORATION_SERVER_URL=wss://relay.example.com bun run build` makes that relay the default of the build (the saved Server URL and `?relay=` still override it).
- The relay must allow the editor's origin (`ALLOWED_ORIGINS` on the relay); see the relay's `docs/SELF_HOSTING.md`.

Order: `?relay=` link, then the saved Server URL, then `VITE_COLLABORATION_SERVER_URL`, then the defaults above.

## For developers

### Architecture

All collaboration code lives in `src/collaboration/`. The relay server is a separate repository, `aiworlded-server`.

| Layer   | Files                                                                                                       | Role                                                                                                                                                    |
| ------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Loader  | `loader/loader_collaboration_menu.ts`                                                                       | The only module loaded at startup. It builds the Collaborate menu and imports the controller with a dynamic `import()` the first time the menu is used. |
| Config  | `config/config_collaboration_server.ts`, `config/config_collaboration_url_source.ts`                        | Relay URL defaults, `?relay=` link, build override, saved override, display name.                                                                       |
| Runtime | `runtime/controller_collaboration_runtime.ts`, `runtime/runtime_collaboration_client.ts`                    | Dialogs, connection, create, join, leave, always-online reconnect with a 5 s cooldown, owner-loss handling.                                             |
| Net     | `net/socket_collaboration_client.ts`, `net/outbox_collaboration_bucket.ts`, `net/stream_collaboration_*.ts` | JSON request/reply over WebSocket, a token-bucket send rate, keepalive, and windowed binary streams for textures.                                       |
| Session | `session/session_collaboration_*.ts`                                                                        | One room: snapshot, edit loop, locks, per-user history, texture transfer, remote selection visuals.                                                     |
| Sync    | `sync/*.ts`                                                                                                 | Scene replica, diff tracker, revert, edit outbox, live ticker, order keys, lock table, roster.                                                          |
| Scene   | `scene/node_collaboration_*.ts`                                                                             | Maps the editor scene (meshes, groups, solid models, brushes) to wire nodes and applies remote states.                                                  |
| Chat    | `chat/*_collaboration_chat.ts`                                                                              | Room chat window (a `PanelFloating`), message list, composer with cooldown, emoji grid, notification and status bar button.                             |
| Shared  | `shared/*.ts`                                                                                               | Protocol definitions, binary frames, password and room-name policies. These are generated copies of the relay's `src/shared/` (see below).              |
| UI      | `ui/*.ts`                                                                                                   | Room browser and the create, password, and settings dialogs, plus the status chip and member list, in the PanelFloating style.                          |

Editor hooks outside `src/collaboration/`:

- `CommandStack.observerSet()` lets per-user history take over undo and redo.
- `ManagerSelection.selectionAdmissionSet()` only refuses selections before the room is synchronized; other members never block a selection.
- The outliner shows other members' selections and running edits. Renaming, the eye and padlock buttons, drag reparent and the context menu are one-shot edits; while someone else's lease covers the row they are refused up front with "Can't edit X yet: Bob is editing it" and nothing is applied or reverted.
- `HostCollaborationEditor.operationRunning()` and `operationCancel()` let the session hold the lease for a single-use tool or Edit Mode and cancel a tool whose lease was refused or lost.
- `layout_collaboration_host.ts` adapts the editor to `HostCollaborationEditor` and blocks New and Load while in a room.

Each hook is `null` until a room starts.

**Wire model.** Each scene object is one node, identified by `object.uuid`:

- a mesh or group entry;
- a solid model group;
- or a brush.

A node's state is the shallow scene-file entry (`SceneSerializer.entryBuildShallow`) plus:

- its parent;
- a fractional sibling order key;
- its padlock flag;
- for solid models and brushes, their codec data.

**Diff-based sync.**

1. Every 250 ms, and right after each command, the tracker compares the scene with the agreed baselines. It uses cheap fingerprints: pose, name, visibility, geometry and attribute versions, and material.
2. Changed nodes become field-level `property`, `texture`, `reparent` or `create` operations; removed nodes become `delete` operations. During a running operation they carry its `lease`.
3. Changes to nodes under another member's lease are restored from the baseline at once.

Because sync works by diffing the scene, every mutation path is covered, including ones that bypass the command stack, such as the MCP `editor_api` or scripts.

**Ordering.**

- The relay gives every edit a room sequence number and broadcasts edits in that order. All clients apply them in the same order, and your own edits come back as acknowledgements.
- Leases are granted by the relay, so two members can never run an operation on the same node at once.
- If the relay rejects an edit, the client reverts the changes that later edits did not replace.

**Joining.**

1. The owner sends a snapshot of the scene.
2. The joiner buffers live edits until the snapshot is applied, then replays them.
3. Texture files the scene uses are streamed from the owner on demand, four streams per member, with flow-control credit.

Rooms are isolated by the relay: messages never cross rooms.

### Presence

Presence is a separate, low-priority binary frame kind (`0xA7`, kind `2`) defined in the shared file `src/collaboration/shared/presence_frame.ts`. The code is in `src/collaboration/presence/`.

- **Frame.** Client frame: `[0xA7][2][version 1][count]` followed by up to 6 entries of 18 bytes. Each entry is an id (u8), a position (3 × f32), a rotation (smallest-three quaternion packed into a u32) and a field of view (u8 degrees; 0 marks the play-mode character). The relay inserts the sender's user id (u32) after the count. One camera is 22 bytes up and 26 bytes down; the frame size is `4 + 18n` bytes up and `8 + 18n` bytes down. A frame with 0 entries clears the sender's presence.
- **Sender** (`sender_collaboration_presence.ts`). It samples every 100 ms and sends about every 200 ms (5 Hz). Half a sample of timer slack is accepted, so a tick that fires slightly early still sends; frames never leave faster than every 150 ms. It sends only when a position moved more than 1 cm, a rotation turned more than 0.5°, a field of view changed or the set of cameras changed. Because the comparison is against the last frame actually sent, the final resting pose always goes out (trailing update). `SocketCollaborationClient.sendPresence` drops the frame unless the socket is open, `bufferedAmount` is at most 384 KiB and its own small rate bucket (15 % of the relay message rate, beside the queue's 80 %) allows it; nothing is ever queued. Queued frames (edits, stream chunks of at most 64 KiB) leave only while `bufferedAmount` is at most 256 KiB, so a long bulk transfer (large textures to a joiner) never backs up the socket and presence interleaves with it; the queue is also flushed on every incoming frame, so stream credits clock it where timers are throttled. Sending starts only after the snapshot is applied, and every member sends its presence once more right away when a member joins, even when it does not move.
- **Relay.** Validates the frame strictly (closing with `4001` on malformed frames), applies its own rate limit (10 frames/s, burst 20) on top of the general message limits, keeps only the latest frame per sender and recipient, delivers it while the recipient's outbound queue is idle and, behind a long bulk stream, ahead of the queue at most every 200 ms (while the socket buffer stays below twice its high-water mark), hands the latest frames to a joiner after its snapshot and purges a member's presence on leave.
- **Compatibility.** The relay advertises presence with `welcome.limits.presencePerSecond`. Against older relays the editor sends neither presence frames nor the `displayName` field of `room.create`/`room.join`, which those relays would reject; the hello name still applies.
- **Receiver** (`receiver_collaboration_presence.ts`). It keeps one item per member and entry id in `SharedWorldScene.helpersRoot` (outside the world, so every pane, including detached ones, renders it). Items carry `userData.isCollaborationPresence`, have a no-op raycast and are skipped by `isEditorHelperObject` consumers. The animation loop runs only while a remote member's item is still moving, correcting or walking; network traffic is unchanged by smoothing.
- **Smoothing** (`buffer_`, `interpolation_` and `pose_collaboration_presence.ts`). Each item keeps a buffer of the last 8 poses. A pose is timestamped on arrival, snapped to the expected 200 ms send grid when it arrives within ±100 ms of it (moving half way toward the real arrival time, because a late timer on the sender delays both the pose and its arrival), so jitter and bunched packets do not show. Items render 280 ms in the past and interpolate between the two surrounding poses (linear position, slerp rotation). When packets are late or missing, the item extrapolates along the last velocity for at most 250 ms, scaled down when the member was slowing (so stops do not overshoot), holds for 300 ms and then eases back to the last received pose within 200 ms. After a silence of 600 ms the stream restarts from the held pose instead of jumping. A new pose that disagrees with what is shown is blended in over about 100 ms (exponential correction) instead of popping. Moves of more than 5 m (teleports), the first pose and entering or leaving play mode snap immediately.
- **Remote walk** (`character_collaboration_presence.ts`, `body_collaboration_presence.ts`). A remote character runs the same `PlayerCharacterAnimator` as the local avatar (walk, run, idle, wall push, jump, fall, land, torso pose and limb IK). Its body velocity is estimated from the smoothed feet position (exponential, 0.15 s), and ground, wall push and run come from the motion flags of the character entry (`lookCollaborationPresenceMotion`), taken at the render time. Head, neck and back turn toward the received look. Only the input differs from the local player: there is no local physics or input for remote members.
- **Colors** (`sync/color_collaboration_oklch.ts`). Slot `n` uses OKLCH with hue `(100 + frac(0.52 + n·φ⁻¹)·285) mod 360` (golden-ratio steps over a hue range that skips the orange selection band), lightness cycling through 0.74, 0.64 and 0.84, and chroma 0.17 reduced by binary search until the color fits in sRGB.
- **Offline cost.** All presence code is in `src/collaboration/`, loaded with the rest of the collaboration code.

### Toys (tennis balls)

Toys are temporary, player-owned things that vanish with their player; today the tennis balls thrown in play mode. They travel as a separate, low-priority binary frame family next to presence, defined in the shared file `src/collaboration/shared/toy_frame.ts`. The relay feature is the `toys` capability; the editor sends nothing of it unless `welcome.caps` contains `toys`. The client code is `src/collaboration/toys/` (`session_collaboration_toys.ts`, `toy_tennis_ball.ts`) and `src/player/ball/`; the simulation is `src/physics/ball/`. The custom channel (kind `4`) is not used; it is reserved for forks.

- **Ownership.** The thrower owns its balls completely: it simulates them, only while it is in play mode, and it is the only one who sends them. Every other editor only interpolates and draws them. Nobody else runs ball physics, and an editor that is not in play mode has no physics world at all (its collision world is inactive, see [Zero-cost editing](#zero-cost-editing)), even while it draws balls. Requests, owner validation and prediction no longer exist.
- **Frame** (kind `5`). Member to relay to everyone else, like presence. The client header is 20 bytes; the relayed header inserts the sender (u32) after the count, 24 bytes. The relay validates only this envelope (header and fixed entry parts), so new toy types need no relay change; clients validate the payloads of the types they know and ignore other types.

| Bytes (client) | Field                                                                                      |
| -------------- | ------------------------------------------------------------------------------------------ |
| 0              | Magic `0xA7`                                                                               |
| 1              | Kind `5`                                                                                   |
| 2              | Format version `1`                                                                         |
| 3              | Entry count 0..4                                                                           |
| 4              | Frame flags: bit 0 full (lists every toy of the sender; its toys missing from it are gone) |
| 5..6           | Sender simulation tick (u16 BE, 120 Hz, wrapping)                                          |
| 7              | Position precision bits k (0..9)                                                           |
| 8..19          | Position origin x, y, z (float32 BE)                                                       |
| 20..           | Entries                                                                                    |

Each entry is a 10-byte fixed part plus an opaque payload; an entry is at most 32 bytes, so a frame is at most 148 bytes up and 152 bytes down. The position is part of every entry because every toy has one:

| Entry bytes | Field                                                                                                |
| ----------- | ---------------------------------------------------------------------------------------------------- |
| 0           | Toy type 1..255 (`1` = tennis ball); the relay passes any type through                               |
| 1           | Toy id 1..4, unique in the frame                                                                     |
| 2           | Entry flags: bit 0 sleeping, bit 1 grounded (moves along a surface, no gravity arc); other bits zero |
| 3           | Payload length 0..22                                                                                 |
| 4..9        | Position x, y, z: int16 BE, `origin + value / 2^k`; every value is valid                             |
| 10..        | Payload, defined per type; a type that needs finer positions adds its own correction here            |

The encoder centers the origin on the toys' bounds and picks the finest k ≤ 9 that fits (2 mm within ±64 m of the origin). Tennis ball payload, 7 bytes (entry 17 bytes, one ball 37 bytes up and 41 down):

| Payload bytes | Field                                                                                                       |
| ------------- | ----------------------------------------------------------------------------------------------------------- |
| 0             | High nibble: bounce counter (+1 per bounce, wraps at 16); low nibble: latest bounce strength in 2 m/s steps |
| 1..6          | Velocity x, y, z: int16 BE, value / 512 m/s (about 2 mm/s, up to ±64 m/s); −32768 is invalid                |

A ball payload of another length or with a −32768 velocity rejects the frame. Rotation is not sent; receivers derive it.

- **Relay.** It accepts toy frames from any synced member with the capability and stamps the sender; there is no owner or member field in the client frame, so nobody can send or remove someone else's toys, and a frame shaped like a relayed one fails the length check. Validation is as strict as presence: version, at most 4 entries, defined frame and entry flag bits, non-zero types, unique ids 1..4, payload lengths ≤ 22 adding up to the exact frame length, k ≤ 9 and a finite origin within ±10^6. Anything else closes with `4001`. Each member may send 5 frames per second, burst 10 (`welcome.limits.toysPerSecond`, at most `toysPerMember` = 4 toys). Toy frames count against the general message limits (`4002`). Every frame over the toy rate is dropped and scores one abuse point: past the throttle score nothing from the member is relayed, a continuing flood is closed with `4007` and kept out of the room for the cooldown, and a reconnect carries at most half the throttle score. Delivery uses latest-only mailboxes per sender and recipient (one slot for full, one for changes frames, delivered like presence: while the recipient's outbound path is idle, or ahead of a long bulk stream at most every 200 ms); the relay keeps each member's latest full frame and gives it to a joiner once it has synced, and drops everything of a member that leaves.
- **Thrower sending** (`player_ball_publisher.ts`). While something moves, the moving and changed balls every 200 ms (5 per second, so receivers can interpolate) and a full frame every 2 s; one extra frame right after a bounce (at least 30 ms after the previous one), so receivers have a real sample on both sides of it; the balls that spawned, were touched, woke or fell asleep; a full frame on every removal and once everything rests; and nothing while every ball rests (no resting heartbeat). Every frame spends a token of a client bucket (5 per second, burst 8) below the relay's toy limit (5 per second, burst 10). Frames go through `SocketCollaborationClient.sendPresence`, so they are dropped, never queued, while the socket is backed up or the rate bucket is empty; a dropped frame stays owed. Edits are never delayed by balls.
- **Late joiners.** When a new member joins (the `member.joined` message that also writes the chat join line), every editor that owns live balls sends one full frame with all of them at its next allowed slot (within the 5/s rate). The relay announces a joiner before it has synced and only forwards toys to synced members, so the joiner receives that frame through the relay's latest-full slot the moment it syncs; that frame is at the same time the latest full frame for every other member. Receivers create unknown toys from any frame and remove a sender's toys missing from its full frame.
- **Simulation** (`player_ball_authority.ts`, `src/physics/ball/`). Fixed 120 Hz steps against the level (Rapier shape casts on `PhysicsLevelWorld`), every player in play mode, the thrower's own other balls, and the other members' drawn balls as one-way proxies (a capsule of the ball's radius, which the own ball bounces off but never moves). Ball against own ball is an equal-mass impulse (restitution 0.8). A player is an upright kinematic capsule (radius 0.35 m, height 1.75 m) with infinite mass: standing players bounce balls, walking players push them. Player poses come from presence (smoothed feet and velocity, clamped to 14 m/s horizontally and 20 m/s vertically); the local player uses its own state. Balls never act on players.
- **Receivers** (`player_ball_receiver.ts`, `player_ball_clock.ts`, `player_ball_motion.ts`). Snapshot interpolation as in Source, no prediction: each sample is placed at local time through the sender's tick (fastest delivery, drift 1 step per second) and drawn 300 ms in the past (one 200 ms interval plus jitter, like presence), between the two samples around that time along a cubic Hermite curve through their positions and velocities (exact for a flight arc), or a straight line when a velocity differs from the average velocity between them by more than 4 m/s (a bounce or push between them). When the samples run dry the ball flies on without collision for at most 100 ms (resting balls hold, rolling ones slow down, flying ones follow gravity) and waits; the next sample is blended in (100 ms exponential) instead of jumped to. New balls and errors above 2 m snap. A bounce sound plays when the counter changes, at its sample's render time and at its strength.
- **Rules.** At most 4 balls per member; a fifth replaces the oldest. A member's balls vanish when it leaves play mode or the room. Each ball has its thrower's color. Bounces play through the reverb sound system (`NotificationGlobal.onBallBounce`).
- **Not part of the level.** Balls live in `SharedWorldScene.helpersRoot` with `userData.isPlayerBall`, have a no-op raycast and count as editor helpers, so they are never picked, selected, saved, snapshotted, undone or audited, and they never push the player or the camera.

### Zero-cost editing

Physics runs only where it is needed. `PlayerCollisionWorld` is inactive until play mode starts (`activate()`), and leaving play mode disposes its Rapier world (`release()`); while inactive, queries return nothing and an edit costs no physics at all. Figurine placement uses the editor's own raycaster (`SceneRaycaster` BVH), not physics.

In play mode, edits (local or remote) are applied to the level colliders as jobs (`physics_level_job_queue.ts`): an edited collider keeps its old shape until its job runs, so nothing disappears under a player. Every frame, all jobs within 8 m of the player (and the thrower's balls) run at once; the rest run nearest first within 1 ms per 16 ms window. The first sync, and any sync without a focus, builds everything at once. A Web Worker was measured and rejected: Rapier calls must stay on the main thread, and only about 30 % of the sync work could move.

Measured on a 256-brush edit (`physics_level_scene_benchmark.test.ts`, 3 repeats each): on gm_publicpools (1989 brushes) and d7 (1098 brushes), CSG takes 200–310 ms. An editor outside play mode that draws two players' balls spends 0.007–0.010 ms in collision with 0 physics calls. A player standing in the edited area spends 4.6–7 ms in the edit frame (16 ms once), with the ground around it already identical to a full rebuild, and catches up the remaining ~260 colliders in 8–13 frames of at most 1.5–2 ms each. A full rebuild in one frame takes 13–27 ms.

### Mutation audit

Every scene mutation is either a **running operation** (it holds the edit lease) or a **one-shot edit** (no lease). The tracker diffs the scene every 250 ms and after each command, so every path below is covered, including ones that bypass the command stack. A change the relay refuses is restored from the agreed state; a change the client already knows will be refused is refused up front with the holder's name, and nothing is applied.

| Mutation path (commands)                                                                                                       | Kind                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| Gizmo translate, rotate, scale; bounds resize; modal G/R/S                                                                     | Running operation: lease on press, live `transform` previews about 30 Hz, `property` commit on release  |
| Hinge, face align and seat, vertex/edge/face snap, bevel (single-use tools, `command_transform_*`, `command_modifier_bevel_*`) | Running operation for the tool's whole duration (they read the geometry they edit)                      |
| Edit Mode (vertex, edge, face moves and topology), brush Edit Mode drags, loop and edge cut, merge                             | Running operation from entering Edit Mode until leaving it                                              |
| Numeric position, rotation and scale fields, texture-locked transform, apply transform                                         | One-shot `property` edit of the changed fields                                                          |
| Clip, extrude, split, hull, mesh CSG, solid brush operation, reorder, inverted world (`command_mesh_*`, `command_solid_*`)     | One-shot `property` edits; CSG results and added brushes are `create`                                   |
| Create, duplicate, paste, primitive, solid model, terrain, import                                                              | `create` with the parent chain `p`; the new ids must be free                                            |
| Delete (`command_object_delete`, `command_object_hierarchy_delete`)                                                            | One-shot `delete`; refused while another member's lease covers the object or something inside it        |
| Group, ungroup, outliner drag reparent, sibling order                                                                          | One-shot `reparent` with the new chain `p`; refused while a moved object or the target is under a lease |
| Rename, visibility, padlock flag, materials, colors, textures, face texture maps, UV transform and smear                       | One-shot `property`/`texture` edit, field-level                                                         |
| Undo and redo                                                                                                                  | Per-user history, field-level inverse, sent as one-shot edits                                           |
| New scene, Load scene                                                                                                          | Blocked while in a room                                                                                 |
| MCP `editor_api` tools                                                                                                         | One-shot edits through `ToolsCollaborationGuard` with structured errors (see MCP below)                 |
| Scripts and other stack bypasses                                                                                               | Caught by the diff and sent as one-shot edits, or reverted when another member's lease covers them      |
| Editor helpers (player figurine and character rig, overlays, rulers, clip previews)                                            | Never synced: `isEditorHelperObject` children are skipped by the node index                             |

**Field-level ops.** A one-shot edit carries the whole new state and the list of changed field paths, `d: {s, f}` (`field_collaboration_paths.ts`), for example `f: ['data.entry.name']`. Receivers apply only those paths, so concurrent edits of different fields of one object both survive, and edits of the same field resolve last-writer-wins in relay order. Paths go 4 levels deep; arrays and deeper values are replaced whole; a change of more than 64 paths replaces the node. Ops address objects by id, never by path, so they follow moves and reparents. An op on an id that no longer exists is dropped, and the sender is told who deleted it.

### Edit leases

`lease_collaboration_client.ts` keeps the member's single lease, `session_collaboration_sync.ts` decides when an operation runs, and `hierarchy_collaboration_locks.ts` builds the request:

- **Scope.** The edited objects and their whole subtrees are leased exclusively (`ids`); their ancestors are leased shared (`shared`). Brushes use the brush id, so a brush drag shares its solid model and the model stays selectable and editable elsewhere.
- **Start.** Pressing on a gizmo, the first live preview, the rising edge of a single-use tool or of Edit Mode (`HostCollaborationEditor.operationRunning`) sends `lock.acquire {lease, ids, shared}`. A new operation while an old one is still being released uses `replace:true`.
- **Keep.** While the mouse or a key is held, live previews are recent (400 ms) or a tool or Edit Mode is running, the editor sends `lock.renew` every 1.5 s.
- **End.** Commit or cancel sends `lock.release`. The relay ends a lease by itself 5 s after the last renew or accepted edit (sweep every 500 ms), 60 s after the last accepted edit even when renewed, and after 600 s in total. Expiry is broadcast as `locks {by, remove, expired:true}`; everyone, the holder included, reverts the uncommitted preview. A tool that only waits for its next click lets the lease lapse quietly at the 60 s cap instead of showing a lost-edit message.
- **Refusal.** `lease_busy`, `lease_stale`, `outside_lease` and `lock_conflict` cancel the running tool through `host.operationCancel`, drop the preview and show a message naming the holder. While the pointer stays down the editor watches the holder's lease and retries as soon as it is released. A hidden tab ends the lease.
- **Measured grant latency** (`AIWORLDED_COLLAB_LATENCY=1`, 20 leases per object): on a local relay about 1.1–1.4 ms median and 1.3–4.3 ms p90 for a root object, an object inside a group and one three groups deep. Over the internet a grant costs one round trip, plus one owner round trip the first time a member leases inside a container (see below).

| Timing                         | Value                                |
| ------------------------------ | ------------------------------------ |
| Lease without renew or edit    | 5 s (sweep every 500 ms, so 5–5.5 s) |
| Client renew interval          | 1.5 s                                |
| Live previews keep a lease for | 400 ms after the last one            |
| Idle cap (renewed, no edits)   | 60 s                                 |
| Total cap                      | 600 s                                |
| Revert after a frozen member   | about 5–5.5 s after its last message |

### Abuse detection

The relay scores protocol misuse per member (see the relay README, "Abuse detection"): one lease per member, edits outside it refused, lease and renew floods, edit floods. Points decay by 1 per second; at 20 the member is throttled (`throttled`, which itself scores a point) and flagged, at 60 it is closed with `4007` and its address may not enter rooms for 60 s. A reconnect inherits half the score. Honest races between members only produce refusals, which score nothing.

The editor stays below every limit on its own: `gate_collaboration_edits.ts` paces one-shot edits (15/s, burst 40; created plus deleted ids 8000/s, burst 200 000) so a burst of undos, a giant paste or a huge delete is queued instead of rejected, and it sends at most one lease request per operation. A `throttled` reply shows "Too many operations at once; wait a moment and try again".

### Protocol versioning

The editor and the relay negotiate the protocol in `hello`: `{t:'hello', protocol:'aiworlded-collab', version:2, minVersion:2, client, name, caps:['select'], x:{}}` (`socket_collaboration_client.ts`). Each room records the protocol version and editor build it was created with; the room browser shows them ("v2 · AiWorldEd/1.0") and their **Join** button reads **Other version** and is disabled for rooms of another version. A relay that supports none of the editor's versions closes with `4008 protocol_unsupported`, and joining a room of another version returns `protocol_mismatch`; both show a clear message asking the user to update (`runtime_collaboration_errors.ts`).

The rules for changing the protocol (capabilities before version bumps, strict schemas with the `x` extension object, fixed widths, path-plus-value field ops, at least 90 days of deprecation, frozen golden vectors) are in the relay README, "Protocol evolution". The golden vectors are shared (`src/collaboration/shared/protocol_golden_vectors.ts`) and replayed through the editor's parsers by `shared_collaboration_golden.test.ts`.

**Protocol 2 is not compatible with protocol 1.** Editors of protocol 1 are closed with `4008` by a protocol 2 relay; branches that touch collaboration must rebase onto it.

### Owner verification of containers

The relay keeps no copy of the scene tree. When a member claims containers it does not already share, the relay asks the room owner, who is the source of truth, whether the claim is true (`handler_verify.ts` on the relay, `verify_collaboration_verdict.ts` and `session_collaboration_sync.ts` in the editor):

- **When.** Only a non-owner `lock.acquire` that adds new shared ids, or an edit whose `create`/`reparent` chain adds new ones. Shared ids the member already holds act as the cache, so a second lease inside the same container is not verified again. The owner's own requests and leases of root-level objects are never verified.
- **Query.** `{t:'verify', q, ids, anc}`: `ids` are the objects that should sit directly under `anc[0]`, and `anc` is the claimed chain up to the root. The owner answers `{t:'verify.result', q, v}` with `valid`, `invalid` or `deleted`, from its agreed baselines, so its own uncommitted moves never refute an honest member.
- **Denial.** A lease gets `lock.result {ok:false, code:'lock_unverified', why}`, and an edit gets `edit.rejected {reason:'lock_unverified', why}`. `why` is `invalid`, `deleted`, `owner_timeout` (no answer within 5 s), `owner_left` or `rate_limited`. The editor retries `invalid`, `deleted` and `rate_limited` up to three times, because they can be a race with a reparent that is still in flight, and then cancels the operation with, for example, "Can't edit the selection: the room owner did not confirm the containers in time".
- **Receivers.** A member applies a new node or a parent change only when it comes with a `create` or `reparent` op whose `p[0]` is that parent (`replicaParentBound`), so a hostile client cannot claim one chain to the relay and apply another.
- **Cost.** One owner round trip for the first lease inside a container (about +110 ms from Europe to the dev relay; root-level objects are unchanged). About 30 bytes plus the ids per query and 37 bytes per answer. A member with more than 64 held messages (or 4 MiB) is disconnected with code 4002. Rate limits: 10 queries/s (burst 20) per member and 50/s (burst 100) per room.
- **Why not a relay-side tree or an LRU cache.** A node-to-parent map would cost RAM for every node in every room, and would have to follow every op. An LRU of verdicts goes stale after any reparent. Held shared ids are already a cache that the relay invalidates correctly.

### MCP (AI) tools in a room

Every MCP tool that is not a known read (`editor_api_tool_kinds.ts`) runs through `ToolsCollaborationGuard` (`session_collaboration_tools.ts`) as the local user, on the same path as a one-shot edit:

1. If the room is not synchronized: `{ok:false, error:'offline'}` and nothing runs.
2. The tool shares the user's single operation. While the user drags, it waits up to 5 s and then returns `{ok:false, error:'busy', message}`.
3. The tool runs; its changes are held back and compared with the agreed state.
4. If a touched object, a deleted object, or a container a created or moved object enters is under another member's lease, the changes are thrown away and the result is `{ok:false, error:'locked', object, holder, message}`, for example `Can't edit Crate yet: Bob is editing it; nothing was changed`.
5. Otherwise the changes are sent as field-level one-shot edits and confirmed by the relay. A relay rejection becomes `{ok:false, error:'rejected', message}`; an `undo`/`redo` refused because of another member returns `error:'locked'` with the holder.
6. `select` never fails because of other members.

The AI therefore always learns when a networked change did not happen, and why.

### Coverage matrix

Every user-facing operation is tested against the real relay with two to four clients (`runtime_collaboration_relay_coverage/barrier_free/rules/import/hierarchy/mcp/live_shape/undo_steps/textures.test.ts`). Each row checks that the change syncs to everyone, what holds a lease, that it is refused while another member's lease covers the object, and that undo and redo work and converge.

| Operation                                              | Syncs | Lease                      | Refused while another member edits it        | Undo / redo                                    |
| ------------------------------------------------------ | ----- | -------------------------- | -------------------------------------------- | ---------------------------------------------- |
| Rename, visibility, padlock flag, material color       | yes   | none (one-shot, LWW)       | yes, names the holder                        | field-level; refused while covered             |
| Same object, different fields, two members             | yes   | none                       | no: both fields survive                      | each member undoes only their own field        |
| Gizmo move, rotate, scale                              | yes   | while dragging             | yes                                          | yes                                            |
| Numeric position, rotation, scale fields               | yes   | none (one-shot)            | yes                                          | one undo step per numeric commit               |
| Edit Mode vertex move (mesh document path)             | yes   | while in Edit Mode         | yes                                          | yes                                            |
| Hinge, face align/seat, vertex snap, bevel             | yes   | the tool's whole duration  | yes                                          | yes                                            |
| Face texture map (UV)                                  | yes   | none (one-shot)            | yes                                          | yes                                            |
| Group, ungroup                                         | yes   | none (one-shot `reparent`) | yes, also for an edited child or target      | yes                                            |
| Outliner drag reparent, reorder                        | yes   | none (one-shot `reparent`) | yes, also for an edited target or child      | yes                                            |
| Edit of an object another member moved into a group    | yes   | none                       | no: lands on the object in its new place     | yes                                            |
| Duplicate                                              | yes   | none (`create`)            | n/a                                          | yes                                            |
| Clipboard paste (`Ctrl+V`)                             | yes   | none (`create`)            | n/a                                          | yes                                            |
| Clip, mesh CSG, solid brush operation                  | yes   | none (one-shot)            | yes                                          | yes                                            |
| VMF import, OBJ import                                 | yes   | none (`create`)            | n/a                                          | yes                                            |
| Delete                                                 | yes   | none (one-shot)            | yes, also for an edited descendant           | undo skips objects another member deleted      |
| Edit of an object another member deleted               | n/a   | n/a                        | dropped with "… was dropped: Bob deleted it" | skipped with a notice, never resurrected       |
| Bevel volume create and distance                       | yes   | while the tool runs        | parent must not be under another lease       | yes                                            |
| Brush Edit Mode vertex / face drag (live shape)        | yes   | while dragging             | yes                                          | yes; brush, selection and overlay kept         |
| Drag cancelled, member leaves or freezes mid-drag      | yes   | freed or expired after 5 s | n/a                                          | everyone drops the preview                     |
| Member joins mid-drag                                  | yes   | yes                        | n/a                                          | joiner gets the committed state, then the drag |
| MCP tools (create, move, rename, delete, select, undo) | yes   | none (one-shot)            | `error:'locked'` with object and holder      | MCP undo refused while covered                 |
| Two members select the same object                     | n/a   | none                       | never                                        | n/a                                            |
| Owner changes the texture folder                       | yes   | n/a                        | owner only                                   | n/a; members re-fetch changed textures         |

**Per-user undo semantics.** Each history step records, per object, the field paths it changed with their before and after values (`history_collaboration_apply.ts`). Undo writes the before values of only those paths, as one-shot edits; fields others changed in the meantime and fields the step did not touch keep their current values (last writer wins, the undo being the last writer). An object of the step that no longer exists because another member deleted it is skipped with a notice and never recreated; objects the step itself deleted come back, since they were the user's own delete, but never into a container another member deleted. Undoing a create keeps the object while other members' objects live inside it. A step whose objects are under another member's lease is refused and names the holder, and stays on the stack.

**Tool audit.** Every viewport tool was checked for three things: what it edits, when it holds the lease, and whether it keeps a stale copy of other objects' geometry. A tool that reads the geometry it edits holds the lease for its whole duration, so nobody can change that geometry under it.

| Tool                                                 | Acts on                     | In a room                                                                       | Other objects' geometry                                       |
| ---------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Move, rotate, scale gizmo, bounds gizmo, modal G/R/S | selection                   | lease from press to release                                                     | snap reads the live scene                                     |
| Vertex / edge / face snap while dragging             | selection                   | lease while dragging                                                            | held target dropped after any remote change (no ghost snap)   |
| Hinge, face align, face seat                         | the clicked brush or object | lease for the whole tool; refused with the holder's name, the tool is cancelled | target cache rebuilt after any remote change                  |
| Face mode: pick, texture, UV slide, smear, extrude   | the picked faces            | picking never locks; texture and UV changes are one-shot, drags take the lease  | face list refreshed and stale picks pruned after remote edits |
| Edit Mode (select, move, loop cut, edge cut, merge)  | the mesh in Edit Mode       | lease from entering to leaving Edit Mode                                        | component snap as above                                       |
| Clip plane, CSG, hull, bridge, duplicate             | selection                   | one-shot on apply                                                               | none                                                          |
| Primitive creation, terrain, import                  | new objects                 | `create`; the parent must not be under another lease                            | placement raycasts the live scene                             |
| Grid align pickers (face, edge, vertex origin)       | the local grid only         | read only, not networked                                                        | live raycast per click                                        |
| CAD rulers, measure overlays                         | selection                   | read only                                                                       | refreshed on selection change                                 |
| Outliner row toggles (visibility, padlock, rename)   | the row                     | one-shot; refused up front while another member's lease covers the row          | none                                                          |
| Outliner row click, Shift/Ctrl add                   | the rows                    | never refused                                                                   | none                                                          |

Remote edits bump a scene revision (`snap_scene_revision.ts`) from the same apply path that rebuilds the solid models, and the snap and align caches compare it before each query. Tests: `snap_drag_hold.test.ts` (remote move and delete mid-drag), `snap_align_claim.test.ts`, `face_selection_claim.test.ts`, `outliner_admission_selection.test.ts`.

Not available in a room, by design or because the editor has no such feature:

- **New** and **Load…** are blocked ("Leave the online room before replacing the scene").
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

Debug sessions use the hosted dev relay (`wss://aiworlded.00labs.net/wsdev`) by default, so no local relay is needed. To use a relay of your own, start it from the `aiworlded-server` checkout (for example on port 8081 with a development-only `FORWARDED_SECRET` and the `http://localhost:5179` origin allowed), then set **Collaborate > Collaboration Settings… > Server URL** to `ws://127.0.0.1:8081/ws`. The tests take the relay from `AIWORLDED_COLLAB_URL`.

### Offline cost

- The startup bundle contains only the Collaborate menu stub and the URL config.
- The controller, sockets, dialogs, and sync engine are loaded with a dynamic `import()` right after startup, which then opens the relay connection.
  - The production build sets `inlineDynamicImports: true` so that GitHub Pages serves a single `index.js`. The collaboration code is therefore inside that file, but wrapped in a lazy module initializer. None of it is evaluated before the editor has started.
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

- **Unit tests** (`tests/collaboration/**`): config, policies, order keys, lock table, the lease client, the edit gate, field paths, the field-level undo inverse, roster colors, history, state parsing, selection admission, the protocol golden vectors (`shared_collaboration_golden.test.ts`), outbox and streams, socket client, error texts, replica round trips, and one test per mutation type. Each mutation type is tested in three ways:
  - synced as a one-shot edit or under the running lease;
  - refused or reverted while another member's lease covers the object;
  - concurrent edits by two members.
- **Integration tests** (`tests/collaboration/runtime/*relay*.test.ts`) run several editor harnesses against the real relay, in up to two rooms with three or four members each. They cover:
  - snapshots and late joiners;
  - live and committed transforms;
  - creates, deletes, duplicates, groups and reparenting;
  - one-shot renames without a lease (field-level, last writer wins);
  - material, visibility, vertex and face texture edits;
  - three members editing every mutation category at the same time (transform, color, visibility, rename, create, vertex, face UV, group, duplicate, brush move, brush operation, brush add, delete) and converging to the same scene and sibling order;
  - ten rapid rounds of concurrent edits;
  - the barrier-free rules (`runtime_collaboration_relay_barrier_free.test.ts`): everyone selects the same object, concurrent one-shot edits of different and of the same field converge, a one-shot edit refused during a drag and accepted after the commit, a single-use tool holding the lease for its whole duration, edits following a reparent, reparent and delete refused under a lease, an edit of a deleted object dropped with a notice, a frozen lease expiring and its preview reverted for everyone, a brush drag inside a selected solid model, and an AI tool running beside a user's drag;
  - lease refusal naming the holder, a four-member lease race with exactly one winner, and hand-over on release;
  - per-user field-level undo, undo refused while another member's lease covers the object, and rejected edits;
  - owner loss (offline warning, scene kept), private passwords and reconnects;
  - two busy rooms editing at once without seeing each other's changes, members or leases;
  - the coverage matrix above, VMF and OBJ import, hierarchical lease conflicts and MCP structured errors;
  - owner verification: honest nested selections and the cache, lying or deleted containers, a lying move ignored by receivers, a flood closed with 4002, owner timeout, owner leave, a retried race and the MCP refusal text (`runtime_collaboration_relay_owner_verify.test.ts`); `AIWORLDED_COLLAB_LATENCY=1` also runs the lease latency benchmark (`runtime_collaboration_relay_latency.test.ts`);
  - owner textures from the project folder: a file added, changed, renamed and removed on the owner's disk reaches every member, and a bulk copy of 500 textures arrives complete (`runtime_collaboration_relay_project.test.ts`);
  - snapshots: a large change is snapshotted, a restore over three clients skips the object a member holds, brings back deleted and moved objects, removes added ones, and is undone as one step; a restore leaves the owner holding no leases (`runtime_collaboration_relay_snapshot.test.ts`);
  - presence: a joiner receives the latest camera pose, follows its movement, sees a play-mode member as a character instead of a camera, and loses the presence when the member leaves. These tests are skipped when the relay does not advertise presence.
- **Relay tests** (`aiworlded-server`, `bun run ci`; `tests/integration/edit_leases.test.ts`, `tests/unit/rooms/room_lease_table.test.ts`, `tests/unit/network/limiter_abuse_score.test.ts`, `tests/unit/shared/protocol_*.test.ts`) cover the relay side: one operation per member and `replace`, extending and stale lease numbers, a million-id request stopped at the cap, two tabs as two members, frozen-holder expiry, renewals and the idle cap, edits outside the lease, duplicates joining the lease, the one-shot rate (rename, undo and color storms), the bulk id budget (giant paste and delete), selection floods, acquire churn throttled and escalated to `4007`, renew floods closing and keeping the address out, honest drags scoring nothing, the reconnect score carry-over, version negotiation and the golden vectors.
- **Physics relay tests** (`tests/collaboration/runtime/runtime_collaboration_relay_physics.test.ts`): a member walks while the owner adds a platform under it, a block around it, removes them and cuts a pit; the member is lifted, freed and drops without ever being stuck. With an owner, a thrower and a watcher, the thrower simulates its ball, the other two show it in the thrower's color and agree on where it rests, bounces are heard on both, the thrower walks through the ball and they agree again, the two non-players never get a physics world, and leaving play mode clears it. A thrower whose ball rests sends nothing; a late joiner sees the ball where it rests right after joining (about 300 ms, mostly the render delay), from the one full frame the thrower sends on the join. A throw outside play mode gives no ball, a fifth ball replaces the oldest, and leaving the room clears the member's balls everywhere.
- **Physics unit tests** (`tests/physics/`, `tests/player/collision/player_collision_edits.test.ts`, `tests/player/collision/player_collision_world_budget.test.ts`, `tests/player/ball/`, `tests/collaboration/toys/`, `tests/player/figurine/`): insert-before-move, removal, ceilings, stairs, edits landing under, on or around the player, the job queue (replacing and dropping jobs, region flush, nearest first within the budget), inactive collision costing nothing, old colliders kept until rebuilt, ball bouncing, wall reflection, resting and waking, determinism with shuffled collider order, thrower-owned simulation, the 4-ball cap with ids 1..4, cleanup on leaving play mode or the room, no physics on editors outside play mode, balls not pickable and not in the world, own balls bouncing off drawn balls, players pushing balls while walking exactly as without balls, interpolation 300 ms in the past (Hermite arcs, straight lines around bounces, 100 ms extrapolation, blending back and snapping), bounce sounds from the counter, the tick clock, the 200 ms sampling, bounce extras, the client toy bucket and full-refresh policy, silence while resting, the full frame for a joiner, the tennis ball payload (round trip, unknown types ignored, bad payloads rejected), measured bandwidth (`player_ball_bandwidth.test.ts`, numbers written to `AIWORLDED_BALL_BANDWIDTH_OUT` when set), figurine ground without physics, and the toys session's capability gate and sender routing. An opt-in benchmark (`AIWORLDED_PHYSICS_BENCH=1`, scenes in `AIWORLDED_PHYSICS_BENCH_SCENES`) loads real levels, measures collider build and edit times, walks characters through them and measures a 256-brush edit on an editor outside play mode and a player in the edited area (`AIWORLDED_PHYSICS_EDIT_BENCH_OUT` writes the numbers).
- **Chat unit tests** (`tests/collaboration/chat/`): message parsing, ordering, grouping, the message cap and the one-hour expiry, follow-at-bottom versus the new messages button, the cooldown (Enter and Send blocked, relay retry time), refusal texts, notification merging, the emoji insert at the caret, and rendering of `<script>`, `<img onerror>`, RTL override and zero-width text as plain text.
- **Chat integration tests** (`tests/collaboration/runtime/runtime_collaboration_relay_chat.test.ts`): welcome limits, `Henry` / `henry2` numbering and shortening, delivery with cleaned text, the rate limit with its retry time, invalid messages and room isolation.
- **Presence unit tests** (`tests/collaboration/presence/`): throttle and deadband, interpolation, the sender's rate and frame size, receiver helper flags, colors, removal, the tinted character copy, and frustum geometry.

### Manual multi-tab test

1. Start the dev server on `:5179` (it uses the `/wsdev` relay). Open four tabs at `http://localhost:5179`.
2. **Tab A:** use **Collaborate > Collaboration Settings…** to set the name to "Alice". Then **Create Room…**, name it "Room 1", Public. Add a few cubes and a solid model first.
3. **Tab B:** set the name to "Bob", then **Browse Rooms…** and **Join** "Room 1". Confirm the discard prompt. Bob should see Alice's scene, including textures.
4. **Tab C:** set the name to "Carol" and create "Room 2" as Private. Copy the password.
5. **Tab D:** set the name to "Dave" and join "Room 2" with the password. A wrong password must fail with "Wrong password."
6. In **A** and **B**, select the same cube. Each sees the other's outline and name; nobody is refused.
   - Drag the gizmo in A. B sees "Alice · editing", follows smoothly while you drag and ends at the same values after you release.
   - While A still holds the mouse, rename the cube in B: refused with "Can't edit Cube yet: Alice is editing it; try again when they are done". Release in A, rename again in B: it applies.
   - Rename the cube in A and change its color in B at the same time: both changes survive everywhere.
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
   - In A, start dragging one of Bob's earlier objects and keep holding the mouse.
   - Press `Ctrl+Z` in B. The undo is refused naming Alice. Release in A and undo again in B: it applies.
   - Delete one of Bob's earlier objects in A, then undo in B: that part is skipped with a notice and the object stays deleted.
   - Start a drag in A and close the tab's network (DevTools offline). About 5 s later B reverts the preview.
10. **Isolation:** make edits in C and D. Rooms 1 and 2 never see each other's changes, members, or leases.
11. **Reconnect:** a member whose connection drops shows **Reconnecting…**, rejoins the same room, and receives the current room scene. Any changes made while it was disconnected are replaced. This is covered by the relay integration tests. The relay keeps rooms in memory, so if you restart the relay process itself, every tab reconnects to the server but the rooms are gone, and members see **Could not rejoin the room**.
12. **Owner loss:** close tab A. B shows **Room closed** with **Save** and **Continue**; the scene stays open whichever you pick, owner textures turn into pink checkers and B's Project panel goes back to B's own folder.
13. **Leave:** in D, choose **Collaborate > Leave Room**. Carol's member list updates.
14. **Presence:** in A and B, orbit the 3D viewport. Each tab shows the other's camera as a frustum in the member's color with a name tag, following within a fraction of a second. Open a detached viewport; the gizmos show there too. Enter play mode in B: A sees a tinted character with Bob's name tag instead of the camera. Leave in B: the character and camera disappear in A.

## Viewers and room editing

Public rooms start in **Viewers** mode: people joining can chat, select objects,
inspect properties and move their camera, but the owner must enable editing for
them. The status chip says **Viewing** while editing is disabled. Open its user
list as the owner to tick **Edit**, untick it to revoke editing immediately, or
use **Kick** to remove someone from this room without disconnecting them from
the server. Kick is not a ban; a deliberate rejoin starts with the room's
normal initial permissions.

Permissions belong to the current connection and room membership only. After a
disconnect/reconnect or leaving and rejoining, the owner must approve a viewer
again. Nothing is saved in browser storage. Revoking permission cancels active
edits, releases locks and restores uncommitted previews. A viewer's attempted
scene changes are blocked or put back to the agreed scene and are not shared.

Choose **Anyone can edit — open blockout session** for a public free-for-all:
it is for doodling and having a laugh, not serious work. Private,
password-protected rooms still admit everyone with the password as an editor.
View-only is write control, not copy protection: visitors receive the scene.
