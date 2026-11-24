import type { SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import {
  solidScriptExampleBlock,
  solidScriptExampleIf,
  solidScriptExampleInput,
  solidScriptExampleLine,
  solidScriptExampleNote,
  solidScriptExampleSet,
} from './solid_script_example_lines.js';

/** Pages of the Widget Showcase menu, in the order its toggles list them. */
const SOLID_SCRIPT_EXAMPLE_WIDGET_PAGES = ['Shape', 'Place', 'Aim'] as const;

/**
 * Where the menu floats: beside the box, level with its top. Toggles that share
 * one point stack into a tight list in the scene.
 */
const SOLID_SCRIPT_EXAMPLE_WIDGET_MENU_AT = '[=Vector([BoxSize.X] / 2 + 1.5, [BoxSize.Y] / 2, 0)]';

/**
 * Lines of one menu page: its Button input, the handler that stores the page in
 * a Persistent value, and the toggle that shows whether it is picked.
 *
 * @param page Page name.
 * @param at Where its toggle floats.
 * @returns Input, handler and toggle lines.
 */
function solidScriptExampleWidgetPage(
  page: string,
  at: string,
): { input: SolidScriptLine; handler: SolidScriptLine[]; toggle: SolidScriptLine } {
  return {
    input: solidScriptExampleInput(`Pick${page}`, 'Button', '', { label: page }),
    handler: solidScriptExampleBlock('when_button_pressed', { name: `Pick${page}` }, [
      solidScriptExampleSet('Persistent.Page', page),
    ]),
    toggle: solidScriptExampleLine('widget_toggle', {
      shows: `[=[Page] == "${page}"]`,
      writes: `Pick${page}`,
      at,
      label: page,
    }),
  };
}

/** Every page's input, handler and toggle lines, grouped by kind. */
const SOLID_SCRIPT_EXAMPLE_WIDGET_PAGE_LINES = SOLID_SCRIPT_EXAMPLE_WIDGET_PAGES.map((page) =>
  solidScriptExampleWidgetPage(page, SOLID_SCRIPT_EXAMPLE_WIDGET_MENU_AT),
);

/**
 * A box to edit with every kind of Widget, sorted onto three pages by a row of
 * Widget Toggles that acts as a menu with one page picked.
 */
export const SOLID_SCRIPT_EXAMPLE_WIDGET_SHOWCASE: readonly SolidScriptLine[] = [
  ...solidScriptExampleNote(
    'Select this with Bounds and click Edit to use its widgets. The list of toggles beside the box is a menu: each is a Widget Toggle that presses a Button input, whose When Button Pressed stores the page in Persistent.Page. Persistent values stay between runs, and each toggle shows as on while Page is its own, so picking one turns the others off.',
  ),
  ...SOLID_SCRIPT_EXAMPLE_WIDGET_PAGE_LINES.map((page) => page.input),
  solidScriptExampleInput('BoxSize', 'Vector', '2, 1, 2', { label: 'Box Size' }),
  solidScriptExampleInput('Lid', 'Number', '0.2', { label: 'Lid', min: '0', max: '1' }),
  solidScriptExampleInput('Spot', 'Vector', '0, 1.5, 0', { label: 'Ball' }),
  solidScriptExampleInput('Turn', 'Number', '30', { label: 'Turn' }),
  solidScriptExampleInput('Facing', 'Vector', '1, 1, 0', { label: 'Facing' }),
  ...SOLID_SCRIPT_EXAMPLE_WIDGET_PAGE_LINES.flatMap((page) => page.handler),
  ...solidScriptExampleNote('Before any toggle is clicked Persistent.Page holds nothing yet, so the Shape page shows.'),
  solidScriptExampleSet('Page', 'Shape'),
  ...solidScriptExampleIf('[=[Persistent.Page] == "Place" || [Persistent.Page] == "Aim"]', [
    solidScriptExampleSet('Page', '[Persistent.Page]'),
  ]),
  ...SOLID_SCRIPT_EXAMPLE_WIDGET_PAGE_LINES.map((page) => page.toggle),
  ...solidScriptExampleIf('[=[Page] == "Place"]', [
    ...solidScriptExampleNote(
      'Widget Point moves the ball along x, y or z. Widget Angle is a dial round the foot of the box that turns it about y.',
    ),
    solidScriptExampleLine('widget_point', { shows: '[Spot]', writes: 'Spot', label: 'Ball', color: 'Cyan' }),
    solidScriptExampleLine('widget_angle', {
      shows: '[Turn]',
      writes: 'Turn',
      at: '[=Vector(0, -[BoxSize.Y] / 2, 0)]',
      radius: '2',
      color: 'Orange',
    }),
  ]),
  ...solidScriptExampleIf('[=[Page] == "Aim"]', [
    ...solidScriptExampleNote(
      'Widget Direction points an arrow above the lid, and Debug Draw draws a Ray along it, twice as long, that builds nothing.',
    ),
    solidScriptExampleLine('widget_direction', {
      shows: '[Facing]',
      writes: 'Facing',
      at: '[=Vector(0, [BoxSize.Y] / 2 + [Lid] + 0.6, 0)]',
      length: '1.5',
    }),
    solidScriptExampleLine('debug_draw', {
      shape: 'Ray',
      at: '[=Vector(0, [BoxSize.Y] / 2 + [Lid] + 0.6, 0)]',
      normal: '[Facing]',
      distance: '3',
      color: 'Yellow',
    }),
  ]),
  ...solidScriptExampleBlock('transform', { rotate: '0, [Turn], 0' }, [
    ...solidScriptExampleIf('[=[Page] == "Shape"]', [
      ...solidScriptExampleNote(
        'Inside the Transform, Widget Size drags the faces of the turned box. Widget Slider, beside it, lifts the lid, kept between 0 and 1.',
      ),
      solidScriptExampleLine('widget_size', { shows: '[BoxSize]', writes: 'BoxSize', color: 'Green' }),
      solidScriptExampleLine('widget_slider', {
        shows: '[Lid]',
        writes: 'Lid',
        at: '[=Vector(-[BoxSize.X] / 2 - 0.5, [BoxSize.Y] / 2, 0)]',
        min: '0',
        max: '1',
      }),
    ]),
    solidScriptExampleLine('cube', { size: '[BoxSize]' }),
    ...solidScriptExampleBlock('transform', { move: '[=Vector(0, [BoxSize.Y] / 2 + [Lid], 0)]' }, [
      solidScriptExampleLine('cube', {
        size: '[=Vector([BoxSize.X], 0.1, [BoxSize.Z])]',
        anchor: 'Center, Bottom, Center',
      }),
    ]),
  ]),
  ...solidScriptExampleBlock('transform', { move: '[Spot]' }, [solidScriptExampleLine('sphere', { r: '0.3' })]),
];
