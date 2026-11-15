const DESTRUCTIVE_TOOL_NAME_REGEX =
  /(?:exec|shell|bash|run_command|delete|drop|remove|write_file|raw_sql|eval)/i;

/**
 * Faz 18 (F18-2): Agent MCP Tool Schema Security & Over-Permission Auditor.
 * Audits MCP tool definitions for unrestricted shell/filesystem capabilities, missing JSON schemas, and missing confirmation gates.
 */
export function auditMcpToolPermissions(options = {}) {
  const { tools = [] } = options;
  const findings = [];

  for (const tool of tools) {
    const name = tool.name || 'unnamed_tool';
    const schema = tool.inputSchema || tool.parameters || null;
    const annotations = tool.annotations || {};
    const isDestructive =
      DESTRUCTIVE_TOOL_NAME_REGEX.test(name) ||
      Boolean(annotations.destructiveHint) ||
      Boolean(tool.allowShell) ||
      Boolean(tool.allowWrite);

    if (!schema || typeof schema !== 'object' || !schema.properties) {
      findings.push({
        toolName: name,
        type: 'missing-input-schema',
        severity: 'high',
        reason: `MCP tool "${name}" does not define a structured JSON inputSchema with explicit properties.`,
        remediation: `Define a strict JSON Schema with explicit property types and required fields for "${name}".`,
      });
    } else {
      if (isDestructive && schema.additionalProperties !== false) {
        findings.push({
          toolName: name,
          type: 'unbounded-additional-properties',
          severity: 'medium',
          reason: `Privileged MCP tool "${name}" allows arbitrary undeclared properties (additionalProperties !== false).`,
          remediation: `Set "additionalProperties": false on the inputSchema of "${name}" to prevent parameter smuggling.`,
        });
      }

      for (const [propName, propDef] of Object.entries(schema.properties)) {
        const p = propDef || {};
        if (
          /(?:path|file|dir|cwd|root)/i.test(propName) &&
          !p.pattern &&
          !p.enum &&
          !tool.sandboxRoot &&
          !annotations.sandboxed
        ) {
          findings.push({
            toolName: name,
            property: propName,
            type: 'unrestricted-path-parameter',
            severity: 'high',
            reason: `Tool "${name}" accepts filesystem path parameter "${propName}" without workspace sandbox enforcement or pattern constraints.`,
            remediation: `Enforce workspace root path containment (realpath prefix check) or restrict "${propName}" via allowed enum/pattern.`,
          });
        }
      }
    }

    if (
      isDestructive &&
      !tool.requiresConfirmation &&
      !annotations.requiresConfirmation &&
      annotations.readOnlyHint !== true
    ) {
      findings.push({
        toolName: name,
        type: 'missing-human-confirmation-gate',
        severity: 'critical',
        reason: `Destructive/privileged MCP tool "${name}" can execute without a human confirmation gate or policy guard.`,
        remediation: `Mark "${name}" with requiresConfirmation: true or enforce a policy allowlist before execution.`,
      });
    }
  }

  const penalty = findings.reduce((acc, f) => {
    if (f.severity === 'critical') return acc + 30;
    if (f.severity === 'high') return acc + 20;
    return acc + 10;
  }, 0);
  const securityScore = Math.max(0, 100 - penalty);
  const status = findings.length === 0 ? 'hardened' : 'over-permissioned';

  return {
    status,
    auditedToolsCount: tools.length,
    securityScore,
    findingsCount: findings.length,
    findings,
    summary:
      status === 'hardened'
        ? `All ${tools.length} MCP tool(s) pass schema and permission hardening checks (${securityScore}/100).`
        : `Detected ${findings.length} MCP tool permission/schema risk(s) across ${tools.length} tool(s) (score: ${securityScore}/100).`,
  };
}
