const fs = require('fs');
const path = require('path');

// Paths
const mediaDir = path.join(__dirname, '..', 'media');
const jsDir = path.join(mediaDir, 'js');
const cssDir = path.join(mediaDir, 'css');
const outExtensionMediaDir = path.join(__dirname, '..', 'out', 'extension', 'media');
const outExtensionMediaImagesDir = path.join(outExtensionMediaDir, 'images');
const templatePath = path.join(mediaDir, 'explorerView.template.html');
const cssPath = path.join(cssDir, 'explorerView.css');
const snippetViewHtmlPath = path.join(mediaDir, 'snippetView.html');
const outputPath = path.join(outExtensionMediaDir, 'explorerView.html');
const snippetViewOutputPath = path.join(outExtensionMediaDir, 'snippetView.html');

// Ensure output directories exist
if (!fs.existsSync(outExtensionMediaDir)) {
  fs.mkdirSync(outExtensionMediaDir, { recursive: true });
}
if (!fs.existsSync(outExtensionMediaImagesDir)) {
  fs.mkdirSync(outExtensionMediaImagesDir, { recursive: true });
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

// Copy snippetView.html and update image references to use images/ subdirectory
if (fs.existsSync(snippetViewHtmlPath)) {
  let snippetViewContent = fs.readFileSync(snippetViewHtmlPath, 'utf8');
  // Update image references from {{media_path}}/image.png to {{media_path}}/images/image.png
  snippetViewContent = snippetViewContent.replace(
    /(\{\{media_path\}\}\/)(light_(?:empty|error|plus)\.png)/g,
    '$1images/$2'
  );
  fs.writeFileSync(snippetViewOutputPath, snippetViewContent, 'utf8');
  console.log(`Copied snippetView.html to ${snippetViewOutputPath} (updated image paths)`);
} else {
  console.error(`Warning: snippetView.html not found: ${snippetViewHtmlPath}`);
}

// Copy image files to images subdirectory
const imageFiles = ['light_empty.png', 'light_error.png', 'light_plus.png'];
for (const imageFile of imageFiles) {
  const imagePath = path.join(mediaDir, imageFile);
  const imageOutputPath = path.join(outExtensionMediaImagesDir, imageFile);
  if (fs.existsSync(imagePath)) {
    fs.copyFileSync(imagePath, imageOutputPath);
    console.log(`Copied ${imageFile} to ${imageOutputPath}`);
  } else {
    console.error(`Warning: ${imageFile} not found: ${imagePath}`);
  }
}
