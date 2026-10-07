/**
 * Method Filter Parser
 * Parses .methodinclude and .methodignore files for method-level filtering
 */

import fs from 'fs';

class MethodFilterParser {
  constructor(methodIncludePath, methodIgnorePath) {
    this.includePatterns = [];
    this.ignorePatterns = [];
    this.hasIncludeFile = false;

    if (methodIncludePath && fs.existsSync(methodIncludePath)) {
      this.includePatterns = this.parseMethodFile(methodIncludePath);
      this.hasIncludeFile = true;
      console.log(`🔧 Method include rules loaded: ${this.includePatterns.length} patterns`);
    }

    if (methodIgnorePath && fs.existsSync(methodIgnorePath)) {
      this.ignorePatterns = this.parseMethodFile(methodIgnorePath);
      console.log(`🚫 Method ignore rules loaded: ${this.ignorePatterns.length} patterns`);
    }
  }

  parseMethodFile(filePath) {
    return (
      fs
        .readFileSync(filePath, 'utf8')
        .split('\n')
        // Trailing comments (`*Handler   # all handlers`) as in the documented examples
        .map((line) => line.replace(/\s+#.*$/, '').trim())
        .filter((line) => line && !line.startsWith('#'))
        .map((line) => {
          const negated = line.startsWith('!');
          const pattern = negated ? line.slice(1) : line;
          return {
            pattern: line,
            negated,
            // Anchored so a plain name is an exact match and `*Handler` / `handle*` are suffix /
            // prefix matches, as documented. `*` is the wildcard; other regex characters are
            // literal (Ruby's `valid?`, `$emit`). `.` stays a regex dot: it still matches the
            // `file.method` separator, and patterns such as `get.*Data` rely on it.
            regex: new RegExp(
              `^${pattern.replace(/[+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`,
              'i'
            ),
          };
        })
    );
  }

  shouldIncludeMethod(methodName, fileName) {
    const matches = (p) => p.regex.test(methodName) || p.regex.test(`${fileName}.${methodName}`);

    // The last matching pattern decides, so a later `!pattern` overrides a broader one
    if (this.hasIncludeFile) {
      const match = this.includePatterns.findLast(matches);
      return Boolean(match) && !match.negated;
    }

    const match = this.ignorePatterns.findLast(matches);
    return !match || match.negated;
  }
}

export default MethodFilterParser;
