import { afterEach, describe, expect, it, vi } from 'vitest';
import { BuilderEditorShell, type EditorToolbarActions } from '@/layout/shell/builder_editor_shell.js';
import { Toolbar } from '@/ui/toolbar/toolbar.js';

interface ToolbarButtonBuilder {
  createToolbarButtons(toolbar: Toolbar, actions: EditorToolbarActions): void;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('EditorShellBuilder toolbar', () => {
  it('uses the categorized Add menu without duplicated creation icons', () => {
    const toolbar = new Toolbar(document.body);
    const builder = new BuilderEditorShell() as unknown as ToolbarButtonBuilder;
    builder.createToolbarButtons(toolbar, createToolbarActions());
    const labels = Array.from(document.querySelectorAll('button')).map(getButtonLabel);
    expect(labels).toContain('Add');
    expect(labels.filter((label) => label.startsWith('Add '))).toEqual([]);
    toolbar.dispose();
  });

  it('does not put an Align menu on the top toolbar', () => {
    const toolbar = new Toolbar(document.body);
    const builder = new BuilderEditorShell() as unknown as ToolbarButtonBuilder;
    builder.createToolbarButtons(toolbar, createToolbarActions());
    const labels = Array.from(document.querySelectorAll('button')).map(getButtonLabel);
    expect(labels).not.toContain('Align');
    expect(labels).toContain('CSG');
    toolbar.dispose();
  });

  it('places Audio next to AI Captures before the trailing spacer and MCP last', () => {
    const toolbar = new Toolbar(document.body);
    const builder = new BuilderEditorShell() as unknown as ToolbarButtonBuilder;
    builder.createToolbarButtons(toolbar, createToolbarActions());
    const labels = Array.from(document.querySelectorAll('button')).map(getButtonLabel);
    const audioIndex = labels.indexOf('Audio');
    const captureIndex = labels.indexOf('AI Captures');
    expect(audioIndex).toBe(captureIndex + 1);
    expect(labels[labels.length - 1]).toBe('MCP');
    expect(document.querySelector('[data-toolbar-trailing-spacer="true"]')).not.toBeNull();
    toolbar.dispose();
  });

  it('starts the Audio button active by default when settings report enabled', () => {
    const toolbar = new Toolbar(document.body);
    const builder = new BuilderEditorShell() as unknown as ToolbarButtonBuilder;
    const actions = createToolbarActions();
    (actions as { isAudioEnabled: () => boolean }).isAudioEnabled = () => true;
    builder.createToolbarButtons(toolbar, actions);
    const audioButton = Array.from(document.querySelectorAll('button')).find(
      (button) => getButtonLabel(button) === 'Audio',
    ) as HTMLButtonElement | undefined;
    expect(audioButton).toBeTruthy();
    expect(audioButton!.dataset['active']).toBe('true');
    toolbar.dispose();
  });

  it('shows File → Recent only while it has reachable files', () => {
    const toolbar = new Toolbar(document.body);
    const builder = new BuilderEditorShell() as unknown as ToolbarButtonBuilder;
    let recent: { label: string; onClick: () => void }[] = [];
    const actions = createToolbarActions();
    (actions as { recentSceneEntries: () => unknown[] }).recentSceneEntries = () => recent;
    builder.createToolbarButtons(toolbar, actions);
    const fileButton = Array.from(document.querySelectorAll('button')).find(
      (button) => getButtonLabel(button) === 'File',
    );
    const recentRow = () =>
      Array.from(document.querySelectorAll<HTMLButtonElement>('.editor-toolbar-dropdown-item')).find(
        (button) => button.textContent?.startsWith('Recent') === true,
      );

    fileButton!.click();
    expect(recentRow()!.closest<HTMLElement>('.editor-toolbar-dropdown-submenu-host')!.style.display).toBe('none');
    fileButton!.click();
    recent = [{ label: 'castle.aiworld', onClick: () => undefined }];
    fileButton!.click();
    const host = recentRow()!.closest<HTMLElement>('.editor-toolbar-dropdown-submenu-host')!;
    expect(host.style.display).toBe('');
    expect(host.textContent).toContain('castle.aiworld');
    toolbar.dispose();
  });

  it('offers File → Level History outside a room, enabled while the history is available', () => {
    const toolbar = new Toolbar(document.body);
    const builder = new BuilderEditorShell() as unknown as ToolbarButtonBuilder;
    let available = true;
    const actions = createToolbarActions();
    const open = vi.fn();
    Object.assign(actions, { isLevelHistoryEnabled: () => available, onOpenLevelHistory: open });
    builder.createToolbarButtons(toolbar, actions);
    const fileButton = Array.from(document.querySelectorAll('button')).find(
      (button) => getButtonLabel(button) === 'File',
    );
    const historyRow = () =>
      Array.from(document.querySelectorAll<HTMLButtonElement>('.editor-toolbar-dropdown-item')).find(
        (button) => button.textContent?.startsWith('Level History\u2026') === true,
      );

    fileButton!.click();
    expect(historyRow()!.disabled).toBe(false);
    historyRow()!.click();
    expect(open).toHaveBeenCalledOnce();
    available = false;
    fileButton!.click();
    expect(historyRow()!.disabled).toBe(true);
    toolbar.dispose();
  });

  it('lists the File menu with Load\u2026 and a separator before Level History', () => {
    const builder = new BuilderEditorShell() as unknown as {
      buildFileMenuEntries(actions: EditorToolbarActions): { kind?: string; label?: string }[];
    };
    const rows = builder
      .buildFileMenuEntries(createToolbarActions())
      .map((entry) => (entry.kind === 'separator' ? '-' : (entry.label ?? '')));
    expect(rows).toEqual([
      'New',
      '-',
      'Save',
      'Save As\u2026',
      'Load\u2026',
      'Recent',
      '-',
      'Level History\u2026',
      '-',
      'Import',
      'Export\u2026',
    ]);
  });

  it('starts the MCP button inactive and can glow orange when running', () => {
    const toolbar = new Toolbar(document.body);
    const builder = new BuilderEditorShell() as unknown as ToolbarButtonBuilder;
    builder.createToolbarButtons(toolbar, createToolbarActions());
    const mcpButton = Array.from(document.querySelectorAll('button')).find(
      (button) => getButtonLabel(button) === 'MCP',
    ) as HTMLButtonElement | undefined;
    expect(mcpButton).toBeTruthy();
    expect(mcpButton!.dataset['active']).toBe('false');
    toolbar.setButtonActiveByLabel('MCP', true);
    expect(mcpButton!.dataset['active']).toBe('true');
    expect(mcpButton!.style.background).toContain('232');
    toolbar.dispose();
  });
});

/**
 * Reads the accessible label used to identify a toolbar control.
 *
 * @param button Toolbar or menu button.
 * @returns Accessible label or visible button text.
 */
function getButtonLabel(button: Element): string {
  return button.getAttribute('aria-label') ?? button.getAttribute('title') ?? button.textContent ?? '';
}

/**
 * Creates inert callbacks for rendering the editor toolbar in isolation.
 *
 * @returns Complete toolbar action implementation.
 */
function createToolbarActions(): EditorToolbarActions {
  return new Proxy(
    {
      isAudioEnabled: () => true,
    },
    {
      get: (target, property, receiver) => {
        if (property in target) {
          return Reflect.get(target, property, receiver);
        }
        return vi.fn();
      },
    },
  ) as EditorToolbarActions;
}
