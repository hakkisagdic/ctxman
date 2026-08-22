# IDE Integration

**ID**: FEAT-011
**Status**: Planned
**Priority**: High
**Effort**: High (40-60 hours)
**Dependencies**: None

---

## Problem Statement

### Why This Matters

Developers live in their IDEs. Context generation requires CLI workflow:

**Workflow Friction**:
- Must switch to terminal for context generation
- No IDE-native context generation
- Manual file selection from editor
- Copy-paste between IDE and CLI

**Lost Productivity**:
- Context switch overhead (2-5 min each time)
- No integration with editor state
- Cannot leverage IDE's file awareness
- Missed opportunities for automation

**User Impact**:
- Disrupted development flow
- Reluctance to generate context frequently
- Less optimal context (not leveraging IDE selection)
- Higher cognitive load

**Business Impact**:
- Reduced tool adoption
- Lower productivity gains
- Competitive disadvantage vs IDE-native tools
- Missed enterprise market

---

## Proposed Solution

### What We Will Build

**IDE extensions** for major editors that:

1. Generate context directly from IDE
2. Use current file/selection as context basis
3. Display token counts in status bar
4. Provide quick actions for context generation
5. Support VS Code and JetBrains IDEs

### User Experience

#### VS Code Extension

```
+-------------------------------------------------------------+
|                    VS Code Extension                         |
+-------------------------------------------------------------+
|                                                             |
|  [Status Bar]                                               |
|  📊 45,230 tokens | ⚡ Generate Context                     |
|                                                             |
|  [Command Palette]                                          |
|  > Ctxman: Generate Context for Current File                |
|  > Ctxman: Generate Context for Selection                   |
|  > Ctxman: Generate Context for Project                     |
|  > Ctxman: Show Token Count                                 |
|  > Ctxman: Configure Budget Alert                           |
|                                                             |
|  [Context Panel - Sidebar]                                  |
|  +---------------------------------------------------+      |
|  | Ctxman                              [🔄] [⚙️]    |      |
|  +---------------------------------------------------+      |
|  | Project: my-project                               |      |
|  | Total: 45,230 tokens                              |      |
|  | Budget: 100K (45% used)                           |      |
|  |                                                   |      |
|  | Quick Actions:                                    |      |
|  | [Current File] [Selection] [Project]             |      |
|  |                                                   |      |
|  | Recent Contexts:                                  |      |
|  | • auth.js (1.2k) - 2 min ago                     |      |
|  | • api/** (8.5k) - 1 hour ago                     |      |
|  |                                                   |      |
|  | Templates:                                        |      |
|  | ○ Bug Fix  ○ Feature  ○ Review                   |      |
|  +---------------------------------------------------+      |
|                                                             |
|  [Editor Integration]                                       |
|  - Right-click > "Add to Context"                          |
|  - Right-click > "Generate Context for Selection"          |
|  - Inline token count for open files                       |
|                                                             |
+-------------------------------------------------------------+
```

#### JetBrains Plugin

```
+-------------------------------------------------------------+
|                   JetBrains Plugin                           |
+-------------------------------------------------------------+
|                                                             |
|  [Tool Window - Ctxman]                                     |
|  +---------------------------------------------------+      |
|  | [Analyze] [Settings]                              |      |
|  +---------------------------------------------------+      |
|  |                                                   |      |
|  | Project Analysis                                  |      |
|  | ━━━━━━━━━━━━━━━━━━━━━━━ 45,230 tokens           |      |
|  |                                                   |      |
|  | Files Analyzed: 127                               |      |
|  | Budget Status: OK (45% of 100K)                   |      |
|  |                                                   |      |
|  | Generate:                                         |      |
|  | [Current File] [Selection] [Module] [Project]    |      |
|  |                                                   |      |
|  | Context Preview:                                  |      |
|  | - auth/AuthController.java (1,450 tokens)        |      |
|  | - auth/JwtService.java (890 tokens)              |      |
|  | - user/UserRepository.java (560 tokens)          |      |
|  |                                                   |      |
|  +---------------------------------------------------+      |
|                                                             |
|  [Intentions (Alt+Enter)]                                   |
|  - "Add file to context"                                    |
|  - "Generate LLM context"                                   |
|  - "Show token breakdown"                                   |
|                                                             |
+-------------------------------------------------------------+
```

