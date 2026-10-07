/**
 * Format Converter Utilities
 * v2.3.2 - Convert between different output formats
 *
 * Supports conversion between:
 * - TOON ↔ JSON
 * - JSON ↔ YAML
 * - JSON ↔ XML
 * - JSON ↔ CSV
 * - JSON ↔ Markdown
 */

import { decode as decodeToon } from '@toon-format/toon';
import FormatRegistry from '../formatters/format-registry.js';
import ToonFormatter from '../formatters/toon-formatter.js';
import fs from 'fs';
import path from 'path';

class FormatConverter {
  constructor() {
    this.registry = new FormatRegistry();
    this.toonFormatter = new ToonFormatter();
  }

  /**
   * Convert from one format to another
   * @param {string} input - Input data as string
   * @param {string} fromFormat - Source format
   * @param {string} toFormat - Target format
   * @returns {Object} Conversion result with output and metadata
   */
  convert(input, fromFormat, toFormat) {
    // Step 1: Parse input to JavaScript object
    const data = this.parse(input, fromFormat);

    // Step 2: Encode to target format
    const output = this.encode(data, toFormat);

    // Step 3: Calculate metadata
    const inputSize = input.length;
    const outputSize = output.length;
    const savings = inputSize - outputSize;
    const savingsPercentage = inputSize > 0 ? ((savings / inputSize) * 100).toFixed(1) : '0.0';

    return {
      output,
      metadata: {
        inputSize,
        outputSize,
        savings,
        savingsPercentage: parseFloat(savingsPercentage),
        fromFormat,
        toFormat,
      },
    };
  }

  /**
   * Parse string input to JavaScript object
   */
  parse(input, format) {
    switch (format.toLowerCase()) {
      case 'json':
      case 'json-compact':
        return JSON.parse(input);

      case 'yaml':
        return this.parseYAML(input);

      case 'toon':
        return decodeToon(input);

      case 'xml':
        throw new Error('XML parsing not yet implemented. Use JSON as intermediate format.');

      case 'csv':
        return this.parseCSV(input);

      case 'markdown':
        throw new Error('Markdown parsing not yet implemented. Use JSON as intermediate format.');

      default:
        throw new Error(`Unknown format for parsing: ${format}`);
    }
  }

  /**
   * Encode JavaScript object to format
   */
  encode(data, format) {
    try {
      return this.registry.encode(format, data);
    } catch (error) {
      throw new Error(`Failed to encode to ${format}: ${error.message}`);
    }
  }

  /**
   * Simple YAML parser for block-style mappings and sequences (what encodeYAML emits)
   * Note: This is a basic implementation. Flow collections other than {} and [],
   * compact "- key: value" items, anchors and block scalars are not supported.
   */
  parseYAML(yamlString) {
    const lines = yamlString
      .split('\n')
      .filter((line) => line.trim() && !line.trim().startsWith('#'))
      .map((line) => ({ indent: line.length - line.trimStart().length, text: line.trim() }));

    if (lines.length === 0) return {};

    const state = { pos: 0 };
    const first = lines[0];
    return this.isYAMLSequenceItem(first.text)
      ? this.parseYAMLSequence(lines, state, first.indent)
      : this.parseYAMLMapping(lines, state, first.indent);
  }

  /**
   * Parse the mapping whose keys sit at `indent`, starting at state.pos
   */
  parseYAMLMapping(lines, state, indent) {
    const result = {};

    while (state.pos < lines.length) {
      const line = lines[state.pos];
      if (line.indent < indent) break;

      state.pos++;
      // Lines that are not a key at this level are skipped, as before
      const isKeyLine = line.indent === indent && !this.isYAMLSequenceItem(line.text);
      const entry = isKeyLine ? this.splitYAMLKey(line.text) : null;
      if (!entry) continue;

      if (entry.value !== '') {
        result[entry.key] = this.parseYAMLValue(entry.value);
        continue;
      }

      // An empty value introduces a nested block: deeper lines, or a sequence at the same indent
      const next = lines[state.pos];
      if (next && next.indent > indent) {
        result[entry.key] = this.isYAMLSequenceItem(next.text)
          ? this.parseYAMLSequence(lines, state, next.indent)
          : this.parseYAMLMapping(lines, state, next.indent);
      } else if (next && next.indent === indent && this.isYAMLSequenceItem(next.text)) {
        result[entry.key] = this.parseYAMLSequence(lines, state, indent);
      } else {
        result[entry.key] = null;
      }
    }

    return result;
  }

  /**
   * Parse the sequence whose "-" markers sit at `indent`, starting at state.pos
   */
  parseYAMLSequence(lines, state, indent) {
    const result = [];

    while (state.pos < lines.length) {
      const line = lines[state.pos];
      if (line.indent < indent) break;
      if (line.indent > indent) {
        state.pos++;
        continue;
      }
      if (!this.isYAMLSequenceItem(line.text)) break;

      state.pos++;
      const value = line.text.substring(1).trim();
      if (value !== '') {
        result.push(this.parseYAMLValue(value));
        continue;
      }

      // "-" alone: the item is the block on the following, deeper lines
      const next = lines[state.pos];
      if (next && next.indent > indent) {
        result.push(
          this.isYAMLSequenceItem(next.text)
            ? this.parseYAMLSequence(lines, state, next.indent)
            : this.parseYAMLMapping(lines, state, next.indent)
        );
      } else {
        result.push(null);
      }
    }

    return result;
  }

