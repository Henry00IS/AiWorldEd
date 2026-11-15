import { describe, it, expect } from 'vitest';
import { dispatchMcpToolCall } from '@/ai/server/mcp_tool_dispatch.js';
import { mcpEndpointFake } from './helpers_mcp_endpoint.js';

/** Unit tests for MCP tools/call dispatch. */
describe('dispatchMcpToolCall', () => {
  it('forwards tool calls to the editor endpoint', async () => {
    const result = await dispatchMcpToolCall(
      { name: 'editor_context_get', arguments: {} },
      mcpEndpointFake(async (name) => ({ ok: true, message: name, data: { called: name } })),
    );
    expect(result.isError).toBeUndefined();
    const textBlock = result.content[0];
    expect(textBlock?.type).toBe('text');
    if (textBlock?.type !== 'text') {
      throw new Error('expected text content');
    }
    const payload = JSON.parse(textBlock.text) as { ok: boolean; data: { called: string } };
    expect(payload.ok).toBe(true);
    expect(payload.data.called).toBe('editor_context_get');
  });

  it('returns MCP image content blocks without duplicating base64 in text', async () => {
    const result = await dispatchMcpToolCall(
      { name: 'view_capture', arguments: {} },
      mcpEndpointFake(async () => ({
        ok: true,
        message: 'Captured view',
        data: { width: 64, height: 64 },
        images: [{ mimeType: 'image/png', data: 'fakebase64payload' }],
      })),
    );
    expect(result.isError).toBeUndefined();
    expect(result.content).toHaveLength(2);
    const textBlock = result.content[0];
    const imageBlock = result.content[1];
    expect(textBlock?.type).toBe('text');
    expect(imageBlock?.type).toBe('image');
    if (textBlock?.type !== 'text' || imageBlock?.type !== 'image') {
      throw new Error('expected text + image content');
    }
    expect(textBlock.text).not.toContain('fakebase64payload');
    expect(imageBlock.data).toBe('fakebase64payload');
    expect(imageBlock.mimeType).toBe('image/png');
  });

  it('marks failed tool calls as errors', async () => {
    const result = await dispatchMcpToolCall(
      { name: 'not_a_real_tool', arguments: {} },
      mcpEndpointFake(async (name) => ({ ok: false, message: `Unknown tool: ${name}` })),
    );
    expect(result.isError).toBe(true);
    const errorBlock = result.content[0];
    expect(errorBlock?.type).toBe('text');
    if (errorBlock?.type !== 'text') {
      throw new Error('expected text error content');
    }
    const payload = JSON.parse(errorBlock.text) as { ok: boolean };
    expect(payload.ok).toBe(false);
  });
});
