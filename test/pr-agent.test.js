import { describe, it, beforeEach, expect } from 'vitest';
import { PRFailureAgent } from '../lib/agents/pr-failure-agent.js';

describe('PRFailureAgent', () => {
  let agent;
  let mockScanner;
  let mockAnalyzer;
  let mockContextBuilder;

  beforeEach(() => {
    mockScanner = {
      scan: () => [
        { relativePath: 'src/utils.js', path: '/abs/src/utils.js', name: 'utils.js' },
        { relativePath: 'src/main.js', path: '/abs/src/main.js', name: 'main.js' },
      ],
    };

    mockAnalyzer = {
      analyze: async () => ({
        files: [],
        stats: {},
      }),
    };

    mockContextBuilder = {
      build: () => ({
        files: {},
        metadata: {},
      }),
      getSummary: () => 'Context Summary Mock',
    };

    agent = new PRFailureAgent('/root', {
      scanner: mockScanner,
      analyzer: mockAnalyzer,
      contextBuilder: mockContextBuilder,
    });
  });

  it('should analyze log and return a fix', async () => {
    const ciLog = `
      ...
      Step 5: Run tests
      FAIL src/utils.test.js
      Error: Expected string but got number in src/utils.js:45
      ...
    `;
    const diff = `
      diff --git a/src/utils.js b/src/utils.js
      index abc..def 100644
      --- a/src/utils.js
      +++ b/src/utils.js
      @@ -42,7 +42,7 @@
       function process(input) {
      -  const result = input + 1;
      +  const result = input + 2;
         return result;
       }
    `;

    // Track calls
    let scanCalled = false;
    const originalScan = mockScanner.scan;
    mockScanner.scan = () => {
      scanCalled = true;
      return originalScan();
    };

    let analyzeCalled = false;
    const originalAnalyze = mockAnalyzer.analyze;
    mockAnalyzer.analyze = async (files) => {
      analyzeCalled = true;
      return originalAnalyze(files);
    };

    const fix = await agent.run(ciLog, diff);

    expect(fix).toContain('Here is the fix');
    expect(scanCalled).toBe(true);
    expect(analyzeCalled).toBe(true);
  });

  it('should identify relevant files from error', () => {
    const error = 'Error in src/components/Button.tsx caused by ...';
    const files = agent.identifyRelevantFiles(error, '');
    expect(files).toContain('src/components/Button.tsx');
  });

  it('should identify relevant files from diff', () => {
    const diff = '+++ b/src/new-feature.js';
    const files = agent.identifyRelevantFiles('', diff);
    expect(files).toContain('src/new-feature.js');
  });

  it('should extract error from log', () => {
    const log = `
Some info
Error: Something went wrong
More info
      `;
    const error = agent.extractError(log);
    expect(error).toContain('Error: Something went wrong');
  });
});
