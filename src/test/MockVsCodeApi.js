// MockVsCodeApi.js
// Inject this script before any webview JS files load.
// Stubs out acquireVsCodeApi() so the tree/snippet UI can run outside VSCode.
//
// Usage in a test:
//   1. Inject this file first (via jsdom scriptElement or Playwright addInitScript)
//   2. Access the singleton via  window.__mockVsCodeApi
//   3. Use _resolveCommand / _dispatchIncoming to simulate extension responses
//   4. Inspect _sentMessages to assert what the webview sent

class MockVsCodeApi {
    constructor() {
        // All messages sent by the webview via vscode.postMessage()
        this._sentMessages = [];
        // Optional: auto-respond to outbound messages (set via setAutoResponder)
        this._autoResponder = null;
    }

    // Called by the webview to send a message to the extension
    postMessage(message) {
        this._sentMessages.push(message);
        if (this._autoResponder) {
            const response = this._autoResponder(message);
            if (response !== undefined) {
                this._dispatchIncoming(response);
            }
        }
    }

    // -------------------------------------------------------------------------
    // Test helpers — call these from your test code
    // -------------------------------------------------------------------------

    // Simulate a message arriving FROM the extension (triggers window 'message' event)
    _dispatchIncoming(data) {
        window.dispatchEvent(new MessageEvent('message', { data }));
    }

    // Resolve a pending sendCommand() promise with success
    // callbackId is available in  this._sentMessages[n].callbackId
    _resolveCommand(callbackId, data = {}) {
        this._dispatchIncoming({
            type: 'onCallback',
            callbackId,
            success: true,
            error: '',
            data
        });
    }

    // Reject a pending sendCommand() promise with an error
    _rejectCommand(callbackId, error = 'Simulated error') {
        this._dispatchIncoming({
            type: 'onCallback',
            callbackId,
            success: false,
            error,
            data: {}
        });
    }

    // Push a named message from the extension (e.g. 'refresh', 'addNode')
    _sendExtensionMessage(type, data = {}) {
        this._dispatchIncoming({ type, data });
    }

    // Return the most recent outbound message
    get lastMessage() {
        return this._sentMessages[this._sentMessages.length - 1];
    }

    // Return all outbound messages of a given type
    messagesOfType(type) {
        return this._sentMessages.filter(m => m.type === type);
    }

    // Clear the message log between tests
    reset() {
        this._sentMessages = [];
        this._autoResponder = null;
    }

    // Register a function that is called for every postMessage() and may return
    // an immediate response object. Useful for command/response pairs.
    //
    // Example — auto-respond to 'ready':
    //   api.setAutoResponder(msg => {
    //     if (msg.type === 'ready') {
    //       return { type: 'onCallback', callbackId: msg.callbackId,
    //                success: true, error: '', data: { children: [], treeState: [] } };
    //     }
    //   });
    setAutoResponder(fn) {
        this._autoResponder = fn;
    }
}

// VSCode only allows acquireVsCodeApi() to be called once per webview context.
// This singleton mirrors that constraint.
const _mockVsCodeApiInstance = new MockVsCodeApi();

function acquireVsCodeApi() {
    return _mockVsCodeApiInstance;
}

// Expose on window so test code can reach it after the page scripts have run
window.__mockVsCodeApi = _mockVsCodeApiInstance;
