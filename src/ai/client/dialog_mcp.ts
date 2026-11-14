import { Theme } from '@/theme.js';
import { hexToRgb } from '@/utils/utils_color.js';
import type { BridgeMcpDesktop } from './bridge_mcp_desktop.js';
import type { McpHostStatus } from '@/ai/shared/mcp_protocol_types.js';
import { PanelFloating } from '@/ui/floating_panel/panel_floating.js';
import { mcpImageDeliveryField } from './mode_mcp_image_delivery.js';
import { mcpServerModeGet, mcpServerModeSelect, type McpServerMode } from './mode_mcp_server.js';

/** Start/stop bridge with a regeneratable online URL. */
export interface McpOnlineBridge extends BridgeMcpDesktop {
  /**
   * Stops listening and generates a new URL.
   *
   * @returns Updated host status.
   */
  regenerateToken(): Promise<McpHostStatus>;
}

/** Options for the MCP connection dialog. */
export interface McpDialogOptions {
  /** Parent element that owns the modal overlay. */
  host: HTMLElement;
  /** Desktop MCP bridge, or null outside Electrobun. */
  bridge: BridgeMcpDesktop | null;
  /** Online relay bridge, available in both browser and desktop builds. */
  onlineBridge?: McpOnlineBridge | null;
  /** Status bar / toast callback. */
  showStatus: (message: string) => void;
  /** Called when host running state is known or changes. */
  onRunningChanged?: (running: boolean) => void;
}

/**
 * Opens a modal dialog with MCP start/stop controls and simple connection
 * instructions (URL only).
 *
 * @param options Dialog host, MCP desktop bridge, status callback, and optional
 *   running-changed callback.
 * @returns Promise that resolves when the dialog is closed.
 */
export function showMcpDialog(options: McpDialogOptions): Promise<void> {
  return new Promise<void>((resolve) => {
    const dialog = new DialogMcp(options, () => {
      dialog.dispose();
      resolve();
    });
    void dialog.open();
  });
}

/** Modal MCP connection dialog. */
class DialogMcp extends PanelFloating {
  private readonly options: McpDialogOptions;
  private readonly onClosed: () => void;
  private readonly statusLine: HTMLElement;
  private readonly urlField: HTMLInputElement;
  private readonly primaryButton: HTMLButtonElement;
  private closed: boolean;
  private running: boolean;
  private mode: McpServerMode;
  private readonly regenerateButton: HTMLButtonElement;
  private readonly instructions: HTMLElement;
  private serverModeSelect: HTMLSelectElement | null = null;

  /**
   * Creates the dialog panel and builds its controls.
   *
   * @param options Dialog configuration.
   * @param onClosed Callback when the dialog finishes closing.
   */
  constructor(options: McpDialogOptions, onClosed: () => void) {
    super(options.host, {
      corner: 'top-left',
      modal: true,
      centered: true,
      draggable: false,
      closeOnEscape: true,
      closeOnBackdropClick: true,
      stackLayer: 'confirm',
      backdropClassName: 'editor-message-box-backdrop',
    });
    this.options = options;
    this.onClosed = onClosed;
    this.closed = false;
    this.running = false;
    this.mode = options.bridge ? mcpServerModeGet() : 'online';
    this.instructions = document.createElement('p');
    this.regenerateButton = this.createSecondaryButton('New Token', () => void this.regenerateToken());
    this.statusLine = document.createElement('p');
    this.urlField = this.createReadonlyField('mcp-url');
    this.primaryButton = document.createElement('button');
    this.buildDialog();
  }

  /** Shows the dialog and loads current MCP host status. */
  async open(): Promise<void> {
    this.show();
    await this.refreshStatus();
    this.primaryButton.focus();
  }

  /** Marks the dialog closed once and runs the close callback. */
  protected override onAfterHide(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.onClosed();
  }

