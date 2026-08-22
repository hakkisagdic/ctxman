/**
 * Unused Exports Detector
 * Detects exported functions/variables that are never imported
 * Part of FEAT-005: AI-Powered Context Suggestions
 */

import path from 'path';
import { getLogger } from '../utils/logger.js';

const logger = getLogger('UnusedExportsDetector');

export class UnusedExportsDetector {
    constructor(options = {}) {
        this.options = {
            excludePatterns: options.excludePatterns || ['index.js', 'index.ts', '*.d.ts'],
            ...options
        };
        this.unusedExports = [];
    }

    /**
     * Detect unused exports in files
     * @param {Array} files - Array of file objects with content
     * @returns {Array} Array of unused export objects
     */
    detect(files) {
        logger.debug(`Analyzing ${files.length} files for unused exports`);
        
        // Build export and import maps
        const exportsMap = this.buildExportsMap(files);
        const importsMap = this.buildImportsMap(files);
        
        // Find unused exports
        const unused = this.findUnusedExports(exportsMap, importsMap);
        
        this.unusedExports = unused;
        logger.info(`Found ${unused.length} potentially unused exports`);
        
        return unused;
    }

    /**
     * Build a map of all exports from files
     */
    buildExportsMap(files) {
        const exportsMap = new Map();
        
        for (const file of files) {
            if (!file.content || !this.isCodeFile(file.path)) {
                continue;
            }
            
            const exports = this.extractExports(file.content, file.path);
            if (exports.length > 0) {
                exportsMap.set(file.relativePath || file.path, exports);
            }
        }
        
        return exportsMap;
    }

    /**
     * Build a map of all imports in files
     */
    buildImportsMap(files) {
        const importsMap = new Map();
        
        for (const file of files) {
            if (!file.content || !this.isCodeFile(file.path)) {
                continue;
            }
            
            const imports = this.extractImports(file.content);
            for (const imp of imports) {
                const key = imp.name;
                if (!importsMap.has(key)) {
                    importsMap.set(key, []);
                }
                importsMap.get(key).push({
                    file: file.relativePath || file.path,
                    source: imp.source
                });
            }
        }
        
        return importsMap;
    }

    /**
     * Extract exports from JavaScript/TypeScript content
     */
    extractExports(content, filePath) {
        const exports = [];
        const lines = content.split('\n');
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            // export function name
            const funcMatch = line.match(/export\s+(?:async\s+)?function\s+(\w+)/);
            if (funcMatch) {
                exports.push({
                    name: funcMatch[1],
                    type: 'function',
                    line: i + 1
                });
                continue;
            }
            
            // export const/let/var name
            const constMatch = line.match(/export\s+(?:const|let|var)\s+(\w+)/);
            if (constMatch) {
                exports.push({
                    name: constMatch[1],
                    type: 'variable',
                    line: i + 1
                });
                continue;
            }
            
            // export class Name
            const classMatch = line.match(/export\s+class\s+(\w+)/);
            if (classMatch) {
                exports.push({
                    name: classMatch[1],
                    type: 'class',
                    line: i + 1
                });
                continue;
            }
            
            // export { name1, name2 }
            const namedMatch = line.match(/export\s+\{([^}]+)\}/);
            if (namedMatch) {
                const names = namedMatch[1].split(',').map(n => {
                    const parts = n.trim().split(/\s+as\s+/);
                    return parts[parts.length - 1].trim();
                }).filter(n => n);
                
                for (const name of names) {
                    exports.push({
                        name,
                        type: 'named',
                        line: i + 1
                    });
                }
                continue;
            }
            
