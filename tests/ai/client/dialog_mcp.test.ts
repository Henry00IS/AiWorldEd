import { afterEach, describe, expect, it, vi } from 'vitest';
import { showMcpDialog } from '@/ai/client/dialog_mcp.js';
import type { BridgeMcpDesktop } from '@/ai/client/bridge_mcp_desktop.js';
import type { McpOnlineBridge } from '@/ai/client/dialog_mcp.js';
import { MCP_SERVER_MODE_KEY } from '@/ai/client/mode_mcp_server.js';
import type { McpHostStatus } from '@/ai/shared/mcp_protocol_types.js';

/**
 * Creates a fake online bridge whose URL stays the same until regenerated.
 *
 * @returns Online bridge.
 */
function fakeOnlineBridge(): McpOnlineBridge {
  let running = false;
  let url = `https://aiworlded.00labs.net/wsdev/mcp/${'a'.repeat(64)}`;
  const status = (): McpHostStatus => ({ running, port: null, url });
  return {
    startMcpServer: vi.fn(async () => {
      running = true;
      return { ok: true, message: 'MCP server started', status: status() };
    }),
    stopMcpServer: vi.fn(async () => {
      running = false;
      return status();
    }),
    getMcpStatus: vi.fn(async () => status()),
    regenerateToken: vi.fn(async () => {
      running = false;
      url = `https://aiworlded.00labs.net/wsdev/mcp/${'b'.repeat(64)}`;
      return status();
    }),
  };
}

/** Lets the dialog's async status refreshes finish. */
async function settle(): Promise<void> {
  for (let index = 0; index < 6; index += 1) await Promise.resolve();
}

/**
 * Finds a dialog button by its label.
 *
 * @param host Dialog host.
 * @param label Button text.
 * @returns Button, if present.
 */
function buttonFind(host: HTMLElement, label: string): HTMLButtonElement | undefined {
  return Array.from(host.querySelectorAll('button')).find((button) => button.textContent === label);
}

afterEach(() => {
  document.body.replaceChildren();
});

