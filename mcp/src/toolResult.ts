// File: toolResult.ts
// Small helpers so every tool returns MCP's { content: [...] } shape
// consistently: JSON payloads on success, `isError: true` + a plain-text
// actionable message on failure (per Readme.mcp.md: "returns an actionable
// error ... so the agent can self-correct instead of silently writing an
// invalid file" — MCP tool errors are reported this way, not as JSON-RPC
// protocol errors, precisely so the calling model sees them).

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export function ok(data: unknown): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }]
  };
}

export function fail(message: string): CallToolResult {
  return {
    isError: true,
    content: [{ type: 'text', text: message }]
  };
}

/** Wraps a handler body so any thrown Error becomes a tool-level error result instead of a protocol error. */
export async function guarded(fn: () => CallToolResult | Promise<CallToolResult>): Promise<CallToolResult> {
  try {
    return await fn();
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}