            // export default name
            const defaultMatch = line.match(/export\s+default\s+(\w+)/);
            if (defaultMatch) {
                exports.push({
                    name: defaultMatch[1],
                    type: 'default',
                    line: i + 1,
                    isDefault: true
                });
            }
        }
        
        return exports;
    }

    /**
     * Extract imports from JavaScript/TypeScript content
     */
    extractImports(content) {
        const imports = [];
        const lines = content.split('\n');
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            // import { name } from 'source'
            const namedImport = line.match(/import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/);
            if (namedImport) {
                const names = namedImport[1].split(',').map(n => {
                    const parts = n.trim().split(/\s+as\s+/);
                    return parts[0].trim();
                }).filter(n => n);
                
                for (const name of names) {
                    imports.push({ name, source: namedImport[2], line: i + 1 });
                }
                continue;
            }
            
            // import name from 'source'
            const defaultImport = line.match(/import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/);
            if (defaultImport) {
                imports.push({ name: defaultImport[1], source: defaultImport[2], line: i + 1 });
                continue;
            }
            
            // import * as name from 'source'
            const namespaceImport = line.match(/import\s+\*\s+as\s+(\w+)\s+from\s+['"]([^'"]+)['"]/);
            if (namespaceImport) {
                imports.push({ name: namespaceImport[1], source: namespaceImport[2], line: i + 1, isNamespace: true });
                continue;
            }
            
            // require('source')
            const requireMatch = line.match(/(?:const|let|var)\s+\{([^}]+)\}\s*=\s*require\(['"]([^'"]+)['"]\)/);
            if (requireMatch) {
                const names = requireMatch[1].split(',').map(n => n.trim()).filter(n => n);
                for (const name of names) {
                    imports.push({ name, source: requireMatch[2], line: i + 1 });
                }
            }
        }
        
        return imports;
    }

    /**
     * Find exports that are never imported
     */
    findUnusedExports(exportsMap, importsMap) {
        const unused = [];
        
        for (const [filePath, exports] of exportsMap) {
            // Skip index files (typically re-export)
            if (this.shouldExclude(filePath)) {
                continue;
            }
            
            for (const exp of exports) {
                // Skip default exports (often used differently)
                if (exp.isDefault) {
                    continue;
                }
                
                // Check if this export is imported anywhere
                const imports = importsMap.get(exp.name);
                
                if (!imports || imports.length === 0) {
                    unused.push({
                        file: filePath,
                        name: exp.name,
                        type: exp.type,
                        line: exp.line,
                        tokens: this.estimateExportTokens(exp)
                    });
                }
            }
        }
        
        // Sort by file, then by line
        unused.sort((a, b) => {
            if (a.file !== b.file) return a.file.localeCompare(b.file);
            return a.line - b.line;
        });
        
        return unused;
    }

    /**
     * Check if file should be excluded from unused export detection
     */
    shouldExclude(filePath) {
        const basename = path.basename(filePath);
        
        for (const pattern of this.options.excludePatterns) {
            if (pattern.startsWith('*')) {
                const ext = pattern.substring(1);
                if (basename.endsWith(ext)) return true;
            } else if (basename === pattern) {
                return true;
            }
        }
        
        return false;
    }

    /**
     * Check if file is a code file
     */
    isCodeFile(filePath) {
        const codeExtensions = ['.js', '.ts', '.jsx', '.tsx', '.mjs'];
        const ext = path.extname(filePath).toLowerCase();
        return codeExtensions.includes(ext);
    }

    /**
     * Estimate tokens for an export
     */
    estimateExportTokens(exp) {
        // Rough estimate based on type
        const baseTokens = { function: 30, class: 50, variable: 10, named: 15 };
        return baseTokens[exp.type] || 10;
    }

    /**
     * Get statistics about unused exports
     */
    getStats() {
        const byFile = {};
        
        for (const exp of this.unusedExports) {
            if (!byFile[exp.file]) {
                byFile[exp.file] = [];
            }
            byFile[exp.file].push(exp);
        }
        
        return {
            totalUnused: this.unusedExports.length,
            filesAffected: Object.keys(byFile).length,
            byType: {
                functions: this.unusedExports.filter(e => e.type === 'function').length,
                classes: this.unusedExports.filter(e => e.type === 'class').length,
                variables: this.unusedExports.filter(e => e.type === 'variable').length,
                named: this.unusedExports.filter(e => e.type === 'named').length
            }
        };
    }
}

export default UnusedExportsDetector;
