const fs = require('fs');
const path = require('path');

// Paths
const mediaDir = path.join(__dirname, '..', 'media');
const jsDir = path.join(mediaDir, 'js');
const cssDir = path.join(mediaDir, 'css');
const testSrcDir = path.join(__dirname, '..', 'src', 'test');
const outTestDir = path.join(__dirname, '..', 'out', 'test');
const outTestJsDir = path.join(outTestDir, 'js');
const outTestJsWebviewDir = path.join(outTestJsDir, 'webview');
const outTestCssDir = path.join(outTestDir, 'css');
const templatePath = path.join(mediaDir, 'testPage.template.html');
const cssPath = path.join(cssDir, 'explorerView.css');
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

// MockVsCodeApi.js must be first — it defines acquireVsCodeApi() before any
// webview script runs.
const mockApiSrc = path.join(testSrcDir, 'MockVsCodeApi.js');
const mockApiDst = path.join(outTestJsWebviewDir, 'MockVsCodeApi.js');
if (fs.existsSync(mockApiSrc)) {
  fs.copyFileSync(mockApiSrc, mockApiDst);
  console.log(`Copied MockVsCodeApi.js to ${mockApiDst}`);
} else {
  console.error(`Warning: MockVsCodeApi.js not found: ${mockApiSrc}`);
}

// Webview class files in dependency order.
// init.js is included but its auto-init is guarded by window.isDebug (set in
// the template), so it does nothing on load — Snippetor.activate() drives init.
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

for (const jsFile of jsFiles) {
  const jsPath = path.join(jsDir, jsFile);
  const jsOutputPath = path.join(outTestJsWebviewDir, jsFile);
  if (fs.existsSync(jsPath)) {
    fs.copyFileSync(jsPath, jsOutputPath);
  } else {
    console.error(`Warning: JS file not found: ${jsPath}`);
  }
}

// Browser-compatible test activation script (no Node.js requires).
const browserTestSrc = path.join(testSrcDir, 'SnippetorBrowserTest.js');
const browserTestDst = path.join(outTestJsWebviewDir, 'SnippetorBrowserTest.js');
if (fs.existsSync(browserTestSrc)) {
  fs.copyFileSync(browserTestSrc, browserTestDst);
  console.log(`Copied SnippetorBrowserTest.js to ${browserTestDst}`);
} else {
  console.error(`Warning: SnippetorBrowserTest.js not found: ${browserTestSrc}`);
}

// Generate CSS import
const cssImports = `<link rel="stylesheet" href="css/explorerView.css">`;

// MockVsCodeApi.js first, then the webview class scripts
let jsImports = `    <script src="js/webview/MockVsCodeApi.js"></script>\n`;
for (const jsFile of jsFiles) {
  jsImports += `    <script src="js/webview/${jsFile}"></script>\n`;
}

// The browser test helper defines window.Snippetor
const testJsImport = `    <script src="js/webview/SnippetorBrowserTest.js"></script>\n`;

// Read template and replace placeholders
const template = fs.readFileSync(templatePath, 'utf8');
let html = template.replace('{{CSS_IMPORTS}}', cssImports);
html = html.replace('{{JS_IMPORTS}}', jsImports);
html = html.replace('{{TEST_JS_IMPORT}}', testJsImport);

fs.writeFileSync(outputPath, html, 'utf8');
console.log(`Built testPage.html to ${outputPath}`);
