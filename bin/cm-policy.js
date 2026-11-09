#!/usr/bin/env node
/**
 * Policy Command
 * Validate and show the export policy (`ctxman policy check`), or write a starter policy
 * (`ctxman policy init`)
 */

import fs from 'fs';
import path from 'path';
import {
  loadPolicy,
  createStarterPolicy,
  loadIgnoreFileRules,
  checkWorkspacePolicies,
  POLICY_FILE,
  POLICY_ENV,
  POLICY_DOCS_URL,
  PolicyConfigError,
} from '../lib/policy/index.js';

function collectRepos(args) {
  const repos = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--repo') {
      const next = args[++i];
      if (!next || next.startsWith('-')) {
        throw new Error('--repo needs a directory path');
      }
      repos.push(next);
    } else if (arg.startsWith('--repo=')) {
      const value = arg.slice('--repo='.length);
      if (!value) {
        throw new Error('--repo needs a directory path');
      }
      repos.push(value);
    }
  }
  return repos;
}

function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    return;
  }

  let repos = [];
  try {
    repos = collectRepos(args);
  } catch (error) {
    console.error(`❌ ${error.message}`);
    process.exitCode = 2;
    return;
  }

  const command = args[0] && !args[0].startsWith('-') ? args[0] : 'check';

  switch (command) {
    case 'check':
      check(args.includes('--json'), repos);
      break;
    case 'init':
      if (repos.length > 0) {
        console.error("❌ --repo is only supported with 'ctxman policy check'");
        process.exitCode = 2;
        return;
      }
      init(args.includes('--force') || args.includes('-f'));
      break;
    default:
      console.error(`❌ Unknown policy command: ${command}`);
      console.error('   Usage: ctxman policy <check|init> (see ctxman policy --help)');
      process.exitCode = 2;
  }
}

function checkWorkspace(root, json, repos) {
  let result;
  try {
    result = checkWorkspacePolicies(root, repos);
  } catch (error) {
    console.error(`❌ ${error.message}`);
    process.exitCode = 2;
    return;
  }

  if (!result.valid) {
    process.exitCode = 2;
  }

  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const label = (text) => `${text}:`.padEnd(24);
  console.log('🛡️  ctxman workspace export policy');
  console.log(`Repositories (${result.repos.length}):`);
  for (const repo of result.repos) {
    if (!repo.valid) {
      console.log(`  ❌ [${repo.alias}] ${repo.root}`);
      console.error(`❌ [${repo.alias}] ${repo.message}`);
      continue;
    }
    const state = repo.active
      ? `active (${repo.sources.map((s) => s.scope).join(', ')})`
      : 'no policy (unrestricted)';
    console.log(`  ✅ [${repo.alias}] ${repo.root} — ${state}`);
  }
  console.log();
  console.log(
    label('Require redaction') + (result.requireRedaction ? 'yes (--no-redact is refused)' : 'no')
  );
  console.log(
    label('Max export tokens') +
      (result.maxExportTokens === null
        ? 'no limit'
        : result.maxExportTokens.toLocaleString('en-US'))
  );
  console.log(
    label('Allowed target models') +
      (!result.allowedTargetModels
        ? 'any'
        : result.allowedTargetModels
            .map((rule) => `${rule.patterns.join(', ')} [${rule.repo}:${rule.scope}]`)
            .join(' AND '))
  );
  console.log(
    label('AI-tool ignore files') +
      (result.ignoreFiles.length === 0 ? 'none' : result.ignoreFiles.join(', '))
  );
  console.log();
  if (result.valid) {
    console.log('✅ All workspace policies are valid.');
  } else {
    console.error('❌ One or more workspace policy files are invalid.');
  }
}

