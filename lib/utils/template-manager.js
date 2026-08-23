/**
 * Template Manager
 * Manages context templates for different development tasks
 * FEAT-009: Context Templates
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Built-in templates defined in code for reliability
 */
const BUILTIN_TEMPLATES = {
  'bug-fix': {
    name: 'Bug Fix Context',
    description: 'Optimized for debugging and fixing bugs',
    include: ['src/**/*.js', 'lib/**/*.js', '!src/**/*.test.js', '!lib/**/*.test.js'],
    exclude: [
      'docs/**',
      '*.md',
      '*.json',
      'examples/**',
      'test/**',
      '**/*.test.js',
      '**/*.spec.js',
    ],
    methodInclude: ['*Handler', '*Service', '*Controller', '*Manager'],
    methodExclude: ['*test*', 'console*', 'debug*', 'log*'],
    targetModel: 'claude-sonnet-4.5',
  },
  feature: {
    name: 'Feature Development Context',
    description: 'Optimized for implementing new features',
    include: ['src/**/*.js', 'lib/**/*.js', '!src/**/*.test.js'],
    exclude: ['docs/**', '*.md', 'examples/**'],
    methodInclude: ['*Handler', '*Service', '*Controller', '*Manager', '*Factory', '*Builder'],
    methodExclude: ['*test*', 'console*'],
    targetModel: 'claude-sonnet-4.5',
  },
  'code-review': {
    name: 'Code Review Context',
    description: 'Optimized for reviewing code changes',
    include: ['src/**/*.js', 'lib/**/*.js', 'bin/**/*.js'],
    exclude: ['docs/**', '*.md', '*.json', 'node_modules/**'],
    methodInclude: ['*Handler', '*Service', '*Controller', '*Manager', '*Parser', '*Analyzer'],
    methodExclude: ['*test*'],
    targetModel: 'claude-sonnet-4.5',
  },
  documentation: {
    name: 'Documentation Context',
    description: 'Optimized for writing documentation',
    include: ['src/**/*.js', 'lib/**/*.js', 'index.js'],
    exclude: ['**/*.test.js', '**/*.spec.js', 'test/**', 'examples/**', 'node_modules/**'],
    methodInclude: ['*'],
    methodExclude: ['_*', '*test*', '*internal*'],
    targetModel: 'claude-sonnet-4.5',
  },
  refactoring: {
    name: 'Refactoring Context',
    description: 'Optimized for code refactoring and restructuring',
    include: ['src/**/*.js', 'lib/**/*.js', 'bin/**/*.js', 'test/**/*.js'],
    exclude: ['docs/**', '*.md', 'node_modules/**'],
    methodInclude: [
      '*Handler',
      '*Service',
      '*Controller',
      '*Manager',
      '*Parser',
      '*Analyzer',
      '*Utils',
      '*Helper',
    ],
    methodExclude: ['*test*'],
    targetModel: 'claude-sonnet-4.5',
  },
  testing: {
    name: 'Testing Context',
    description: 'Optimized for writing tests',
    include: ['src/**/*.js', 'lib/**/*.js', 'test/**/*.js'],
    exclude: ['docs/**', '*.md', 'examples/**', 'node_modules/**'],
    methodInclude: ['*'],
    methodExclude: ['_*', 'console*'],
    targetModel: 'claude-sonnet-4.5',
  },
  'full-context': {
    name: 'Full Context',
    description: 'Complete project context for comprehensive analysis',
    include: ['**/*'],
    exclude: ['node_modules/**', '.git/**', 'coverage/**', 'dist/**', 'build/**'],
    methodInclude: ['*'],
    methodExclude: [],
    targetModel: 'claude-sonnet-4.5',
  },
};

class TemplateManager {
  /**
   * Create a TemplateManager instance
   * @param {string} projectRoot - Project root directory
   */
  constructor(projectRoot = process.cwd()) {
    this.projectRoot = projectRoot;
    this.customTemplatesPath = path.join(projectRoot, '.ctxman', 'templates');
    this.builtinTemplatesPath = path.join(__dirname, '..', '..', '.ctxman', 'templates');
  }

  /**
   * List all available templates (built-in + custom)
   * @returns {Array} Array of template objects
   */
  list() {
    const templates = [];

    // Add built-in templates
    for (const [id, template] of Object.entries(BUILTIN_TEMPLATES)) {
      templates.push({
        id,
        ...template,
        source: 'builtin',
      });
    }

    // Add custom templates from project .ctxman/templates/
    const customTemplates = this.loadCustomTemplates();
    templates.push(...customTemplates);

    return templates;
  }

  /**
   * Get a specific template by ID
   * @param {string} templateId - Template identifier
   * @returns {object|null} Template object or null if not found
   */
  get(templateId) {
    // Check built-in first
    if (BUILTIN_TEMPLATES[templateId]) {
      return {
        id: templateId,
        ...BUILTIN_TEMPLATES[templateId],
        source: 'builtin',
      };
    }

    // Check custom templates
    const customTemplates = this.loadCustomTemplates();
    const custom = customTemplates.find((t) => t.id === templateId);
    if (custom) {
      return custom;
    }

    return null;
  }

