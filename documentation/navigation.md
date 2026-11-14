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

Fly and play movement use those physical key positions on every layout, including Colemak (W A R S) and AZERTY (Z Q S D). Command shortcuts still follow the typed letter.

The editor captures the pointer during right- or middle-mouse navigation so you can continue moving without hitting the viewport edge. Release the mouse button to return the pointer.

Tool shortcuts such as `W`, `E`, `R`, `T`, and `A` are deliberately suppressed while right-mouse fly navigation is active. This prevents flying forward from unexpectedly changing tools.

## Play mode physics

Play mode collides the player character with the level through Rapier. Outside play mode there is no physics at all, so editing costs nothing extra. Every brush gets its own collider, so an edit, local or from a collaborator, only rebuilds the colliders of the brushes it touched. Colliders within 8 m of the character are rebuilt in the same frame; the rest follow, nearest first, within about 1 ms per frame, and keep their old shape until then, so nothing vanishes under you.

- **Edits around the player.** A brush that lands on, under or around the character pushes it out to the nearest free spot (up first, at most 2 m sideways), lifts it on top when it is fully enclosed, or puts it back at its last safe position. Removing the floor lets it fall.
- **Third-person camera.** Hold the right mouse button in play mode to orbit the character. The camera sweeps a small sphere from the head to the wanted position and stops in front of walls, ceilings and floors, so it never looks through or hides behind geometry.
- **Tennis balls.** Click the left mouse button to throw a tennis ball in your color where you look (14 m/s with a slight upward lift). Balls bounce with a sound (72 % of the speed is kept), roll, come to rest and fall again when the floor under them is removed. Each player has at most 4 balls; a fifth replaces their oldest. Balls exist only while you are in play mode. They bounce off each other and off players, and walking players push them, but balls never push players. They are never picked, selected, saved, undone or used for CSG.
- **In a room.** Your editor simulates your balls, and everyone else draws them a quarter second in the past, without physics of their own. Your balls bounce off other players and off the balls of others, which do not move for you. Someone who joins later sees resting balls right away. Balls are a low-priority extra: they never delay edits, and they vanish when their player leaves play mode or the room.

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
