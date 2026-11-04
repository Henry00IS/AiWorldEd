import { describe, expect, it } from 'vitest';
import { PanelMenu } from '@/ui/menu/panel_menu.js';

describe('MenuPanel tooltips', () => {
  it('should apply static tooltips to action rows as title attributes', () => {
    const panel = new PanelMenu(
      [
        {
          kind: 'action',
          label: 'Duplicate Current',
          tooltip: 'Add a new workspace.',
          onClick: () => undefined,
        },
      ],
      () => undefined,
    );
    const anchor = document.createElement('button');
    document.body.appendChild(anchor);
    document.body.appendChild(panel.getElement());
    panel.open(anchor);
    const item = panel.getElement().querySelector('.editor-toolbar-dropdown-item') as HTMLButtonElement;
    expect(item.title).toBe('Add a new workspace.');
    panel.close();
  });

  it('should refresh dynamic tooltips when the menu opens', () => {
    let tip = 'first';
    const panel = new PanelMenu(
      [
        {
          kind: 'action',
          label: 'Dynamic',
          tooltip: () => tip,
          onClick: () => undefined,
        },
      ],
      () => undefined,
    );
    const anchor = document.createElement('button');
    document.body.appendChild(anchor);
    document.body.appendChild(panel.getElement());
    panel.open(anchor);
    const item = panel.getElement().querySelector('.editor-toolbar-dropdown-item') as HTMLButtonElement;
    expect(item.title).toBe('first');
    tip = 'second';
    panel.refresh();
    expect(item.title).toBe('second');
    panel.close();
  });

  it('should clear title when tooltip is omitted', () => {
    const panel = new PanelMenu([{ kind: 'action', label: 'Plain', onClick: () => undefined }], () => undefined);
    const item = panel.getElement().querySelector('.editor-toolbar-dropdown-item') as HTMLButtonElement;
    expect(item.hasAttribute('title')).toBe(false);
  });

  it('should refresh live labels such as Disconnect and Connect', () => {
    let online = true;
    const panel = new PanelMenu(
      [
        {
          kind: 'action',
          label: 'Disconnect',
          labelLive: () => (online ? 'Disconnect' : 'Connect'),
          onClick: () => undefined,
        },
      ],
      () => undefined,
    );
    const anchor = document.createElement('button');
    document.body.appendChild(anchor);
    document.body.appendChild(panel.getElement());
    panel.open(anchor);
    const label = panel.getElement().querySelector('.editor-toolbar-dropdown-label');
    expect(label?.textContent).toBe('Disconnect');
    online = false;
    panel.refresh();
    expect(label?.textContent).toBe('Connect');
    panel.close();
  });
});
