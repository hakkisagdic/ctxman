/**
 * Computes Shannon entropy in bits per character for a string.
 *
 * @param {string} str
 * @returns {number}
 */
export function computeShannonEntropy(str) {
  const input = String(str || '');
  if (!input.length) return 0;
  const freq = new Map();
  for (const ch of input) {
    freq.set(ch, (freq.get(ch) || 0) + 1);
  }
  let entropy = 0;
  const len = input.length;
  for (const count of freq.values()) {
    const p = count / len;
    entropy -= p * Math.log2(p);
  }
  return Number(entropy.toFixed(3));
}

function isBenignToken(token) {
  if (!token) return true;
  // Ignore URLs, file paths, SRI hashes, UUIDs, pure words with spaces/hyphens
  if (/^(?:https?:\/\/|file:\/\/|\/|\.\.?\/)/.test(token)) return true;
  if (/^sha(?:256|384|512)-[A-Za-z0-9+/=]+$/.test(token)) return true;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) return true;
  if (token.includes('/') && !token.includes('+') && !token.includes('=')) return true;
  if (/^[a-z-]+$/i.test(token)) return true;
  // Require a mix of character classes (e.g., upper+lower+digit or hex>=32)
  const hasDigit = /\d/.test(token);
  const hasLower = /[a-z]/.test(token);
  const hasUpper = /[A-Z]/.test(token);
  const isHexLong = /^[0-9a-fA-F]{32,}$/.test(token);
  if (!isHexLong && !(hasDigit && (hasLower || hasUpper))) return true;
  return false;
}

function redactPreview(token) {
  if (token.length <= 8) return '***';
  return `${token.slice(0, 4)}...${token.slice(-4)}`;
}

/**
 * Scans files for high-entropy secrets and canary tokens that evade static regexes (F8-3).
 *
 * @param {object} options
 * @param {Array<{path: string, content: string}>} [options.files=[]]
 * @param {number} [options.minLength=20]
 * @param {number} [options.entropyThreshold=4.1]
 * @returns {{
 *   clean: boolean,
 *   findings: Array<{
 *     file: string,
 *     line: number,
 *     kind: 'canary-token' | 'high-entropy-secret',
 *     entropy: number,
 *     length: number,
 *     tokenPreview: string
 *   }>,
 *   summary: {
 *     scannedFiles: number,
 *     findingsCount: number,
 *     canaryCount: number,
 *     highEntropyCount: number
 *   }
 * }}
 */
export function scanHighEntropySecrets(options = {}) {
  const { files = [], minLength = 20, entropyThreshold = 4.1 } = options;
  const findings = [];

  const literalRegex = /['"`]([^\s'"`]{16,})['"`]/g;
  const canaryPrefixRegex = /^(?:canary_|ak_live_|sk_live_|ghp_|xox[baprs]-|eyJ[A-Za-z0-9_-]{10,})/;

  for (const fileObj of files) {
    const file = String(fileObj.path || '').replace(/\\/g, '/');
    const content = String(fileObj.content || '');
    if (!file || !content) continue;

    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const lineText = lines[i];
      let match;
      literalRegex.lastIndex = 0;
      while ((match = literalRegex.exec(lineText)) !== null) {
        const token = match[1];
        const isCanary = canaryPrefixRegex.test(token);
        if (!isCanary && token.length < minLength) continue;
        if (!isCanary && isBenignToken(token)) continue;

        const entropy = computeShannonEntropy(token);
        if (isCanary || entropy >= entropyThreshold) {
          findings.push({
            file,
            line: i + 1,
            kind: isCanary ? 'canary-token' : 'high-entropy-secret',
            entropy,
            length: token.length,
            tokenPreview: redactPreview(token),
          });
        }
      }
    }
  }

  const canaryCount = findings.filter((f) => f.kind === 'canary-token').length;
  const highEntropyCount = findings.filter((f) => f.kind === 'high-entropy-secret').length;

  return {
    clean: findings.length === 0,
    findings,
    summary: {
      scannedFiles: files.length,
      findingsCount: findings.length,
      canaryCount,
      highEntropyCount,
    },
  };
}