---

## Implementation Steps

### Step 1: Create VS Code Extension

```javascript
// extensions/vscode/src/extension.ts

import * as vscode from 'vscode';
import { ContextManager } from './ContextManager';
import { StatusBarManager } from './StatusBarManager';
import { ContextPanel } from './ContextPanel';

export function activate(context: vscode.ExtensionContext) {
  const contextManager = new ContextManager();
  const statusBar = new StatusBarManager(contextManager);
  const panel = new ContextPanel(contextManager);

  // Register commands
  const commands = [
    vscode.commands.registerCommand('ctxman.generateContext', async () => {
      const result = await contextManager.generateForProject();
      await displayResult(result);
    }),

    vscode.commands.registerCommand('ctxman.generateCurrentFile', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage('No file open');
        return;
      }
      const result = await contextManager.generateForFile(editor.document);
      await displayResult(result);
    }),

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
      const result = await contextManager.generateForSelection(
        editor.document,
        selection
      );
      await displayResult(result);
    }),

    vscode.commands.registerCommand('ctxman.showTokenCount', async () => {
      const result = await contextManager.analyzeProject();
      vscode.window.showInformationMessage(
        `Total tokens: ${result.totalTokens.toLocaleString()}`
      );
    }),
  ];

  commands.forEach(cmd => context.subscriptions.push(cmd));

  // Register tree view
  const treeView = vscode.window.createTreeView('ctxman.contextPanel', {
    treeDataProvider: panel,
  });
  context.subscriptions.push(treeView);

  // Update status bar on file changes
  vscode.workspace.onDidChangeActiveTextEditor(async (editor) => {
    if (editor) {
      const tokens = await contextManager.countFileTokens(editor.document);
      statusBar.updateTokenCount(tokens);
    }
  });
}

async function displayResult(result: any) {
  const choice = await vscode.window.showInformationMessage(
    `Generated context: ${result.totalTokens.toLocaleString()} tokens`,
    'Copy to Clipboard',
    'Save to File',
    'Open Preview'
  );

  switch (choice) {
    case 'Copy to Clipboard':
      await vscode.env.clipboard.writeText(result.context);
      vscode.window.showInformationMessage('Context copied to clipboard');
      break;
    case 'Save to File':
      const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file('llm-context.json'),
      });
      if (uri) {
        await vscode.workspace.fs.writeFile(uri, Buffer.from(result.context));
      }
      break;
    case 'Open Preview':
      const doc = await vscode.workspace.openTextDocument({
        content: result.context,
        language: 'json',
      });
      await vscode.window.showTextDocument(doc);
      break;
  }
}
```

### Step 2: Create Status Bar Manager

```javascript
// extensions/vscode/src/StatusBarManager.ts

export class StatusBarManager {
  private statusBarItem: vscode.StatusBarItem;

  constructor(private contextManager: ContextManager) {
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    this.statusBarItem.command = 'ctxman.showTokenCount';
    this.statusBarItem.tooltip = 'Click for token details';
    this.statusBarItem.show();

    this.initialize();
  }

  async initialize() {
    const result = await this.contextManager.analyzeProject();
    this.updateTokenCount(result.totalTokens);
  }

  updateTokenCount(tokens: number) {
    const budget = this.contextManager.getBudget();
    const percentUsed = budget ? (tokens / budget) * 100 : 0;

    let icon = '📊';
    if (budget && percentUsed > 90) {
      icon = '⚠️';
    } else if (budget && percentUsed > 70) {
      icon = '⚡';
    }

    this.statusBarItem.text = `${icon} ${tokens.toLocaleString()} tokens`;
    this.statusBarItem.color = percentUsed > 90 ? 'red' : undefined;
  }
}
```

