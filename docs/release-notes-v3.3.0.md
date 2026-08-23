# Release Notes - v3.3.0

## 🚀 New Features

### 🖥️ Desktop Application

- **New Electron-based UI**: A modern, dark-themed desktop interface for Ctxman.
- **Visual Project Management**: Browse files, view stats, and manage projects visually.
- **Real-time Updates**: File watcher automatically detects changes.

### 🔌 MCP Integration

- **Built-in MCP Client**: Connects to the Ctxman MCP server.
- **Resource Browser**: View and access MCP resources.
- **Prompt Library**: Execute parameterized prompts directly from the UI.

### 🛠️ Advanced Tools

- **Context Wizard**: Step-by-step guide to generate context for LLMs.
- **Export Functionality**: Export analysis reports to JSON.
- **Keyboard Shortcuts**: `Cmd/Ctrl+O` (Open), `Cmd/Ctrl+R` (Refresh).

## 📦 Improvements

- **Bundled CLI**: The desktop app includes the CLI, running standalone without global npm installation.
- **Performance**: Optimized file tree rendering and analysis speed.
- **Security**: Sandboxed renderer process with secure IPC bridge.

## 🐛 Bug Fixes

- Fixed path resolution issues in CLI bridge.
- Resolved electron-builder configuration for macOS builds.
- Improved error handling for MCP connection failures.

## 📝 Known Issues

- Auto-update is currently disabled (planned for v3.4).
- Code signing is skipped for this release (requires developer ID).
