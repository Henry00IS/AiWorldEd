import { afterEach, describe, expect, it } from 'vitest';
import { curveFromPolyline } from '@/curve/model/curve_model.js';
import { solidScriptCommandFind } from '@/solid_script/commands/solid_script_command_catalog.js';
import { curveEditorCloseActive } from '@/curve/ui/curve_editor.js';
import { SolidScriptConfigurator } from '@/solid_script/ui/solid_script_configurator.js';
import { SolidScriptConfiguratorCurves } from '@/solid_script/ui/solid_script_configurator_curves.js';
import { solidScriptResourceCurve, type SolidScriptResource } from '@/solid_script/document/solid_script_resource.js';

afterEach(() => {
  curveEditorCloseActive();
  document.body.replaceChildren();
});

describe('SolidScript configurator curve field', () => {
  it('shows a curve picker with Base/Top markers and Pick/Type toggle on Column Profile', () => {
    const command = solidScriptCommandFind('column')!;
    const saved: Record<string, string>[] = [];
    new SolidScriptConfigurator(document.body, command, {}, (written) => saved.push(written)).show();

    const pick = document.body.querySelector<HTMLButtonElement>('button[aria-label="Pick Profile"]');
    const type = document.body.querySelector<HTMLButtonElement>('button[aria-label="Type Profile"]');
    const strip = document.body.querySelector<HTMLElement>('[aria-label^="Profile:"][role="button"]');
    const input = document.body.querySelector<HTMLInputElement>('input[aria-label="Profile"]');
    expect(pick?.getAttribute('aria-pressed')).toBe('true');
    expect(type?.getAttribute('aria-pressed')).toBe('false');
    expect(strip).not.toBeNull();
    expect(input?.hidden).toBe(true);

    const ok = [...document.body.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'OK');
    ok?.click();
    expect(saved.at(-1)?.['profile']).toBe('');
  });

  it('opens in Type mode when Profile holds a variable or formula, and saves typed or curve edits', () => {
    const command = solidScriptCommandFind('column')!;
    const saved: Record<string, string>[] = [];
    new SolidScriptConfigurator(document.body, command, { profile: '[MyCurve]' }, (written) =>
      saved.push(written),
    ).show();

    const pick = document.body.querySelector<HTMLButtonElement>('button[aria-label="Pick Profile"]');
    const type = document.body.querySelector<HTMLButtonElement>('button[aria-label="Type Profile"]');
    const input = document.body.querySelector<HTMLInputElement>('input[aria-label="Profile"]');
    expect(pick?.getAttribute('aria-pressed')).toBe('false');
    expect(type?.getAttribute('aria-pressed')).toBe('true');
    expect(input?.hidden).toBe(false);
    expect(input?.value).toBe('[MyCurve]');

    input!.value = 'Classic Column';
    input!.dispatchEvent(new Event('input', { bubbles: true }));
    const ok = [...document.body.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'OK');
    ok?.click();
    expect(saved.at(-1)?.['profile']).toBe('Classic Column');
  });

  it('keeps a New Curve as a resource of the script, given to the line on OK and not on Cancel', () => {
    const command = solidScriptCommandFind('column')!;
    const stored: (readonly SolidScriptResource[] | null)[] = [];
    const open = (): HTMLSelectElement => {
      const curves = new SolidScriptConfiguratorCurves([
        solidScriptResourceCurve(
          'Arch',
          curveFromPolyline([
            [0, 1],
            [1, 0],
          ]),
        ),
      ]);
      new SolidScriptConfigurator(
        document.body,
        command,
        {},
        (_values, resources) => stored.push(resources),
        [],
        null,
        [],
        [],
        null,
        curves,
      ).show();
      return document.body.querySelector<HTMLSelectElement>('select[aria-label="Profile resource"]')!;
    };
    const select = open();
    expect([...select.options].map((option) => option.textContent)).toEqual([
      'No Resource',
      '[$Resources.Arch]',
      'New Curve',
    ]);
    select.value = '+';
    select.dispatchEvent(new Event('change'));
    expect(select.value).toBe('[$Resources.Profile]');
    [...document.body.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'OK')!.click();
    expect(stored.at(-1)?.map((resource) => resource.name)).toEqual(['Arch', 'Profile']);
  });

  it('opens Curve Editor above the options window and its backdrop, keeps it interactive, and closes cleanly', () => {
    const command = solidScriptCommandFind('curve_profile')!;
    const saved: Record<string, string>[] = [];
    new SolidScriptConfigurator(document.body, command, {}, (written) => saved.push(written)).show();

    const strip = document.body.querySelector<HTMLElement>('[aria-label^="Curve:"][role="button"]')!;
    strip.click();

    const editor = document.body.querySelector<HTMLElement>('[data-curve-editor]');
    const dialog = document.body.querySelector<HTMLElement>('[data-solid-script-configurator="curve_profile"]');
    const backdrop = document.body.querySelector<HTMLElement>('.editor-message-box-backdrop');
    expect(editor).not.toBeNull();
    expect(dialog).not.toBeNull();
    expect(backdrop).not.toBeNull();
    expect(Number(editor!.style.zIndex)).toBeGreaterThan(Number(dialog!.style.zIndex));
    expect(Number(editor!.style.zIndex)).toBeGreaterThan(Number(backdrop!.style.zIndex));

    const select = editor!.querySelector<HTMLSelectElement>('select[aria-label="Curve presets"]');
    expect(select).not.toBeNull();
    select!.value = select!.options[1]!.value;
    select!.dispatchEvent(new Event('change'));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape' }));
    expect(document.body.querySelector('[data-curve-editor]')).toBeNull();
    expect(document.body.querySelector('[data-solid-script-configurator="curve_profile"]')).not.toBeNull();

    const ok = [...dialog!.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'OK');
    ok?.click();
    expect(saved.at(-1)?.['curve']).toBeTruthy();
  });
});
