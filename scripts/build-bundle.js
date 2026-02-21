const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

// Ensure out directory exists
const outExtensionDir = path.join(__dirname, '..', 'out', 'extension');
if (!fs.existsSync(outExtensionDir)) {
  fs.mkdirSync(outExtensionDir, { recursive: true });
}

esbuild.build({
  entryPoints: [
    path.join(__dirname, '..', 'src', 'extension.ts')
  ],
  bundle: true,
  outfile: path.join(outExtensionDir, 'extension.js'),
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  external: ['vscode'],
  sourcemap: true,
  minify: false,
  keepNames: true,
  tsconfig: path.join(__dirname, '..', 'tsconfig.json'),
}).then(() => {
  console.log('✓ Bundled extension.js successfully');
}).catch((error) => {
  console.error('✗ Bundle failed:', error);
  process.exit(1);
});