  /** Builds dialog chrome, fields, and actions onto the panel root. */
  private buildDialog(): void {
    this.root.className = 'editor-message-box-panel';
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-labelledby', 'editor-mcp-dialog-title');
    this.applyPanelChrome();
    this.root.appendChild(this.createTitle());
    if (this.options.bridge && this.options.onlineBridge) this.appendServerMode();
    this.root.appendChild(this.createStatusLine());
    this.root.appendChild(this.createInstructions());
    this.root.appendChild(this.createFieldBlock('URL', this.urlField));
    this.root.appendChild(this.createFieldBlock('When the AI captures the view', mcpImageDeliveryField()));
    this.root.appendChild(this.createButtonRow());
    this.root.addEventListener('mousedown', (event) => event.stopPropagation());
  }

  /** Applies dark gradient panel styles to the dialog root. */
  private applyPanelChrome(): void {
    this.root.style.minWidth = '420px';
    this.root.style.maxWidth = '520px';
    this.root.style.padding = '18px 20px 16px';
    this.root.style.borderRadius = '10px';
    this.root.style.background = `linear-gradient(180deg, ${hexToRgb(Theme.toolbarBackground)} 0%, ${hexToRgb(Theme.toolbarBackgroundEnd)} 100%)`;
    this.root.style.border = '1px solid rgba(255,255,255,0.1)';
    this.root.style.boxShadow = '0 18px 48px rgba(0,0,0,0.65)';
    this.root.style.color = Theme.buttonTextColor;
    this.root.style.boxSizing = 'border-box';
    this.root.style.fontFamily = Theme.uiFontFamily;
  }

  /**
   * Creates the dialog title heading.
   *
   * @returns Title element.
   */
  private createTitle(): HTMLElement {
    const title = document.createElement('h2');
    title.id = 'editor-mcp-dialog-title';
    title.textContent = 'MCP Server';
    title.style.margin = '0 0 10px';
    title.style.fontSize = '15px';
    title.style.fontWeight = '600';
    title.style.letterSpacing = '0.01em';
    title.style.color = '#f0f0f0';
    return title;
  }

  /**
   * Creates the live status line element.
   *
   * @returns Status paragraph.
   */
  private createStatusLine(): HTMLElement {
    this.statusLine.style.margin = '0 0 12px';
    this.statusLine.style.fontSize = '13px';
    this.statusLine.style.lineHeight = '1.45';
    this.statusLine.style.color = '#c8c8c8';
    this.statusLine.textContent = 'Status: checking…';
    return this.statusLine;
  }

  /**
   * Creates the instruction paragraph for MCP clients.
   *
   * @returns Instructions block.
   */
  private createInstructions(): HTMLElement {
    const body = this.instructions;
    body.style.margin = '0 0 14px';
    body.style.fontSize = '13px';
    body.style.lineHeight = '1.45';
    body.style.color = '#c8c8c8';
    body.style.whiteSpace = 'pre-wrap';
    this.updateInstructions();
    return body;
  }

  /**
   * Creates a labeled monospace field row.
   *
   * @param label Field label.
   * @param field Input element.
   * @returns Container element.
   */
  private createFieldBlock(label: string, field: HTMLElement): HTMLElement {
    const block = document.createElement('div');
    block.style.margin = '0 0 16px';
    const caption = document.createElement('div');
    caption.textContent = label;
    caption.style.fontSize = '11px';
    caption.style.fontWeight = '600';
    caption.style.color = '#a0a0a0';
    caption.style.marginBottom = '4px';
    caption.style.textTransform = 'uppercase';
    caption.style.letterSpacing = '0.04em';
    block.appendChild(caption);
    block.appendChild(field);
    return block;
  }

