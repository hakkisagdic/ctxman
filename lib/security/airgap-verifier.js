/**
 * F11-5: Air-Gapped / Zero-Cloud Readiness Verifier
 * Audits source files, dependencies, and config for outbound cloud URLs, SaaS SDKs, and phone-home telemetry.
 */

import fs from 'fs';
import path from 'path';
import { Scanner } from '../core/Scanner.js';

const EXTERNAL_URL_REGEX = /https?:\/\/([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})(?:\/[^\s"'`)]*)?/g;
const CLOUD_SDK_PACKAGES = new Set([
  'openai',
  '@anthropic-ai/sdk',
  '@google-cloud/vertexai',
  'cohere-ai',
  'posthog-node',
  '@sentry/node',
  'mixpanel',
]);

const SAFE_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  'json.schemastore.org',
  'www.w3.org',
]);

/**
 * Verify whether a repository is ready for air-gapped (zero-cloud) deployment.
 *
 * @param {object} [options]
 * @param {string} [options.rootPath]
 * @param {Array<{path: string, content: string}>} [options.files]
 * @param {object} [options.packageJson]
 * @param {object} [options.config]
 * @param {string[]} [options.allowedHosts]
 * @returns {object}
 */
export function verifyAirgappedReadiness(options = {}) {
  const allowedHosts = new Set([
    ...SAFE_HOSTS,
    ...(Array.isArray(options.allowedHosts) ? options.allowedHosts : []),
  ]);

  let fileEntries = [];
  if (Array.isArray(options.files)) {
    fileEntries = options.files;
  } else if (options.rootPath) {
    const scanner = new Scanner(options.rootPath);
    fileEntries = scanner
      .scan()
      .filter((f) => /\.(?:js|ts|mjs|cjs|json)$/.test(f.relativePath))
      .map((f) => ({
        path: f.relativePath,
        content: fs.readFileSync(path.join(options.rootPath, f.relativePath), 'utf8'),
      }));
  }

  const findings = [];

  for (const file of fileEntries) {
    const lines = String(file.content || '').split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;

      let match;
      EXTERNAL_URL_REGEX.lastIndex = 0;
      while ((match = EXTERNAL_URL_REGEX.exec(line)) !== null) {
        const host = match[1].toLowerCase();
        if (!allowedHosts.has(host) && !host.endsWith('.internal') && !host.endsWith('.local')) {
          findings.push({
            kind: 'external-url',
            severity: 'high',
            file: file.path,
            line: i + 1,
            target: match[0],
            remediation: `Replace external endpoint '${host}' with an internal air-gapped mirror or configurable env endpoint.`,
          });
        }
      }
    }
  }

  const pkg = options.packageJson || {};
  const allDeps = {
    ...(pkg.dependencies || {}),
    ...(pkg.optionalDependencies || {}),
  };
  for (const depName of Object.keys(allDeps)) {
    if (CLOUD_SDK_PACKAGES.has(depName)) {
      findings.push({
        kind: 'cloud-sdk-dependency',
        severity: 'medium',
        file: 'package.json',
        line: 1,
        target: depName,
        remediation: `Ensure '${depName}' is guarded by an offline provider fallback (e.g. LocalHashEmbeddingProvider).`,
      });
    }
  }

  const config = options.config || {};
  if (config.autoUpdate === true || config.telemetry === true) {
    findings.push({
      kind: 'telemetry-or-autoupdate-enabled',
      severity: 'high',
      file: 'config',
      line: 1,
      target: config.autoUpdate ? 'autoUpdate:true' : 'telemetry:true',
      remediation: 'Disable autoUpdate and telemetry in air-gapped enterprise deployments.',
    });
  }

  const externalUrls = findings.filter((f) => f.kind === 'external-url').length;
  const cloudSdks = findings.filter((f) => f.kind === 'cloud-sdk-dependency').length;
  const telemetryFlags = findings.filter(
    (f) => f.kind === 'telemetry-or-autoupdate-enabled'
  ).length;
  const readinessScore = Math.max(
    0,
    100 - externalUrls * 20 - cloudSdks * 10 - telemetryFlags * 25
  );

  return {
    airgapReady: findings.length === 0,
    readinessScore,
    findings,
    summary: {
      scannedFiles: fileEntries.length,
      totalFindings: findings.length,
      externalUrls,
      cloudSdks,
      telemetryFlags,
    },
  };
}
