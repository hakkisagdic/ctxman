/**
 * GitIgnore Parser
 * Parses .gitignore, .contextignore, and .contextinclude files
 */

import fs from 'fs';

class GitIgnoreParser {
  constructor(gitignorePath, contextIgnorePath, contextIncludePath) {
    this.patterns = [];
    this.contextPatterns = [];
    this.hasIncludeFile = false;
    this._lastIgnoreReason = null;

    this.loadPatterns(gitignorePath, contextIgnorePath, contextIncludePath);
  }

  loadPatterns(gitignorePath, contextIgnorePath, contextIncludePath) {
    // Load .gitignore
    if (fs.existsSync(gitignorePath)) {
      this.patterns = this.parsePatternFile(gitignorePath);
    }

    // Load context patterns (include takes priority)
    if (contextIncludePath && fs.existsSync(contextIncludePath)) {
      this.contextPatterns = this.parsePatternFile(contextIncludePath);
      this.hasIncludeFile = true;
      console.log(`📅 Context include rules loaded: ${this.contextPatterns.length} patterns`);
    } else if (contextIgnorePath && fs.existsSync(contextIgnorePath)) {
      this.contextPatterns = this.parsePatternFile(contextIgnorePath);
      console.log(`📋 Context ignore rules loaded: ${this.contextPatterns.length} patterns`);
    }
  }

  parsePatternFile(filePath) {
    try {
      // Check if path is actually a file (not a directory)
      const stats = fs.statSync(filePath);
      if (stats.isDirectory()) {
        console.warn(`Warning: ${filePath} is a directory, expected a file`);
        return [];
      }

      return fs
        .readFileSync(filePath, 'utf8')
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#'))
        .map((pattern) => this.convertToRegex(pattern));
    } catch (_error) {
      // File doesn't exist or can't be read
      return [];
    }
  }

  convertToRegex(pattern) {
    const isDirectory = pattern.endsWith('/');
    const isNegation = pattern.startsWith('!');
    const original = pattern;

    pattern = pattern.replace(/^[!/]/, '').replace(/\/$/, '');

    // Placeholders keep the `*` inside `.*` from being rewritten by the single-star rule
    let regexPattern = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*\*\//g, '\u0001') // `**/`: zero or more directories
      .replace(/\*\*/g, '\u0002') // any other `**`: anything, across directories
      .replace(/\*/g, '[^/]*')
      .replace(/\?/g, '[^/]')
      .replace(/\u0001/g, '(?:.*/)?')
      .replace(/\u0002/g, '.*');

    regexPattern = original.startsWith('/') ? `^${regexPattern}` : `(^|/)${regexPattern}`;

    regexPattern += isDirectory ? '(/.*)?$' : '$';

    return { regex: new RegExp(regexPattern), isNegation, original, isDirectory };
  }

  isIgnored(filePath, relativePath) {
    let ignored = this.testPatterns(this.patterns, relativePath, 'gitignore');

    if (this.hasIncludeFile) {
      if (ignored) return true; // Keep gitignore exclusions

      if (this.isDirectory(filePath)) {
        const shouldTraverse = this.contextPatterns.some(
          (p) =>
            p.original.startsWith(relativePath) || p.original.includes('**') || relativePath === ''
        );
        ignored = !shouldTraverse;
      } else {
        const included = this.testPatternsWithNegation(this.contextPatterns, relativePath);
        ignored = !included;
      }

      if (ignored) this._lastIgnoreReason = 'context-include';
    } else if (!ignored) {
      ignored = this.testPatterns(this.contextPatterns, relativePath, 'context');
    }

    return ignored;
  }

  isDirectory(filePath) {
    try {
      return fs.statSync(filePath).isDirectory();
    } catch (_error) {
      // Deleted (e.g. a watch-mode "rename" event) or unreadable: treat it as a file
      return false;
    }
  }

  testPatterns(patterns, relativePath, reason) {
    let ignored = false;
    for (const pattern of patterns) {
      if (pattern.regex.test(relativePath)) {
        ignored = !pattern.isNegation;
        if (ignored) this._lastIgnoreReason = reason;
      }
    }
    return ignored;
  }

  testPatternsWithNegation(patterns, relativePath) {
    let included = false;
    for (const pattern of patterns) {
      if (pattern.regex.test(relativePath)) {
        included = pattern.isNegation ? false : true;
        if (pattern.isNegation) break;
      }
    }
    return included;
  }
}

export default GitIgnoreParser;
