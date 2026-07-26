# Navigation

Good navigation in AiWorldEd means using the Perspective view to understand the space and the orthographic views to place things accurately.

## Perspective view

The Perspective viewport uses a first-person fly camera.

| Input                     | Result                                   |
| ------------------------- | ---------------------------------------- |
| Hold right mouse and move | Look around                              |
| Right mouse + `W` / `S`   | Move forward / backward                  |
| Right mouse + `A` / `D`   | Move left / right                        |
| Right mouse + `Q` / `E`   | Move down / up                           |
| Right mouse + `Shift`     | Fly faster while using movement keys     |
| Middle-mouse drag         | Pan across the view plane                |
| Mouse wheel               | Move along the current viewing direction |

The editor captures the pointer during right- or middle-mouse navigation so you can continue moving without hitting the viewport edge. Release the mouse button to return the pointer.

Tool shortcuts such as `W`, `E`, `R`, `T`, and `A` are deliberately suppressed while right-mouse fly navigation is active. This prevents flying forward from unexpectedly changing tools.

## Top, Front, and Side views

The three orthographic views use simpler CAD-style navigation.

| Input            | Result   |
| ---------------- | -------- |
| Right-mouse drag | Pan      |
| Mouse wheel up   | Zoom in  |
| Mouse wheel down | Zoom out |

These views stay aligned to a world plane:

- Top is ideal for room footprints, corridors, and horizontal spacing.
- Front is useful for height, vertical placement, and front silhouettes.
- Side is useful for depth, slopes, and side silhouettes.

## Frame the work

Use framing whenever you become lost or a newly created object is not visible.

- `F` frames the current selection.
- `Shift+F` fits all viewports.
- The Fit icon in a viewport header frames the selection in that individual view.

If nothing is selected, a fit action may use the scene's available bounds or report that there is nothing suitable to frame.

## A reliable editing rhythm

For architectural work:

1. Establish the footprint in Top view.
2. Check height in Front or Side view.
3. Inspect the volume from Perspective.
4. Press `F` frequently as the selection changes.

For small props:

1. Select the object in the hierarchy.
2. Frame it in Perspective.
3. Use an orthographic view for precise axis edits.
4. Return to Perspective to judge the final form.

## Navigation settings

Open Settings and use the Mouse tab to adjust:

- Look sensitivity and X/Y inversion.
- Pan sensitivity and X/Y inversion.
- Fly movement speed.
- Movement sensitivity.
- Mouse-wheel inversion.
- Optional alternate camera movement behaviors.

If the camera feels wrong, adjust one category at a time. Start with look sensitivity, then movement speed, then inversion preferences.
