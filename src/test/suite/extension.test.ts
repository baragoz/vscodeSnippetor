import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension Test Suite', () => {

    test('Extension is registered', () => {
        const ext = vscode.extensions.getExtension('Snippetor.sw-architecture-snippets');
        assert.ok(ext, 'Extension not found — check publisher and name in package.json');
    });

    test('Extension activates', async () => {
        const ext = vscode.extensions.getExtension('Snippetor.sw-architecture-snippets');
        assert.ok(ext);
        await ext!.activate();
        assert.strictEqual(ext!.isActive, true);
    });

    test('Core commands are registered after activation', async () => {
        const commands = await vscode.commands.getCommands(true);
        const expected = [
            'snippetExplorer.refresh',
            'snippetExplorer.addSnippet',
            'snippetExplorer.addFolder',
            'snippetExplorer.openConfig',
            'workingSnippet.close',
        ];
        for (const cmd of expected) {
            assert.ok(commands.includes(cmd), `Command not registered: ${cmd}`);
        }
    });

});
