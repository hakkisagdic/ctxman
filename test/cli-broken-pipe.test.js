import { describe, test, expect } from 'vitest';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const CLI = fileURLToPath(new URL('../bin/cli.js', import.meta.url));
// Synchronous token counting across the repository before the final report is printed can
// exceed Vitest's 10s default when all 163 test suites contend for CPU (load average > 50).
const BROKEN_PIPE_TIMEOUT_MS = 60_000;

/** Run a command, close its stdout after the first chunk, and collect the exit */
function runAndCloseEarly(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI, ...args], { cwd: process.cwd() });
    let stderr = '';
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.stdout.once('data', () => {
      // Wait for stdout closure to be observed before collecting exit status
      child.stdout.once('close', () => {});
      child.stdout.destroy();
    });
    child.once('error', reject);
    child.once('close', (code) => resolve({ code, stderr }));
  });
}

describe('output to a closed pipe (ctxman ... | head)', () => {
  test.each([
    [['--verbose', '--simple']],
    [['count', 'lib', '--top', '400']],
    [['search', 'token', 'lib', '--limit', '50', '--full']],
  ])(
    '%j stops quietly',
    async (args) => {
      const { code, stderr } = await runAndCloseEarly(args);
      expect(stderr).not.toContain('EPIPE');
      expect(code).toBe(0);
    },
    BROKEN_PIPE_TIMEOUT_MS
  );
});
