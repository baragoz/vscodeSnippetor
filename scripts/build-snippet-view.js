const fs = require('fs');
const path = require('path');

// Copies media/snippetView.html (and the images it references) into
// out/extension/media/. Snippet files are plain project files now — there
// is no Explorer webview to assemble (see Readme.snippets.md).

const outDir = path.join(__dirname, '..', 'out');
const mediaDir = path.join(__dirname, '..', 'media');
const outExtensionMediaDir = path.join(outDir, 'extension', 'media');
const outExtensionMediaImagesDir = path.join(outExtensionMediaDir, 'images');
const snippetViewHtmlPath = path.join(mediaDir, 'snippetView.html');
const snippetViewOutputPath = path.join(outExtensionMediaDir, 'snippetView.html');

if (!fs.existsSync(outExtensionMediaDir)) {
  fs.mkdirSync(outExtensionMediaDir, { recursive: true });
}
if (!fs.existsSync(outExtensionMediaImagesDir)) {
  fs.mkdirSync(outExtensionMediaImagesDir, { recursive: true });
}

// Copy icon.svg to both locations package.json's "contributes" references:
// the activity bar container icon (out/icon.svg) and the view icon
// (out/extension/media/icon.svg). Neither was ever produced by the old
// build-explorer-view.js either — this closes a pre-existing 404.
const iconSrcPath = path.join(mediaDir, 'icon.svg');
const iconDestPaths = [
  path.join(outDir, 'icon.svg'),
  path.join(outExtensionMediaDir, 'icon.svg')
];
if (fs.existsSync(iconSrcPath)) {
  for (const iconDestPath of iconDestPaths) {
    fs.copyFileSync(iconSrcPath, iconDestPath);
    console.log(`Copied icon.svg to ${iconDestPath}`);
  }
} else {
  console.error(`Warning: icon.svg not found: ${iconSrcPath}`);
}

// Copy snippetView.html and update image references to use images/ subdirectory
if (fs.existsSync(snippetViewHtmlPath)) {
  let snippetViewContent = fs.readFileSync(snippetViewHtmlPath, 'utf8');
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
