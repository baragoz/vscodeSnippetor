// ============================================================================
// MessageManager - Centralizes all vscode.postMessage and message listening
// ============================================================================
class MessageManager {
    constructor() {
        this.vscode = acquireVsCodeApi();
        this.callbackMap = new Map();
        this.callbackCounter = 1;
        this.messageHandlers = new Map();
    }

    // Send a command and wait for callback
    sendCommand(type, data = {}) {
        return new Promise((resolve, reject) => {
            const callbackId = `cb_${Date.now()}_${this.callbackCounter++}`;
            this.callbackMap.set(callbackId, { resolve, reject });

            this.vscode.postMessage({
                type: type,
                ...data,
                callbackId
            });
        });
    }

    // Send a message without waiting for response
    sendMessage(type, data = {}) {
        this.vscode.postMessage({ type, ...data });
    }

    // Register handler for incoming messages
    onMessage(type, handler) {
        if (!this.messageHandlers.has(type)) {
            this.messageHandlers.set(type, []);
        }
        this.messageHandlers.get(type).push(handler);
    }

    // Initialize message listener (called once)
    initialize() {
        window.addEventListener('message', event => {
            const message = event.data;

            // Handle callbacks
            if (message.type === 'onCallback') {
                const callback = this.callbackMap.get(message.callbackId);
                if (callback) {
                    this.callbackMap.delete(message.callbackId);
                    if (message.success) {
                        callback.resolve(message.data);
                    } else {
                        callback.reject(new Error(message.error || 'Unknown error'));
                    }
                }
                return;
            }

            // Handle other message types
            const handlers = this.messageHandlers.get(message.type);
            if (handlers) {
                handlers.forEach(handler => handler(message));
            }
        });
    }
}