### Step 3: Create Context Panel

```javascript
// extensions/vscode/src/ContextPanel.ts

export class ContextPanel implements vscode.TreeDataProvider<TreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<TreeItem | undefined>();
  onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private contextManager: ContextManager) {}

  getTreeItem(element: TreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: TreeItem): Promise<TreeItem[]> {
    if (!element) {
      // Root items
      return [
        new ActionItem('Generate for Project', 'ctxman.generateContext'),
        new ActionItem('Generate for Current File', 'ctxman.generateCurrentFile'),
        new ActionItem('Generate for Selection', 'ctxman.generateSelection'),
        new SeparatorItem(),
        new InfoItem('Project Stats', await this.getProjectStats()),
        new SeparatorItem(),
        new TemplateItem('Bug Fix', 'bug-fix'),
        new TemplateItem('Feature', 'feature'),
        new TemplateItem('Code Review', 'code-review'),
      ];
    }

    return [];
  }

  async getProjectStats(): Promise<string> {
    const result = await this.contextManager.analyzeProject();
    return `Files: ${result.fileCount} | Tokens: ${result.totalTokens.toLocaleString()}`;
  }

  refresh() {
    this._onDidChangeTreeData.fire(undefined);
  }
}

class ActionItem extends vscode.TreeItem {
  constructor(label: string, command: string) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.command = { command, title: label };
    this.iconPath = new vscode.ThemeIcon('play');
  }
}

class InfoItem extends vscode.TreeItem {
  constructor(label: string, description: string) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.description = description;
    this.iconPath = new vscode.ThemeIcon('info');
  }
}

class TemplateItem extends vscode.TreeItem {
  constructor(label: string, templateId: string) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.command = {
      command: 'ctxman.useTemplate',
      title: `Use ${label} template`,
      arguments: [templateId],
    };
    this.iconPath = new vscode.ThemeIcon('file-code');
  }
}
```

### Step 4: Create JetBrains Plugin

```java
// extensions/jetbrains/src/main/java/com/ctxman/CtxmanPlugin.java

package com.ctxman;

import com.intellij.openapi.actionSystem.*;
import com.intellij.openapi.project.Project;
import com.intellij.openapi.wm.ToolWindow;
import com.intellij.openapi.wm.ToolWindowFactory;
import com.intellij.ui.content.Content;
import com.intellij.ui.content.ContentFactory;

public class CtxmanPlugin implements ToolWindowFactory {

    @Override
    public void createToolWindowContent(Project project, ToolWindow toolWindow) {
        CtxmanPanel panel = new CtxmanPanel(project);
        Content content = ContentFactory.getInstance().createContent(panel, "", false);
        toolWindow.getContentManager().addContent(content);
    }
}

// CtxmanPanel.java
public class CtxmanPanel extends JPanel {
    private final Project project;
    private final ContextManager contextManager;

    public CtxmanPanel(Project project) {
        this.project = project;
        this.contextManager = new ContextManager(project);

        setLayout(new BorderLayout());

        // Create toolbar
        JToolBar toolbar = new JToolBar();
        toolbar.add(new JButton(new GenerateContextAction()));
        toolbar.add(new JButton(new AnalyzeProjectAction()));
        add(toolbar, BorderLayout.NORTH);

        // Create main content
        JPanel content = new JPanel(new GridLayout(0, 1));
        content.add(createTokenDisplay());
        content.add(createQuickActions());
        add(content, BorderLayout.CENTER);
    }

    private JPanel createQuickActions() {
        JPanel panel = new JPanel(new FlowLayout());
        panel.add(new JButton("Current File"));
        panel.add(new JButton("Selection"));
        panel.add(new JButton("Module"));
        panel.add(new JButton("Project"));
        return panel;
    }
}
```

