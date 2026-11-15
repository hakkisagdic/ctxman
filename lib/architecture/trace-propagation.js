/**
 * F16-4: Distributed Trace Context (OpenTelemetry / W3C traceparent) Propagation Auditor
 * Detects outbound HTTP/queue calls that drop W3C `traceparent` or `x-correlation-id` headers.
 */

import fs from 'fs';
import path from 'path';
import { Scanner } from '../core/Scanner.js';

const OUTBOUND_CALL_REGEX = /\b(?:fetch|axios\.(?:get|post|put|delete|request)|http\.request)\s*\(/;
const TRACE_HEADER_REGEX =
  /\b(?:traceparent|tracestate|x-correlation-id|x-request-id|correlationId|propagateTrace|withTraceHeaders)\b/i;

function extractCallWindow(lines, startIndex) {
  const collected = [];
  for (let j = startIndex; j < Math.min(lines.length, startIndex + 5); j++) {
    collected.push(lines[j]);
    if (lines[j].includes(';')) break;
  }
  return collected.join('\n');
}

/**
 * Audit outbound service calls for W3C Trace Context / correlation ID propagation.
 *
 * @param {object} [options]
 * @param {string} [options.rootPath]
 * @param {Array<{path: string, content: string}>} [options.files]
 * @returns {object}
 */
export function auditTraceContextPropagation(options = {}) {
  let fileEntries = [];
  if (Array.isArray(options.files)) {
    fileEntries = options.files;
  } else if (options.rootPath) {
    const scanner = new Scanner(options.rootPath);
    fileEntries = scanner
      .scan()
      .filter((f) => /\.(?:js|ts|mjs|cjs)$/.test(f.relativePath))
      .map((f) => ({
        path: f.relativePath,
        content: fs.readFileSync(path.join(options.rootPath, f.relativePath), 'utf8'),
      }));
  }

  const brokenLinks = [];
  let totalOutboundCalls = 0;

  for (const file of fileEntries) {
    const lines = String(file.content || '').split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (OUTBOUND_CALL_REGEX.test(lines[i])) {
        totalOutboundCalls += 1;
        const windowText = extractCallWindow(lines, i);
        if (!TRACE_HEADER_REGEX.test(windowText)) {
          brokenLinks.push({
            file: file.path,
            line: i + 1,
            ruleId: 'ctxman/observability/missing-traceparent-propagation',
            severity: 'medium',
            snippet: lines[i].trim(),
            remediation:
              'Forward W3C `traceparent` and `x-correlation-id` headers on outbound service requests.',
          });
        }
      }
    }
  }

  return {
    propagated: brokenLinks.length === 0,
    brokenLinks,
    summary: {
      scannedFiles: fileEntries.length,
      totalOutboundCalls,
      brokenCount: brokenLinks.length,
    },
  };
}
