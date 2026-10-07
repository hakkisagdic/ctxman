/**
 * Format Registry
 * Central registry for all output format exporters
 * Supports: TOON, JSON, YAML, CSV, XML, Markdown, Protobuf, GitIngest
 */

import { encode as encodeToon } from '@toon-format/toon';

class FormatRegistry {
  constructor() {
    this.formatters = new Map();
    this.registerDefaultFormatters();
  }

  /**
   * Register all default formatters
   */
  registerDefaultFormatters() {
    // TOON format: measured 25% (file lists) to 66% (method lists) fewer tokens than JSON
    this.register('toon', {
      name: 'TOON',
      description: 'Token-Oriented Object Notation (fewer tokens than JSON)',
      extension: '.toon',
      mimeType: 'text/plain',
      // Official encoder: ToonFormatter.encode()'s legacy sync output is not valid TOON
      encoder: (data) => encodeToon(data),
    });

    // JSON format (standard)
    this.register('json', {
      name: 'JSON',
      description: 'JavaScript Object Notation (standard format)',
      extension: '.json',
      mimeType: 'application/json',
      encoder: (data) => JSON.stringify(data, null, 2),
    });

    // JSON Compact (no whitespace)
    this.register('json-compact', {
      name: 'JSON Compact',
      description: 'Minified JSON without whitespace',
      extension: '.json',
      mimeType: 'application/json',
      encoder: (data) => JSON.stringify(data),
    });

    // YAML format
    this.register('yaml', {
      name: 'YAML',
      description: "YAML Ain't Markup Language (human-readable)",
      extension: '.yaml',
      mimeType: 'text/yaml',
      encoder: (data) => this.encodeYAML(data),
    });

    // Markdown format
    this.register('markdown', {
      name: 'Markdown',
      description: 'Markdown documentation format',
      extension: '.md',
      mimeType: 'text/markdown',
      encoder: (data) => this.encodeMarkdown(data),
    });

    // CSV format
    this.register('csv', {
      name: 'CSV',
      description: 'Comma-Separated Values (spreadsheet compatible)',
      extension: '.csv',
      mimeType: 'text/csv',
      encoder: (data) => this.encodeCSV(data),
    });

    // XML format
    this.register('xml', {
      name: 'XML',
      description: 'Extensible Markup Language (enterprise compatible)',
      extension: '.xml',
      mimeType: 'application/xml',
      encoder: (data) => this.encodeXML(data),
    });

    // GitIngest format
    this.register('gitingest', {
      name: 'GitIngest',
      description: 'Single-file digest for LLM consumption',
      extension: '.txt',
      mimeType: 'text/plain',
      encoder: (data, options) => {
        // GitIngest uses a different interface
        if (options && options.formatter) {
          return options.formatter.generateDigest();
        }
        throw new Error('GitIngest format requires a GitIngestFormatter instance');
      },
    });
  }

  /**
   * Register a custom formatter
   */
  register(name, formatter) {
    if (!formatter.encoder || typeof formatter.encoder !== 'function') {
      throw new Error(`Formatter '${name}' must have an encoder function`);
    }
    this.formatters.set(name, formatter);
  }

  /**
   * Get formatter by name
   */
  get(name) {
    const formatter = this.formatters.get(name);
    if (!formatter) {
      throw new Error(
        `Unknown format: ${name}. Available formats: ${this.listFormats().join(', ')}`
      );
    }
    return formatter;
  }

  /**
   * Check if format exists
   */
  has(name) {
    return this.formatters.has(name);
  }

  /**
   * List all available formats
   */
  listFormats() {
    return Array.from(this.formatters.keys());
  }

  /**
   * Get format info
   */
  getInfo(name) {
    const formatter = this.get(name);
    return {
      name: formatter.name,
      description: formatter.description,
      extension: formatter.extension,
      mimeType: formatter.mimeType,
    };
  }

  /**
   * Get all formats info
   */
  getAllInfo() {
    const info = {};
    for (const [name, formatter] of this.formatters) {
      info[name] = {
        name: formatter.name,
        description: formatter.description,
        extension: formatter.extension,
        mimeType: formatter.mimeType,
      };
    }
    return info;
  }

  /**
   * Encode data to specified format
   */
  encode(name, data, options = {}) {
    const formatter = this.get(name);
    return formatter.encoder(data, options);
  }

