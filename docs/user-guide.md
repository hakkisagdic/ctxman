# Ctxman Desktop App - User Guide

## Overview

Ctxman Desktop is a powerful AI development tool that helps you analyze codebases, generate context for LLMs, and manage development workflows.

## Installation

1. Download the latest release for your platform (macOS, Windows, Linux).
2. Install the application:
   - **macOS**: Drag `Ctxman.app` to Applications.
   - **Windows**: Run the installer `.exe`.
   - **Linux**: Install the `.deb` or run the `.AppImage`.

## Getting Started

### 1. Select a Project

- Click "Select Project" or use `Cmd/Ctrl+O`.
- Choose the root directory of your code project.
- The app will automatically analyze the project structure.

### 2. Dashboard Overview

- **File Browser** (Left): Navigate your project files.
- **Stats Panel** (Right): View project statistics (Token count, File count).
- **Tabs** (Top): Switch between Project, Resources, Prompts, and Settings.

## Features

### 🔍 Code Analysis

- Select a file to view its content with syntax highlighting.
- View token counts per file.
- Click "Analyze Project" to run a full analysis.
- **Export**: Click "Export Report" to save analysis data as JSON.

### 🤖 MCP Integration

- The app connects to the local MCP server automatically.
- **Resources**: View available resources exposed by the server.
- **Prompts**: Execute predefined prompts (e.g., Code Review, Refactor).

### 🧙 Context Wizard

- Go to the "Context" tab.
- Follow the step-by-step wizard to generate optimized context for LLMs.
- Choose output format (Markdown, XML, JSON).
- Copy to clipboard or save to file.

### ⚡ Real-time Updates

- The app watches for file changes.
- Press `Cmd/Ctrl+R` to force a refresh.

## Settings

- Configure MCP server connection.
- Toggle "Auto-connect".
- Customize analysis options.

## Troubleshooting

- **Connection Failed**: Ensure no other process is using port 3000.
- **Analysis Slow**: Large projects may take time. Use `.gitignore` to exclude unnecessary files.
