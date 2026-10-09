# Ctxman - VS Code Extension

Generate optimized LLM context from your codebase directly in VS Code.

## Features

- **Generate LLM Context**: Right-click in the editor or use the command palette to generate context optimized for LLMs
- **Token Count Display**: Shows the current file's token count in the status bar
- **Template Support**: Choose from pre-built templates for different use cases:
  - Bug Fix
  - Feature Development
  - Refactoring
  - Code Review
- **Multiple Output Formats**: JSON, Markdown, GitIngest, and TOON formats
- **Model-Aware Token Estimation**: Accurate token counting for different LLM models

## Installation

### From VS Code Marketplace

1. Open VS Code
2. Go to Extensions (Ctrl+Shift+X)
3. Search for "Ctxman"
4. Click Install

### From Source

```bash
cd ide/vscode
npm install
npm run vsce:package
code --install-extension ctxman-1.0.0.vsix
```

## Usage

### Commands

All commands are available via the Command Palette (Ctrl+Shift+P):

| Command                                     | Description                                 |
| ------------------------------------------- | ------------------------------------------- |
| `Ctxman: Generate LLM Context`              | Generate context for the entire project     |
| `Ctxman: Generate Context for Current File` | Generate context for the active file        |
| `Ctxman: Generate Context for Selection`    | Generate context for selected code          |
| `Ctxman: Generate Context for Project`      | Generate context for the entire workspace   |
| `Ctxman: Show Token Count`                  | Display total token count for the workspace |
| `Ctxman: Select Template`                   | Choose a context generation template        |

### Right-Click Menu

Right-click in the editor to access quick actions:

- Generate context for selection
- Generate context for current file
- Generate project context

### Status Bar

The extension displays the token count for the current file in the status bar. Click to see detailed statistics.

## Configuration

Configure the extension in VS Code settings:

| Setting                  | Type    | Default                       | Description                                     |
| ------------------------ | ------- | ----------------------------- | ----------------------------------------------- |
| `ctxman.targetModel`     | string  | `claude-sonnet-5-5`           | Any model id from `ctxman --list-llms`          |
| `ctxman.budget`          | number  | `100000`                      | Token budget for alerts                         |
| `ctxman.defaultTemplate` | string  | `feature`                     | Default context template                        |
| `ctxman.excludePatterns` | array   | `["**/node_modules/**", ...]` | File patterns to exclude                        |
| `ctxman.outputFormat`    | string  | `json`                        | Output format (json, markdown, gitingest, toon) |
| `ctxman.showStatusBar`   | boolean | `true`                        | Show token count in status bar                  |
| `ctxman.enableCodeLens`  | boolean | `false`                       | Enable CodeLens for token hints                 |

### Supported Models

- GPT-4 / GPT-4 Turbo
- GPT-3.5 Turbo
- Claude 3 (Opus, Sonnet, Haiku)
- Llama 2 (70B)
- Gemini Pro

## Requirements

- VS Code 1.85.0 or higher
- Node.js 22 or newer
- Ctxman CLI installed globally or accessible via npx

## Keyboard Shortcuts

You can add keyboard shortcuts for Ctxman commands:

1. Open Keyboard Shortcuts (Ctrl+K Ctrl+S)
2. Search for "ctxman"
3. Set your preferred shortcuts

Example `keybindings.json`:

```json
[
  {
    "key": "ctrl+alt+c",
    "command": "ctxman.generateContext"
  },
  {
    "key": "ctrl+alt+f",
    "command": "ctxman.generateCurrentFile"
  }
]
```

## Troubleshooting

### "ctxman command not found"

Make sure ctxman is installed globally:

```bash
npm install -g ctxman
```

Or use npx to run it without global installation.

### Incorrect Token Counts

Token counts may vary slightly between the IDE and CLI due to different tokenizers. Use the `ctxman.targetModel` setting to match your target LLM.

## Contributing

See the [main repository](https://github.com/hakkisagdic/ctxman) for contribution guidelines.

## License

MIT License - see [LICENSE](LICENSE) for details.
