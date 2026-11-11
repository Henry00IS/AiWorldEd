import { afterEach, describe, expect, it } from 'vitest';
import { PanelMenu } from '@/ui/menu/panel_menu.js';
import type { ToolbarMenuEntry } from '@/ui/menu/menu_types.js';

afterEach(() => {
  document.body.replaceChildren();
});

/**
 * Opens a root menu under a fresh anchor.
 *
 * @param entries Menu rows.
 * @returns Open panel.
 */
function menuOpen(entries: ToolbarMenuEntry[]): PanelMenu {
  const panel = new PanelMenu(entries, () => undefined);
  const anchor = document.createElement('button');
  document.body.append(anchor, panel.getElement());
  panel.open(anchor);
  return panel;
}

describe('PanelMenu live rows', () => {
  it('hides and shows rows by their live visibility', () => {
    let visible = false;
    const panel = menuOpen([
      { label: 'Always', onClick: () => undefined },
      { label: 'Sometimes', onClick: () => undefined, isVisible: () => visible },
    ]);
    const rows = panel.getElement().querySelectorAll<HTMLButtonElement>('.editor-toolbar-dropdown-item');

    expect(rows[1]!.style.display).toBe('none');
    expect(rows[1]!.disabled).toBe(true);
    visible = true;
    panel.refresh();
    expect(rows[1]!.style.display).toBe('');
    expect(rows[1]!.disabled).toBe(false);
    panel.close();
  });

  it('rebuilds a submenu from its live entries every time the menu opens', () => {
    let files = ['a.aiworld'];
    const panel = menuOpen([
      {
        kind: 'submenu',
        label: 'Recent',
        children: [],
        childrenLive: () => files.map((label) => ({ label, onClick: () => undefined })),
      },
    ]);
    const flyoutLabels = () =>
      Array.from(
        panel.getElement().querySelectorAll('.editor-toolbar-dropdown-submenu .editor-toolbar-dropdown-label'),
      ).map((label) => label.textContent);

    expect(flyoutLabels()).toEqual(['a.aiworld']);
    panel.close();
    files = ['b.aiworld', 'a.aiworld'];
    panel.open(document.body.querySelector('button') as HTMLButtonElement);
    expect(flyoutLabels()).toEqual(['b.aiworld', 'a.aiworld']);
    panel.close();
  });
});
