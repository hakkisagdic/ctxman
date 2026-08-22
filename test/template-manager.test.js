/**
 * Template Manager Tests
 * FEAT-009: Context Templates
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import TemplateManager, { BUILTIN_TEMPLATES } from '../lib/utils/template-manager.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('TemplateManager', () => {
    let tempDir;
    let manager;

    beforeEach(() => {
        // Create a temporary directory for testing
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-test-'));
        manager = new TemplateManager(tempDir);
    });

    afterEach(() => {
        // Clean up temporary directory
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    describe('list()', () => {
        it('should list all built-in templates', () => {
            const templates = manager.list();

            expect(templates.length).toBeGreaterThan(0);

            // Check for required templates
            const templateIds = templates.map(t => t.id);
            expect(templateIds).toContain('bug-fix');
            expect(templateIds).toContain('feature');
            expect(templateIds).toContain('code-review');
            expect(templateIds).toContain('documentation');
            expect(templateIds).toContain('refactoring');
            expect(templateIds).toContain('testing');
            expect(templateIds).toContain('full-context');
        });

        it('should mark built-in templates with source: builtin', () => {
            const templates = manager.list();
            const bugFixTemplate = templates.find(t => t.id === 'bug-fix');

            expect(bugFixTemplate).toBeDefined();
            expect(bugFixTemplate.source).toBe('builtin');
        });

        it('should include custom templates in list', () => {
            // Create a custom template
            const customTemplate = {
                name: 'Custom Template',
                description: 'A custom template for testing'
            };

            const ctxmanDir = path.join(tempDir, '.ctxman', 'templates');
            fs.mkdirSync(ctxmanDir, { recursive: true });
            fs.writeFileSync(
                path.join(ctxmanDir, 'my-custom.json'),
                JSON.stringify(customTemplate)
            );

            const templates = manager.list();
            const custom = templates.find(t => t.id === 'my-custom');

            expect(custom).toBeDefined();
            expect(custom.source).toBe('custom');
            expect(custom.name).toBe('Custom Template');
        });
    });

    describe('get()', () => {
        it('should return a built-in template by id', () => {
            const template = manager.get('bug-fix');

            expect(template).toBeDefined();
            expect(template.id).toBe('bug-fix');
            expect(template.name).toBe('Bug Fix Context');
            expect(template.source).toBe('builtin');
        });

        it('should return null for non-existent template', () => {
            const template = manager.get('non-existent');

            expect(template).toBeNull();
        });

        it('should return custom template if exists', () => {
            const customTemplate = {
                name: 'My Custom',
                description: 'Custom template'
            };

            const ctxmanDir = path.join(tempDir, '.ctxman', 'templates');
            fs.mkdirSync(ctxmanDir, { recursive: true });
            fs.writeFileSync(
                path.join(ctxmanDir, 'custom-test.json'),
                JSON.stringify(customTemplate)
            );

            const template = manager.get('custom-test');

            expect(template).toBeDefined();
            expect(template.source).toBe('custom');
        });
    });

    describe('apply()', () => {
        it('should apply a template and return config', () => {
            const config = manager.apply('bug-fix');

            expect(config).toBeDefined();
            expect(config.templateId).toBe('bug-fix');
            expect(config.templateName).toBe('Bug Fix Context');
            expect(config.targetModel).toBe('claude-sonnet-4.5');
        });

        it('should throw error for non-existent template', () => {
            expect(() => manager.apply('non-existent')).toThrow('not found');
        });

        it('should merge options with template config', () => {
            const config = manager.apply('bug-fix', { targetModel: 'gpt-4' });

            expect(config.targetModel).toBe('gpt-4');
        });

        it('should include ignore patterns from template', () => {
            const config = manager.apply('bug-fix');

            expect(config.ignorePatterns).toBeDefined();
            expect(config.ignorePatterns.length).toBeGreaterThan(0);
        });
    });

    describe('createCustom()', () => {
        it('should create a custom template file', () => {
            const template = {
                name: 'Test Template',
                description: 'Test description'
            };

            const filePath = manager.createCustom('test-template', template);

            expect(fs.existsSync(filePath)).toBe(true);
            expect(filePath).toContain('test-template.json');
        });

        it('should throw error if template already exists', () => {
            const template = {
                name: 'Test Template',
                description: 'Test description'
            };

            manager.createCustom('test-template', template);

            expect(() => manager.createCustom('test-template', template)).toThrow('already exists');
        });

        it('should validate template structure', () => {
            const invalidTemplate = {
                name: 'Test'
                // Missing description
            };

            expect(() => manager.createCustom('invalid', invalidTemplate)).toThrow('description');
        });
    });

    describe('deleteCustom()', () => {
        it('should delete a custom template', () => {
            const template = {
                name: 'Test Template',
                description: 'Test description'
            };

            manager.createCustom('to-delete', template);
            const result = manager.deleteCustom('to-delete');

            expect(result).toBe(true);
            expect(manager.get('to-delete')).toBeNull();
        });

        it('should return false if template does not exist', () => {
            const result = manager.deleteCustom('non-existent');

            expect(result).toBe(false);
        });

        it('should throw error when trying to delete built-in template', () => {
            expect(() => manager.deleteCustom('bug-fix')).toThrow('Cannot delete built-in');
        });
    });

    describe('formatList()', () => {
        it('should return formatted string with templates', () => {
            const formatted = manager.formatList();

            expect(formatted).toContain('Available Context Templates');
            expect(formatted).toContain('bug-fix');
            expect(formatted).toContain('feature');
        });

        it('should include usage examples', () => {
            const formatted = manager.formatList();

            expect(formatted).toContain('--template');
        });
    });

    describe('BUILTIN_TEMPLATES', () => {
        it('should have all required templates', () => {
            expect(BUILTIN_TEMPLATES['bug-fix']).toBeDefined();
            expect(BUILTIN_TEMPLATES['feature']).toBeDefined();
            expect(BUILTIN_TEMPLATES['code-review']).toBeDefined();
            expect(BUILTIN_TEMPLATES['documentation']).toBeDefined();
            expect(BUILTIN_TEMPLATES['refactoring']).toBeDefined();
            expect(BUILTIN_TEMPLATES['testing']).toBeDefined();
            expect(BUILTIN_TEMPLATES['full-context']).toBeDefined();
        });

        it('should have required properties for each template', () => {
            for (const [id, template] of Object.entries(BUILTIN_TEMPLATES)) {
                expect(template.name).toBeDefined();
                expect(template.description).toBeDefined();
                expect(typeof template.name).toBe('string');
                expect(typeof template.description).toBe('string');
            }
        });
    });
});
