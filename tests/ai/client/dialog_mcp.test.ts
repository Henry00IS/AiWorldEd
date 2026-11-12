import { afterEach, describe, expect, it, vi } from 'vitest';
import { showMcpDialog } from '@/ai/client/dialog_mcp.js';
import type { BridgeMcpDesktop } from '@/ai/client/bridge_mcp_desktop.js';

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
});
