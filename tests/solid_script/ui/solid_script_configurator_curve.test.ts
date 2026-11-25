import { afterEach, describe, expect, it } from 'vitest';
import { curveEncode } from '@/curve/model/curve_codec.js';
import { curveFromPolyline } from '@/curve/model/curve_model.js';
import { solidScriptCommandFind } from '@/solid_script/commands/solid_script_command_catalog.js';
import { SolidScriptConfigurator } from '@/solid_script/ui/solid_script_configurator.js';

afterEach(() => document.body.replaceChildren());

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

    const custom = curveEncode(
      curveFromPolyline([
        [0, 0.5],
        [1, 0.5],
      ]),
    );
    input!.value = custom;
    input!.dispatchEvent(new Event('input', { bubbles: true }));
    const ok = [...document.body.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'OK');
    ok?.click();
    expect(saved.at(-1)?.['profile']).toBe(custom.replace(/[$[\]]/g, (ch) => `${ch}`));
  });
});