  /**
   * YAML encoder (simple implementation)
   */
  encodeYAML(data, indent = 0) {
    const prefix = '  '.repeat(indent);
    const type = this.getType(data);

    switch (type) {
      case 'null':
      case 'undefined':
        return 'null';

      case 'boolean':
      case 'number':
        return String(data);

      case 'string':
        // Quote if contains special characters
        if (/[:\n\r{}[\],&*#?|<>=!%@`]/.test(data)) {
          return `"${data.replace(/"/g, '\\"')}"`;
        }
        return data;

      case 'array':
        if (data.length === 0) return '[]';
        let arrResult = '\n';
        for (const item of data) {
          arrResult += prefix + '- ' + this.encodeYAML(item, indent + 1) + '\n';
        }
        return arrResult.trimEnd();

      case 'object':
        const keys = Object.keys(data);
        if (keys.length === 0) return '{}';
        let objResult = '\n';
        for (const key of keys) {
          objResult += prefix + key + ': ' + this.encodeYAML(data[key], indent + 1) + '\n';
        }
        return objResult.trimEnd();

      default:
        return 'null';
    }
  }

  /**
   * Markdown encoder
   */
  encodeMarkdown(data) {
    const { project, paths, methods, methodStats } = data;

    let md = `# ${project?.root || 'Project'} - Context Analysis\n\n`;

    // Project summary
    if (project) {
      md += '## Project Summary\n\n';
      md += `- **Total Files**: ${project.totalFiles}\n`;
      md += `- **Total Tokens**: ${project.totalTokens?.toLocaleString()}\n\n`;
    }

    // Paths
    if (paths) {
      md += '## File Structure\n\n';
      for (const [dir, files] of Object.entries(paths)) {
        md += `### ${dir}\n\n`;
        for (const file of files) {
          md += `- ${file}\n`;
        }
        md += '\n';
      }
    }

    // Methods
    if (methods) {
      md += '## Methods\n\n';
      for (const [file, methodList] of Object.entries(methods)) {
        md += `### ${file}\n\n`;
        md += '| Method | Line | Tokens |\n';
        md += '|--------|------|--------|\n';
        for (const method of methodList) {
          md += `| ${method.name} | ${method.line} | ${method.tokens} |\n`;
        }
        md += '\n';
      }
    }

    // Method stats
    if (methodStats) {
      md += '## Statistics\n\n';
      md += `- **Total Methods**: ${methodStats.totalMethods}\n`;
      md += `- **Included Methods**: ${methodStats.includedMethods}\n`;
      md += `- **Total Method Tokens**: ${methodStats.totalMethodTokens || 0}\n`;
    }

    return md;
  }

  /**
   * CSV encoder
   */
  encodeCSV(data) {
    const { project: _project, methods } = data;

    if (!methods) {
      // File-level CSV
      return this.encodeFilesCSV(data);
    }

    // Method-level CSV
    let csv = 'File,Method,Line,Tokens\n';

    for (const [file, methodList] of Object.entries(methods)) {
      for (const method of methodList) {
        csv += `"${file}","${method.name}",${method.line},${method.tokens}\n`;
      }
    }

    return csv;
  }

  /**
   * CSV encoder for file-level data
   */
  encodeFilesCSV(data) {
    const { paths } = data;

    if (!paths) {
      return 'Directory,File\n';
    }

    let csv = 'Directory,File\n';
    for (const [dir, files] of Object.entries(paths)) {
      for (const file of files) {
        csv += `"${dir}","${file}"\n`;
      }
    }

    return csv;
  }

  /**
   * XML encoder
   */
  encodeXML(data, indent = 0) {
    const prefix = '  '.repeat(indent);
    const type = this.getType(data);

    if (indent === 0) {
      let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
      xml += '<context>\n';
      xml += this.encodeXML(data, 1);
      xml += '</context>';
      return xml;
    }

    switch (type) {
      case 'null':
      case 'undefined':
        return '';

      case 'boolean':
      case 'number':
      case 'string':
        return this.escapeXML(String(data));

      // Recurse with indent + 1, never 0: indent 0 is what emits the document wrapper.
      case 'array':
        let arrXML = '';
        for (const item of data) {
          const itemType = this.getType(item);

          if (itemType === 'object' || itemType === 'array') {
            arrXML += prefix + '<item>\n';
            arrXML += this.encodeXML(item, indent + 1);
            arrXML += prefix + '</item>\n';
          } else {
            arrXML += prefix + '<item>' + this.encodeXML(item, indent + 1) + '</item>\n';
          }
        }
        return arrXML;

      case 'object':
        let objXML = '';
        for (const [key, value] of Object.entries(data)) {
          const safeKey = this.sanitizeXMLTag(key);
          const valueType = this.getType(value);

          if (valueType === 'object' || valueType === 'array') {
            objXML += prefix + `<${safeKey}>\n`;
            objXML += this.encodeXML(value, indent + 1);
            objXML += prefix + `</${safeKey}>\n`;
          } else {
            objXML += prefix + `<${safeKey}>`;
            objXML += this.encodeXML(value, indent + 1);
            objXML += `</${safeKey}>\n`;
          }
        }
        return objXML;

      default:
        return '';
    }
  }

  /**
   * Escape XML special characters
   */
  escapeXML(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * Sanitize string for use as XML tag
   */
  sanitizeXMLTag(str) {
    return str.replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  /**
   * Get value type
   */
  getType(value) {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (Array.isArray(value)) return 'array';
    return typeof value;
  }

  /**
   * Auto-detect best format for data
   */
  suggestFormat(data) {
    const { methods, paths } = data;

    // Method-level data benefits most from TOON
    if (methods) {
      return 'toon';
    }

    // File lists work well with TOON too
    if (paths) {
      return 'toon';
    }

    // Default to JSON
    return 'json';
  }
}

export default FormatRegistry;
