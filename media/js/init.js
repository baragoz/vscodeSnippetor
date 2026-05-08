// ============================================================================
// Initialization — skipped in debug/test mode (window.isDebug = true)
// ============================================================================
if (!window.isDebug) {
    const messageManager = new MessageManager();
    messageManager.initialize();

    const tree = new SnippetTreeView('sne-tree', messageManager);

    tree.commandHandler.ready()
        .then((data) => {
            tree.reset();
            tree.renderTree(data.children || data);
            if (data.treeState && data.treeState.length > 0) {
                setTimeout(() => {
                    tree.restoreTreeState(data.treeState);
                }, 100);
            }
        })
        .catch(err => {
            tree.commandHandler.dialogManager.showErrorDialog(err);
        });
}


