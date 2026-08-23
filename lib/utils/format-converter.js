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
        throw new Error('TOON parsing not yet implemented. Use JSON as intermediate format.');

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
   * Simple YAML parser
   * Note: This is a basic implementation. For complex YAML, use a proper library.
   */
  parseYAML(yamlString) {
    const lines = yamlString
      .split('\n')
      .filter((line) => line.trim() && !line.trim().startsWith('#'));
    const result = {};
    let currentKey = null;
    let currentArray = null;

    for (const line of lines) {
      const trimmed = line.trim();

      // Array item
      if (trimmed.startsWith('- ')) {
        const value = trimmed.substring(2).trim();

        // Initialize array if needed
        if (currentKey && (!result[currentKey] || !Array.isArray(result[currentKey]))) {
          result[currentKey] = [];
          currentArray = result[currentKey];
        }

        if (currentArray) {
          currentArray.push(this.parseYAMLValue(value));
        }
        continue;
      }

      // Key-value pair
      const colonIndex = trimmed.indexOf(':');
      if (colonIndex !== -1) {
        const key = trimmed.substring(0, colonIndex).trim();
        const value = trimmed.substring(colonIndex + 1).trim();

        if (value === '') {
          // Object or array follows
          currentKey = key;
          result[key] = {}; // Default to object, will be overwritten if array items found
          currentArray = null; // Reset current array
        } else {
          result[key] = this.parseYAMLValue(value);
          currentKey = null;
          currentArray = null;
        }
      }
    }

    return result;
  }

  /**
   * Parse YAML value (string, number, boolean)
   */
  parseYAMLValue(value) {
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (value === 'null') return null;
    if (/^-?\d+$/.test(value)) return parseInt(value, 10);
    if (/^-?\d+\.\d+$/.test(value)) return parseFloat(value);
    if (value.startsWith('"') && value.endsWith('"')) {
      return value.substring(1, value.length - 1);
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
        'YAML → JSON (basic)',
        'CSV → JSON',
      ],
      partialSupport: [
        'TOON → JSON (decoder not implemented)',
        'XML → JSON (parser not implemented)',
        'Markdown → JSON (parser not implemented)',
      ],
      planned: [
        'TOON ↔ JSON (bidirectional)',
        'XML ↔ JSON (bidirectional)',
        'Advanced YAML parsing',
      ],
    };
  }
}

export default FormatConverter;
