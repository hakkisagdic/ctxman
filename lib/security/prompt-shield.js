const INJECTION_RULES = [
  {
    id: 'ctxman/prompt-security/ignore-previous-instructions',
    severity: 'error',
    regex:
      /\b(?:ignore|disregard|forget)\s+(?:all\s+)?(?:previous|prior|above|system)\s+(?:instructions|prompts|rules|directives)\b/gi,
    description: 'Attempt to override system or prior prompt instructions',
  },
  {
    id: 'ctxman/prompt-security/system-role-spoofing',
    severity: 'error',
    regex: /(?:<\s*\/?\s*(?:system|instruction|developer_prompt)\s*>|\[\s*SYSTEM\s*:\s*[^\]]+\])/gi,
    description: 'Spoofed system/developer prompt delimiter tag inside source or documentation',
  },
  {
    id: 'ctxman/prompt-security/exfiltrate-secrets',
    severity: 'error',
    regex:
      /\b(?:exfiltrate|send|upload|post)\s+(?:all\s+)?(?:env|environment\s+variables|api\s+keys|secrets|credentials|\.env)\s+to\s+https?:\/\//gi,
    description: 'Instruction attempting to exfiltrate secrets or environment variables',
  },
  {
    id: 'ctxman/prompt-security/zero-width-obfuscation',
    severity: 'warning',
    regex: /[\u200B-\u200F\u202A-\u202E\u2060-\u206F]/g,
    description: 'Hidden zero-width or bidirectional control characters detected',
  },
];

/**
 * Scan repository context text for indirect prompt injection, system-tag spoofing,
 * secret-exfiltration directives, and zero-width Unicode obfuscation (`F6-4`).
 *
 * @param {string} text - Raw text or packed context document
 * @param {object} [options]
 * @param {boolean} [options.sanitize=true] - Neutralize matched injection payloads
 * @returns {object}
 */
export function sanitizePromptContext(text, options = {}) {
  let output = String(text || '');
  const shouldSanitize = options.sanitize !== false;
  const findings = [];

  for (const rule of INJECTION_RULES) {
    const matches = [...output.matchAll(rule.regex)];
    for (const match of matches) {
      findings.push({
        ruleId: rule.id,
        severity: rule.severity,
        match: match[0].slice(0, 80),
        index: match.index ?? 0,
        description: rule.description,
      });
    }

    if (shouldSanitize && matches.length > 0) {
      if (rule.id === 'ctxman/prompt-security/zero-width-obfuscation') {
        output = output.replace(rule.regex, '');
      } else {
        output = output.replace(rule.regex, '[REDACTED_PROMPT_INJECTION]');
      }
    }
  }

  return {
    safe: findings.length === 0,
    findingCount: findings.length,
    findings,
    sanitizedText: output,
  };
}
