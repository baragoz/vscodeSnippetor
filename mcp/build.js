const esbuild = require('esbuild');
const path = require('path');

// Bundles src/index.ts + the MCP SDK/zod into a single self-contained
// dist/index.js — no node_modules needed at runtime, so the parent
// extension's .vsix only has to ship mcp/dist, not mcp/node_modules.
esbuild
  .build({
    entryPoints: [path.join(__dirname, 'src', 'index.ts')],
    bundle: true,
    outfile: path.join(__dirname, 'dist', 'index.js'),
    platform: 'node',
    target: 'node18',
    format: 'cjs',
    sourcemap: true,
    minify: false
  })
  .then(() => {
    console.log('✓ Bundled mcp/dist/index.js successfully');
  })
  .catch((error) => {
    console.error('✗ Bundle failed:', error);
    process.exit(1);
  });