  isYAMLSequenceItem(text) {
    return text === '-' || text.startsWith('- ');
  }

  /**
   * Split "key: value" into its parts; the key may be double-quoted
   * @returns {{key: string, value: string}|null} null when the line has no key
   */
  splitYAMLKey(text) {
    const quoted = text.match(/^("(?:[^"\\]|\\.)*")\s*:(?:\s+(.*))?$/);
    if (quoted) {
      return { key: JSON.parse(quoted[1]), value: (quoted[2] || '').trim() };
    }

    let colonIndex = text.search(/:(\s|$)/);
    if (colonIndex === -1) colonIndex = text.indexOf(':');
    if (colonIndex === -1) return null;

    return {
      key: text.substring(0, colonIndex).trim(),
      value: text.substring(colonIndex + 1).trim(),
    };
  }

  /**
   * Parse YAML value (string, number, boolean)
   */
  parseYAMLValue(value) {
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (value === 'null') return null;
    if (value === '{}') return {};
    if (value === '[]') return [];
    if (/^-?\d+$/.test(value)) return parseInt(value, 10);
    if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(value)) return parseFloat(value);
    if (value.startsWith('"') && value.endsWith('"')) {
      try {
        return JSON.parse(value);
      } catch {
        return value.substring(1, value.length - 1);
      }
    }
    return value;
  }

  /**
   * Simple CSV parser
   */
  parseCSV(csvString) {
    const lines = csvString.split('\n').filter((line) => line.trim());
    if (lines.length === 0) return { rows: [] };

    const headers = this.parseCSVLine(lines[0]);
    const rows = [];

    for (let i = 1; i < lines.length; i++) {
      const values = this.parseCSVLine(lines[i]);
      const row = {};
      headers.forEach((header, index) => {
        row[header] = values[index] || '';
      });
      rows.push(row);
    }

    return { headers, rows };
  }

  /**
   * Parse CSV line (handles quoted values)
   */
  parseCSVLine(line) {
    const values = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }

    values.push(current.trim());
    return values;
  }

  /**
   * Convert file from one format to another
   * @param {string} inputFile - Input file path
   * @param {string} outputFile - Output file path
   * @param {string} fromFormat - Source format (auto-detect from extension if not provided)
   * @param {string} toFormat - Target format (auto-detect from extension if not provided)
   */
  convertFile(inputFile, outputFile, fromFormat = null, toFormat = null) {
    // Auto-detect formats from file extensions
    if (!fromFormat) {
      const ext = path.extname(inputFile).substring(1);
      fromFormat = this.extensionToFormat(ext);
    }

    if (!toFormat) {
      const ext = path.extname(outputFile).substring(1);
      toFormat = this.extensionToFormat(ext);
    }

    // Read input file
    const input = fs.readFileSync(inputFile, 'utf8');

    // Convert
    const result = this.convert(input, fromFormat, toFormat);

    // Write output file
    fs.writeFileSync(outputFile, result.output, 'utf8');

    return {
      inputFile,
      outputFile,
      fromFormat,
      toFormat,
      inputSize: input.length,
      outputSize: result.output.length,
      savings: input.length - result.output.length,
      savingsPercent: result.metadata.savingsPercentage + '%',
    };
  }

  /**
   * Map file extension to format name
   */
  extensionToFormat(ext) {
    const map = {
      json: 'json',
      toon: 'toon',
      yaml: 'yaml',
      yml: 'yaml',
      csv: 'csv',
      xml: 'xml',
      md: 'markdown',
      txt: 'gitingest',
    };

    return map[ext.toLowerCase()] || 'json';
  }

  /**
   * Batch convert multiple files
   * @param {Array} files - Array of {input, output, from, to}
   * @returns {Array} Conversion results
   */
  batchConvert(files) {
    const results = [];

    for (const file of files) {
      try {
        const result = this.convertFile(
          file.input,
          file.output,
          file.from || null,
          file.to || null
        );
        results.push({ success: true, ...result });
      } catch (error) {
        results.push({
          success: false,
          inputFile: file.input,
          error: error.message,
        });
      }
    }

    return results;
  }

  /**
   * Get supported conversions
   */
  getSupportedConversions() {
    return {
      fullySupported: [
        'JSON → TOON',
        'JSON → YAML',
        'JSON → CSV',
        'JSON → XML',
        'JSON → Markdown',
        'TOON → JSON',
        'YAML → JSON (basic)',
        'CSV → JSON',
      ],
      partialSupport: [
        'XML → JSON (parser not implemented)',
        'Markdown → JSON (parser not implemented)',
      ],
      planned: ['XML ↔ JSON (bidirectional)', 'Advanced YAML parsing'],
    };
  }
}

export default FormatConverter;
