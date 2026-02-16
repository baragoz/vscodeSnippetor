// ============================================================================
// DialogManager - Handles all dialog showing (error, confirm, etc.)
// ============================================================================
class DialogManager {
    showErrorDialog(errorMessage) {
        const existing = document.getElementById('sne-error-dialog');
        if (existing) existing.remove();

        const dialog = document.createElement('div');
        dialog.id = 'sne-error-dialog';
        dialog.className = 'sne-dialog';

        const message = document.createElement('div');
        message.className = 'sne-dialog-message';
        message.textContent = errorMessage;
        dialog.appendChild(message);

        const button = document.createElement('button');
        button.className = 'sne-dialog-button sne-dialog-button-primary';
        button.textContent = 'OK';
        button.onclick = () => {
            dialog.remove();
        };

        dialog.appendChild(button);
        document.body.appendChild(dialog);
    }

    showConfirmDialog(message, onConfirm, onCancel) {
        const existing = document.getElementById('sne-confirm-dialog');
        if (existing) existing.remove();

        const dialog = document.createElement('div');
        dialog.id = 'sne-confirm-dialog';
        dialog.className = 'sne-dialog';

        const messageDiv = document.createElement('div');
        messageDiv.className = 'sne-dialog-message-large';
        messageDiv.textContent = message;
        dialog.appendChild(messageDiv);

        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'sne-dialog-button-container';

        const cancelButton = document.createElement('button');
        cancelButton.className = 'sne-dialog-button sne-dialog-button-secondary';
        cancelButton.textContent = 'Cancel';
        cancelButton.onclick = () => {
            dialog.remove();
            if (onCancel) onCancel();
        };

        const confirmButton = document.createElement('button');
        confirmButton.className = 'sne-dialog-button sne-dialog-button-primary';
        confirmButton.textContent = 'Confirm';
        confirmButton.onclick = () => {
            dialog.remove();
            if (onConfirm) onConfirm();
        };

        buttonContainer.appendChild(cancelButton);
        buttonContainer.appendChild(confirmButton);
        dialog.appendChild(buttonContainer);
        document.body.appendChild(dialog);
    }
}
