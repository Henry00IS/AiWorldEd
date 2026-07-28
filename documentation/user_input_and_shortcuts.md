# User Input and Shortcuts

AiWorldEd supports both direct manipulation and keyboard-driven editing. Most shortcuts are ignored while you are typing in a text field, number field, list, or other form control.

## Mouse input

### In a viewport

- Left-click selects a visible object or face, depending on the active selection tool.
- `Shift` with selection adds to the selection.
- `Ctrl` with selection toggles membership in the selection.
- Drag selection can collect multiple objects or faces.
- Hold `Ctrl+Alt+Left Mouse` and drag to orbit around the Perspective view
  focus. This binding is configurable in **Settings > Mouse**.
- Right mouse navigates the 2D views and activates fly-look in Perspective.
- Middle mouse pans the Perspective camera.
- The wheel zooms or moves the camera.
- Right-click may open a context menu when navigation is not taking ownership of the gesture.

Perspective orbit uses turntable movement, not trackball rotation, so the
camera remains aligned to the world up axis without rolling. Its Y axis is
inverted by default and can be changed independently in **Settings > Mouse >
Orbit**.

### In the hierarchy

- Click selects an item.
- Double-click the name to rename it.
- Drag an item onto another suitable item to reparent it.
- Use the visibility and lock controls to manage editing state.
- Right-click opens hierarchy actions.

### On transform handles

Drag a colored axis or plane handle to constrain the edit. The exact handles depend on Bounds, Move, Rotate, or Scale mode.

## Default keyboard shortcuts

Shortcuts can be changed in **Settings > Keyboard**. The table below describes the defaults.

### Tools and selection

| Shortcut    | Action                                         |
| ----------- | ---------------------------------------------- |
| `T`         | Bounds resize                                  |
| `W`         | Move                                           |
| `E`         | Rotate                                         |
| `R`         | Scale                                          |
| `Tab`       | Return to Object Select                        |
| `Shift+Tab` | Enter Face Select                              |
| `Escape`    | Cancel the active tool or clear selection      |
| `Delete`    | Delete selected                                |
| `Ctrl+D`    | Duplicate selected                             |
| `Alt+drag`  | Duplicate and move the selection in a viewport |
| `Shift+E`   | Extrude selected faces                         |
| `F11`       | Toggle fullscreen in the desktop app only      |

Earlier builds may have described plain `Tab` as a toggle. In the current default bindings, `Shift+Tab` enters face mode and `Tab` returns to object mode.

### History and files

| Shortcut       | Action         |
| -------------- | -------------- |
| `Ctrl+Z`       | Undo           |
| `Ctrl+Y`       | Redo           |
| `Ctrl+Shift+Z` | Alternate redo |
| `Ctrl+S`       | Save scene     |
| `Ctrl+O`       | Load scene     |
| `Ctrl+Shift+E` | Export GLB     |

### Organization and alignment

| Shortcut  | Action                                               |
| --------- | ---------------------------------------------------- |
| `Shift+G` | Group selected                                       |
| `Shift+U` | Ungroup selected                                     |
| `Alt+G`   | Align to origin                                      |
| `A`       | Cycle alignment restriction through All, X, Y, and Z |

### View and shading

| Shortcut  | Action                           |
| --------- | -------------------------------- |
| `F`       | Fit selection in the active view |
| `Shift+F` | Fit all viewports                |
| `1`       | Solid shading                    |
| `2`       | Wireframe shading                |
| `3`       | Flat shading                     |
| `4`       | Solid with wireframe overlay     |

### Snapping

| Shortcut  | Action                                |
| --------- | ------------------------------------- |
| `.`       | Next snap interval                    |
| `,`       | Previous snap interval                |
| `Shift+.` | Move forward by three interval steps  |
| `Shift+,` | Move backward by three interval steps |

### Clip Plane tool

These keys are interpreted differently while Clip Plane is active:

| Shortcut | Action                          |
| -------- | ------------------------------- |
| `F`      | Flip the side that will be kept |
| `Enter`  | Commit the clip                 |
| `X`      | Split into both sides           |
| `Escape` | Cancel                          |

## When a shortcut does not work

Check the following:

1. Finish or unfocus the current text or number field.
2. Release the right mouse button after fly navigation.
3. Confirm the active tool in the Tools palette.
4. Confirm the current selection is appropriate for the action.
5. Review the Keyboard tab in Settings in case the binding was changed.
