import { afterEach, describe, expect, it } from 'vitest';
import { solidScriptCommandFind } from '@/solid_script/commands/solid_script_command_catalog.js';
import { solidScriptConfiguratorFieldBuild } from '@/solid_script/ui/solid_script_configurator_fields.js';
import { solidScriptSuggestionContext, solidScriptSuggestions } from '@/solid_script/ui/solid_script_suggestions.js';

/**
 * Finds a parameter of a command.
 *
 * @param command Command key.
 * @param key Parameter key.
 * @returns Parameter.
 */
function parameterOf(command: string, key: string) {
  return solidScriptCommandFind(command)!.parameters.find((parameter) => parameter.key === key)!;
}

afterEach(() => document.body.replaceChildren());

describe('SolidScript editable choice fields', () => {
  it('offers every Anchor as a word, and takes a variable or formula typed instead', () => {
    const words = parameterOf('cube', 'anchor').words!.map((entry) => entry.word);
    expect(words).toHaveLength(27);
    expect(words).toContain('Center, Bottom, Back');
    expect(parameterOf('square', 'anchor').words).toHaveLength(9);
    const typed = solidScriptConfiguratorFieldBuild(parameterOf('cube', 'anchor'), '[Where]', () => {});
    expect(typed.element.querySelector('select')).toBeNull();
    expect(typed.problem()).toBe('');
    expect(
      solidScriptConfiguratorFieldBuild(parameterOf('cube', 'anchor'), 'Up, Center', () => {}).problem(),
    ).toContain('needs 3 words');
  });

  it('stars the two most common Anchors in autocomplete', () => {
    const byWord = Object.fromEntries(
      (parameterOf('cube', 'anchor').words ?? []).map((entry) => [entry.word, entry.detail]),
    );
    expect(byWord['Center, Center, Center']).toBe('Anchor. ⭐');
    expect(byWord['Center, Bottom, Center']).toBe('Anchor. ⭐');
    expect(byWord['Left, Bottom, Back']).toBe('Anchor.');
    const square = Object.fromEntries(
      (parameterOf('square', 'anchor').words ?? []).map((entry) => [entry.word, entry.detail]),
    );
    expect(square['Center, Center']).toBe('Anchor.');
  });

  it('shows starred Anchors in autocomplete as Anchor. ⭐, with no period after the star', () => {
    const words = parameterOf('cube', 'anchor').words ?? [];
    const shown = solidScriptSuggestions(solidScriptSuggestionContext('', 0, true), {
      names: [],
      extra: [],
      words,
    });
    const byWord = Object.fromEntries(shown.map((entry) => [entry.label, entry.detail]));
    expect(byWord['Center, Center, Center']).toBe('Anchor. ⭐');
    expect(byWord['Center, Bottom, Center']).toBe('Anchor. ⭐');
    expect(byWord['Left, Bottom, Back']).toBe('Anchor.');
  });

  it('shows a switch as Yes or No text, never a checkbox, and lists it like before', () => {
    const closed = parameterOf('curve_to_mesh', 'closed');
    const field = solidScriptConfiguratorFieldBuild(closed, 'false', () => {});
    expect(field.element.querySelector('input[type="checkbox"]')).toBeNull();
    expect(field.read()).toBe('No');
    expect(solidScriptConfiguratorFieldBuild(closed, 'true', () => {}).read()).toBe('Yes');
    expect(solidScriptConfiguratorFieldBuild(closed, '[Shut]', () => {}).read()).toBe('[Shut]');
    const command = solidScriptCommandFind('curve_to_mesh')!;
    const text = (closedText: string) =>
      command
        .listing({ closed: closedText })
        .map((part) => part.text)
        .join('');
    expect(text('Yes')).toBe(text('true'));
    expect(text('No')).toBe(text('false'));
  });
});
