import { describe, test, expect, vi, beforeEach, _afterEach } from 'vitest';

describe('LLMDetector Final Coverage', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  test('loadProfiles handles file read errors', async () => {
    // Mock fs to throw error
    vi.doMock('fs', () => ({
      readFileSync: () => {
        throw new Error('Read failed');
      },
      default: {
        readFileSync: () => {
          throw new Error('Read failed');
        },
      },
    }));

    // Mock other deps to avoid side effects
    vi.doMock('../lib/utils/logger.js', () => ({
      getLogger: () => ({
        debug: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
      }),
    }));

    const { LLMDetector } = await import('../lib/utils/llm-detector.js?bust=loadProfiles');

    const profiles = LLMDetector.loadProfiles();

    // Should return fallback
    expect(profiles.default.name).toBe('Unknown Model');
    expect(profiles.profiles['gpt-4o']).toBeDefined();
  });

  test('detectFromConfig returns configured model', async () => {
    vi.doMock('../lib/utils/config-utils.js', () => ({
      default: {
        loadUserConfig: vi.fn().mockReturnValue({ targetModel: 'gpt-4-turbo' }),
      },
    }));

    const { LLMDetector } = await import('../lib/utils/llm-detector.js?bust=detectFromConfig');

    const model = LLMDetector.detectFromConfig();

    expect(model).toBe('gpt-4-turbo');
  });

  test('detect logs warning if slow', async () => {
    // Mock Date.now
    let time = 1000;
    vi.spyOn(Date, 'now').mockImplementation(() => {
      time += 150;
      return time;
    });

    // Mock logger to capture warning
    const warnSpy = vi.fn();
    vi.doMock('../lib/utils/logger.js', () => ({
      getLogger: () => ({
        debug: vi.fn(),
        error: vi.fn(),
        warn: warnSpy,
      }),
    }));

    // Mock dependencies to avoid actual work
    vi.doMock('../lib/utils/config-utils.js', () => ({
      default: { loadUserConfig: () => null },
    }));

    const { LLMDetector } = await import('../lib/utils/llm-detector.js?bust=detectSlow');

    // Mock static methods on the imported class
    // Note: We can't easily mock static methods of the class we just imported if they are called internally
    // UNLESS we mock them on the class itself.
    vi.spyOn(LLMDetector, 'detectFromEnv').mockReturnValue(null);
    vi.spyOn(LLMDetector, 'detectFromConfig').mockReturnValue(null);

    await LLMDetector.detect();

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('LLM detection took'));
  });
});
