import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

suite('UML Diagram Editor Test Suite', () => {

    test('snippetor.uml.newDiagram command is registered', async () => {
        const commands = await vscode.commands.getCommands(true);
        assert.ok(commands.includes('snippetor.uml.newDiagram'));
    });

    test('Opening a .umlsync file opens the vscodeSnippetor.umlEditor custom editor', async () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'uml-editor-test-'));
        const tmpFile = path.join(tmpDir, 'fixture.umlsync');
        fs.writeFileSync(tmpFile, JSON.stringify({ nameTemplate: 'classDiagram' }));
        const uri = vscode.Uri.file(tmpFile);

        try {
            await vscode.commands.executeCommand('vscode.openWith', uri, 'vscodeSnippetor.umlEditor');

            const tabs = vscode.window.tabGroups.all.flatMap(group => group.tabs);
            const umlTab = tabs.find(tab =>
                tab.input instanceof vscode.TabInputCustom &&
                tab.input.viewType === 'vscodeSnippetor.umlEditor' &&
                tab.input.uri.fsPath === uri.fsPath
            );
            assert.ok(umlTab, 'Expected an open tab using the vscodeSnippetor.umlEditor custom editor');
        } finally {
            await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });

});
