import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { LLMDetector } from '../lib/utils/llm-detector.js';
import ConfigUtils from '../lib/utils/config-utils.js';

vi.mock('../lib/utils/config-utils.js', () => ({
  default: {
    loadUserConfig: vi.fn(),
  },
}));

vi.mock('../lib/utils/logger.js', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

describe('LLM Detector Coverage', () => {
  let originalEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Restore environment
    process.env = originalEnv;
  });

  describe('Environment Detection Edge Cases', () => {
    test('detectsExplicit CTXMAN_LLM override', () => {
      process.env.CTXMAN_LLM = 'custom-model';
      const detected = LLMDetector.detectFromEnv();
      expect(detected).toBe('custom-model');
    });

    test('detects Anthropic API key', () => {
      delete process.env.CTXMAN_LLM;
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
      const detected = LLMDetector.detectFromEnv();
      expect(detected).toBe('claude-sonnet-5-5');
    });

    test('detects OpenAI API key', () => {
      delete process.env.CTXMAN_LLM;
      delete process.env.ANTHROPIC_API_KEY;
      process.env.OPENAI_API_KEY = 'sk-test';
      const detected = LLMDetector.detectFromEnv();
      expect(detected).toBe('gpt-6.1-sol');
    });

    test('detects Google API key', () => {
      delete process.env.CTXMAN_LLM;
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.OPENAI_API_KEY;
      process.env.GOOGLE_API_KEY = 'test-key';
      const detected = LLMDetector.detectFromEnv();
      expect(detected).toBe('gemini-3.8-flash');
    });

    test('detects Gemini API key', () => {
      delete process.env.CTXMAN_LLM;
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.OPENAI_API_KEY;
      delete process.env.GOOGLE_API_KEY;
      process.env.GEMINI_API_KEY = 'test-key';
      const detected = LLMDetector.detectFromEnv();
      expect(detected).toBe('gemini-3.8-flash');
    });

    test('detects DeepSeek API key', () => {
      delete process.env.CTXMAN_LLM;
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.OPENAI_API_KEY;
      delete process.env.GOOGLE_API_KEY;
      delete process.env.GEMINI_API_KEY;
      process.env.DEEPSEEK_API_KEY = 'test-key';
      const detected = LLMDetector.detectFromEnv();
      expect(detected).toBe('deepseek-flash');
    });

    test('returns null when no API keys present', () => {
      delete process.env.CTXMAN_LLM;
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.OPENAI_API_KEY;
      delete process.env.GOOGLE_API_KEY;
      delete process.env.GEMINI_API_KEY;
      delete process.env.DEEPSEEK_API_KEY;
      const detected = LLMDetector.detectFromEnv();
      expect(detected).toBeNull();
    });
  });

  describe('Config Detection', () => {
    test('detectFromConfig returns model from config', () => {
      ConfigUtils.loadUserConfig.mockReturnValue({ targetModel: 'gpt-4o' });
      const detected = LLMDetector.detectFromConfig();
      expect(detected).toBe('gpt-4o');
    });

    test('detectFromConfig returns null when no config', () => {
      ConfigUtils.loadUserConfig.mockReturnValue({});
      const detected = LLMDetector.detectFromConfig();
      expect(detected).toBeNull();
    });

    test('detectFromConfig handles config error', () => {
      ConfigUtils.loadUserConfig.mockImplementation(() => {
        throw new Error('Config not found');
      });
      const detected = LLMDetector.detectFromConfig();
      expect(detected).toBeNull();
    });
  });

  describe('Profile Edge Cases', () => {
    test('getProfile returns default for null model', () => {
      const profile = LLMDetector.getProfile(null);
      expect(profile.name).toBe('Unknown Model');
      expect(profile.contextWindow).toBe(100000);
    });

    test('getProfile returns default for unknown string', () => {
      const profile = LLMDetector.getProfile('unknown');
      expect(profile.name).toBe('Unknown Model');
    });

    test('getProfile falls back to default for non-existent model', () => {
      const profile = LLMDetector.getProfile('non-existent-model-xyz');
      expect(profile.name).toBe('non-existent-model-xyz');
      expect(profile.contextWindow).toBeDefined();
    });
  });

  describe('Recommendation Edge Cases', () => {
    test('handles excellent fit (< 50% utilization)', () => {
      const msg = LLMDetector.getRecommendation(true, 1, 40);
      expect(msg).toContain('Plenty of room');
    });

    test('handles comfortable fit (50-80% utilization)', () => {
      const msg = LLMDetector.getRecommendation(true, 1, 65);
      expect(msg).toContain('fits comfortably');
    });

    test('handles tight fit (80-100% utilization)', () => {
      const msg = LLMDetector.getRecommendation(true, 1, 95);
      expect(msg).toContain('most of available context');
    });

    test('handles edge case over 100% when fitsInOne is true', () => {
      const msg = LLMDetector.getRecommendation(true, 1, 105);
      expect(msg).toContain('Context limit exceeded');
    });

    test('handles small chunking (2-3 chunks)', () => {
      const msg = LLMDetector.getRecommendation(false, 3, 250);
      expect(msg).toContain('3 chunks');
      expect(msg).toContain('--chunk flag');
    });

    test('handles medium chunking (4-10 chunks)', () => {
      const msg = LLMDetector.getRecommendation(false, 7, 600);
      expect(msg).toContain('7 chunks');
      expect(msg).toContain('filtering with .contextinclude');
    });

    test('handles large chunking (>10 chunks)', () => {
      const msg = LLMDetector.getRecommendation(false, 15, 1200);
      expect(msg).toContain('15 chunks');
      expect(msg).toContain('Strongly recommend filtering');
    });
  });

  describe('Format Analysis Edge Cases', () => {
    test('formatAnalysis shows excellent fit status', () => {
      const analysis = {
        modelName: 'Claude Sonnet 4.5',
        contextWindow: 200000,
        usableContext: 120000,
        reservedForSystem: 80000,
        utilizationPercentage: 60,
        repoTokens: 50000,
        repoFiles: 100,
        fitsInOne: true,
        chunksNeeded: 1,
        utilizationActual: 41.7, // < 50%
        percentageOfTotal: 25.0, // < 80% of total context
        warningLevel: 'ok',
        suggestions: [],
        recommendation: 'Plenty of room',
      };
      const formatted = LLMDetector.formatAnalysis(analysis);
      expect(formatted).toContain('Context usage is within safe limits');
      expect(formatted).toContain('25.0%');
    });

    test('formatAnalysis shows good fit status', () => {
      const analysis = {
        modelName: 'Claude Sonnet 4.5',
        contextWindow: 200000,
        usableContext: 120000,
        reservedForSystem: 80000,
        utilizationPercentage: 60,
        repoTokens: 90000,
        repoFiles: 150,
        fitsInOne: true,
        chunksNeeded: 1,
        utilizationActual: 75, // 50-80%
        percentageOfTotal: 45.0, // < 80% of total context
        warningLevel: 'ok',
        suggestions: [],
        recommendation: 'Fits comfortably',
      };
      const formatted = LLMDetector.formatAnalysis(analysis);
      expect(formatted).toContain('Context usage is within safe limits');
    });

    test('formatAnalysis shows acceptable fit status (warning)', () => {
      const analysis = {
        modelName: 'Claude Sonnet 4.5',
        contextWindow: 200000,
        usableContext: 120000,
        reservedForSystem: 80000,
        utilizationPercentage: 60,
        repoTokens: 170000,
        repoFiles: 200,
        fitsInOne: true,
        chunksNeeded: 1,
        utilizationActual: 91.7, // > 80% usable
        percentageOfTotal: 85.0, // 80-89% of total context
        warningLevel: 'warning',
        suggestions: [],
        recommendation: 'Uses most of context',
      };
      const formatted = LLMDetector.formatAnalysis(analysis);
      expect(formatted).toContain('WARNING');
      expect(formatted).toContain('80%+');
    });

    test('formatAnalysis shows critical status', () => {
      const analysis = {
        modelName: 'GPT-4o',
        contextWindow: 128000,
        usableContext: 76800,
        reservedForSystem: 51200,
        utilizationPercentage: 60,
        repoTokens: 118000,
        repoFiles: 300,
        fitsInOne: false,
        chunksNeeded: 2,
        utilizationActual: 153.6,
        percentageOfTotal: 92.0, // 90-99% of total context
        warningLevel: 'critical',
        suggestions: [
          { path: 'large-file.js', tokens: 50000, percentage: '42.4', reason: 'Large file' },
        ],
        recommendation: 'Enable chunking',
      };
      const formatted = LLMDetector.formatAnalysis(analysis);
      expect(formatted).toContain('CRITICAL');
      expect(formatted).toContain('90%+');
    });

    test('formatAnalysis shows overflow status', () => {
      const analysis = {
        modelName: 'GPT-4o',
        contextWindow: 128000,
        usableContext: 76800,
        reservedForSystem: 51200,
        utilizationPercentage: 60,
        repoTokens: 150000,
        repoFiles: 300,
        fitsInOne: false,
        chunksNeeded: 2,
        utilizationActual: 195.3,
        percentageOfTotal: 117.2, // 100%+ of total context
        warningLevel: 'overflow',
        suggestions: [
          { path: 'large-file.js', tokens: 50000, percentage: '33.3', reason: 'Large file' },
        ],
        recommendation: 'Enable chunking',
      };
      const formatted = LLMDetector.formatAnalysis(analysis);
      expect(formatted).toContain('OVERFLOW');
      expect(formatted).toContain('exceeded');
    });
  });

  describe('Integration', () => {
    test('detect falls back through env and config', () => {
      delete process.env.CTXMAN_LLM;
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.OPENAI_API_KEY;
      ConfigUtils.loadUserConfig.mockImplementation(() => {
        throw new Error('No config');
      });

      const detected = LLMDetector.detect();
      expect(detected).toBe('unknown');
    });

    test('detect prefers env over config', () => {
      process.env.OPENAI_API_KEY = 'test';
      ConfigUtils.loadUserConfig.mockReturnValue({ targetModel: 'claude-sonnet-4.5' });

      const detected = LLMDetector.detect();
      expect(detected).toBe('gpt-6.1-sol'); // From env, not config
    });
  });
});
