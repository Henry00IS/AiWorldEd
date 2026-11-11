# Project Folder

The **Project** panel is the editor's asset browser: you pick one folder on disk as your project, and the editor shows every compatible file in it, keeps watching it for changes and writes an autosave into it. The Texture Browser reads its textures from the same folder.

## Open a project

1. Click **Project** in the top toolbar. The panel opens as a floating window you can move and resize.
2. Click **Open Project Folder** and choose a folder.
3. Chrome and Edge ask for permission to read and write the folder. Allow **edit** access so the editor can autosave.

The editor remembers the folder. On your next visit the panel shows **Reopen "<folder>"**; one click asks the browser for permission again (browsers require that click) and the project opens where you left off.

**Close Project** stops watching the folder. Nothing on disk is changed.

## The panel

- **Folder tree (left).** Every folder of the project, with only the project root and **Curves** expanded at first. Click a folder to show its files; folders with subfolders, including the **Curves** item and in a room **Remote** and **Local**, have the outliner's ▶ arrow: click it to collapse or expand them (kept while the panel redraws), and folders without subfolders show no arrow. The tree follows the disk live. Hidden folders (names starting with a dot, such as `.git`), `node_modules`, `__pycache__` and the editor's own `AiWorldEd` folder are not listed. Below the project folders, the virtual **Curves** item lists the curves saved in `AiWorldEd/Curves`. In a collaboration room, members see **Remote** (the owner's curves) and **Local** (their own) below **Curves**; Remote is read-only: drag a Remote curve onto Local or right-click it to copy it there (see [Collaboration](collaboration.md#curves)). The notice above the tree says the owner's project and Remote curves are read-only, and switches to explain **Local** while that folder is selected or under the pointer.
- **Files (right).** Compatible files of the selected folder as tiles. Textures show a thumbnail, the same as in the Texture Browser (sized in whole pixels and drawn at the screen's resolution, so they stay sharp at any display scaling); levels and models show a label (`LEVEL`, `VMF`, `OBJ`); curves show a drawing. Hover a tile for its path, size and date. The tree and the files scroll with the same scrollbar as the Outliner and the Texture Browser.
- **Search.** Type in the search box to search the whole project by name or path. Clear it to return to the selected folder.
- **Double-click** a file to use it:
  - a texture is selected in the Texture Browser, ready to apply;
  - a level (`.aiworld`, or a `.json` level saved by an older version) is loaded (asks first when the current scene has unsaved changes);
  - a model (`.vmf`, `.obj`, `.glb` or `.fbx`) is added like a new volume: in front of the last used view, clear of other geometry and snapped to the grid. Right-click a model and choose **Add at Original Location** to keep the coordinates stored in the file.

Compatible files are `png`, `jpg`, `jpeg`, `gif`, `webp`, `bmp` (textures), `aiworld` (levels), `aicurve` (curves), `vmf`, `obj`, `glb` and `fbx`, plus `json` and `curve` files saved by older versions, which still open unchanged. Other files are ignored. Very large projects are capped at 20000 files and 4000 folders; the panel shows at most 600 tiles at once (search to narrow it down).

## Textures come from the project

The Texture Browser lists every texture of the open project. A texture's id is its path inside the project, for example `walls/brick_red.png`, so scenes saved inside a project keep working when the project moves to another place or another computer.

While no project is open, the Texture Browser shows **Open Project Folder** as a shortcut; once a project is open that button is gone, because there is only one place textures come from.

## The AiWorldEd folder

The editor keeps its own files in an `AiWorldEd` folder at the project root:

```
AiWorldEd/
  .gitignore              created automatically, ignores .Local/
  Curves/<name>.aicurve   curves saved from the curve editor
  .Local/                 this computer only (git-ignored)
    Autosave/
      History/
    Snapshots/            collaboration room snapshots (<id>.json)
    TextureCache/         embedded textures of autosaves and snapshots
```

Commit `AiWorldEd` with the rest of the project: saved curves live there. `.Local` holds state that only makes sense on this computer; the `.gitignore` keeps it out of git. An existing `AiWorldEd/.gitignore` is never overwritten: the editor only appends the `.Local/` line when it is missing.

Projects used with older versions may still have a hidden `.aiworlded` folder with old autosaves and snapshots. The editor no longer reads or changes it, so you can delete it.

## Imported textures

Images embedded in imported models (GLB, FBX) become embedded textures of the level, with or without an open project. When you save, they go into the `.aiworld` file (see [Save a scene](files_import_and_export.md#save-a-scene)). Importing the same model twice, or two models that share an image, reuses the same texture, so nothing is duplicated.

- **Texture Browser.** Embedded textures are often character skins or props rather than wall materials, so the browser lists only the project's own textures by default. Click **Show Imported** to list the imported ones too; the textures in view stay where they are. The choice is remembered for this browser (or desktop app).
- Textures you put into the project yourself keep their normal paths and are never touched.

**Identity.** An embedded texture is identified by the SHA-256 of its bytes alone (`embedded:<sha256>.<ext>`). The extension comes from the image's magic bytes (PNG, JPEG, GIF, WebP, BMP). FBX and OBJ export write each texture's original file (a JPEG stays the same JPEG) instead of re-encoding the pixels, so a model exported and imported again lands on the same texture.

**Autosaves and snapshots.** Autosaves and room snapshots are plain JSON, so the embedded textures they use are copied into `AiWorldEd/.Local/TextureCache/` (`<sha256>.<ext>`, plus `<sha256>.json` with the name). Restoring an autosave or a snapshot takes them from there. Levels never depend on this folder: they carry their own textures.

**Cache cleanup.** A cached texture is deleted as soon as no autosave, autosave copy or room snapshot uses it; there is no trash. Textures the open scene or its undo history uses, and files written in the last ten minutes, stay. If an autosave or snapshot can't be read, nothing is deleted. The first pass runs five minutes after you open a writable project folder, the next one an hour after a pass has finished. A pass works in slices of a few milliseconds and only while you are idle (no input for 30 seconds, or the tab is in the background): input pauses it, and it never runs while a level loads. Entering a collaboration room, as owner or member, cancels it; leaving the room starts the five-minute countdown again. Closing the project cancels it too. There is no lock: with two editors on one project, a texture one of them deletes is written again by the other's next autosave.

**Levels and textures.** A level names the textures of the project by their path. Textures that are not files of the project travel inside the `.aiworld` file (see [Save a scene](files_import_and_export.md#save-a-scene)), so a level can be saved anywhere, also outside the project.

## Missing textures

A texture that is not on disk is never removed from the level. Objects keep its path, saved scenes keep it, and it shows as a **pink checkerboard** (the normal checker tinted magenta) so it stands out from the plain grey checker, which means "no texture".

- The Texture Browser lists such textures at the end, under **Used in the level, missing on disk**, with a pink tile and "(missing)" in the name. The footer counts them, for example `12 texture(s) · 2 missing`.
- The bevel volume's texture list shows them too, as `walls/brick.png (missing)`, so the stored choice stays visible.
- As soon as the file is there again (copied back into the folder, or after opening a project that has it), the pink checker is replaced by the image on every object, live. Replacing a file on disk updates it live in the same way.
- A missing path also resolves, without changing the saved path, to the one texture in the project with the same file name, for example `old/brick.png` to `walls/brick.png`, or to an embedded texture imported under that name. When two textures share the name, neither is used and the pink checker stays. A missing embedded texture (`embedded:<sha256>.<ext>`) resolves to the embedded texture with the same hash under any extension, or else to an image file of the project with exactly these bytes (hashes come from the cache in `AiWorldEd/.Local/TextureHashes.json`; a new or changed file is hashed once). In a room the owner sends that file to members asking for the embedded texture.

## Online and offline

- **Offline** (no room, or after leaving one): the Project panel shows your own project folder and you can open, close and reopen it.
- **In a room as a member**: the panel shows the room owner's project, read-only. You browse and apply the owner's textures, but cannot open your own folder; the panel says why. Scenes and models of the owner are not shared.
- **In a room as the owner**: your own project stays fully usable, and it is the texture source for everyone in the room.
- **After leaving a room** your last local project comes back (one click on **Reopen** when the browser asks for permission again), or the panel is empty when none was open. The owner's textures are dropped when you leave: objects that use them keep their paths and show the pink missing checker until those files exist in your project. The room scene you kept is autosaved into your restored project.

## Live updates

The editor watches the project while it is open:

- Copy or paste an image into the folder in your file manager and it appears in the panel and the Texture Browser within about a second. Changed images update on every object that uses them; deleted images show the pink missing checker until they are back (see [Missing textures](#missing-textures)).
- Chrome and Edge with the `FileSystemObserver` API get change events directly. Other browsers and the desktop app check the folder every 2 seconds while the editor is visible and every 15 seconds while it is in the background. When nothing changed a check costs only a directory listing.
- Copying hundreds of files at once is handled as one update.

In an [online room](collaboration.md#textures) the owner's project is the texture source for everyone: a picture the owner pastes into the folder becomes available to every member right away.

## Autosave and recovery

With a project open, the editor saves your scene into the project folder by itself. There are no save dialogs, it works offline, and it does not use browser storage.

- The autosave is written a few seconds after you stop changing things, at most every 15 seconds. Very large scenes save less often, so saving never takes more than a small fraction of the time.
- Files live in `AiWorldEd/.Local/Autosave/` inside the project. Each scene has its own file, named after the scene file (`untitled.autosave.json` for a scene that was never saved).
- Writes are atomic: a crash or power loss in the middle of a save leaves the previous autosave intact.
- Older copies are kept in `AiWorldEd/.Local/Autosave/History/`: the last 10, plus one per hour for the last 48 hours.
- Nothing runs while you are not editing.

**Recovery.**

- When you open a project while the editor holds no work of its own, the newest autosave is offered: **Restore** loads it, **Not Now** keeps the current scene.
- When you open a scene from the panel and its autosave is newer than the file, you choose between **Open Autosave** and **Open File**.
- You are asked once per autosave. Older copies stay in `AiWorldEd/.Local/Autosave/History/` as a safety net; each is a `.json` file whose `data` field is a normal scene.

## Browser support

| Browser or app         | Project panel  | Live updates                       | Autosave and snapshots on disk |
| ---------------------- | -------------- | ---------------------------------- | ------------------------------ |
| Chrome, Edge (desktop) | Yes            | Yes (`FileSystemObserver` or poll) | Yes                            |
| AiWorldEd desktop app  | Yes            | Yes (poll)                         | Yes                            |
| Firefox, Safari        | Read-only copy | No                                 | No                             |

Firefox and Safari cannot keep access to a folder. The panel says so and still lets you pick a folder: you get a read-only copy of its files for this visit, without live updates or autosave. Use Chrome, Edge or the desktop app for the full project folder.

## Troubleshooting

- **"Reopen" asks for permission every time.** That is how browsers protect folders; the permission lasts until the tab is closed.
- **A new texture does not appear.** Check that its extension is one of the compatible ones and that it is not inside a hidden folder.
- **An imported texture is not in the Texture Browser.** Click **Show Imported**.
- **Autosave says it cannot write.** The browser was given read-only access. Close the project and open it again, allowing edit access.
