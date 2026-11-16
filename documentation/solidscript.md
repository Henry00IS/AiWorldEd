# SolidScript

SolidScript builds level geometry from a list of command lines: add a **SolidScript** generator to a solid model, press **Edit Script**, and every line you add turns into brushes in the viewport as you type.

## Writing a script

Double-click a command in the palette, or drag it in, to add it below the current line. Double-click a line to change its values. Blocks such as Repeat, Translate or If hold the lines up to their End.

<details>
<summary>More Details</summary>

- Fields take plain values (`2`, `1, 0, 0`), variables in brackets (`[width]`) and formulas after an equals sign (`[=[width] / 2]`).
- Functions such as `sin`, `lerp`, `remap`, `split` or `time_text` work in formulas; hover one in the suggestions to see what it does.
- Shift+click or Shift+↑/↓ selects lines, Ctrl+C, Ctrl+X and Ctrl+V copy, cut and paste them, also between scripts, and Ctrl+D duplicates them.
- **F4** or **Ctrl+/** turns lines off and on: they stay but do not run.
- **New** starts an empty script and **Examples…** opens a ready one; both can be undone.

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

- When Input Changes and When Button Pressed blocks can check and change inputs.
- Values stored as `persistent.name` stay between runs.

</details>

## Faces and points

**Select Faces** picks faces of the shapes built above it; the face commands then work on them.

<details>
<summary>More Details</summary>

- **For Each Selected Face** runs lines once per picked face; **Place On Face**, **Extrude Face**, **Inset Face** and **Bevel Edges** work on its face.
- **For Each Scattered Point** spreads points over the picked faces, more on bigger ones; the same Seed always gives the same points.
- **Align To** turns the lines inside so their Z points along a direction, such as `[Point.Normal]`.

</details>

## Examples

The **Examples** window holds showcase scripts such as the Spiral Staircase, small lessons, and the built-in generators rebuilt line by line, so you can see how they work and change them.