function check(json, repos = []) {
  const root = process.cwd();
  if (repos.length > 0) {
    checkWorkspace(root, json, repos);
    return;
  }

  let policy;
  try {
    policy = loadPolicy(root);
  } catch (error) {
    if (!(error instanceof PolicyConfigError)) throw error;
    if (json) {
      console.log(
        JSON.stringify({ valid: false, file: error.file, errors: error.errors }, null, 2)
      );
    } else {
      console.error(`❌ ${error.message}`);
    }
    process.exitCode = error.exitCode;
    return;
  }

  if (json) {
    console.log(JSON.stringify({ valid: true, ...policy.toJSON() }, null, 2));
    return;
  }

  if (!policy.active) {
    console.log(`No export policy: there is no ${POLICY_FILE} and ${POLICY_ENV} is not set.`);
    console.log('Exports are unrestricted. Create a policy with: ctxman policy init');
    return;
  }

  const display = (file) => (file.startsWith(root + path.sep) ? path.relative(root, file) : file);
  const label = (text) => `${text}:`.padEnd(24);

  console.log('🛡️  ctxman export policy');
  console.log(`Project root: ${root}`);
  console.log();
  console.log('Policy files:');
  for (const { scope, file } of policy.sources) {
    console.log(`  ${scope.padEnd(13)} ${display(file)}`);
  }
  console.log();

  console.log('Deny rules (never exported):');
  if (policy.denyRules.length === 0) console.log('  (none)');
  for (const rule of policy.denyRules) {
    console.log(`  [${rule.scope}] ${rule.patterns.join('  ')}`);
  }
  console.log(
    label('Require redaction') + (policy.requireRedaction ? 'yes (--no-redact is refused)' : 'no')
  );
  console.log(
    label('Max export tokens') +
      (policy.maxExportTokens === null
        ? 'no limit'
        : policy.maxExportTokens.toLocaleString('en-US'))
  );
  console.log(
    label('Allowed target models') +
      (policy.modelRules.length === 0
        ? 'any'
        : policy.modelRules
            .map((rule) => `${rule.patterns.join(', ')} [${rule.scope}]`)
            .join(' AND '))
  );

  if (policy.ignoreFiles.length === 0) {
    console.log(label('AI-tool ignore files') + 'none');
  } else {
    console.log(
      label('AI-tool ignore files') + loadIgnoreFileRules(root, policy.ignoreFiles).describe()
    );
  }

  console.log(
    label('Audit log') + (policy.audit.enabled ? policy.audit.paths.map(display).join(', ') : 'off')
  );
  console.log();
  console.log('✅ Policy is valid.');
}

function init(force) {
  const file = path.join(process.cwd(), POLICY_FILE);

  fs.mkdirSync(path.dirname(file), { recursive: true });
  try {
    // 'wx' fails when the file exists, without a separate check that could go stale
    fs.writeFileSync(file, `${JSON.stringify(createStarterPolicy(), null, 2)}\n`, {
      flag: force ? 'w' : 'wx',
    });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    console.error(`❌ ${POLICY_FILE} already exists. Use --force to overwrite it.`);
    process.exitCode = 1;
    return;
  }

  console.log(`✅ Wrote ${POLICY_FILE}`);
  console.log();
  console.log('JSON has no comments, so the "$comment" field points to the reference:');
  console.log(`   ${POLICY_DOCS_URL}`);
  console.log();
  console.log('Next steps:');
  console.log('  1. Edit the "deny" list (.gitignore syntax) and the limits.');
  console.log('  2. Run `ctxman policy check` to validate it.');
  console.log('  3. Add .ctxman/audit.log to .gitignore; commit .ctxman/policy.json.');
  console.log(`  Organisation-wide rules: point ${POLICY_ENV} at a shared policy file.`);
}

function printHelp() {
  console.log('ctxman policy - export policy for this repository\n');
  console.log('Usage: ctxman policy [check|init] [options]\n');
  console.log('Commands:');
  console.log('  check                Validate the policy files and print the effective policy');
  console.log('                       (default)');
  console.log(`  init                 Write a starter ${POLICY_FILE}\n`);
  console.log('Options:');
  console.log('  --repo DIR           check: include another repository (repeatable)');
  console.log('  --json               check: print the effective policy as JSON');
  console.log('  -f, --force          init: overwrite an existing policy file');
  console.log('  -h, --help           Show this help\n');
  console.log('Policy files:');
  console.log(`  ${POLICY_FILE}  Project policy, committed with the repository`);
  console.log(`  $${POLICY_ENV}        Organisation policy file; wins on conflicts (deny lists`);
  console.log('                       are combined, the stricter limit applies)\n');
  console.log('Exit codes: 0 valid or no policy, 2 invalid policy file');
  console.log(`Reference: ${POLICY_DOCS_URL}`);
}

main();
