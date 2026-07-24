const fs = require('fs');
const path = require('path');

// Paths
const mediaDir = path.join(__dirname, '..', 'media', 'umlsync');
const outDir = path.join(__dirname, '..', 'out', 'extension', 'media', 'umlsync');
const vendorDir = path.join(outDir, 'vendor');

const umlsyncDistDir = path.join(__dirname, '..', 'node_modules', 'umlsync', 'dist', 'editor');
const jqueryDistFile = path.join(__dirname, '..', 'node_modules', 'jquery', 'dist', 'jquery.js');
const jqueryUiDistDir = path.join(__dirname, '..', 'node_modules', 'jquery-ui-dist');

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

function copyFile(src, dst) {
  if (!fs.existsSync(src)) {
    console.error(`Warning: file not found: ${src}`);
    return;
  }
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
  console.log(`Copied ${src} -> ${dst}`);
}

function copyDirRecursive(srcDir, dstDir) {
  if (!fs.existsSync(srcDir)) {
    console.error(`Warning: directory not found: ${srcDir}`);
    return;
  }
  fs.mkdirSync(dstDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const srcPath = path.join(srcDir, entry.name);
    const dstPath = path.join(dstDir, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, dstPath);
    } else {
      fs.copyFileSync(srcPath, dstPath);
    }
  }
}

// 1. HTML template (straight copy — {{nonce}}/{{media_path}} substituted at
//    runtime by DiagramEditorProvider.getHtml(), same split as build-explorer-view.js)
copyFile(path.join(mediaDir, 'umlEditor.template.html'), path.join(outDir, 'umlEditor.html'));

// 2. Adapter script
copyFile(path.join(mediaDir, 'init.js'), path.join(outDir, 'init.js'));

// 3. umlsync editor bundle — preserve dist/editor's own relative layout
//    (style.css has no external references, but assets/js/jquery.editable.js and
//    assets/styles/themes/*.css are referenced by path from the HTML template)
copyFile(path.join(umlsyncDistDir, 'UMLSync.editor.es.js'), path.join(vendorDir, 'umlsync', 'UMLSync.editor.es.js'));
copyFile(path.join(umlsyncDistDir, 'style.css'), path.join(vendorDir, 'umlsync', 'style.css'));
copyDirRecursive(path.join(umlsyncDistDir, 'assets'), path.join(vendorDir, 'umlsync', 'assets'));

// 4. jQuery (vendored — umlsync's DiagramEditor expects a global $/jQuery, and a
//    VS Code webview has no network access to load it from a CDN like umlsync's
//    own examples do)
copyFile(jqueryDistFile, path.join(vendorDir, 'jquery', 'jquery.js'));

// 5. jQuery UI (vendored — DiagramEditor calls .draggable/.resizable/.autocomplete/
//    .sortable/.droppable)
copyFile(path.join(jqueryUiDistDir, 'jquery-ui.min.js'), path.join(vendorDir, 'jquery-ui', 'jquery-ui.min.js'));
copyFile(path.join(jqueryUiDistDir, 'jquery-ui.min.css'), path.join(vendorDir, 'jquery-ui', 'jquery-ui.min.css'));
copyDirRecursive(path.join(jqueryUiDistDir, 'images'), path.join(vendorDir, 'jquery-ui', 'images'));

console.log('Built umlEditor view.');
