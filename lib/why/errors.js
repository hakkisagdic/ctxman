/**
 * Errors raised by `ctxman why`
 */

/**
 * An expected failure (bad target, not a repository, budget too small, ...) with a
 * stable code callers can branch on and a message meant for the user
 */
export class WhyError extends Error {
  /**
   * @param {string} code - e.g. NOT_A_GIT_REPO, PATH_OUTSIDE_ROOT, SYMBOL_NOT_FOUND
   * @param {string} message - User-facing message
   * @param {object} [details] - Extra fields copied onto the error (e.g. candidates)
   */
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'WhyError';
    this.code = code;
    Object.assign(this, details);
  }
}

export default WhyError;
