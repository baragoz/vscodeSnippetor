// ============================================================================
// DragAndDropHandler - Handles all drag-and-drop operations
// ============================================================================
class DragAndDropHandler {
    constructor(commandHandler, treeView) {
        this.commandHandler = commandHandler;
        this.treeView = treeView;
    }

    setupDragAndDrop(nodeItem, wrapper) {
        wrapper.ondragstart = (e) => {
            if (nodeItem.isFolder && nodeItem.isTopLevel) {
                e.preventDefault();
                return;
            }
            e.dataTransfer.setData('text/plain', 
                (nodeItem.isFolder ? "folder:" : "file:") + nodeItem.fullPath);
        };

        wrapper.ondragover = (e) => {
            if (nodeItem.isFolder) {
                e.preventDefault();
                wrapper.style.backgroundColor = 'var(--vscode-list-hoverBackground)';
            }
        };

        wrapper.ondragleave = () => {
            if (nodeItem.isFolder) {
                wrapper.style.backgroundColor = '';
            }
        };

        wrapper.ondrop = (e) => {
            e.preventDefault();
            wrapper.style.backgroundColor = '';
            this.handleDrop(e, nodeItem);
        };
    }

    async handleDrop(e, targetNodeItem) {
        const dragData = e.dataTransfer.getData('text/plain').split(":");
        const sourcePath = dragData[1];
        const isMovingFolder = dragData[0] === "folder";
        const targetPath = targetNodeItem.isFolder 
            ? targetNodeItem.fullPath 
            : targetNodeItem.fullPath.substring(0, targetNodeItem.fullPath.lastIndexOf('/'));

        // Delegate to command handler's handlePasteCommand with 'move' command
        this.commandHandler.handlePasteCommand('move', sourcePath, isMovingFolder, targetPath, targetNodeItem.isFolder);
    }
}
