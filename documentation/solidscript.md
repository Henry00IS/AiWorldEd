# SolidScript

SolidScript builds level geometry from a list of command lines: add a **SolidScript** generator to a solid model, press **Edit Script**, and every line you add turns into brushes in the viewport as you type.

## Writing a script

Double-click a command in the palette, or drag it in, to add it below the current line. Double-click a line to change its values. Blocks such as Repeat, Translate or If hold the lines up to their End. A block with nothing inside is no mistake: it does nothing, and the Output shows a ⚠️ warning with a link to its line. With several lines selected whose blocks are whole (every If with its End), double-clicking a block command wraps them: it goes above the first line and its End below the last. When the selection cuts a block, the command goes below the current line as usual.

<details>
<summary>More Details</summary>

- Scripts use the editor's axes: X right, Y up and Z toward the front, so a Cube of `1, 2, 3` is 2 metres tall and `[$Box.Size]` is width, height and depth. Flat outlines are drawn with their own X and Y: Linear Extrude lays them on the ground (their Y running to the back) and pulls them up, Rotate Extrude spins them around the upright Y axis with their Y as the height.
- Fields take plain values (`2`, `1, 0, 0`), vectors in brackets (`[20, 30, 10]`, the same as `[=Vector(20, 30, 10)]`; any bracket that works out to exactly three numbers, such as `[[X], 0, 2]`), lists of vectors (`[1, 2, 3], [4, 5, 6]`), variables in brackets (`[Width]`) and formulas after an equals sign (`[=[Width] / 2]`). Text inside a formula takes double quotes, such as `[=IsString("3e")]`; bare words there are names, so `3e` or `hello` get an error that shows the quoted form. Single quotes are kept for later use.
- Only the commas typed in a field separate list items; a value is never split again, so For Each In `[Text], 23` with Text set to `Hello, World` walks `Hello, World` and `23`. Write `$,` for a comma inside an item, such as `a$, b, c` for the two items `a, b` and `c`. `[=Split([Text], ",")]` splits text, `[=Join([List], ", ")]` joins a list, and `[=Parse([Text])]` reads text like a typed field: `4,5,5` gives a vector and `5+5` gives 10.
- A script that builds nothing runs and shows its output with a warning, for trying out lines. An error keeps the output and variables from before it.
- **Set** may name a **Type**, such as Number, Yes/No, Text List or Face List; the variable then always holds that kind. Left empty, the Value gives the kind's empty value: 0, no text, `0, 0, 0`, No or a new empty list. A list Type splits the Value on commas, so `t,6mv` as a Text List is `t` and `6mv`; `$[` and `$]` still write brackets as text. Clicking the Value of a Yes/No suggests Yes and No.
- Names ignore case: `[count]` and `[Count]` are one variable, and `sin(65)` is `Sin(65)`. Write them in PascalCase, such as `[StepHeight]`, `[Local.Width]`, `[Persistent.Presses]`, `Function Staircase` and `CharacterCode("A")`, like the examples do; the explorer keeps the spelling of the first Set or Input.
- Functions such as `Sin`, `Lerp`, `Remap`, `Split` or `TimeText` work in formulas; hover one in the suggestions to see what it does. `ItemOr([List], 5, 0)` reads an item with a fallback when there is none.
- A Texture field in a line's window has **Pick** and **Type**: Pick uses the same texture picker as the inspector and stores the texture's full library path; Type takes a name, a variable such as `[Wall]` or a formula. A field whose text uses `[` opens on Type.
- While a field is typed, suggestions follow the caret: a field that takes a few words, such as Which of Select Faces, lists them first; after `[` the matching variables, system values and functions show; inside any call, such as `[=Clamp(`, a hint under the field shows the full signature, such as `Clamp(Value: Number, Min: Number, Max: Number) -> Number`, with the input being typed in bold, that input's kind and meaning, and what the function does; it follows the caret as commas are typed, also in nested calls, and the script's own Functions show their inputs. Click a suggestion, or press Enter or Tab, to write it at the caret. Entering or clicking a field whose text before the caret ends with `[` (not `$[`) opens the suggestions again.
- **Stop Script** ends the script there, also from inside a Repeat or a Function, and keeps what it built. Run shared lines from many places with a Function and Call. A mistake always stops the script and highlights its line; there is no error catching.
- Shift+click or Shift+↑/↓ selects lines and Ctrl+click picks single lines; dragging any selected line moves them all, picked lines squashed together where they land, as one undo step. Ctrl+C, Ctrl+X and Ctrl+V copy, cut and paste them, also between scripts, and Ctrl+D duplicates them. Space adds an empty line above the current line and moves there; Shift+Enter or Insert adds one below.
- **F4**, **Ctrl+/**, **Off / On** in the toolbar or **Turn Off** in the right-click menu turns the selected lines off and on: they stay, are saved and synced, but do not run. Only the selected lines change: turning off a block line such as If also turns off its End and Else, and the lines inside keep running without the block; turning it on again turns its off End and Else back on when it has no End. Select the block with its contents to turn it all off. **End** in Logic adds an End by hand when one is missing. A **Note** line holds a comment.
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
- Drag the splitters beside the palette, beside the help column and above the output to resize them; the editor keeps the sizes for next time.
- The **Settings** tab holds **Can Be Used As** (Generator, Modifier; the use of the step you opened stays on, as in the inspector) and an **Author** line saved with the script. Both are script edits, so Ctrl+Z in the editor undoes them.
- The **Variables** tab lists every name with its value at the step shown, and the **System** values such as `$Time.Year`, `$Editor.Version` or `$Box.Width`. The generator examples size themselves from `[$Box.Width]`, `[Box.Depth]` and `[Box.Height]`; where a script runs without a box, such as a modifier, those values read as 1 and the Output shows a ⚠️ warning on the line instead of stopping. While you edit a script that Can Be Used As Modifier, a check that does not run the script looks for lines a modifier would run that read Box values (it follows If Used As and its Else and skips off lines) and lists them as ⚠️ warnings in the Output; it waits until typing pauses and the page is idle.

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

## Brushes, faces and points

Brushes, faces, edges and corners are values, like numbers and text. A dot reads their parts: `[Top.Normal]`, `[Brush.Faces.Count]`, `[Edge.Length]`, `[Faces.Center]` of a whole list. `[Face.Data.Height]` keeps your own values on one. Set through a list writes every item, so Set `Brush.Edges.Data.Kind` to `trim` marks every edge of a brush, and `[Brush.Edges.Data.Kind]` reads one value per edge. System values start with `$`: `[$Selected.Faces]` is what the last **Select Faces** picked, `[$Selected.Brushes]` what the lines below work on, `[$Input.Brushes]` what a modifier receives.

<details>
<summary>More Details</summary>

- **Select Faces** picks faces into `[$Selected.Faces]` and into its **Into** variable. Inside a For Each round it picks faces of what that round built, and after the round the outer pick comes back, so Select Faces can be nested.
- **For Each** walks any list: For Each `[Face]` In `[$Selected.Faces]`, with an optional **Key** for its number. In a Data value it walks the keys.
- Every face command takes **Of**: a face, edge, brush, a list of them, or a brush **Name** such as Knob (in any case, also the shapes of a Part by its name). Empty takes `[$Selected.Faces]`. See the Panel With Knobs example.
- **Place On Face** builds the shapes inside standing on its face the way they stand on the ground (Y out of the face), with a Lift.
- **Extrude Face** names its new brushes (**Into**), their end faces (**Top**) and side faces (**Sides**); **Inset Face** names **Inner** and **Ring**; **Bevel Edges** names its new faces and skips edges of faces it made itself.
- **Scatter Points** spreads points over faces, more on bigger ones, into a list of positions and a list of **Normals**; the same Seed always gives the same points.
- **Align To** turns the lines inside so their up (Y) points along a direction, such as a face's `[Face.Normal]`.

</details>

## Paths and meshes

**Curve To Mesh** sweeps a circle or your own outline along a list of points, such as a rail or a pipe. Points are vectors in brackets separated by commas, such as `[0, 0, 0], [1, 0, 0], [2, 1, 0]`, or a list variable such as `[Path]`; a Profile outline ignores z.

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
- `[$Script.Usage]` is Generator or Modifier. `[$Input.Brushes]`, `[$Input.Faces]`, `[$Input.Min]`, `[$Input.Max]`, `[$Input.Size]` and `[$Input.Center]` describe what a modifier receives (all zero for a generator), and **Input Shapes** builds copies of those brushes to move, mirror or cut.
- The **Pedestal** example works both ways: as a generator it builds a box on a slab, as a modifier it puts the slab under the brush.
- **Input Brushes** passes the received brushes on, moved by the Translate, Rotate, Scale, Mirror or Matrix blocks around it, with their textures and materials. The first one that runs changes them; each later one adds a copy. **Built-In Modifiers** in the Examples window rebuilds Shear, Linear Array, Radial Array, Transform Array and Mirror this way, and they change brushes exactly like the built-in modifiers (the arrays measure the whole input, not each piece; Mirror places its plane on the received brushes and has no Bisect).

</details>

## Examples

The **Examples** window holds showcase scripts such as the Spiral Staircase, small lessons, and the built-in generators and modifiers rebuilt line by line, so you can see how they work and change them.
