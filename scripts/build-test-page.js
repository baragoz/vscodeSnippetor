const fs = require('fs');
const path = require('path');

// Paths
const mediaDir = path.join(__dirname, '..', 'media');
const jsDir = path.join(mediaDir, 'js');
const cssDir = path.join(mediaDir, 'css');
const outTestDir = path.join(__dirname, '..', 'out', 'test');
const outTestJsDir = path.join(outTestDir, 'js');
const outTestJsWebviewDir = path.join(outTestJsDir, 'webview');
const outTestCssDir = path.join(outTestDir, 'css');
const templatePath = path.join(mediaDir, 'testPage.template.html');
const cssPath = path.join(cssDir, 'explorerView.css');
const testJsPath = path.join(outTestDir, 'SnippetorTest.js');
const testJsWrapperPath = path.join(outTestJsWebviewDir, 'SnippetorTest.js');
const outputPath = path.join(outTestDir, 'testPage.html');

// Ensure output directories exist
if (!fs.existsSync(outTestDir)) {
  fs.mkdirSync(outTestDir, { recursive: true });
}
if (!fs.existsSync(outTestJsWebviewDir)) {
  fs.mkdirSync(outTestJsWebviewDir, { recursive: true });
}
if (!fs.existsSync(outTestCssDir)) {
  fs.mkdirSync(outTestCssDir, { recursive: true });
}

// Copy CSS file
const cssOutputPath = path.join(outTestCssDir, 'explorerView.css');
if (fs.existsSync(cssPath)) {
  fs.copyFileSync(cssPath, cssOutputPath);
  console.log(`Copied CSS to ${cssOutputPath}`);
} else {
  console.error(`Warning: CSS file not found: ${cssPath}`);
}

// Define JS files in dependency order (same as explorer view)
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

// Copy webview JS files to webview directory
for (const jsFile of jsFiles) {
  const jsPath = path.join(jsDir, jsFile);
  const jsOutputPath = path.join(outTestJsWebviewDir, jsFile);
  if (fs.existsSync(jsPath)) {
    fs.copyFileSync(jsPath, jsOutputPath);
  } else {
    console.error(`Warning: JS file not found: ${jsPath}`);
  }
}

// Generate CSS import
const cssImports = `<link rel="stylesheet" href="css/explorerView.css">`;

// Generate JS imports (webview files)
let jsImports = '';
for (const jsFile of jsFiles) {
  jsImports += `    <script src="js/webview/${jsFile}"></script>\n`;
}

// Create wrapper for test JS file
let testJsImport = '';
if (fs.existsSync(testJsPath)) {
  const testJsContent = fs.readFileSync(testJsPath, 'utf8');
  // Wrap CommonJS exports to make them available globally in the browser
  const testJsWrapper = `(function() {
    // Create a minimal CommonJS environment
    const exports = {};
    const module = { exports: exports };
    
    ${testJsContent}
    
    // Expose to global scope for browser use
    window.Snippetor = exports.Snippetor;
    window.snippetor = exports.snippetor;
    window.activate = exports.activate;
    window.deactivate = exports.deactivate;
  })();`;
  
  fs.writeFileSync(testJsWrapperPath, testJsWrapper, 'utf8');
  testJsImport = '    <script src="js/webview/SnippetorTest.js"></script>\n';
  console.log(`Created test JS wrapper at ${testJsWrapperPath}`);
} else {
  console.error(`Warning: Test JS file not found: ${testJsPath}`);
  console.error('Make sure to run "npm run compile:test" first to build SnippetorTest.js');
}

// Read template
const template = fs.readFileSync(templatePath, 'utf8');

// Replace placeholders
let html = template.replace('{{CSS_IMPORTS}}', cssImports);
html = html.replace('{{JS_IMPORTS}}', jsImports);
html = html.replace('{{TEST_JS_IMPORT}}', testJsImport);

// Write output
fs.writeFileSync(outputPath, html, 'utf8');

console.log(`Built testPage.html to ${outputPath}`);
