#!/usr/bin/env node
// File: index.ts
// Entrypoint: speaks MCP over stdio (Mode A — see ../Readme.mcp.md). Every
// tool's `path` argument is confined to `workspaceRoot`, which defaults to
// the process' cwd (how Claude Code normally launches an MCP server) and can
// be overridden with UMLSYNC_MCP_ROOT for other MCP clients.
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as path from 'path';
import { createServer } from './server';

async function main(): Promise<void> {
  const workspaceRoot = path.resolve(process.env.UMLSYNC_MCP_ROOT ?? process.cwd());
  const server = createServer({ workspaceRoot });
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('umlsync-mcp failed to start:', err);
  process.exit(1);
});
