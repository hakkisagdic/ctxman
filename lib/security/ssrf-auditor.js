/**
 * Faz 19 (F19-3): SSRF & Outbound URL Egress Allowlist Security Auditor.
 * Detects user-controlled URLs passed into `fetch`/`axios`/`http.request` without allowlist validation or RFC 1918 / cloud metadata IP (`169.254.169.254`) guards.
 */
export function auditSsrfEgressSafety(options = {}) {
  const { files = [] } = options;
  const findings = [];

  const hasGuardInScope = (content) =>
    /allowlist|allowedHosts|allowedDomains|isPrivateIp|blockPrivateIp|validateEgressUrl|169\.254\.169\.254/i.test(
      content
    );

  for (const file of files) {
    const filePath = file.path || 'unknown.js';
    const content = String(file.content || '');
    if (!content.trim()) continue;

    const guarded = hasGuardInScope(content);

    // 1. Direct req.body / req.query / req.params / userUrl in fetch/axios
    const directSsrfRegex =
      /\b(?:fetch|axios(?:\.(?:get|post|put|delete|request))?|http\.get|https\.get)\s*\(\s*([^),\n]+)/g;
    let match;
    while ((match = directSsrfRegex.exec(content)) !== null) {
      const arg = match[1].trim();
      if (/^['"`]https?:\/\//i.test(arg) && !arg.includes('${')) {
        continue; // Static literal URL is safe
      }
      const isUserTainted =
        /\breq\.(?:body|query|params|headers)|targetUrl|webhookUrl|callbackUrl|userUrl|redirectUrl/i.test(
          arg
        );
      if (isUserTainted && !guarded) {
        findings.push({
          type: 'unvalidated-ssrf-sink',
          path: filePath,
          sinkArgument: arg,
          severity: 'critical',
          reason: `Outbound HTTP call in "${filePath}" uses user-controlled URL (${arg}) without egress allowlist or private IP / cloud metadata (169.254.169.254) blocking.`,
          remediation:
            'Parse the URL with `new URL(input)`, enforce protocol === "https:", verify hostname against an explicit allowlist, and block RFC 1918 / link-local (`169.254.169.254`, `127.0.0.0/8`, `10.0.0.0/8`) resolved IPs.',
        });
      }
    }
  }

  const status = findings.length === 0 ? 'safe' : 'ssrf-risk';

  return {
    status,
    scannedFilesCount: files.length,
    findingsCount: findings.length,
    findings,
    summary:
      status === 'safe'
        ? `No unvalidated SSRF sinks detected across ${files.length} file(s).`
        : `Detected ${findings.length} SSRF / egress allowlist vulnerability(ies) across ${files.length} file(s).`,
  };
}
