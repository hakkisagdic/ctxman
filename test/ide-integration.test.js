/**
 * IDE Integration Tests
 *
 * Tests for VS Code extension, JetBrains plugin stubs, and LSP server.
 *
 * @module test/ide-integration.test
 */

import { describe, it, expect, _beforeEach } from 'vitest';

describe('IDE Integration', () => {
  describe('VS Code Extension', () => {
    it('should have valid package.json manifest', async () => {
      const { readFileSync } = await import('fs');
      const pkg = JSON.parse(
        readFileSync(new URL('../ide/vscode/package.json', import.meta.url), 'utf-8')
      );

      // Check required fields
      expect(pkg.name).toBe('ctxman');
      expect(pkg.displayName).toBeDefined();
      expect(pkg.version).toBe('1.0.0');
      expect(pkg.engines.vscode).toMatch(/^\^1\.85\.0$/);
      expect(pkg.main).toBe('./extension.js');

      // Check commands
      expect(pkg.contributes.commands).toBeDefined();
      expect(pkg.contributes.commands.length).toBeGreaterThan(0);

      // Check configuration
      expect(pkg.contributes.configuration).toBeDefined();
      expect(pkg.contributes.configuration.properties).toBeDefined();
    });

    it('should have all required commands', async () => {
      const { readFileSync } = await import('fs');
      const pkg = JSON.parse(
        readFileSync(new URL('../ide/vscode/package.json', import.meta.url), 'utf-8')
      );

      const commandIds = pkg.contributes.commands.map((cmd) => cmd.command);

      expect(commandIds).toContain('ctxman.generateContext');
      expect(commandIds).toContain('ctxman.generateCurrentFile');
      expect(commandIds).toContain('ctxman.generateSelection');
      expect(commandIds).toContain('ctxman.showTokenCount');
    });

    it('should have configuration settings', async () => {
      const { readFileSync } = await import('fs');
      const pkg = JSON.parse(
        readFileSync(new URL('../ide/vscode/package.json', import.meta.url), 'utf-8')
      );

      const props = pkg.contributes.configuration.properties;

      expect(props['ctxman.targetModel']).toBeDefined();
      expect(props['ctxman.budget']).toBeDefined();
      expect(props['ctxman.defaultTemplate']).toBeDefined();
      expect(props['ctxman.outputFormat']).toBeDefined();
    });

    it('should have editor context menu contributions', async () => {
      const { readFileSync } = await import('fs');
      const pkg = JSON.parse(
        readFileSync(new URL('../ide/vscode/package.json', import.meta.url), 'utf-8')
      );

      expect(pkg.contributes.menus).toBeDefined();
      expect(pkg.contributes.menus['editor/context']).toBeDefined();
      expect(pkg.contributes.menus['editor/context'].length).toBeGreaterThan(0);
    });
  });

  describe('JetBrains Plugin', () => {
    it('should have valid plugin.xml manifest', async () => {
      const { readFileSync } = await import('fs');
      const pluginXml = readFileSync(
        new URL('../ide/jetbrains/plugin.xml', import.meta.url),
        'utf-8'
      );

      // Check required elements
      expect(pluginXml).toContain('<id>com.ctxman.intellij</id>');
      expect(pluginXml).toContain('<name>Ctxman</name>');
      expect(pluginXml).toContain('<description>');
      expect(pluginXml).toContain('<idea-version');
    });

    it('should define actions', async () => {
      const { readFileSync } = await import('fs');
      const pluginXml = readFileSync(
        new URL('../ide/jetbrains/plugin.xml', import.meta.url),
        'utf-8'
      );

      expect(pluginXml).toContain('<action id="Ctxman.GenerateSelection"');
      expect(pluginXml).toContain('<action id="Ctxman.GenerateFile"');
      expect(pluginXml).toContain('<action id="Ctxman.GenerateProject"');
    });

    it('should define tool window', async () => {
      const { readFileSync } = await import('fs');
      const pluginXml = readFileSync(
        new URL('../ide/jetbrains/plugin.xml', import.meta.url),
        'utf-8'
      );

      expect(pluginXml).toContain('<toolWindow id="Ctxman"');
    });

    it('should have Java stub file', async () => {
      const { existsSync, readFileSync } = await import('fs');
      const javaPath = new URL('../ide/jetbrains/src/CtxmanAction.java', import.meta.url);

      expect(existsSync(javaPath)).toBe(true);

      const javaCode = readFileSync(javaPath, 'utf-8');
      expect(javaCode).toContain('class CtxmanAction');
      expect(javaCode).toContain('class GenerateSelectionAction');
      expect(javaCode).toContain('class GenerateFileAction');
      expect(javaCode).toContain('class GenerateProjectAction');
    });
  });

  describe('LSP Server', () => {
    it('should export required functions', async () => {
      const lsp = await import('../lib/lsp/server.js');

      expect(lsp.estimateTokens).toBeDefined();
      expect(typeof lsp.estimateTokens).toBe('function');
      expect(lsp.MODEL_TOKEN_RATIOS).toBeDefined();
      expect(lsp.connection).toBeDefined();
      expect(lsp.documents).toBeDefined();
    });

    it('should estimate tokens correctly', async () => {
      const { estimateTokens, MODEL_TOKEN_RATIOS } = await import('../lib/lsp/server.js');

      // Test with empty string
      expect(estimateTokens('')).toBe(0);

      // Test with typical code
      const code = 'function hello() { return "world"; }';
      const tokens = estimateTokens(code, 'gpt-6.1-sol');
      const expected = Math.ceil(code.length / MODEL_TOKEN_RATIOS.gpt);
      expect(tokens).toBe(expected);
      expect(estimateTokens(code, 'claude-opus-5-5')).toBe(
        Math.ceil(code.length / MODEL_TOKEN_RATIOS.claude)
      );
    });

    it('should have model token ratios defined', async () => {
      const { MODEL_TOKEN_RATIOS } = await import('../lib/lsp/server.js');

      for (const family of ['claude', 'gpt', 'gemini', 'llama', 'deepseek', 'mistral']) {
        expect(MODEL_TOKEN_RATIOS[family], family).toBeDefined();
      }
    });
  });

  describe('Documentation', () => {
    it('should have VS Code README', async () => {
      const { existsSync, readFileSync } = await import('fs');
      const readmePath = new URL('../ide/vscode/README.md', import.meta.url);

      expect(existsSync(readmePath)).toBe(true);

      const readme = readFileSync(readmePath, 'utf-8');
      expect(readme).toContain('# Ctxman - VS Code Extension');
      expect(readme).toContain('## Installation');
      expect(readme).toContain('## Usage');
    });

    it('should have VS Code CHANGELOG', async () => {
      const { existsSync, readFileSync } = await import('fs');
      const changelogPath = new URL('../ide/vscode/CHANGELOG.md', import.meta.url);

      expect(existsSync(changelogPath)).toBe(true);

      const changelog = readFileSync(changelogPath, 'utf-8');
      expect(changelog).toContain('# Changelog');
      expect(changelog).toContain('## [1.0.0]');
    });

    it('should have JetBrains README', async () => {
      const { existsSync, readFileSync } = await import('fs');
      const readmePath = new URL('../ide/jetbrains/README.md', import.meta.url);

      expect(existsSync(readmePath)).toBe(true);

      const readme = readFileSync(readmePath, 'utf-8');
      expect(readme).toContain('# Ctxman JetBrains Plugin');
      expect(readme).toContain('## Supported IDEs');
    });
  });

  describe('Integration Stub', () => {
    it('should mark all stubs as stubs', async () => {
      const { readFileSync } = await import('fs');

      // Check VS Code extension
      const vscodeExt = readFileSync(
        new URL('../ide/vscode/extension.js', import.meta.url),
        'utf-8'
      );
      expect(vscodeExt).toContain('stub');

      // Check JetBrains action
      const jetbrainsAction = readFileSync(
        new URL('../ide/jetbrains/src/CtxmanAction.java', import.meta.url),
        'utf-8'
      );
      expect(jetbrainsAction).toContain('Stub implementation');

      // Check LSP server
      const lspServer = readFileSync(new URL('../lib/lsp/server.js', import.meta.url), 'utf-8');
      expect(lspServer).toContain('stub');
    });
  });
});
