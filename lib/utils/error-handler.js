/**
 * Error Handler Utilities
 * v2.3.4 - Enhanced error handling and user-friendly messages
 */

import fs from 'fs';

class ErrorHandler {
  constructor(options = {}) {
    this.verbose = options.verbose || false;
    this.logFile = options.logFile || null;
  }

  /**
   * Handle format errors
   */
  handleFormatError(error, format) {
    const message = `Format error (${format}): ${error.message}`;

    if (this.verbose) {
      console.error('❌ ' + message);
      console.error('   Stack:', error.stack);
    } else {
      console.error('❌ ' + message);
      console.error('   Use --verbose for detailed error information');
    }

    this.logError(message, error);
  }

  /**
   * Handle file errors
   */
  handleFileError(error, filePath) {
    const message = `File error (${filePath}): ${error.message}`;

    console.error('❌ ' + message);

    // Provide helpful suggestions
    if (error.code === 'ENOENT') {
      console.error('   Suggestion: Check if the file path is correct');
    } else if (error.code === 'EACCES') {
      console.error('   Suggestion: Check file permissions');
    }

    this.logError(message, error);
  }

  /**
   * Handle parse errors
   */
  handleParseError(error, format, content) {
    const message = `Parse error (${format}): ${error.message}`;

    console.error('❌ ' + message);

    if (this.verbose && content) {
      console.error('   Content preview:', content.substring(0, 200) + '...');
    }

    this.logError(message, error);
  }

  /**
   * Handle validation errors
   */
  handleValidationError(errors, context) {
    console.error(`❌ Validation failed (${context}):`);

    for (const error of errors) {
      console.error(`   • ${error}`);
    }

    this.logError(`Validation errors in ${context}`, { errors });
  }

  /**
   * Log error to file (if configured)
   */
  logError(message, error) {
    if (!this.logFile) return;

    try {
      const timestamp = new Date().toISOString();
      const logEntry = `[${timestamp}] ${message}\n${error.stack || ''}\n\n`;

      fs.appendFileSync(this.logFile, logEntry, 'utf8');
    } catch (logError) {
      // Silently fail if logging fails
    }
  }

  /**
   * Wrap async function with error handling
   */
  wrapAsync(fn, context) {
    return async (...args) => {
      try {
        return await fn(...args);
      } catch (error) {
        console.error(`❌ Error in ${context}:`, error.message);
        if (this.verbose) {
          console.error('   Stack:', error.stack);
        }
        this.logError(`Error in ${context}`, error);
        throw error;
      }
    };
  }

  /**
   * Validate format support
   */
  validateFormat(format, supportedFormats) {
    if (!supportedFormats.includes(format)) {
      const message = `Unsupported format: ${format}`;
      const suggestion = `Supported formats: ${supportedFormats.join(', ')}`;

      console.error(`❌ ${message}`);
      console.error(`   ${suggestion}`);

      throw new Error(message);
    }
  }

  /**
   * Create user-friendly error message
   */
  createUserMessage(error, context = '') {
    const prefix = context ? `${context}: ` : '';

    // Map common errors to user-friendly messages
    const errorMap = {
      ENOENT: 'File not found',
      EACCES: 'Permission denied',
      EISDIR: 'Expected file, got directory',
      ENOTDIR: 'Expected directory, got file',
    };

    const userMessage = errorMap[error.code] || error.message;
    return `${prefix}${userMessage}`;
  }
}

export default ErrorHandler;
