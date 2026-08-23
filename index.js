/**
 * Ctxman - Public API
 * Exports all modules for programmatic usage
 */

// Core analyzers
import TokenCalculator from './lib/analyzers/token-calculator.js';
import MethodAnalyzer from './lib/analyzers/method-analyzer.js';

// Parsers
import GitIgnoreParser from './lib/parsers/gitignore-parser.js';
import MethodFilterParser from './lib/parsers/method-filter-parser.js';

// Formatters
import GitIngestFormatter from './lib/formatters/gitingest-formatter.js';
import ToonFormatter from './lib/formatters/toon-formatter.js';
import FormatRegistry from './lib/formatters/format-registry.js';

// Utils
import TokenUtils from './lib/utils/token-utils.js';
import FileUtils from './lib/utils/file-utils.js';
import ClipboardUtils from './lib/utils/clipboard-utils.js';
import ConfigUtils from './lib/utils/config-utils.js';
import FormatConverter from './lib/utils/format-converter.js';
import ErrorHandler from './lib/utils/error-handler.js';
import { Logger, getLogger, createLogger } from './lib/utils/logger.js'; // v2.3.6+
import Updater from './lib/utils/updater.js'; // v2.3.6+
import GitUtils from './lib/utils/git-utils.js'; // v2.3.6+

// Orchestrator functions
import { generateDigestFromReport, generateDigestFromContext } from './ctxman.js';

export {
  // Analyzers
  TokenCalculator,
  MethodAnalyzer,

  // Parsers
  GitIgnoreParser,
  MethodFilterParser,

  // Formatters
  GitIngestFormatter,
  ToonFormatter,
  FormatRegistry,

  // Utils
  TokenUtils,
  FileUtils,
  ClipboardUtils,
  ConfigUtils,
  FormatConverter,
  ErrorHandler,

  // v2.3.6+ Utils
  Logger,
  getLogger,
  createLogger,
  Updater,
  GitUtils,

  // Functions
  generateDigestFromReport,
  generateDigestFromContext,
};

// Alias for backward compatibility
export { TokenCalculator as TokenAnalyzer };
