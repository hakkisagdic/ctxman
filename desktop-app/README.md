# Desktop App - Quick Start Guide

## Development Mode

```bash
# Terminal 1: Start Vite dev server
cd desktop-app/renderer
npm run dev

# Terminal 2: Start Electron
NODE_ENV=development electron desktop-app/main/index.js
```

## Architecture

```
desktop-app/
├── main/
│   ├── index.js       - Electron main process + IPC handlers
│   ├── cli-bridge.js  - Executes CLI commands
│   └── mcp-client.js  - Connects to MCP server
├── preload/
│   └── index.js       - IPC bridge (exposes APIs to renderer)
├── renderer/
│   ├── index.html
│   ├── main.js        - Vue entry point
│   ├── App.vue        - Main component
│   └── style.css      - Global styles
└── package.json
```

## Features

### ✅ Phase 2 Complete

1. **Project Tab**: Select directory, analyze with CLI
2. **Resources Tab**: Browse MCP resources
3. **Prompts Tab**: List MCP prompt templates
4. **Settings Tab**: Auto-connect, verbose logging

### IPC APIs

```javascript
// CLI operations
window.api.cli.analyze(projectPath, options);
window.api.cli.generateContext(projectPath, options);
window.api.cli.listFormats();
window.api.cli.getVersion();

// MCP operations
window.api.mcp.connect();
window.api.mcp.listResources();
window.api.mcp.listPrompts();
window.api.mcp.callTool(name, args);

// File system
window.api.fs.selectDirectory();
window.api.fs.readFile(path);
```

## Next Steps (Phase 3)

- [ ] UI components library
- [ ] File browser component
- [ ] Syntax highlighting for code
- [ ] Real-time MCP updates
- [ ] Export functionality

## Build

```bash
npm run desktop:build
```

Outputs to `dist-electron/` directory.
