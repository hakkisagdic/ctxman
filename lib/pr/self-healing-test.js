/**
 * Builds a structured, token-efficient self-healing repair prompt from failing test output,
 * stack traces, and recent git diffs (F9-2).
 *
 * @param {object} options
 * @param {string} [options.testOutput='']
 * @param {string} [options.gitDiff='']
 * @param {Array<{path: string, content: string}>} [options.files=[]]
 * @param {number} [options.maxPromptChars=6000]
 * @returns {{
 *   failedTests: Array<{testFile: string, testName: string, expected?: string, received?: string}>,
 *   suspectLocations: Array<{file: string, line: number}>,
 *   prompt: string,
 *   summary: {
 *     failureCount: number,
 *     suspectFileCount: number,
 *     estimatedTokens: number
 *   }
 * }}
 */
export function buildSelfHealingPrompt(options = {}) {
  const { testOutput = '', gitDiff = '', files = [], maxPromptChars = 6000 } = options;
  const rawOutput = String(testOutput || '');

  const failedTests = [];
  const suspectLocations = [];
  const seenLocations = new Set();

  // Extract FAIL lines: e.g. `FAIL  test/foo.test.js > Suite > test name`
  const failLineRegex = /FAIL\s+([^\s>]+)(?:\s*>\s*(.+))?/g;
  let match;
  while ((match = failLineRegex.exec(rawOutput)) !== null) {
    failedTests.push({
      testFile: match[1].trim(),
      testName: (match[2] || 'unnamed test').trim(),
    });
  }

  // Extract Expected / Received pairs or AssertionError messages
  const assertionRegex = /AssertionError:\s*([^\n]+)/g;
  const assertions = [];
  while ((match = assertionRegex.exec(rawOutput)) !== null) {
    assertions.push(match[1].trim());
  }
  for (let i = 0; i < Math.min(failedTests.length, assertions.length); i++) {
    failedTests[i].expected = assertions[i];
  }

  // Extract file:line stack frames: e.g. `❯ lib/billing/store.js:45:12` or `at fn (lib/foo.js:12:5)`
  const frameRegex = /(?:❯|at\s+[^\n(]*\(?)\s*([a-zA-Z0-9_./-]+\.[a-zA-Z0-9]+):(\d+)(?::\d+)?/g;
  while ((match = frameRegex.exec(rawOutput)) !== null) {
    const file = match[1].replace(/\\/g, '/');
    if (file.includes('node_modules')) continue;
    const line = Number(match[2]);
    const key = `${file}:${line}`;
    if (!seenLocations.has(key)) {
      seenLocations.add(key);
      suspectLocations.push({ file, line });
    }
  }

  // Extract relevant code snippets around suspect lines
  const fileMap = new Map(
    files.map((f) => [String(f.path || '').replace(/\\/g, '/'), String(f.content || '')])
  );
  const snippets = [];
  for (const loc of suspectLocations.slice(0, 5)) {
    const content = fileMap.get(loc.file);
    if (!content) continue;
    const lines = content.split(/\r?\n/);
    const start = Math.max(0, loc.line - 4);
    const end = Math.min(lines.length, loc.line + 3);
    const slice = lines
      .slice(start, end)
      .map((l, idx) => `${start + idx + 1}: ${l}`)
      .join('\n');
    snippets.push(`### ${loc.file}:${loc.line}\n\`\`\`js\n${slice}\n\`\`\``);
  }

  const sections = [
    '# Self-Healing Test Repair Context',
    '',
    '## 1. Failing Tests',
    failedTests.length > 0
      ? failedTests
          .map(
            (f) => `- **${f.testFile}** (\`${f.testName}\`)${f.expected ? ` — ${f.expected}` : ''}`
          )
          .join('\n')
      : '- Unspecified test failure (see raw output below)',
    '',
    '## 2. Implicated Source Locations',
    suspectLocations.length > 0
      ? suspectLocations.map((s) => `- \`${s.file}:${s.line}\``).join('\n')
      : '- No stack frames resolved',
  ];

  if (snippets.length > 0) {
    sections.push('', '## 3. Focused Code Context', ...snippets);
  }

  if (gitDiff && String(gitDiff).trim()) {
    sections.push(
      '',
      '## 4. Recent Git Diff',
      '```diff',
      String(gitDiff).trim().slice(0, 2000),
      '```'
    );
  }

  sections.push(
    '',
    '## 5. Repair Instructions',
    'Produce a minimal, grounded patch that resolves the failing assertions without breaking existing exports.'
  );

  const prompt = sections.join('\n').slice(0, maxPromptChars);
  const estimatedTokens = Math.ceil(prompt.length / 4);

  return {
    failedTests,
    suspectLocations,
    prompt,
    summary: {
      failureCount: failedTests.length || (rawOutput.includes('FAIL') ? 1 : 0),
      suspectFileCount: new Set(suspectLocations.map((s) => s.file)).size,
      estimatedTokens,
    },
  };
}
