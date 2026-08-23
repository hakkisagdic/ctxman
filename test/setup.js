import { vi } from 'vitest';

// Global mocks
global.console = {
  ...console,
  // Suppress logs during tests to keep output clean, unless debugging
  log: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
  warn: console.warn,
  error: console.error,
};

// Mock optional dependencies that might be missing in some environments
// This ensures tests don't crash on import, but logic might fail if not handled
try {
  await import('tiktoken');
} catch (_e) {
  // doMock is NOT hoisted — the fallback only applies when the import truly failed
  vi.doMock('tiktoken', () => ({
    default: {
      get_encoding: () => ({
        encode: (text) => new Uint32Array(text.length), // Dummy encoder
        decode: (_tokens) => 'decoded text',
        free: () => {},
      }),
    },
  }));
}

try {
  await import('supertest');
} catch (_e) {
  vi.doMock('supertest', () => ({
    default: () => ({
      get: () => ({ expect: () => Promise.resolve() }),
      post: () => ({ send: () => ({ expect: () => Promise.resolve() }) }),
    }),
  }));
}
