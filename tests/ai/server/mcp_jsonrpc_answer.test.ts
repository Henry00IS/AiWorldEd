import { describe, expect, it, vi } from 'vitest';
import { mcpJsonRpcAnswer } from '@/ai/server/mcp_jsonrpc_answer.js';

describe('mcpJsonRpcAnswer', () => {
  it('answers raw request text with status and JSON-RPC response', async () => {
    const invoker = vi.fn(async () => ({ ok: true, message: 'done' }));
    expect(await mcpJsonRpcAnswer('{"jsonrpc":"2.0","id":4,"method":"ping"}', invoker)).toEqual({
      status: 200,
      response: { jsonrpc: '2.0', id: 4, result: {} },
    });
    expect((await mcpJsonRpcAnswer('not json', invoker)).response).toMatchObject({ error: { code: -32700 } });
    expect((await mcpJsonRpcAnswer('{"id":1}', invoker)).status).toBe(400);
    expect(await mcpJsonRpcAnswer('{"jsonrpc":"2.0","method":"notifications/initialized"}', invoker)).toEqual({
      status: 202,
      response: null,
    });
    expect(invoker).not.toHaveBeenCalled();
  });
});
