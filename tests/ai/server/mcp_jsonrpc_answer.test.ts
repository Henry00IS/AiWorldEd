import { describe, expect, it, vi } from 'vitest';
import { mcpJsonRpcAnswer } from '@/ai/server/mcp_jsonrpc_answer.js';
import { mcpEndpointFake } from './helpers_mcp_endpoint.js';

describe('mcpJsonRpcAnswer', () => {
  it('answers raw request text with status and JSON-RPC response', async () => {
    const toolCall = vi.fn(async () => ({ ok: true, message: 'done' }));
    const invoker = mcpEndpointFake(toolCall);
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
    expect(toolCall).not.toHaveBeenCalled();
  });

  it('answers tools/list with the tools the editor endpoint lists', async () => {
    const tool = { name: 'brush_get', description: 'Reads a brush.', inputSchema: { type: 'object', properties: {} } };
    const endpoint = mcpEndpointFake(async () => ({ ok: true, message: '' }), [tool]);
    const answer = await mcpJsonRpcAnswer('{"jsonrpc":"2.0","id":1,"method":"tools/list"}', endpoint);
    expect(answer.response).toMatchObject({ result: { tools: [tool] } });
  });

  it('answers initialize with server instructions that name the tool convention', async () => {
    const endpoint = mcpEndpointFake(async () => ({ ok: true, message: '' }));
    const answer = await mcpJsonRpcAnswer('{"jsonrpc":"2.0","id":1,"method":"initialize"}', endpoint);
    const result = (answer.response as { result: { instructions: string } }).result;
    expect(result.instructions).toContain('category_subject_verb');
    expect(result.instructions).toContain('geometry_script_build');
  });
});