  /**
   * Creates a readonly monospace text field for the MCP URL.
   *
   * @param testId Data attribute value for tests.
   * @returns Input element.
   */
  private createReadonlyField(testId: string): HTMLInputElement {
    const field = document.createElement('input');
    field.type = 'text';
    field.readOnly = true;
    field.dataset['mcpField'] = testId;
    field.value = '—';
    field.style.width = '100%';
    field.style.boxSizing = 'border-box';
    field.style.padding = '8px 10px';
    field.style.borderRadius = '6px';
    field.style.border = '1px solid rgba(255,255,255,0.12)';
    field.style.background = 'rgba(0,0,0,0.35)';
    field.style.color = '#e8e8e8';
    field.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    field.style.fontSize = '12px';
    field.addEventListener('focus', () => field.select());
    return field;
  }

  /**
   * Creates the action button row.
   *
   * @returns Button row container.
   */
  private createButtonRow(): HTMLElement {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.justifyContent = 'flex-end';
    row.style.gap = '8px';
    const copy = this.createSecondaryButton('Copy URL', () => void this.copyUrl(copy));
    row.appendChild(copy);
    this.regenerateButton.hidden = this.mode !== 'online';
    if (this.options.onlineBridge) row.appendChild(this.regenerateButton);
    row.appendChild(this.createPrimaryToggleButton());
    row.appendChild(this.createSecondaryButton('Close', () => this.hide(), true));
    return row;
  }

  /**
   * Creates the Start/Stop primary button.
   *
   * @returns Primary button element.
   */
  private createPrimaryToggleButton(): HTMLButtonElement {
    this.primaryButton.type = 'button';
    this.primaryButton.textContent = 'Start Server';
    this.styleActionButton(this.primaryButton, true);
    this.primaryButton.addEventListener('click', () => {
      void this.onPrimaryClicked();
    });
    return this.primaryButton;
  }

