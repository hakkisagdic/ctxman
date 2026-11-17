/**
 * Faz 19 (F19-1): Webhook Signature & Replay-Attack Security Auditor.
 * Audits incoming payment/webhook handlers for HMAC signature verification, constant-time comparison (`timingSafeEqual`), and timestamp/nonce replay protection.
 */
export function auditWebhookSignatureSecurity(options = {}) {
  const { files = [] } = options;
  const findings = [];
  let webhookHandlersCount = 0;

  for (const file of files) {
    const filePath = file.path || 'unknown.js';
    const content = String(file.content || '');
    if (!content.trim()) continue;

    const isWebhookFile =
      /webhook|callback|iyzico|stripe|github-hook/i.test(filePath) ||
      /['"`][^'"`]*webhook[^'"`]*['"`]|x-hub-signature|stripe-signature|x-iyzi-signature/i.test(
        content
      );
    if (!isWebhookFile) continue;

    webhookHandlersCount += 1;

    const hasHmacVerify =
      /createHmac|constructEvent|verifyWebhook|verifySignature|subtle\.verify/i.test(content);
    const hasTimingSafe = /timingSafeEqual|constructEvent|constantTime/i.test(content);
    const hasInsecureCompare =
      /(?:signature|digest|hmac|hash)\s*===\s*(?:expected|computed|signature|digest|hmac|req\.headers)/i.test(
        content
      );
    const hasReplayProtection =
      /timestamp|tolerance|replay|nonce|idempotency|event\.id|Date\.now\(\)\s*-/i.test(content);

    if (!hasHmacVerify) {
      findings.push({
        type: 'missing-hmac-verification',
        path: filePath,
        severity: 'critical',
        reason: `Webhook handler in "${filePath}" processes incoming payloads without cryptographic HMAC/signature verification.`,
        remediation:
          'Verify the raw request body against the provider signature header using HMAC-SHA256 before parsing or executing business logic.',
      });
    }

    if (hasInsecureCompare || (hasHmacVerify && !hasTimingSafe)) {
      findings.push({
        type: 'non-constant-time-comparison',
        path: filePath,
        severity: 'high',
        reason: `Webhook signature comparison in "${filePath}" does not use crypto.timingSafeEqual, exposing a timing side-channel.`,
        remediation:
          'Compare signature buffers using `crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))` after checking byte lengths.',
      });
    }

    if (!hasReplayProtection) {
      findings.push({
        type: 'missing-replay-protection',
        path: filePath,
        severity: 'high',
        reason: `Webhook handler in "${filePath}" lacks timestamp tolerance or event ID deduplication against replay attacks.`,
        remediation:
          'Validate the webhook timestamp header within a strict window (e.g. <= 300s) and deduplicate processed event IDs.',
      });
    }
  }

  const status = findings.length === 0 ? 'secure' : 'webhook-vulnerable';

  return {
    status,
    webhookHandlersCount,
    findingsCount: findings.length,
    findings,
    summary:
      status === 'secure'
        ? `All ${webhookHandlersCount} webhook handler(s) enforce HMAC verification, constant-time comparison, and replay protection.`
        : `Detected ${findings.length} webhook security risk(s) across ${webhookHandlersCount} handler(s).`,
  };
}
