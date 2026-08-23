/**
 * Preload Script - IPC Bridge
 * Exposes safe APIs to renderer process
 */

import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods to renderer
contextBridge.exposeInMainWorld('api', {
  // CLI Bridge APIs
  cli: {
    analyze: (projectPath, options) => ipcRenderer.invoke('cli:analyze', projectPath, options),
    generateContext: (projectPath, options) =>
      ipcRenderer.invoke('cli:generateContext', projectPath, options),
    listFormats: () => ipcRenderer.invoke('cli:listFormats'),
    getVersion: () => ipcRenderer.invoke('cli:getVersion'),
  },

  // MCP Client APIs
  mcp: {
    connect: (options) => ipcRenderer.invoke('mcp:connect', options),
    disconnect: () => ipcRenderer.invoke('mcp:disconnect'),
    listTools: () => ipcRenderer.invoke('mcp:listTools'),
    callTool: (name, args) => ipcRenderer.invoke('mcp:callTool', name, args),
    listResources: (cursor) => ipcRenderer.invoke('mcp:listResources', cursor),
    readResource: (uri) => ipcRenderer.invoke('mcp:readResource', uri),
    listPrompts: () => ipcRenderer.invoke('mcp:listPrompts'),
    getPrompt: (name, args) => ipcRenderer.invoke('mcp:getPrompt', name, args),
  },

  // File system APIs
  fs: {
    selectDirectory: () => ipcRenderer.invoke('fs:selectDirectory'),
    readFile: (path) => ipcRenderer.invoke('fs:readFile', path),
    saveFile: (content, defaultPath) => ipcRenderer.invoke('fs:saveFile', content, defaultPath),
  },

  // Watcher APIs
  watcher: {
    start: (path) => ipcRenderer.invoke('watcher:start', path),
    stop: () => ipcRenderer.invoke('watcher:stop'),
    onFileChange: (callback) => ipcRenderer.on('project:files-changed', callback),
  },

  // App APIs
  app: {
    getVersion: () => ipcRenderer.invoke('app:getVersion'),
    quit: () => ipcRenderer.send('app:quit'),
  },
  // Shortcuts
  shortcuts: {
    onOpenProject: (callback) => ipcRenderer.on('shortcut:open-project', callback),
    onRefresh: (callback) => ipcRenderer.on('shortcut:refresh', callback),
  },
});
