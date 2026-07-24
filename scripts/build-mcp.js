const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Builds the umlsync-mcp server (mcp/) as part of the extension's own
// compile, so mcp/dist/index.js exists for UmlMcpServerProvider to spawn.
// See ../Readme.mcp.md and ../src/UmlMcpServerProvider.ts.

const mcpDir = path.join(__dirname, '..', 'mcp');

if (!fs.existsSync(path.join(mcpDir, 'node_modules'))) {
  execFileSync('npm', ['install'], { cwd: mcpDir, stdio: 'inherit' });
}

execFileSync('npm', ['run', 'build'], { cwd: mcpDir, stdio: 'inherit' });
