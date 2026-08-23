/**
 * TOON Format Wrapper
 * Wraps official @toon-format/toon package with Ctxman integration
 *
 * Official TOON Spec v1.3: https://github.com/toon-format/spec
 * Reference Implementation: https://github.com/toon-format/toon
 *
 * Features (100% Spec Compliant):
 * - Array length markers [N]
 * - Delimiter options: comma, tab, pipe
 * - Length marker prefix: # (optional)
 * - List format for non-uniform arrays
 * - Smart quoting rules
 * - Type normalizations
 * - Full decoder support
 */

class ToonFormatter {
  constructor(options = {}) {
    this.options = {
      indent: options.indent || 2,
      delimiter: options.delimiter || ',',
      lengthMarker: options.lengthMarker || false,
    };

    // Initialize indentChar
    this.indentChar = ' '.repeat(this.options.indent);

    // Lazy load official TOON package (ESM)
    this._toonModule = null;
  }

  /**
   * Get official TOON module (lazy load)
   */
  async getToonModule() {
    if (!this._toonModule) {
      this._toonModule = await import('@toon-format/toon');
    }
    return this._toonModule;
  }

  /**
   * Encode data to TOON format (Async - uses official package)
   */
  async encodeAsync(data, options = {}) {
    const toon = await this.getToonModule();
    const opts = { ...this.options, ...options };
    return toon.encode(data, opts);
  }

  /**
   * Encode data to TOON format (Sync - uses custom implementation for backward compat)
   */
  encode(data, options = {}) {
    // Fallback to synchronous custom implementation
    // This maintains backward compatibility with existing code
    const opts = { ...this.options, ...options };
    return this.encodeSync(data, opts);
  }

  /**
   * Synchronous encoder (custom implementation - basic features only)
   * For full spec compliance, use encodeAsync()
   */
  encodeSync(data, options = {}) {
    const { indent = 2 } = options;
    this.indentChar = ' '.repeat(indent);
    return this.encodeValue(data, 0, true);
  }

  encodeValue(value, indent = 0, compact = true) {
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'boolean') return String(value);
    if (typeof value === 'number') return String(value);
    if (typeof value === 'string') return this.encodeString(value);
    if (Array.isArray(value)) return this.encodeArray(value, indent, compact);
    if (typeof value === 'object') return this.encodeObject(value, indent, compact);
    return 'null';
  }

  encodeString(str) {
    const escaped = str
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t');

    if (/[\s,:{}\[\]]/.test(escaped)) {
      return `"${escaped}"`;
    }

    return escaped;
  }

  encodeArray(arr, indent = 0, compact = true) {
    if (arr.length === 0) return '[]';

    if (this.isTabularArray(arr)) {
      return this.encodeTabular(arr, indent, compact);
    }

    return this.encodeRegularArray(arr, indent, compact);
  }

  isTabularArray(arr) {
    if (arr.length < 2) return false;
    if (!arr.every((item) => typeof item === 'object' && item !== null && !Array.isArray(item))) {
      return false;
    }

    const firstKeys = Object.keys(arr[0]).sort();
    return arr.every((item) => {
      const keys = Object.keys(item).sort();
      return keys.length === firstKeys.length && keys.every((key, i) => key === firstKeys[i]);
    });
  }

  encodeTabular(arr, indent = 0, compact = true) {
    const prefix = this.indentChar.repeat(indent);
    const keys = Object.keys(arr[0]).sort();

    let result = `{${keys.join(',')}}:\n`;

    for (const item of arr) {
      result += prefix + this.indentChar;
      const values = keys.map((key) => this.encodeValue(item[key], 0, true));
      result += values.join(',') + '\n';
    }

    return result;
  }

  encodeRegularArray(arr, indent = 0, compact = true) {
    const prefix = this.indentChar.repeat(indent);

    if (
      compact &&
      arr.every((item) => ['string', 'number', 'boolean'].includes(typeof item) || item === null)
    ) {
      return '[' + arr.map((item) => this.encodeValue(item, 0, true)).join(',') + ']';
    }

    let result = '[\n';
    for (let i = 0; i < arr.length; i++) {
      result += prefix + this.indentChar + this.encodeValue(arr[i], indent + 1, compact);
      if (i < arr.length - 1) result += ',';
      result += '\n';
    }
    result += prefix + ']';

    return result;
  }

  encodeObject(obj, indent = 0, compact = true) {
    const keys = Object.keys(obj);
    if (keys.length === 0) return '{}';

    const prefix = this.indentChar.repeat(indent);
    let result = '{\n';

    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const value = obj[key];
      result += prefix + this.indentChar + key + ': ';

      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        result += '\n' + this.encodeObject(value, indent + 1, compact);
      } else {
        result += this.encodeValue(value, indent + 1, compact);
      }

      if (i < keys.length - 1) result += ',';
      result += '\n';
    }

    result += prefix + '}';
    return result;
  }

  /**
   * Decode TOON string to JavaScript value (Async - uses official package)
   */
  async decodeAsync(toonString, options = {}) {
    const toon = await this.getToonModule();
    return toon.decode(toonString, options);
  }

  /**
   * Decode TOON string (Sync - throws error, decoder not available in sync mode)
   */
  decode(toonString, options = {}) {
    throw new Error('Synchronous decoder not available. Use decodeAsync() instead.');
  }

  /**
   * Validate TOON string
   */
  validate(toonString) {
    const errors = [];
    let braceDepth = 0;
    let bracketDepth = 0;

    for (const char of toonString) {
      if (char === '{') braceDepth++;
      if (char === '}') braceDepth--;
      if (char === '[') bracketDepth++;
      if (char === ']') bracketDepth--;

      if (braceDepth < 0) errors.push('Unbalanced braces: extra closing brace');
      if (bracketDepth < 0) errors.push('Unbalanced brackets: extra closing bracket');
    }

    if (braceDepth > 0) errors.push('Unbalanced braces: missing closing braces');
    if (bracketDepth > 0) errors.push('Unbalanced brackets: missing closing brackets');

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Estimate tokens (GPT-4 compatible)
   */
  estimateTokens(toonString) {
    return Math.ceil(toonString.length / 4);
  }

  /**
   * Optimize TOON output
   */
  optimize(toonString) {
    const lines = toonString.split('\n');
    const optimized = lines.map((line) => line.trimEnd()).join('\n');
    return optimized.replace(/\n{3,}/g, '\n\n');
  }

  /**
   * Minify TOON output
   */
  minify(toonString) {
    return toonString
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .join('\n');
  }

  /**
   * Compare TOON with JSON (token savings)
   */
  compareWithJSON(data) {
    const toon = this.encode(data);
    const json = JSON.stringify(data, null, 2);

    const toonSize = toon.length;
    const jsonSize = json.length;
    const savings = jsonSize - toonSize;
    const savingsPercentage = ((savings / jsonSize) * 100).toFixed(1);

    return {
      toon,
      json,
      toonSize,
      jsonSize,
      savings,
      savingsPercentage: parseFloat(savingsPercentage),
      toonTokens: this.estimateTokens(toon),
      jsonTokens: this.estimateTokens(json),
    };
  }

  /**
   * Compare with official TOON encoder (async)
   */
  async compareWithOfficial(data, options = {}) {
    const customEncoded = this.encode(data);
    const officialEncoded = await this.encodeAsync(data, options);

    return {
      custom: customEncoded,
      official: officialEncoded,
      customSize: customEncoded.length,
      officialSize: officialEncoded.length,
      difference: customEncoded.length - officialEncoded.length,
      officialIsBetter: officialEncoded.length < customEncoded.length,
    };
  }
}

export default ToonFormatter;
