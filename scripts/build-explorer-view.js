const fs = require('fs');
const path = require('path');

// Paths
const mediaDir = path.join(__dirname, '..', 'media');
const jsDir = path.join(mediaDir, 'js');
const cssDir = path.join(mediaDir, 'css');
const outMediaDir = path.join(__dirname, '..', 'out', 'media');
const templatePath = path.join(mediaDir, 'explorerView.template.html');
const cssPath = path.join(cssDir, 'explorerView.css');
const outputPath = path.join(outMediaDir, 'explorerView.html');

// Ensure output directory exists
if (!fs.existsSync(outMediaDir)) {
  fs.mkdirSync(outMediaDir, { recursive: true });
}

// Define JS files in dependency order
const jsFiles = [
  'MessageManager.js',
  'DialogManager.js',
  'TreeCommandHandler.js',
  'DragAndDropHandler.js',
  'ContextMenuHandler.js',
  'NodeItem.js',
  'SnippetTreeView.js',
  'init.js'
];

// Read and combine JS files
let js = '';
for (const jsFile of jsFiles) {
  const jsPath = path.join(jsDir, jsFile);
  if (!fs.existsSync(jsPath)) {
    console.error(`Warning: JS file not found: ${jsPath}`);
    continue;
  }
  const content = fs.readFileSync(jsPath, 'utf8');
  js += content + '\n\n';
}

// Read template and CSS
const template = fs.readFileSync(templatePath, 'utf8');
const css = fs.readFileSync(cssPath, 'utf8');

// Replace placeholders
let html = template.replace('{{CSS}}', css);
html = html.replace('{{JS}}', js);

// Write output
fs.writeFileSync(outputPath, html, 'utf8');

console.log(`Built explorerView.html to ${outputPath}`);