  /**
   * Load custom templates from .ctxman/templates/
   * @returns {Array} Array of custom template objects
   */
  loadCustomTemplates() {
    const templates = [];

    try {
      if (!fs.existsSync(this.customTemplatesPath)) {
        return templates;
      }

      const files = fs.readdirSync(this.customTemplatesPath);

      for (const file of files) {
        if (!file.endsWith('.json')) {
          continue;
        }

        const filePath = path.join(this.customTemplatesPath, file);

        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          const template = JSON.parse(content);
          const id = path.basename(file, '.json');

          // Skip if already defined as built-in (built-ins take precedence)
          if (BUILTIN_TEMPLATES[id]) {
            continue;
          }

          templates.push({
            id,
            ...template,
            source: 'custom',
          });
        } catch (parseError) {
          console.error(`Warning: Failed to parse template ${file}: ${parseError.message}`);
        }
      }
    } catch (error) {
      console.error(`Warning: Failed to load custom templates: ${error.message}`);
    }

    return templates;
  }

  /**
   * Apply a template and get configuration options
   * @param {string} templateId - Template identifier
   * @param {object} options - Additional options to merge
   * @returns {object} Merged configuration options
   */
  apply(templateId, options = {}) {
    const template = this.get(templateId);

    if (!template) {
      throw new Error(`Template '${templateId}' not found`);
    }

    // Build configuration from template
    const config = {
      templateId,
      templateName: template.name,
      templateDescription: template.description,
      templateSource: template.source,
      // Convert include/exclude patterns to ignore patterns for TokenAnalyzer
      ignorePatterns: this.buildIgnorePatterns(template),
      includePatterns: template.include || [],
      methodInclude: template.methodInclude || [],
      methodExclude: template.methodExclude || [],
      targetModel: template.targetModel || options.targetModel,
      ...options,
    };

    return config;
  }

  /**
   * Build ignore patterns from template exclude list
   * @param {object} template - Template object
   * @returns {Array} Array of ignore patterns
   */
  buildIgnorePatterns(template) {
    const patterns = [];

    if (template.exclude) {
      patterns.push(...template.exclude);
    }

    return patterns;
  }

  /**
   * Create a custom template
   * @param {string} id - Template identifier
   * @param {object} template - Template configuration
   * @returns {string} Path to created template file
   */
  createCustom(id, template) {
    // Ensure .ctxman/templates directory exists
    if (!fs.existsSync(this.customTemplatesPath)) {
      fs.mkdirSync(this.customTemplatesPath, { recursive: true });
    }

    const filePath = path.join(this.customTemplatesPath, `${id}.json`);

    // Check if template already exists
    if (fs.existsSync(filePath)) {
      throw new Error(`Template '${id}' already exists`);
    }

    // Validate template structure
    this.validateTemplate(template);

    // Write template file
    fs.writeFileSync(filePath, JSON.stringify(template, null, 2));

    return filePath;
  }

  /**
   * Validate template structure
   * @param {object} template - Template to validate
   * @throws {Error} If template is invalid
   */
  validateTemplate(template) {
    if (!template.name || typeof template.name !== 'string') {
      throw new Error('Template must have a "name" string property');
    }

    if (!template.description || typeof template.description !== 'string') {
      throw new Error('Template must have a "description" string property');
    }

    if (template.include && !Array.isArray(template.include)) {
      throw new Error('Template "include" must be an array');
    }

    if (template.exclude && !Array.isArray(template.exclude)) {
      throw new Error('Template "exclude" must be an array');
    }

    if (template.methodInclude && !Array.isArray(template.methodInclude)) {
      throw new Error('Template "methodInclude" must be an array');
    }

    if (template.methodExclude && !Array.isArray(template.methodExclude)) {
      throw new Error('Template "methodExclude" must be an array');
    }
  }

  /**
   * Delete a custom template
   * @param {string} id - Template identifier
   * @returns {boolean} True if deleted, false if not found
   */
  deleteCustom(id) {
    // Prevent deletion of built-in templates
    if (BUILTIN_TEMPLATES[id]) {
      throw new Error('Cannot delete built-in templates');
    }

    const filePath = path.join(this.customTemplatesPath, `${id}.json`);

    if (!fs.existsSync(filePath)) {
      return false;
    }

    fs.unlinkSync(filePath);
    return true;
  }

  /**
   * Format templates for display
   * @returns {string} Formatted template list
   */
  formatList() {
    const templates = this.list();
    const lines = [];

    lines.push('\n📋 Available Context Templates:\n');
    lines.push('═'.repeat(70));

    // Group by source
    const builtin = templates.filter((t) => t.source === 'builtin');
    const custom = templates.filter((t) => t.source === 'custom');

    if (builtin.length > 0) {
      lines.push('\nBuilt-in Templates:');
      builtin.forEach((t) => {
        lines.push(`  ${t.id.padEnd(15)} ${t.description}`);
      });
    }

    if (custom.length > 0) {
      lines.push('\nCustom Templates:');
      custom.forEach((t) => {
        lines.push(`  ${t.id.padEnd(15)} ${t.description}`);
      });
    }

    lines.push('\n' + '═'.repeat(70));
    lines.push('\nUsage:');
    lines.push('  ctxman --template <template-id>');
    lines.push('  ctxman -t bug-fix');
    lines.push('  ctxman -t feature --cli');
    lines.push('\nCustom Templates:');
    lines.push('  Add templates to .ctxman/templates/<name>.json');
    lines.push('');

    return lines.join('\n');
  }
}

export default TemplateManager;
export { BUILTIN_TEMPLATES };
