/**
 * Ctxman VS Code Extension
 * 
 * Provides LLM context generation directly from VS Code.
 * This is a stub implementation for future development.
 * 
 * @version 1.0.0
 */

const vscode = require('vscode');
const { spawn } = require('child_process');
const path = require('path');

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    console.log('Ctxman extension is now active');

    // Initialize status bar
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = 'ctxman.showTokenCount';
    statusBarItem.text = '$(file-text) Ctxman';
    statusBarItem.tooltip = 'Click to show token count';
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    // Register commands
    const commands = [
        // Generate Context for Project
        vscode.commands.registerCommand('ctxman.generateContext', async () => {
            await generateContext('project');
        }),

        // Generate Context for Current File
        vscode.commands.registerCommand('ctxman.generateCurrentFile', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showWarningMessage('No file open');
                return;
            }
            await generateContext('file', editor.document.uri.fsPath);
        }),

        // Generate Context for Selection
        vscode.commands.registerCommand('ctxman.generateSelection', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showWarningMessage('No file open');
                return;
            }
            const selection = editor.selection;
            if (selection.isEmpty) {
                vscode.window.showWarningMessage('No selection');
                return;
            }
            await generateContext('selection', editor.document.uri.fsPath, {
                startLine: selection.start.line,
                endLine: selection.end.line
            });
        }),

        // Generate Context for Project
        vscode.commands.registerCommand('ctxman.generateProject', async () => {
            await generateContext('project');
        }),

        // Show Token Count
        vscode.commands.registerCommand('ctxman.showTokenCount', async () => {
            const tokenCount = await getTokenCount();
            const budget = vscode.workspace.getConfiguration('ctxman').get('budget');
            const percentUsed = budget ? ((tokenCount / budget) * 100).toFixed(1) : 'N/A';
            
            vscode.window.showInformationMessage(
                `Total tokens: ${tokenCount.toLocaleString()} (${percentUsed}% of ${budget?.toLocaleString() || 'unlimited'} budget)`
            );
        }),

        // Select Template
        vscode.commands.registerCommand('ctxman.selectTemplate', async () => {
            const templates = [
                { label: 'Bug Fix', id: 'bug-fix', description: 'Context optimized for debugging' },
                { label: 'Feature', id: 'feature', description: 'Context for feature development' },
                { label: 'Refactor', id: 'refactor', description: 'Context for code refactoring' },
                { label: 'Code Review', id: 'code-review', description: 'Context for code reviews' }
            ];

            const selected = await vscode.window.showQuickPick(templates, {
                placeHolder: 'Select a context template'
            });

            if (selected) {
                const config = vscode.workspace.getConfiguration('ctxman');
                await config.update('defaultTemplate', selected.id, vscode.ConfigurationTarget.Workspace);
                vscode.window.showInformationMessage(`Template set to: ${selected.label}`);
            }
        })
    ];

    commands.forEach(cmd => context.subscriptions.push(cmd));

    // Update status bar on file changes
    vscode.workspace.onDidChangeActiveTextEditor(async (editor) => {
        if (editor) {
            const doc = editor.document;
            const tokens = estimateFileTokens(doc.getText());
            updateStatusBar(statusBarItem, tokens);
        }
    });

    // Watch for file saves to update token count
    vscode.workspace.onDidSaveTextDocument(async (doc) => {
        const tokens = estimateFileTokens(doc.getText());
        updateStatusBar(statusBarItem, tokens);
    });
}

/**
 * Generate context using ctxman CLI
 * @param {string} mode - 'project', 'file', or 'selection'
 * @param {string} [filePath] - Optional file path
 * @param {object} [options] - Additional options
 */
