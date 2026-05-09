// ============================================================================
// DialogManager - Delegates dialog display to the VS Code host
// ============================================================================
class DialogManager {
    constructor(messageManager) {
        this.messageManager = messageManager;
    }

    showErrorDialog(errorMessage) {
        const message = errorMessage instanceof Error ? errorMessage.message : String(errorMessage);
        this.messageManager.sendMessage('showError', { message });
    }

    showConfirmDialog(message, onConfirm, onCancel) {
        this.messageManager.sendCommand('showConfirm', { message })
            .then(result => {
                if (result.confirmed) {
                    if (onConfirm) { onConfirm(); }
                } else {
                    if (onCancel) { onCancel(); }
                }
            });
    }
}
