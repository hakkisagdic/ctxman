import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

describe('TokenUtils Final Coverage', () => {
  let TokenUtils;
  let mockTokenizerManager;

  beforeEach(async () => {
    vi.resetModules();

    // Mock tokenizer-adapter dependency
    mockTokenizerManager = {
      countWithTelemetry: vi.fn(),
      getTokenizerForModel: vi.fn().mockReturnValue({ getName: () => 'MockTokenizer' }),
      getAvailableTokenizers: vi.fn().mockReturnValue(['mock']),
      getTelemetry: vi.fn().mockReturnValue({}),
      resetTelemetry: vi.fn(),
    };

    vi.doMock('../lib/utils/tokenizer-adapter.js', () => ({
      getTokenizerManager: vi.fn().mockResolvedValue(mockTokenizerManager),
    }));

    const module = await import('../lib/utils/token-utils.js');
    TokenUtils = module.default;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('calculateForModel falls back to estimation on error', async () => {
    mockTokenizerManager.countWithTelemetry.mockImplementation(() => {
      throw new Error('Tokenizer error');
    });

    // Estimate for .txt is length / 4
    const content = '12345678'; // 8 chars -> 2 tokens
    const tokens = await TokenUtils.calculateForModel(content, 'gpt-4');

    expect(tokens).toBe(2);
    expect(mockTokenizerManager.countWithTelemetry).toHaveBeenCalled();
  });

  test('getMethodForModel falls back to estimation on error', async () => {
    mockTokenizerManager.getTokenizerForModel.mockImplementation(() => {
      throw new Error('Model not found');
    });

    const method = await TokenUtils.getMethodForModel('unknown-model');
    expect(method).toContain('Estimated');
  });

  test('getAvailableTokenizers triggers lazy init', async () => {
    vi.resetModules();
    const mockManager = {
      getAvailableTokenizers: vi.fn().mockReturnValue(['mock']),
    };
    const getTokenizerManagerMock = vi.fn().mockResolvedValue(mockManager);
    vi.doMock('../lib/utils/tokenizer-adapter.js', () => ({
      getTokenizerManager: getTokenizerManagerMock,
    }));

    const module = await import('../lib/utils/token-utils.js');
    const TokenUtils = module.default;

    await TokenUtils.getAvailableTokenizers();
    expect(getTokenizerManagerMock).toHaveBeenCalled();
  });

  test('detectTokenizer triggers lazy init', async () => {
    vi.resetModules();
    // Re-mock for this specific test
    const mockManager = {
      getTokenizerForModel: vi.fn().mockReturnValue({ getName: () => 'Mock' }),
    };
    const getTokenizerManagerMock = vi.fn().mockResolvedValue(mockManager);
    vi.doMock('../lib/utils/tokenizer-adapter.js', () => ({
      getTokenizerManager: getTokenizerManagerMock,
    }));

    const module = await import('../lib/utils/token-utils.js');
    const TokenUtils = module.default;

    await TokenUtils.detectTokenizer('gpt-4');
    expect(getTokenizerManagerMock).toHaveBeenCalled();
  });

  test('getTelemetry triggers lazy init', async () => {
    vi.resetModules();
    const mockManager = {
      getTelemetry: vi.fn().mockReturnValue({}),
    };
    const getTokenizerManagerMock = vi.fn().mockResolvedValue(mockManager);
    vi.doMock('../lib/utils/tokenizer-adapter.js', () => ({
      getTokenizerManager: getTokenizerManagerMock,
    }));

    const module = await import('../lib/utils/token-utils.js');
    const TokenUtils = module.default;

    await TokenUtils.getTelemetry();
    expect(getTokenizerManagerMock).toHaveBeenCalled();
  });

  test('resetTelemetry triggers lazy init', async () => {
    vi.resetModules();
    const mockManager = {
      resetTelemetry: vi.fn(),
    };
    const getTokenizerManagerMock = vi.fn().mockResolvedValue(mockManager);
    vi.doMock('../lib/utils/tokenizer-adapter.js', () => ({
      getTokenizerManager: getTokenizerManagerMock,
    }));

    const module = await import('../lib/utils/token-utils.js');
    const TokenUtils = module.default;

    await TokenUtils.resetTelemetry();
    expect(getTokenizerManagerMock).toHaveBeenCalled();
  });

  test('calculate uses estimation when tiktoken is missing', async () => {
    // Re-import with tiktoken failing to load
    vi.resetModules();
    vi.doMock('tiktoken', () => {
      throw new Error('Not found');
    });

    const module = await import('../lib/utils/token-utils.js');
    const TokenUtilsNoTiktoken = module.default;

    const content = '12345678';
    const tokens = TokenUtilsNoTiktoken.calculate(content, 'test.txt');

    expect(tokens).toBe(2); // 8 chars / 4 ratio
  });
});