async function generateContext(mode, filePath, options = {}) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        vscode.window.showWarningMessage('No workspace open');
        return;
    }

    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    const config = vscode.workspace.getConfiguration('ctxman');
    
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Generating LLM Context...',
        cancellable: false
    }, async (progress) => {
        try {
            progress.report({ increment: 0, message: 'Running ctxman analysis...' });

            // Build command arguments
            const args = ['--cli', '--format', config.get('outputFormat')];
            
            if (mode === 'file' && filePath) {
                args.push('--file', filePath);
            } else if (mode === 'selection' && filePath) {
                args.push('--file', filePath);
                if (options.startLine !== undefined && options.endLine !== undefined) {
                    args.push('--start-line', String(options.startLine + 1));
                    args.push('--end-line', String(options.endLine + 1));
                }
            }

            const template = config.get('defaultTemplate');
            if (template) {
                args.push('--template', template);
            }

            const model = config.get('targetModel');
            if (model) {
                args.push('--target-llm', model);
            }

            // Run ctxman
            const result = await runCtxman(workspaceRoot, args);
            
            progress.report({ increment: 100, message: 'Complete!' });

            // Show result options
            const choice = await vscode.window.showInformationMessage(
                `Generated ${result.tokenCount?.toLocaleString() || 'N/A'} tokens`,
                'Copy to Clipboard',
                'Save to File',
                'Open Preview'
            );

            switch (choice) {
                case 'Copy to Clipboard':
                    await vscode.env.clipboard.writeText(result.output);
                    vscode.window.showInformationMessage('Context copied to clipboard');
                    break;
                case 'Save to File':
                    const uri = await vscode.window.showSaveDialog({
                        defaultUri: vscode.Uri.file(path.join(workspaceRoot, 'llm-context.json')),
                        filters: { 'JSON': ['json'], 'Markdown': ['md'], 'Text': ['txt'] }
                    });
                    if (uri) {
                        await vscode.workspace.fs.writeFile(uri, Buffer.from(result.output, 'utf-8'));
                        vscode.window.showInformationMessage(`Context saved to ${uri.fsPath}`);
                    }
                    break;
                case 'Open Preview':
                    const doc = await vscode.workspace.openTextDocument({
                        content: result.output,
                        language: config.get('outputFormat') === 'json' ? 'json' : 'markdown'
                    });
                    await vscode.window.showTextDocument(doc);
                    break;
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to generate context: ${error.message}`);
        }
    });
}

/**
 * Run ctxman CLI
 * @param {string} cwd - Working directory
 * @param {string[]} args - Command arguments
 * @returns {Promise<{output: string, tokenCount: number}>}
 */
function runCtxman(cwd, args) {
    return new Promise((resolve, reject) => {
        const proc = spawn('npx', ['ctxman', ...args], {
            cwd,
            shell: true,
            timeout: 60000
        });

        let output = '';
        let error = '';

        proc.stdout.on('data', (data) => {
            output += data.toString();
        });

        proc.stderr.on('data', (data) => {
            error += data.toString();
        });

        proc.on('close', (code) => {
            if (code !== 0 && !output) {
                reject(new Error(error || `ctxman exited with code ${code}`));
            } else {
                // Try to parse token count from output
                const tokenMatch = output.match(/Total tokens: (\d+)/);
                const tokenCount = tokenMatch ? parseInt(tokenMatch[1], 10) : 0;
                resolve({ output, tokenCount });
            }
        });

        proc.on('error', (err) => {
            reject(err);
        });
    });
}

/**
 * Get total token count for workspace
 * @returns {Promise<number>}
 */
async function getTokenCount() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        return 0;
    }

    const workspaceRoot = workspaceFolders[0].uri.fsPath;

    try {
        const result = await runCtxman(workspaceRoot, ['--cli', '--json']);
        const data = JSON.parse(result.output);
        return data.totalTokens || 0;
    } catch {
        // Fallback to estimation
        return 0;
    }
}

/**
 * Estimate tokens for a string (rough estimation)
 * @param {string} text - Text to estimate
 * @returns {number} Estimated token count
 */
function estimateFileTokens(text) {
    // Rough estimation: ~4 characters per token for English code
    return Math.ceil(text.length / 4);
}

/**
 * Update status bar with token count
 * @param {vscode.StatusBarItem} statusBar
 * @param {number} tokens
 */
function updateStatusBar(statusBar, tokens) {
    const config = vscode.workspace.getConfiguration('ctxman');
    const budget = config.get('budget');
    const showStatusBar = config.get('showStatusBar');

    if (!showStatusBar) {
        statusBar.hide();
        return;
    }

    const percentUsed = budget ? (tokens / budget) * 100 : 0;

    let icon = '$(file-text)';
    if (budget && percentUsed > 90) {
        icon = '$(alert)';
        statusBar.color = 'errorForeground';
    } else if (budget && percentUsed > 70) {
        icon = '$(warning)';
        statusBar.color = 'editorWarning.foreground';
    } else {
        statusBar.color = undefined;
    }

    statusBar.text = `${icon} ${tokens.toLocaleString()} tokens`;
    statusBar.show();
}

function deactivate() {
    console.log('Ctxman extension deactivated');
}

module.exports = {
    activate,
    deactivate
};