### Step 5: Add Configuration

```json
// extensions/vscode/package.json

{
  "name": "ctxman",
  "displayName": "Ctxman - LLM Context Manager",
  "description": "Generate optimized context for LLM assistance",
  "version": "1.0.0",
  "engines": { "vscode": "^1.85.0" },
  "categories": ["Other", "Programming Languages"],
  "activationEvents": ["onStartupFinished"],
  "main": "./out/extension.js",
  "contributes": {
    "commands": [
      {
        "command": "ctxman.generateContext",
        "title": "Ctxman: Generate Context for Project"
      },
      {
        "command": "ctxman.generateCurrentFile",
        "title": "Ctxman: Generate Context for Current File"
      },
      {
        "command": "ctxman.generateSelection",
        "title": "Ctxman: Generate Context for Selection"
      },
      {
        "command": "ctxman.showTokenCount",
        "title": "Ctxman: Show Token Count"
      }
    ],
    "viewsContainers": {
      "activitybar": [
        {
          "id": "ctxman",
          "title": "Ctxman",
          "icon": "resources/icon.svg"
        }
      ]
    },
    "views": {
      "ctxman": [
        {
          "id": "ctxman.contextPanel",
          "name": "Context"
        }
      ]
    },
    "menus": {
      "editor/context": [
        {
          "command": "ctxman.generateSelection",
          "when": "editorHasSelection",
          "group": "ctxman@1"
        },
        {
          "command": "ctxman.generateCurrentFile",
          "group": "ctxman@2"
        }
      ]
    },
    "configuration": {
      "title": "Ctxman",
      "properties": {
        "ctxman.budget": {
          "type": "number",
          "default": 100000,
          "description": "Token budget for alerts"
        },
        "ctxman.defaultTemplate": {
          "type": "string",
          "enum": ["bug-fix", "feature", "refactor", "code-review"],
          "default": "feature",
          "description": "Default context template"
        }
      }
    }
  }
}
```

---

## Acceptance Criteria

### Must Have
- [ ] VS Code extension available
- [ ] Generate context for current file
- [ ] Generate context for selection
- [ ] Generate context for project
- [ ] Token count in status bar
- [ ] Context panel in sidebar

### Should Have
- [ ] JetBrains plugin (IntelliJ, PyCharm, WebStorm)
- [ ] Template selection in UI
- [ ] Recent contexts history
- [ ] Budget alerts in UI
- [ ] Settings/configuration UI

### Nice to Have
- [ ] Inline token hints
- [ ] Context preview editor
- [ ] Multi-file selection
- [ ] Team context sharing
- [ ] Custom keybindings

---

## Success Metrics

### Quantitative Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Extension installs | 10,000+ | Marketplace stats |
| Daily active users | 30% of installs | Telemetry |
| CLI vs Extension usage | 50% via extension | Usage tracking |

### Qualitative Metrics

- [ ] Users report improved workflow
- [ ] Reduced context switch overhead
- [ ] Higher satisfaction scores

---

## Timeline

| Task | Effort | Week |
|------|--------|------|
| VS Code extension scaffold | 4 hours | Week 1 |
| Core commands implementation | 8 hours | Week 1-2 |
| UI components | 8 hours | Week 2 |
| JetBrains plugin scaffold | 8 hours | Week 3 |
| JetBrains implementation | 12 hours | Week 3-4 |
| Testing & publishing | 8 hours | Week 4 |

**Total Estimated Effort**: 48 hours over 4 weeks

---

## References

- [VS Code Extension API](https://code.visualstudio.com/api)
- [JetBrains Plugin SDK](https://plugins.jetbrains.com/docs/intellij/)
- [Language Server Protocol](https://microsoft.github.io/language-server-protocol/)

---

*Planned by: Ctxman Development Team*
*Target: Q2 2025*
