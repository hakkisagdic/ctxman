/**
 * TOON Format Encoder/Decoder - Spec v1.3 Compliant
 *
 * Full implementation of TOON (Tabular Object Oriented Notation)
 * Following official spec: https://github.com/toon-format/spec
 *
 * Spec Version: 1.3 (2025-10-31)
 * Features:
 * - Array length markers [N]
 * - Delimiter options: comma, tab, pipe
 * - Length marker prefix: # (optional)
 * - List format for non-uniform arrays
 * - Smart quoting rules
 * - Type normalizations
 * - Full decoder support
 */

class ToonFormatterV13 {
  constructor(options = {}) {
    this.indent = options.indent || 2;
    this.delimiter = options.delimiter || ',';
    this.lengthMarker = options.lengthMarker || false; // false or '#'
    this.indentChar = ' '.repeat(this.indent);
  }

  /**
   * Encode data to TOON format (Spec v1.3)
   */
  encode(data, options = {}) {
    // Merge options
    const opts = { ...this, ...options };
    this.indent = opts.indent;
    this.delimiter = opts.delimiter || ',';
    this.lengthMarker = opts.lengthMarker || false;
    this.indentChar = ' '.repeat(this.indent);

    return this.encodeValue(data, 0).trimEnd();
  }

  /**
   * Encode any value
   */
  encodeValue(value, depth = 0) {
    const normalized = this.normalizeValue(value);

    if (normalized === null) return 'null';
    if (typeof normalized === 'boolean') return String(normalized);
    if (typeof normalized === 'number') return this.encodeNumber(normalized);
    if (typeof normalized === 'string') return this.encodeString(normalized);
    if (Array.isArray(normalized)) return this.encodeArray(normalized, depth);
    if (typeof normalized === 'object') return this.encodeObject(normalized, depth);

    return 'null';
  }

  /**
   * Normalize non-JSON values (Spec: Type Conversions)
   */
  normalizeValue(value) {
    // undefined → null
    if (value === undefined) return null;

    // function → null
    if (typeof value === 'function') return null;

    // symbol → null
    if (typeof value === 'symbol') return null;

    // NaN, Infinity → null
    if (typeof value === 'number' && !isFinite(value)) return null;

    // BigInt → number or string
    if (typeof value === 'bigint') {
      if (value >= Number.MIN_SAFE_INTEGER && value <= Number.MAX_SAFE_INTEGER) {
        return Number(value);
      }
      return String(value); // Will be quoted
    }

    // Date → ISO string
    if (value instanceof Date) {
      return value.toISOString();
    }

    return value;
  }

  /**
   * Encode number (no scientific notation)
   */
  encodeNumber(num) {
    // -0 → 0
    if (Object.is(num, -0)) return '0';

    // No scientific notation
    return num.toLocaleString('en-US', {
      useGrouping: false,
      maximumFractionDigits: 20,
    });
  }

  /**
   * Encode string with smart quoting (Spec: Quoting Rules)
   */
  encodeString(str) {
    const escaped = str
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t');

    // Always quote if any of these conditions:
    if (
      str === '' || // Empty string
      str !== str.trim() || // Leading/trailing spaces
      str.startsWith('- ') || // Looks like list item
      /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(str) || // Looks like number
      /^(true|false|null)$/.test(str) || // Looks like boolean/null
      /[\[\]{}:]/.test(str) || // Contains structural chars
      /^(\[.*\]|\{.*\})$/.test(str) || // Looks structural
      str.includes(this.delimiter) || // Contains active delimiter
      str.includes(':') || // Contains colon
      str.includes('"') || // Contains quote
      str.includes('\\') // Contains backslash
    ) {
      return `"${escaped}"`;
    }

    return escaped;
  }

