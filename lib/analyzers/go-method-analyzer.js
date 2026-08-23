/**
 * Go Method Analyzer
 * Extracts functions and methods from Go source files
 */

import path from 'path';

class GoMethodAnalyzer {
  extractMethods(content, filePath) {
    const patterns = [
      // Regular function: func FunctionName(params) returnType { ... }
      { regex: /func\s+([A-Z_][a-zA-Z0-9_]*)\s*\(/g, type: 'function' },

      // Method (receiver function): func (r *Receiver) MethodName(params) returnType { ... }
      { regex: /func\s+\([^)]+\)\s+([A-Z_][a-zA-Z0-9_]*)\s*\(/g, type: 'method' },

      // Interface method declarations: MethodName(params) returnType
      {
        regex: /^\s+([A-Z_][a-zA-Z0-9_]*)\s*\([^)]*\)\s*(?:[a-zA-Z0-9_*\[\]]+)?/gm,
        type: 'interface',
      },
    ];

    const methodsMap = new Map();
    const processedLines = new Map();

    patterns.forEach(({ regex, type }) => {
      let match;
      while ((match = regex.exec(content)) !== null) {
        const line = this.getLineNumber(content, match.index);
        const methodName = match[1];

        if (methodName && !this.isKeyword(methodName)) {
          const key = `${methodName}:${line}`;

          // Skip if this line was already processed
          if (processedLines.has(key)) {
            continue;
          }

          // Validate it's not inside a comment
          if (this.isInComment(content, match.index)) {
            continue;
          }

          methodsMap.set(key, {
            name: methodName,
            line: line,
            file: path.relative(process.cwd(), filePath),
            type: type,
          });
          processedLines.set(key, true);
        }
      }
    });

    return Array.from(methodsMap.values());
  }

  getLineNumber(content, index) {
    return content.substring(0, index).split('\n').length;
  }

  isInComment(content, index) {
    // Check if position is inside a comment
    const beforeContent = content.substring(0, index);
    const lines = beforeContent.split('\n');
    const currentLine = lines[lines.length - 1];

    // Single-line comment check
    if (currentLine.includes('//')) {
      const commentPos = currentLine.indexOf('//');
      const matchPos = currentLine.length;
      if (commentPos < matchPos) {
        return true;
      }
    }

    // Multi-line comment check (simple heuristic)
    const beforeText = content.substring(0, index);
    const openComments = (beforeText.match(/\/\*/g) || []).length;
    const closeComments = (beforeText.match(/\*\//g) || []).length;

    return openComments > closeComments;
  }

  isKeyword(name) {
    // Go keywords and common types
    const keywords = new Set([
      'break',
      'case',
      'chan',
      'const',
      'continue',
      'default',
      'defer',
      'else',
      'fallthrough',
      'for',
      'func',
      'go',
      'goto',
      'if',
      'import',
      'interface',
      'map',
      'package',
      'range',
      'return',
      'select',
      'struct',
      'switch',
      'type',
      'var',
      // Common types
      'bool',
      'byte',
      'complex64',
      'complex128',
      'error',
      'float32',
      'float64',
      'int',
      'int8',
      'int16',
      'int32',
      'int64',
      'rune',
      'string',
      'uint',
      'uint8',
      'uint16',
      'uint32',
      'uint64',
      'uintptr',
    ]);
    return keywords.has(name);
  }

  extractMethodContent(content, methodName) {
    // Extract function/method body
    const patterns = [
      new RegExp(`(func\\s+${methodName}\\s*\\([^)]*\\)[^{]*\\{)`, 'g'),
      new RegExp(`(func\\s+\\([^)]+\\)\\s+${methodName}\\s*\\([^)]*\\)[^{]*\\{)`, 'g'),
    ];

    for (const pattern of patterns) {
      const match = pattern.exec(content);
      if (match) {
        // Find the matching closing brace
        let braceCount = 1;
        let pos = match.index + match[0].length;

        while (braceCount > 0 && pos < content.length) {
          if (content[pos] === '{') braceCount++;
          if (content[pos] === '}') braceCount--;
          pos++;
        }

        return content.substring(match.index, pos);
      }
    }
    return null;
  }
}

export default GoMethodAnalyzer;
