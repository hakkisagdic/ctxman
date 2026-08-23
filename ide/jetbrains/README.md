# Ctxman JetBrains Plugin

Generate optimized LLM context from your codebase directly in JetBrains IDEs.

## Supported IDEs

- IntelliJ IDEA
- PyCharm
- WebStorm
- PhpStorm
- GoLand
- Rider
- CLion
- Android Studio

## Features

- **Generate LLM Context**: Right-click in the editor or use Tools menu to generate context optimized for LLMs
- **Token Count Display**: Shows the current file's token count in the status bar
- **Template Support**: Choose from pre-built templates for different use cases:
  - Bug Fix
  - Feature Development
  - Refactoring
  - Code Review
- **Multiple Output Formats**: JSON, Markdown, GitIngest, and TOON formats
- **Model-Aware Token Estimation**: Accurate token counting for different LLM models
- **Intentions (Alt+Enter)**: Quick actions for context generation

## Installation

### From JetBrains Marketplace

1. Open Settings/Preferences → Plugins
2. Browse repositories
3. Search for "Ctxman"
4. Click Install
5. Restart IDE

### From Source

```bash
cd ide/jetbrains
./gradlew buildPlugin
```

Then install the generated plugin from `build/distributions/Ctxman-1.0.0.zip`:

1. Settings → Plugins → ⚙️ → Install Plugin from Disk
2. Select the ZIP file
3. Restart IDE

## Usage

### Commands

All commands are available via:

- **Tools Menu**: Tools → Ctxman
- **Editor Context Menu**: Right-click → Ctxman
- **Keyboard Shortcuts**: Ctrl+Alt+C (generate context)

| Command                        | Shortcut   | Description                         |
| ------------------------------ | ---------- | ----------------------------------- |
| Generate Context for Selection | -          | Generate context for selected code  |
| Generate Context for File      | -          | Generate context for current file   |
| Generate Context for Project   | Ctrl+Alt+C | Generate context for entire project |
| Show Token Count               | -          | Display token count statistics      |

### Intentions

Press Alt+Enter on any code element to see Ctxman intentions:

- Add to Context
- Generate LLM Context
- Show Token Breakdown

### Status Bar

The plugin displays the token count for the current file in the status bar. Click to see detailed statistics.

### Tool Window

Open the Ctxman tool window (View → Tool Windows → Ctxman) for:

- Project analysis overview
- Quick actions
- Template selection
- Recent contexts history

## Configuration

Configure the plugin in Settings → Tools → Ctxman:

| Setting          | Type    | Default                   | Description                                     |
| ---------------- | ------- | ------------------------- | ----------------------------------------------- |
| Target Model     | string  | GPT-4                     | Target LLM model for token estimation           |
| Token Budget     | number  | 100000                    | Token budget for alerts                         |
| Default Template | string  | feature                   | Default context template                        |
| Exclude Patterns | list    | [node_modules, .git, ...] | File patterns to exclude                        |
| Output Format    | string  | JSON                      | Output format (JSON, Markdown, GitIngest, TOON) |
| Show Status Bar  | boolean | true                      | Show token count in status bar                  |

### Supported Models

- GPT-4 / GPT-4 Turbo
- GPT-3.5 Turbo
- Claude 3 (Opus, Sonnet, Haiku)
- Llama 2 (70B)
- Gemini Pro

## Requirements

- JetBrains IDE 2022.3 or later
- Node.js 20.0.0 or higher (for ctxman CLI)
- Ctxman CLI installed globally

## Project Structure

```
ide/jetbrains/
├── plugin.xml                    # Plugin manifest
├── README.md                     # This file
└── src/
    └── main/
        ├── java/com/ctxman/
        │   ├── actions/          # Editor actions
        │   ├── intentions/       # Quick fix intentions
        │   ├── listeners/        # Event listeners
        │   ├── services/         # Business logic
        │   ├── settings/         # Configuration
        │   └── ui/               # UI components
        └── resources/
            └── META-INF/
                └── plugin.xml
```

## Troubleshooting

### "ctxman command not found"

Make sure ctxman is installed globally:

```bash
npm install -g ctxman
```

Or configure the path to ctxman in Settings → Tools → Ctxman.

### Incorrect Token Counts

Token counts may vary slightly between the IDE and CLI due to different tokenizers. Use the Target Model setting to match your target LLM.

## Development

### Build

```bash
./gradlew buildPlugin
```

### Run in Development Mode

```bash
./gradlew runIde
```

### Run Tests

```bash
./gradlew test
```

## Contributing

See the [main repository](https://github.com/hakkisagdic/ctxman) for contribution guidelines.

## License

MIT License - see [LICENSE](LICENSE) for details.
