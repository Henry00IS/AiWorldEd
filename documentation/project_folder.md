# Project Folder

The **Project** panel works like the asset browser in Unity: you pick one folder on disk as your project, and the editor shows every compatible file in it, keeps watching it for changes and writes an autosave into it. The Texture Browser reads its textures from the same folder.

## Open a project

1. Click **Project** in the top toolbar. The panel opens as a floating window you can move and resize.
2. Click **Open project folder** and choose a folder.
3. Chrome and Edge ask for permission to read and write the folder. Allow **edit** access so the editor can autosave.

The editor remembers the folder. On your next visit the panel shows **Reopen "<folder>"**; one click asks the browser for permission again (browsers require that click) and the project opens where you left off.

**Close project** stops watching the folder. Nothing on disk is changed.

## The panel

- **Folder tree (left).** Every folder of the project. Click a folder to show its files. Hidden folders (names starting with a dot, including the editor's own `.aiworlded`), `node_modules` and `__pycache__` are not listed.
- **Files (right).** Compatible files of the selected folder as tiles. Textures show a thumbnail; scenes and models show a label (`JSON`, `VMF`, `OBJ`). Hover a tile for its path, size and date.
- **Search.** Type in the search box to search the whole project by name or path. Clear it to return to the selected folder.
- **Double-click** a file to use it:
  - a texture is selected in the Texture Browser, ready to apply;
  - a scene (`.json`) is loaded (asks first when the current scene has unsaved changes);
  - a `.vmf` or `.obj` file is imported.

Compatible files are `png`, `jpg`, `jpeg`, `gif`, `webp`, `bmp` (textures), `json` (scenes), `vmf` and `obj`. Other files are ignored. Very large projects are capped at 20000 files and 4000 folders; the panel shows at most 600 tiles at once (search to narrow it down).

## Textures come from the project

The Texture Browser lists every texture of the open project. A texture's id is its path inside the project, for example `walls/brick_red.png`, so scenes saved inside a project keep working when the project moves to another place or another computer.

While no project is open, the Texture Browser shows **Open project folder** as a shortcut; once a project is open that button is gone, because there is only one place textures come from.

## Missing textures

A texture that is not on disk is never removed from the level. Objects keep its path, saved scenes keep it, and it shows as a **pink checkerboard** (the normal checker tinted magenta) so it stands out from the plain grey checker, which means "no texture".

- The Texture Browser lists such textures at the end, under **Used in the level, missing on disk**, with a pink tile and "(missing)" in the name. The footer counts them, for example `12 texture(s) · 2 missing`.
- The bevel volume's texture list shows them too, as `walls/brick.png (missing)`, so the stored choice stays visible.
- As soon as the file is there again (copied back into the folder, or after opening a project that has it), the pink checker is replaced by the image on every object, live. Replacing a file on disk updates it live in the same way.

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
- Files live in `.aiworlded/autosave/` inside the project. Each scene has its own file, named after the scene file (`untitled.autosave.json` for a scene that was never saved).
- Writes are atomic: a crash or power loss in the middle of a save leaves the previous autosave intact.
- Older copies are kept in `.aiworlded/autosave/history/`: the last 10, plus one per hour for the last 48 hours.
- Nothing runs while you are not editing.

**Recovery.**

- When you open a project while the editor holds no work of its own, the newest autosave is offered: **Restore** loads it, **Not now** keeps the current scene.
- When you open a scene from the panel and its autosave is newer than the file, you choose between **Open autosave** and **Open file**.
- You are asked once per autosave. Older copies stay in `.aiworlded/autosave/history/` as a safety net; each is a JSON file whose `data` field is a normal scene.

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
- **Autosave says it cannot write.** The browser was given read-only access. Close the project and open it again, allowing edit access.