  /**
   * Encode object
   */
  encodeObject(obj, depth = 0) {
    const keys = Object.keys(obj);

    if (keys.length === 0) {
      return ''; // Empty object
    }

    const prefix = this.indentChar.repeat(depth);
    const lines = [];

    for (const key of keys) {
      const quotedKey = this.needsQuotingAsKey(key) ? `"${key}"` : key;
      const value = obj[key];

      const encoded = this.encodeValue(value, depth + 1);

      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        // Nested object
        lines.push(`${prefix}${quotedKey}:`);
        if (encoded) {
          lines.push(encoded);
        }
      } else {
        lines.push(`${prefix}${quotedKey}: ${encoded}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Check if key needs quoting
   */
  needsQuotingAsKey(key) {
    // Keys must match: /^[a-zA-Z_][a-zA-Z0-9_.]*$/
    return !/^[a-zA-Z_][a-zA-Z0-9_.]*$/.test(key);
  }

  /**
   * Encode array with length markers (Spec v1.3)
   */
  encodeArray(arr, depth = 0) {
    const _prefix = this.indentChar.repeat(depth);
    const length = arr.length;

    if (length === 0) {
      const lengthPrefix = this.lengthMarker ? `#0` : `0`;
      return `[${lengthPrefix}]:`;
    }

    // Check if tabular format (uniform objects with primitive values)
    if (this.isTabularArray(arr)) {
      return this.encodeTabularArray(arr, depth);
    }

    // Check if primitive array (inline)
    if (this.isPrimitiveArray(arr)) {
      return this.encodePrimitiveArray(arr);
    }

    // Non-uniform or complex: use list format
    return this.encodeListArray(arr, depth);
  }

  /**
   * Check if array is suitable for tabular format
   */
  isTabularArray(arr) {
    if (arr.length === 0) return false;

    // All must be plain objects
    if (!arr.every((item) => this.isPlainObject(item))) {
      return false;
    }

    // Get keys from first object
    const firstKeys = Object.keys(arr[0]).sort();

    // All objects must have same keys
    if (
      !arr.every((item) => {
        const keys = Object.keys(item).sort();
        return keys.length === firstKeys.length && keys.every((key, i) => key === firstKeys[i]);
      })
    ) {
      return false;
    }

    // All values must be primitives (not nested objects/arrays)
    return arr.every((item) =>
      Object.values(item).every(
        (val) =>
          val === null ||
          typeof val === 'string' ||
          typeof val === 'number' ||
          typeof val === 'boolean'
      )
    );
  }

  /**
   * Check if all array elements are primitives
   */
  isPrimitiveArray(arr) {
    return arr.every(
      (item) =>
        item === null ||
        typeof item === 'string' ||
        typeof item === 'number' ||
        typeof item === 'boolean'
    );
  }

  /**
   * Check if value is plain object
   */
  isPlainObject(val) {
    return (
      val !== null &&
      typeof val === 'object' &&
      !Array.isArray(val) &&
      Object.getPrototypeOf(val) === Object.prototype
    );
  }

  /**
   * Encode tabular array (Spec: Arrays of Objects)
   */
  encodeTabularArray(arr, depth = 0) {
    const prefix = this.indentChar.repeat(depth);
    const keys = Object.keys(arr[0]).sort();
    const length = arr.length;

    // Build length marker
    const delimiterSuffix = this.delimiter === ',' ? '' : this.delimiter;
    const lengthPrefix = this.lengthMarker ? `#${length}` : `${length}`;

    // Header: items[N]{field1,field2}:
    const fieldList = keys.join(this.delimiter);
    const header = `[${lengthPrefix}${delimiterSuffix}]{${fieldList}}:`;

    const lines = [prefix + header];

    // Data rows
    for (const item of arr) {
      const values = keys.map((key) => {
        const val = this.normalizeValue(item[key]);
        if (val === null) return 'null';
        if (typeof val === 'boolean') return String(val);
        if (typeof val === 'number') return this.encodeNumber(val);
        if (typeof val === 'string') return this.encodeString(val);
        return 'null';
      });

      lines.push(prefix + this.indentChar + values.join(this.delimiter));
    }

    return lines.join('\n');
  }

  /**
   * Encode primitive array (Spec: Primitive Arrays)
   */
  encodePrimitiveArray(arr) {
    const length = arr.length;
    const delimiterSuffix = this.delimiter === ',' ? '' : this.delimiter;
    const lengthPrefix = this.lengthMarker ? `#${length}` : `${length}`;

    const values = arr.map((item) => {
      const val = this.normalizeValue(item);
      if (val === null) return 'null';
      if (typeof val === 'boolean') return String(val);
      if (typeof val === 'number') return this.encodeNumber(val);
      if (typeof val === 'string') return this.encodeString(val);
      return 'null';
    });

    return `[${lengthPrefix}${delimiterSuffix}]: ${values.join(this.delimiter)}`;
  }

  /**
   * Encode list array (Spec: Mixed and Non-Uniform Arrays)
   */
  encodeListArray(arr, depth = 0) {
    const prefix = this.indentChar.repeat(depth);
    const length = arr.length;
    const delimiterSuffix = this.delimiter === ',' ? '' : this.delimiter;
    const lengthPrefix = this.lengthMarker ? `#${length}` : `${length}`;

    const lines = [`${prefix}[${lengthPrefix}${delimiterSuffix}]:`];

    for (const item of arr) {
      const normalized = this.normalizeValue(item);

      if (this.isPlainObject(normalized)) {
        // Object in list: first field on hyphen line
        const keys = Object.keys(normalized);
        if (keys.length > 0) {
          const firstKey = keys[0];
          const quotedKey = this.needsQuotingAsKey(firstKey) ? `"${firstKey}"` : firstKey;
          const firstValue = this.encodeValue(normalized[firstKey], depth + 1);

          lines.push(`${prefix}${this.indentChar}- ${quotedKey}: ${firstValue}`);

          // Remaining fields at same indentation
          for (let i = 1; i < keys.length; i++) {
            const key = keys[i];
            const quotedK = this.needsQuotingAsKey(key) ? `"${key}"` : key;
            const val = this.encodeValue(normalized[key], depth + 1);
            lines.push(`${prefix}${this.indentChar}  ${quotedK}: ${val}`);
          }
        }
      } else if (Array.isArray(normalized)) {
        // Array in list
        const encoded = this.encodeArray(normalized, depth + 1);
        lines.push(`${prefix}${this.indentChar}- ${encoded}`);
      } else {
        // Primitive in list
        const encoded = this.encodeValue(normalized, depth + 1);
        lines.push(`${prefix}${this.indentChar}- ${encoded}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Decode TOON string to JavaScript value (Spec v1.3)
   */
  decode(toonString, options = {}) {
    const _strict = options.strict !== false;
    const lines = toonString.split('\n');

    return this.parseValue(lines, 0, 0).value;
  }

  /**
   * Parse value from lines starting at index
   */
  parseValue(lines, startIndex, expectedDepth) {
    const line = lines[startIndex];

    if (!line) {
      return { value: null, nextIndex: startIndex + 1 };
    }

    const trimmed = line.trim();

    // Empty line
    if (trimmed === '') {
      return { value: null, nextIndex: startIndex + 1 };
    }

    // Check for key-value pair
    if (trimmed.includes(':')) {
      const colonIndex = trimmed.indexOf(':');
      const key = trimmed.substring(0, colonIndex).trim();
      const valueStr = trimmed.substring(colonIndex + 1).trim();

      // Check if it's an array header
      if (key.includes('[') && key.includes(']')) {
        return this.parseArray(lines, startIndex, expectedDepth);
      }

      // Check if value is on same line
      if (valueStr) {
        return {
          value: { [this.unquoteKey(key)]: this.parsePrimitive(valueStr) },
          nextIndex: startIndex + 1,
        };
      }

      // Value is on next lines (nested object)
      const result = this.parseObject(lines, startIndex, expectedDepth);
      return result;
    }

    // List item
    if (trimmed.startsWith('- ')) {
      return this.parseListItem(lines, startIndex, expectedDepth);
    }

    // Primitive value
    return {
      value: this.parsePrimitive(trimmed),
      nextIndex: startIndex + 1,
    };
  }

  /**
   * Parse array from TOON format
   */
  parseArray(lines, startIndex, depth) {
    const line = lines[startIndex];
    const match = line.match(/\[([#]?\d+)([,\t|])?\]\{([^}]+)\}:/);

    if (match) {
      // Tabular array
      const lengthStr = match[1].replace('#', '');
      const expectedLength = parseInt(lengthStr);
      const delimiter = match[2] || ',';
      const fields = match[3].split(delimiter);

      const items = [];
      let index = startIndex + 1;

      for (let i = 0; i < expectedLength && index < lines.length; i++) {
        const dataLine = lines[index];
        const values = this.splitByDelimiter(dataLine.trim(), delimiter);

        const obj = {};
        fields.forEach((field, idx) => {
          obj[field] = this.parsePrimitive(values[idx] || 'null');
        });

        items.push(obj);
        index++;
      }

      return { value: items, nextIndex: index };
    }

    // Primitive or list array
    const primitiveMatch = line.match(/\[([#]?\d+)([,\t|])?\]: (.+)/);
    if (primitiveMatch) {
      // Primitive array
      const delimiter = primitiveMatch[2] || ',';
      const valueStr = primitiveMatch[3];
      const values = this.splitByDelimiter(valueStr, delimiter);

      return {
        value: values.map((v) => this.parsePrimitive(v)),
        nextIndex: startIndex + 1,
      };
    }

    // List array
    return this.parseListArray(lines, startIndex, depth);
  }

  /**
   * Parse list-format array
   */
  parseListArray(lines, startIndex, depth) {
    const items = [];
    let index = startIndex + 1;

    while (index < lines.length) {
      const line = lines[index];
      const currentDepth = this.getIndentDepth(line);

      if (currentDepth <= depth) break;

      if (line.trim().startsWith('- ')) {
        const result = this.parseListItem(lines, index, depth + 1);
        items.push(result.value);
        index = result.nextIndex;
      } else {
        break;
      }
    }

    return { value: items, nextIndex: index };
  }

  /**
   * Parse list item
   */
  parseListItem(lines, startIndex, depth) {
    const line = lines[startIndex];
    const content = line.trim().substring(2); // Remove "- "

    if (content.includes(':')) {
      // Object
      const result = this.parseObject(lines, startIndex, depth);
      return result;
    }

    // Primitive
    return {
      value: this.parsePrimitive(content),
      nextIndex: startIndex + 1,
    };
  }

  /**
   * Parse object from lines
   */
  parseObject(lines, startIndex, depth) {
    const obj = {};
    let index = startIndex;

    while (index < lines.length) {
      const line = lines[index];
      const trimmed = line.trim();
      const currentDepth = this.getIndentDepth(line);

      if (currentDepth < depth && index !== startIndex) break;
      if (!trimmed || !trimmed.includes(':')) {
        index++;
        continue;
      }

      const colonIndex = trimmed.indexOf(':');
      const key = trimmed.substring(0, colonIndex).trim();
      const valueStr = trimmed.substring(colonIndex + 1).trim();

      const unquotedKey = this.unquoteKey(key);

      if (valueStr) {
        // Value on same line
        obj[unquotedKey] = this.parsePrimitive(valueStr);
        index++;
      } else {
        // Value on next lines
        const result = this.parseValue(lines, index + 1, depth + 1);
        obj[unquotedKey] = result.value;
        index = result.nextIndex;
      }
    }

    return { value: obj, nextIndex: index };
  }

  /**
   * Parse primitive value
   */
  parsePrimitive(str) {
    const trimmed = str.trim();

    if (trimmed === 'null') return null;
    if (trimmed === 'true') return true;
    if (trimmed === 'false') return false;

    // Number
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
      return parseFloat(trimmed);
    }

    // Quoted string
    if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
      return this.unescapeString(trimmed.slice(1, -1));
    }

    // Unquoted string
    return trimmed;
  }

  /**
   * Unescape string
   */
  unescapeString(str) {
    return str
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\');
  }

  /**
   * Unquote key
   */
  unquoteKey(key) {
    if (key.startsWith('"') && key.endsWith('"')) {
      return this.unescapeString(key.slice(1, -1));
    }
    return key;
  }

  /**
   * Get indentation depth
   */
  getIndentDepth(line) {
    const match = line.match(/^( *)/);
    return match ? Math.floor(match[1].length / this.indent) : 0;
  }

  /**
   * Split by delimiter (respecting quotes)
   */
  splitByDelimiter(str, delimiter) {
    const parts = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < str.length; i++) {
      const char = str[i];
      const nextChar = str[i + 1];

      if (char === '\\' && inQuotes) {
        current += char + (nextChar || '');
        i++; // Skip next char
        continue;
      }

      if (char === '"') {
        inQuotes = !inQuotes;
        current += char;
        continue;
      }

      if (char === delimiter && !inQuotes) {
        parts.push(current.trim());
        current = '';
        continue;
      }

      current += char;
    }

    if (current) {
      parts.push(current.trim());
    }

    return parts;
  }

  /**
   * Validate TOON string (enhanced)
   */
  validate(toonString) {
    const errors = [];

    // Check balanced braces/brackets
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
    // Simple estimation: ~4 chars per token (GPT-4 average)
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
   * Compare with JSON (token savings)
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
}

export default ToonFormatterV13;