/** Unit tests for the MCP connection dialog. */
describe('showMcpDialog', () => {
  it('shows desktop-only state when no bridge is available', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const openPromise = showMcpDialog({
      host,
      bridge: null,
      showStatus: () => undefined,
    });
    await Promise.resolve();
    await Promise.resolve();
    const panel = host.querySelector('.editor-message-box-panel');
    expect(panel).not.toBeNull();
    expect(panel?.textContent).toContain('MCP Server');
    expect(panel?.textContent).toContain('Desktop Only');
    expect(panel?.textContent).not.toContain('Token');
    const closeButton = Array.from(panel?.querySelectorAll('button') ?? []).find(
      (button) => button.textContent === 'Close',
    );
    closeButton?.click();
    await openPromise;
    expect(host.querySelector('.editor-message-box-panel')).toBeNull();
  });

  it('shows a clean URL without a token field when the host is running', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const url = 'http://127.0.0.1:18765/mcp';
    const bridge: BridgeMcpDesktop = {
      startMcpServer: vi.fn(async () => ({
        ok: true,
        message: 'started',
        status: { running: true, port: 18765, url },
      })),
      stopMcpServer: vi.fn(async () => ({
        running: false,
        port: null,
        url: null,
      })),
      getMcpStatus: vi.fn(async () => ({
        running: true,
        port: 18765,
        url,
      })),
    };
    const onRunningChanged = vi.fn();
    const openPromise = showMcpDialog({
      host,
      bridge,
      showStatus: () => undefined,
      onRunningChanged,
    });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    const urlField = host.querySelector<HTMLInputElement>('[data-mcp-field="mcp-url"]');
    expect(urlField?.value).toBe(url);
    expect(urlField?.value.includes(' ')).toBe(false);
    expect(host.querySelector('[data-mcp-field="mcp-token"]')).toBeNull();
    expect(onRunningChanged).toHaveBeenCalledWith(true);
    const closeButton = Array.from(host.querySelectorAll('button')).find((button) => button.textContent === 'Close');
    closeButton?.click();
    await openPromise;
  });

  it('notifies onRunningChanged when the server is stopped', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const bridge: BridgeMcpDesktop = {
      startMcpServer: vi.fn(async () => ({
        ok: true,
        message: 'started',
        status: { running: true, port: 18765, url: 'http://127.0.0.1:18765/mcp' },
      })),
      stopMcpServer: vi.fn(async () => ({
        running: false,
        port: null,
        url: null,
      })),
      getMcpStatus: vi.fn(async () => ({
        running: true,
        port: 18765,
        url: 'http://127.0.0.1:18765/mcp',
      })),
    };
    const onRunningChanged = vi.fn();
    const openPromise = showMcpDialog({
      host,
      bridge,
      showStatus: () => undefined,
      onRunningChanged,
    });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    const stopButton = Array.from(host.querySelectorAll('button')).find(
      (button) => button.textContent === 'Stop server',
    );
    stopButton?.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(bridge.stopMcpServer).toHaveBeenCalled();
    expect(onRunningChanged).toHaveBeenCalledWith(false);
    const closeButton = Array.from(host.querySelectorAll('button')).find((button) => button.textContent === 'Close');
    closeButton?.click();
    await openPromise;
  });

  it('uses the online server in the browser build with the same buttons and a stable URL', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const online = fakeOnlineBridge();
    const openPromise = showMcpDialog({ host, bridge: null, onlineBridge: online, showStatus: () => undefined });
    await settle();
    const urlField = host.querySelector<HTMLInputElement>('[data-mcp-field="mcp-url"]');
    const stableUrl = urlField?.value;
    expect(stableUrl).toBe(`https://aiworlded.00labs.net/wsdev/mcp/${'a'.repeat(64)}`);
    expect(host.querySelector('[data-mcp-field="server-mode"]')).toBeNull();
    expect(host.textContent).toContain('Copy the URL below.');
    buttonFind(host, 'Start Server')?.click();
    await settle();
    expect(online.startMcpServer).toHaveBeenCalled();
    expect(host.textContent).toContain('Status: listening on the online server');
    expect(urlField?.value).toBe(stableUrl);
    buttonFind(host, 'Stop server')?.click();
    await settle();
    expect(online.stopMcpServer).toHaveBeenCalled();
    expect(urlField?.value).toBe(stableUrl);
    buttonFind(host, 'New Token')?.click();
    await settle();
    expect(urlField?.value).not.toBe(stableUrl);
    buttonFind(host, 'Close')?.click();
    await openPromise;
  });

  it('defaults to the local server on desktop and switches to the online server on request', async () => {
    localStorage.removeItem(MCP_SERVER_MODE_KEY);
    const host = document.createElement('div');
    document.body.appendChild(host);
    const local: BridgeMcpDesktop = {
      startMcpServer: vi.fn(),
      stopMcpServer: vi.fn(),
      getMcpStatus: vi.fn(async () => ({ running: false, port: null, url: null })),
    };
    const online = fakeOnlineBridge();
    const openPromise = showMcpDialog({ host, bridge: local, onlineBridge: online, showStatus: () => undefined });
    await settle();
    const select = host.querySelector<HTMLSelectElement>('[data-mcp-field="server-mode"]');
    expect(select?.value).toBe('local');
    expect(buttonFind(host, 'New Token')?.hidden).toBe(true);
    expect(host.textContent).toContain('no password or token');
    if (select) select.value = 'online';
    select?.dispatchEvent(new Event('change'));
    await settle();
    expect(localStorage.getItem(MCP_SERVER_MODE_KEY)).toBe('online');
    expect(buttonFind(host, 'New Token')?.hidden).toBe(false);
    expect(host.querySelector<HTMLInputElement>('[data-mcp-field="mcp-url"]')?.value).toContain('/wsdev/mcp/');
    buttonFind(host, 'Start Server')?.click();
    await settle();
    expect(online.startMcpServer).toHaveBeenCalled();
    expect(local.startMcpServer).not.toHaveBeenCalled();
    expect(select?.disabled).toBe(true);
    buttonFind(host, 'Close')?.click();
    await openPromise;
    localStorage.removeItem(MCP_SERVER_MODE_KEY);
  });
});
