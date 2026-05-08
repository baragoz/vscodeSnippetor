// SnippetorBrowserTest.js
// Browser-compatible test activation for Tier 1 webview UI tests.
// Loaded by testPage.html after MockVsCodeApi.js and the webview class scripts.
// init.js is included but skipped (window.isDebug = true); this script drives
// initialization so each test can control timing and mock responses.
//
// Usage:
//   Snippetor.activate()          — create MessageManager + SnippetTreeView
//   Snippetor.tree                — the SnippetTreeView instance
//   Snippetor.messageManager      — the MessageManager instance
//   Snippetor.api                 — shortcut for window.__mockVsCodeApi
//   Snippetor.deactivate()        — reset state between tests

const Snippetor = (function () {
    let _mm = null;
    let _tree = null;

    return {
        activate() {
            const api = window.__mockVsCodeApi;
            if (!api) {
                throw new Error('MockVsCodeApi not loaded — inject MockVsCodeApi.js before webview scripts.');
            }

            _mm = new MessageManager();
            _mm.initialize();
            _tree = new SnippetTreeView('sne-tree', _mm);

            // Expose on window for direct test access
            window.__snippetorMM = _mm;
            window.__snippetorTree = _tree;
        },

        deactivate() {
            if (_tree) {
                _tree.reset();
                _tree = null;
            }
            _mm = null;
            if (window.__mockVsCodeApi) {
                window.__mockVsCodeApi.reset();
            }
            window.__snippetorMM = null;
            window.__snippetorTree = null;
        },

        get tree() { return _tree; },
        get messageManager() { return _mm; },
        get api() { return window.__mockVsCodeApi; }
    };
})();
