# SolidScript

SolidScript builds level geometry from a list of command lines: add a **SolidScript** generator to a solid model, press **Edit Script**, and every line you add turns into brushes in the viewport as you type.

## Writing a script

Double-click a command in the palette, or drag it in, to add it below the current line. Double-click a line to change its values. Blocks such as Repeat, Translate or If hold the lines up to their End. A block with nothing inside is no mistake: it does nothing, and the Output shows a ⚠️ warning with a link to its line. With several lines selected whose blocks are whole (every If with its End), double-clicking a block command wraps them: it goes above the first line and its End below the last. When the selection cuts a block, the command goes below the current line as usual.

<details>
<summary>More Details</summary>

- Fields take plain values (`2`, `1, 0, 0`), variables in brackets (`[Width]`) and formulas after an equals sign (`[=[Width] / 2]`). Text inside a formula takes double quotes, such as `[=IsString("3e")]`; bare words there are names, so `3e` or `hello` get an error that shows the quoted form. Single quotes are kept for later use.
- Names ignore case: `[count]` and `[Count]` are one variable, and `sin(65)` is `Sin(65)`. Write them in PascalCase, such as `[StepHeight]`, `[Local.Width]`, `[Persistent.Presses]`, `Function Staircase` and `CharacterCode("A")`, like the examples do; the explorer keeps the spelling of the first Set or Input.
- Functions such as `Sin`, `Lerp`, `Remap`, `Split` or `TimeText` work in formulas; hover one in the suggestions to see what it does. `ItemOr([List], 5, 0)` reads an item with a fallback when there is none.
- A Texture field in a line's window has **Pick** and **Type**: Pick uses the same texture picker as the inspector and stores the texture's full library path; Type takes a name, a variable such as `[Wall]` or a formula. A field whose text uses `[` opens on Type.
- While a field is typed, suggestions follow the caret: a field that takes a few words, such as Which of Select Faces, lists them first; after `[` the matching variables, system values and functions show; inside any call, such as `[=Clamp(`, a hint under the field shows the full signature, such as `Clamp(Value: Number, Min: Number, Max: Number) -> Number`, with the input being typed in bold, that input's kind and meaning, and what the function does; it follows the caret as commas are typed, also in nested calls, and the script's own Functions show their inputs. Click a suggestion, or press Enter or Tab, to write it at the caret. Entering or clicking a field whose text before the caret ends with `[` (not `$[`) opens the suggestions again.
- **Stop Script** ends the script there, also from inside a Repeat or a Function, and keeps what it built. Run shared lines from many places with a Function and Call. A mistake always stops the script and highlights its line; there is no error catching.
- Shift+click or Shift+↑/↓ selects lines and Ctrl+click picks single lines; dragging any selected line moves them all, picked lines squashed together where they land, as one undo step. Ctrl+C, Ctrl+X and Ctrl+V copy, cut and paste them, also between scripts, and Ctrl+D duplicates them. Space adds an empty line above the current line and moves there; Shift+Enter or Insert adds one below.
- **F4**, **Ctrl+/**, **Off / On** in the toolbar or **Turn Off** in the right-click menu turns the selected lines off and on: they stay, are saved and synced, but do not run. A **Note** line holds a comment.
- In the help panel and a line's manual, every block name is a link: clicking it selects that block in the command list, scrolls to it and shows its help. The search is cleared only when it hides that block.
- In a shared room, script edits sync line by line: two people changing different lines both keep their change, the later write wins on the same line, and Undo only reverts your own lines. When someone else edits, your scroll position, current line, selection and an open configurator stay put. Breakpoints stay on your computer; turned-off lines are part of the script and sync.
- The script has its own undo history, apart from the level's: while the editor has focus, Ctrl+Z undoes and Ctrl+Y or Ctrl+Shift+Z redoes script edits only (typing, inserting, deleting, moving, Off/On, a line window's OK, paste), and level undo never changes the script.
- **New** starts an empty script and **Examples…** opens a ready one; both can be undone with the script's undo.

</details>

## Running and debugging

The script runs on every change. **Start** builds everything, **Debug** builds one solid at a time, **Step** builds the next one, and **Stop** shows the whole script again.

<details>
<summary>More Details</summary>

- **F9** sets a breakpoint on the current line; Start and Debug pause before it runs.
- **Ctrl+F10** builds up to the line at the cursor.
- **Trace** marks the lines the debugger has passed.
- A small **×N** at the end of a line says how often it ran; hover it for its time.
- The **Variables** tab lists every name with its value at the step shown, and the **System** values such as `Time.Year`, `Editor.Version` or `Box.Width`.

</details>

## Inputs

**Input** lines become fields in the inspector, so the same script builds many variants: a staircase with a Steps count, a column with a Height.

<details>
<summary>More Details</summary>

- A **curve** input opens the curve editor; read it with `CurveAt(curve, x)` or `ProfilePoints(curve, height, radius)`.
- A **texture** input picks a library texture; wrap brushes in a **Texture** block, such as `Texture [Wall]`, to paint every face with it. An inner Texture block wins, and brushes outside keep the generator's texture. **Texture Faces** gives the faces Select Faces picked their own texture.
- **Input Group** shows the inputs inside it under a heading, **Input Row** puts them side by side, **Show Inputs When** shows them only while another input has a value, and **Input Note** shows a line of text among them.
- When Input Changes and When Button Pressed blocks can check and change inputs.
- **When Baked** runs just before the generator is baked, so a light preview can bake as a detailed version; undo brings back the old inputs.
- Values stored as `Persistent.Name` stay between runs.

</details>

## Faces and points

**Select Faces** picks faces of the shapes built above it; the face commands then work on them. Inside a For Each round it picks faces of what that round built, and after the loop the outer pick comes back, so Select Faces can be nested.

<details>
<summary>More Details</summary>

- **For Each Selected Face** runs lines once per picked face, and the shapes built inside stand on that face; **Place On Face** adds a Lift, and **Extrude Face**, **Inset Face** and **Bevel Edges** work on its face.
- **For Each Scattered Point** spreads points over the picked faces, more on bigger ones; the same Seed always gives the same points.
- **Align To** turns the lines inside so their Z points along a direction, such as `[Point.Normal]`.

</details>

## Paths and meshes

**Curve To Mesh** sweeps a circle or your own outline along a list of points, such as a rail or a pipe.

<details>
<summary>More Details</summary>

- Each stretch becomes one solid, cut on the mitre so the pieces meet; **As Mesh** builds one mesh instead.
- `Resample(points, count)` spaces points evenly along a path, and `PathLength(points)` measures it.
- **Merge By Distance** welds mesh corners that nearly touch. **Mesh From Shapes** turns shapes into a real mesh.

</details>

## Generator or modifier

A script can be a **generator**, which builds new geometry from nothing, or a **modifier** on a brush, mesh or group, which works on what it is added to. **Can Be Used As** on the Script row says which uses a script allows, and **If Used As** lets one script do something different in each.

<details>
<summary>More Details</summary>

- Generator is on for every script that sets nothing. A script that does not allow a use is refused there with a message saying which box to turn on; the use a step already has stays on.
- Add a SolidScript modifier from **Add Modifier** on a brush, mesh, group or modifier volume. The old generators still cannot go on brushes or groups.
- As a modifier, the brushes it receives pass on unchanged unless the script has an **Input Brushes** line. What the script builds is added, with the script origin at the centre of what it receives; Operation picks whether it is added, cut out or intersected.
- `[Script.Usage]` is Generator or Modifier. `[Input.Brushes]`, `[Input.Faces]`, `[Input.Min]`, `[Input.Max]`, `[Input.Size]` and `[Input.Center]` describe what a modifier receives (all zero for a generator), and **Input Shapes** builds copies of those brushes to move, mirror or cut.
- The **Pedestal** example works both ways: as a generator it builds a box on a slab, as a modifier it puts the slab under the brush.
- **Input Brushes** passes the received brushes on, moved by the Translate, Rotate, Scale, Mirror or Matrix blocks around it, with their textures and materials. The first one that runs changes them; each later one adds a copy. **Built-In Modifiers** in the Examples window rebuilds Shear, Linear Array, Radial Array, Transform Array and Mirror this way, and they change brushes exactly like the built-in modifiers (the arrays measure the whole input, not each piece; Mirror places its plane on the received brushes and has no Bisect).

</details>

## Examples

The **Examples** window holds showcase scripts such as the Spiral Staircase, small lessons, and the built-in generators and modifiers rebuilt line by line, so you can see how they work and change them.
