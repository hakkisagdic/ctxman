/**
 * Tests for AI-Powered Context Suggestions (FEAT-005)
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { AISuggester } from '../lib/analyzers/ai-suggester.js';
import { DuplicateDetector } from '../lib/analyzers/duplicate-detector.js';
import { UnusedExportsDetector } from '../lib/analyzers/unused-exports-detector.js';
import fs from 'fs';
import os from 'os';
import path from 'path';

describe('AISuggester', () => {
    let tempDir;
    let suggester;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-suggester-test-'));
        suggester = new AISuggester({
            projectRoot: tempDir
        });
    });

    afterEach(() => {
        if (tempDir && fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });

    describe('Efficiency Score', () => {
        test('returns 100 for optimal context', async () => {
            // Create small, focused files
            const mainFile = path.join(tempDir, 'main.js');
            fs.writeFileSync(mainFile, 'function main() { return 1; }');

            const stats = {
                totalFiles: 1,
                totalTokens: 100,
                largestFiles: []
            };

            const files = [{
                path: mainFile,
                relativePath: 'main.js',
                tokens: 100
            }];

            const result = await suggester.analyze(stats, files);

            expect(result.score).toBeGreaterThanOrEqual(80);
            expect(result.metrics.totalFiles).toBe(1);
        });

        test('penalizes for large files', async () => {
            const largeFile = path.join(tempDir, 'large.js');
            fs.writeFileSync(largeFile, 'x'.repeat(200000)); // Large file

            const stats = {
                totalFiles: 1,
                totalTokens: 60000, // Over critical threshold
                largestFiles: [{
                    path: largeFile,
                    relativePath: 'large.js',
                    tokens: 60000
                }]
            };

            const files = [{
                path: largeFile,
                relativePath: 'large.js',
                tokens: 60000
            }];

            const result = await suggester.analyze(stats, files);

            expect(result.score).toBeLessThan(100);
            expect(result.suggestions.critical.length).toBeGreaterThan(0);
            expect(result.suggestions.critical[0].type).toBe('large_file');
        });

        test('penalizes for high test ratio', async () => {
            const stats = {
                totalFiles: 10,
                totalTokens: 10000,
                largestFiles: []
            };

            const files = [];
            for (let i = 0; i < 6; i++) {
                files.push({
                    path: path.join(tempDir, `test${i}.test.js`),
                    relativePath: `test${i}.test.js`,
                    tokens: 1000
                });
            }
            for (let i = 0; i < 4; i++) {
                files.push({
                    path: path.join(tempDir, `src${i}.js`),
                    relativePath: `src${i}.js`,
                    tokens: 1000
                });
            }

            const result = await suggester.analyze(stats, files);

            expect(result.suggestions.warning.some(w => w.type === 'test_files')).toBe(true);
        });
    });

    describe('Large File Detection', () => {
        test('detects critical large files (50K+ tokens)', async () => {
            const stats = {
                totalFiles: 2,
                totalTokens: 70000,
                largestFiles: []
            };

            const files = [
                {
                    path: path.join(tempDir, 'huge.js'),
                    relativePath: 'huge.js',
                    tokens: 55000
                },
                {
                    path: path.join(tempDir, 'small.js'),
                    relativePath: 'small.js',
                    tokens: 500
                }
            ];

            const result = await suggester.analyze(stats, files);

            expect(result.suggestions.critical.length).toBeGreaterThan(0);
            expect(result.suggestions.critical[0].type).toBe('large_file');
            expect(result.suggestions.critical[0].tokens).toBe(55000);
        });

        test('detects warning large files (20K-50K tokens)', async () => {
            const stats = {
                totalFiles: 1,
                totalTokens: 30000,
                largestFiles: []
            };

            const files = [{
                path: path.join(tempDir, 'medium.js'),
                relativePath: 'medium.js',
                tokens: 25000
            }];

            const result = await suggester.analyze(stats, files);

            expect(result.suggestions.warning.some(w => w.type === 'large_file')).toBe(true);
        });

        test('detects suggestion large files (10K-20K tokens)', async () => {
            const stats = {
                totalFiles: 1,
                totalTokens: 15000,
                largestFiles: []
            };

            const files = [{
                path: path.join(tempDir, 'moderate.js'),
                relativePath: 'moderate.js',
                tokens: 12000
            }];

            const result = await suggester.analyze(stats, files);

            expect(result.suggestions.suggestion.some(s => s.type === 'large_file')).toBe(true);
        });
    });

    describe('Test File Detection', () => {
        test('detects .test.js files', async () => {
            const stats = { totalFiles: 5, totalTokens: 5000, largestFiles: [] };
            const files = [
                { path: path.join(tempDir, 'a.test.js'), relativePath: 'a.test.js', tokens: 1000 },
                { path: path.join(tempDir, 'b.test.js'), relativePath: 'b.test.js', tokens: 1000 },
                { path: path.join(tempDir, 'c.js'), relativePath: 'c.js', tokens: 1000 }
            ];

            const result = await suggester.analyze(stats, files);

            expect(result.metrics.testFiles).toBe(2);
            expect(result.metrics.testTokens).toBe(2000);
        });

        test('detects .spec.js files', async () => {
            const stats = { totalFiles: 3, totalTokens: 3000, largestFiles: [] };
            const files = [
                { path: path.join(tempDir, 'api.spec.js'), relativePath: 'api.spec.js', tokens: 1500 },
                { path: path.join(tempDir, 'app.js'), relativePath: 'app.js', tokens: 1500 }
            ];

            const result = await suggester.analyze(stats, files);

            expect(result.metrics.testFiles).toBe(1);
        });

        test('detects files in __tests__ directory', async () => {
            const stats = { totalFiles: 3, totalTokens: 3000, largestFiles: [] };
            const files = [
                { path: path.join(tempDir, '__tests__/component.js'), relativePath: '__tests__/component.js', tokens: 1000 },
                { path: path.join(tempDir, 'src/component.js'), relativePath: 'src/component.js', tokens: 1000 }
            ];

            const result = await suggester.analyze(stats, files);

            // The __tests__ path should match the pattern '/__tests__/'
            expect(result.metrics.testFiles).toBe(1);
        });
    });

    describe('Config File Detection', () => {
        test('detects JSON config files', async () => {
            const stats = { totalFiles: 3, totalTokens: 3000, largestFiles: [] };
            const files = [
                { path: path.join(tempDir, 'config.json'), relativePath: 'config.json', tokens: 500 },
                { path: path.join(tempDir, 'settings.yaml'), relativePath: 'settings.yaml', tokens: 300 },
                { path: path.join(tempDir, 'app.js'), relativePath: 'app.js', tokens: 1000 }
            ];

            const result = await suggester.analyze(stats, files);

            expect(result.metrics.configFiles).toBe(2);
        });
    });

    describe('Output Formatting', () => {
        test('formats output as text by default', async () => {
            const stats = { totalFiles: 1, totalTokens: 100, largestFiles: [] };
            const files = [{ path: path.join(tempDir, 'a.js'), relativePath: 'a.js', tokens: 100 }];

            const result = await suggester.analyze(stats, files);
            const output = suggester.formatOutput(result);

            expect(output).toContain('AI Context Suggestions');
            expect(output).toContain('Efficiency Score');
        });

        test('formats output as JSON when requested', async () => {
            const jsonSuggester = new AISuggester({ projectRoot: tempDir, json: true });
            const stats = { totalFiles: 1, totalTokens: 100, largestFiles: [] };
            const files = [{ path: path.join(tempDir, 'a.js'), relativePath: 'a.js', tokens: 100 }];

            const result = await jsonSuggester.analyze(stats, files);
            const output = jsonSuggester.formatOutput(result);

            expect(() => JSON.parse(output)).not.toThrow();
            const parsed = JSON.parse(output);
            expect(parsed).toHaveProperty('score');
            expect(parsed).toHaveProperty('suggestions');
        });
    });
});

describe('DuplicateDetector', () => {
    let detector;
    let tempDir;

    beforeEach(() => {
        detector = new DuplicateDetector();
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicate-test-'));
    });

    afterEach(() => {
        if (tempDir && fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });

    test('detects exact duplicate code blocks', () => {
        const duplicateCode = `
function calculateTotal(items) {
    let total = 0;
    for (const item of items) {
        total += item.price;
    }
    return total;
}`;

        const files = [
            {
                path: path.join(tempDir, 'a.js'),
                relativePath: 'a.js',
                content: duplicateCode + '\n// extra code'
            },
            {
                path: path.join(tempDir, 'b.js'),
                relativePath: 'b.js',
                content: duplicateCode + '\n// different code'
            }
        ];

        const duplicates = detector.detect(files);

        expect(duplicates.length).toBeGreaterThan(0);
        expect(duplicates[0].type).toBe('exact');
        expect(duplicates[0].count).toBeGreaterThanOrEqual(2);
    });

    test('returns empty array for unique code', () => {
        const files = [
            {
                path: path.join(tempDir, 'a.js'),
                relativePath: 'a.js',
                content: 'function a() { return 1; }'
            },
            {
                path: path.join(tempDir, 'b.js'),
                relativePath: 'b.js',
                content: 'function b() { return 2; }'
            }
        ];

        const duplicates = detector.detect(files);

        expect(duplicates.length).toBe(0);
    });

    test('calculates wasted tokens', () => {
        const duplicateCode = 'x'.repeat(100);
        const files = [
            {
                path: path.join(tempDir, 'a.js'),
                relativePath: 'a.js',
                content: duplicateCode
            },
            {
                path: path.join(tempDir, 'b.js'),
                relativePath: 'b.js',
                content: duplicateCode
            }
        ];

        detector.detect(files);
        const stats = detector.getStats();

        expect(stats).toHaveProperty('totalGroups');
        expect(stats).toHaveProperty('wastedTokens');
    });
});

describe('UnusedExportsDetector', () => {
    let detector;
    let tempDir;

    beforeEach(() => {
        detector = new UnusedExportsDetector();
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'unused-exports-test-'));
    });

    afterEach(() => {
        if (tempDir && fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });

    test('detects unused exports', () => {
        const files = [
            {
                path: path.join(tempDir, 'utils.js'),
                relativePath: 'utils.js',
                content: `
export function usedFunc() { return 1; }
export function unusedFunc() { return 2; }
export const unusedVar = 'test';
`
            },
            {
                path: path.join(tempDir, 'main.js'),
                relativePath: 'main.js',
                content: `import { usedFunc } from './utils.js';\nusedFunc();`
            }
        ];

        const unused = detector.detect(files);

        expect(unused.length).toBeGreaterThan(0);
        expect(unused.some(u => u.name === 'unusedFunc')).toBe(true);
        expect(unused.some(u => u.name === 'unusedVar')).toBe(true);
        expect(unused.some(u => u.name === 'usedFunc')).toBe(false);
    });

    test('does not flag used exports', () => {
        const files = [
            {
                path: path.join(tempDir, 'math.js'),
                relativePath: 'math.js',
                content: `export function add(a, b) { return a + b; }`
            },
            {
                path: path.join(tempDir, 'app.js'),
                relativePath: 'app.js',
                content: `import { add } from './math.js';\nconsole.log(add(1, 2));`
            }
        ];

        const unused = detector.detect(files);

        expect(unused.some(u => u.name === 'add')).toBe(false);
    });

    test('calculates statistics', () => {
        const files = [
            {
                path: path.join(tempDir, 'exports.js'),
                relativePath: 'exports.js',
                content: `export function a() {} export function b() {}`
            }
        ];

        detector.detect(files);
        const stats = detector.getStats();

        expect(stats).toHaveProperty('totalUnused');
        expect(stats).toHaveProperty('filesAffected');
        expect(stats).toHaveProperty('byType');
    });

    test('extracts named exports correctly', () => {
        const content = `export { foo, bar, baz as qux };`;
        const exports = detector.extractExports(content, 'test.js');

        expect(exports.length).toBe(3);
        expect(exports.some(e => e.name === 'foo')).toBe(true);
        expect(exports.some(e => e.name === 'bar')).toBe(true);
        expect(exports.some(e => e.name === 'qux')).toBe(true);
    });

    test('extracts default exports', () => {
        const content = `export default MyComponent;`;
        const exports = detector.extractExports(content, 'test.js');

        expect(exports.some(e => e.name === 'MyComponent' && e.isDefault)).toBe(true);
    });
});
