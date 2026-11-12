import { afterEach, describe, expect, it } from 'vitest';
import { modifierStackUiPaint, modifierStackUiRepaint } from '@/modifier/stack/ui/modifier_stack_ui_paint.js';
import {
  PanelPropertiesModifierStackSection,
  MODIFIER_STACK_SECTION_CAPTURE_HINT,
} from '@/modifier/stack/ui/panel_properties_modifier_stack_section.js';
import { UI_THEME_ATTRIBUTE, buildDarkUiThemePalette, buildLightUiThemePalette } from '@/ui/theme/theme_ui_palette.js';

/**
 * Normalizes a CSS colour the way the DOM stores it.
 *
 * @param color Any CSS colour.
 * @returns Normalized colour.
 */
function css(color: string): string {
  const probe = document.createElement('span');
  probe.style.color = color;
  return probe.style.color;
}

afterEach(() => document.documentElement.removeAttribute(UI_THEME_ATTRIBUTE));

describe('modifier stack inspector theme paint', () => {
  it('paints text with the dark palette text colour and follows a switch to the light theme', () => {
    const root = document.createElement('div');
    const text = modifierStackUiPaint(document.createElement('span'), 'text');
    const eyeOff = modifierStackUiPaint(document.createElement('button'), 'eyeOff');
    root.append(text, eyeOff);
    expect(text.style.color).toBe(css(buildDarkUiThemePalette().panelTextColor));
    document.documentElement.setAttribute(UI_THEME_ATTRIBUTE, 'light');
    modifierStackUiRepaint(root);
    expect(text.style.color).toBe(css(buildLightUiThemePalette().panelTextColor));
    expect(eyeOff.style.color).toBe(css(buildLightUiThemePalette().menuDisabledColor));
  });

  it('uses a darker warning colour on the light theme', () => {
    const report = modifierStackUiPaint(document.createElement('div'), 'error');
    const dark = report.style.color;
    document.documentElement.setAttribute(UI_THEME_ATTRIBUTE, 'light');
    modifierStackUiRepaint(report);
    expect(report.style.color).not.toBe(dark);
  });

  it('explains on the status line that volumes never capture other volumes', () => {
    const section = new PanelPropertiesModifierStackSection(
      () => document.createElement('section'),
      (title) => Object.assign(document.createElement('header'), { textContent: title }),
    );
    const titled = [...section.getElement().querySelectorAll<HTMLElement>('[title]')].map((node) => node.title);
    expect(titled.some((title) => title === MODIFIER_STACK_SECTION_CAPTURE_HINT)).toBe(true);
    expect(MODIFIER_STACK_SECTION_CAPTURE_HINT).toContain('loop');
  });
});