  /**
   * Creates a secondary dialog button.
   *
   * @param label Button text.
   * @param onClick Click handler.
   * @param isDefaultFocus Whether the button is marked as the cancel control.
   * @returns Button element.
   */
  private createSecondaryButton(
    label: string,
    onClick: () => void,
    isDefaultFocus: boolean = false,
  ): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    if (isDefaultFocus) {
      button.dataset['messageBoxCancel'] = 'true';
    }
    this.styleActionButton(button, false);
    button.addEventListener('click', onClick);
    return button;
  }

  /**
   * Applies padding, border, and colors for a dialog action button.
   *
   * @param button Button element.
   * @param isPrimary Whether the button is the primary action.
   */
  private styleActionButton(button: HTMLButtonElement, isPrimary: boolean): void {
    button.style.padding = '7px 14px';
    button.style.borderRadius = '6px';
    button.style.fontSize = '13px';
    button.style.fontWeight = '600';
    button.style.cursor = 'pointer';
    button.style.border = isPrimary ? '1px solid rgba(232,106,23,0.65)' : '1px solid rgba(255,255,255,0.12)';
    button.style.background = isPrimary ? 'rgba(232,106,23,0.22)' : 'rgba(255,255,255,0.06)';
    button.style.color = isPrimary ? '#f0a060' : '#e0e0e0';
  }

  /** Loads host status into the dialog fields. */
  private async refreshStatus(): Promise<void> {
    const bridge = this.bridge();
    if (!bridge) {
      this.applyDesktopOnlyState();
      return;
    }
    try {
      const status = await bridge.getMcpStatus();
      if (!this.closed && bridge === this.bridge()) this.applyStatus(status);
    } catch {
      this.applyDesktopOnlyState();
      this.statusLine.textContent = 'Status: desktop RPC unavailable';
    }
  }

  /** Handles Start/Stop on the primary button. */
  private async onPrimaryClicked(): Promise<void> {
    const bridge = this.bridge();
    if (!bridge) {
      this.options.showStatus('MCP is only available in the Electrobun desktop app');
      return;
    }
    if (this.running) {
      const status = await bridge.stopMcpServer();
      this.applyStatus(status);
      this.options.showStatus('MCP server stopped');
      return;
    }
    const result = await bridge.startMcpServer();
    this.applyStatus(result.status);
    this.options.showStatus(result.message);
    if (!result.ok && this.mode === 'online') this.statusLine.textContent = `Status: ${result.message}`;
  }

  /**
   * Updates fields from a host status snapshot.
   *
   * @param status Host status.
   */
  private applyStatus(status: McpHostStatus): void {
    this.running = status.running;
    this.primaryButton.disabled = false;
    this.primaryButton.textContent = status.running ? 'Stop server' : 'Start Server';
    this.notifyRunningChanged(status.running);
    if (this.serverModeSelect !== null) this.serverModeSelect.disabled = status.running;
    this.urlField.value = status.url?.trim() || '—';
    if (status.running) {
      this.statusLine.textContent =
        this.mode === 'online'
          ? 'Status: listening on the online server'
          : `Status: running on port ${status.port ?? '—'}`;
      return;
    }
    this.statusLine.textContent = 'Status: stopped';
  }

  /** Shows the desktop-only disabled state. */
  private applyDesktopOnlyState(): void {
    this.running = false;
    this.primaryButton.textContent = 'Desktop Only';
    this.primaryButton.disabled = true;
    this.statusLine.textContent = 'Status: unavailable in the browser build';
    this.urlField.value = '—';
    this.notifyRunningChanged(false);
  }

  /**
   * Returns the selected MCP bridge.
   *
   * @returns Local or online bridge, or null.
   */
  private bridge(): BridgeMcpDesktop | null {
    return this.mode === 'online' ? (this.options.onlineBridge ?? null) : this.options.bridge;
  }

  /** Appends the desktop-only choice of local or online server. */
  private appendServerMode(): void {
    this.serverModeSelect = mcpServerModeSelect((mode) => void this.modeChange(mode));
    this.root.appendChild(this.createFieldBlock('Server', this.serverModeSelect));
  }

  /**
   * Switches the dialog to another server while both are stopped.
   *
   * @param mode New mode.
   */
  private async modeChange(mode: McpServerMode): Promise<void> {
    this.mode = mode;
    this.regenerateButton.hidden = mode !== 'online';
    this.updateInstructions();
    await this.refreshStatus();
  }

  /** Updates the shared connection instructions for the selected server. */
  private updateInstructions(): void {
    const online = this.mode === 'online';
    this.instructions.textContent = [
      `Lets AI tools (such as Grok Build) edit this map while ${online ? 'this editor' : 'the desktop app'} is open.`,
      '',
      '1. Click Start Server.',
      '2. Copy the URL below.',
      `3. Add that URL as an HTTP MCP server in your AI tool (${online ? 'no password or headers' : 'no password or token'}).`,
      ...(online ? ['', 'Keep this URL private: it lets anyone edit this map while the server is started.'] : []),
    ].join('\n');
  }

  /** Stops listening and replaces the online token with a new one. */
  private async regenerateToken(): Promise<void> {
    const bridge = this.options.onlineBridge;
    if (!bridge || this.mode !== 'online') return;
    try {
      this.applyStatus(await bridge.regenerateToken());
      this.options.showStatus('MCP URL replaced. Copy the new URL to your AI tool, then Start Server.');
    } catch {
      this.options.showStatus('Could not save a new MCP token');
    }
  }

  /**
   * Invokes the optional running-changed callback with the given value.
   *
   * @param running Whether the MCP host is running.
   */
  private notifyRunningChanged(running: boolean): void {
    this.options.onRunningChanged?.(running);
  }

  /**
   * Copies the MCP URL from the URL field to the clipboard and briefly shows
   * "Copied!" on the button.
   *
   * @param button Copy button.
   */
  private async copyUrl(button: HTMLButtonElement): Promise<void> {
    const url = this.urlField.value.trim();
    if (!url || url === '—') {
      this.options.showStatus('Start the MCP server before copying the URL');
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      this.options.showStatus('MCP URL copied');
      button.textContent = 'Copied!';
      setTimeout(() => (button.textContent = 'Copy URL'), 1500);
    } catch {
      this.options.showStatus('Could not copy MCP URL');
    }
  }
}
