/**
 * LLM Detector
 * Auto-detects target LLM model and provides optimization recommendations
 * v2.3.7 feature - JSON config based
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import ConfigUtils from './config-utils.js';
import { getLogger } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Lazy-loaded profiles cache
let profilesCache = null;

// Logger instance
const logger = getLogger('LLMDetector');

/** Model used when nothing is configured or detected (a current, widely available model) */
export const DEFAULT_TARGET_MODEL = 'claude-sonnet-5-5';

// Deprecated/retired notices already printed in this process
const warnedModels = new Set();

export class LLMDetector {
  /**
   * Load LLM profiles from JSON config
   * Merges built-in profiles with custom user profiles
   * @returns {object} All LLM profiles
   */
  static loadProfiles() {
    // Return cached if available
    if (profilesCache) {
      return profilesCache;
    }

    try {
      // Load built-in profiles
      const profilesPath = resolve(__dirname, '../../.ctxman/llm-profiles.json');
      const profilesData = JSON.parse(readFileSync(profilesPath, 'utf-8'));
      const builtInProfiles = profilesData.profiles || {};
      const defaultProfile = profilesData.default;
      let aliases = profilesData.aliases || {};

      // Try to load custom profiles
      let customProfiles = {};
      try {
        const customPath = resolve(__dirname, '../../.ctxman/custom-profiles.json');
        const customData = JSON.parse(readFileSync(customPath, 'utf-8'));
        customProfiles = customData.profiles || {};
        aliases = { ...aliases, ...(customData.aliases || {}) };
        logger.debug(`Loaded ${Object.keys(customProfiles).length} custom LLM profiles`);
      } catch (_error) {
        // Custom profiles optional
        logger.debug('No custom profiles found (optional)');
      }

      // Merge profiles (custom overrides built-in)
      const allProfiles = {
        ...builtInProfiles,
        ...customProfiles,
      };

      // Cache the result
      profilesCache = {
        profiles: allProfiles,
        default: defaultProfile,
        aliases,
        lastUpdated: profilesData.lastUpdated,
      };

      logger.debug(`Loaded ${Object.keys(allProfiles).length} total LLM profiles`);
      return profilesCache;
    } catch (error) {
      logger.error(`Failed to load LLM profiles: ${error.message}`);

      // Fallback to minimal built-in if JSON load fails
      const fallback = {
        profiles: {
          [DEFAULT_TARGET_MODEL]: {
            name: 'Claude Sonnet 5.5',
            vendor: 'Anthropic',
            contextWindow: 1000000,
            utilizationPercentage: 0.6,
            maxRecommendedInput: 600000,
            preferredFormat: 'toon',
            chunkStrategy: 'none',
          },
        },
        aliases: {},
        default: {
          name: 'Unknown Model',
          contextWindow: 100000,
          utilizationPercentage: 0.6,
          maxRecommendedInput: 60000,
          preferredFormat: 'json',
          chunkStrategy: 'smart',
        },
      };

      profilesCache = fallback;
      return fallback;
    }
  }

  /**
   * Get default profile for unknown models
   * @returns {object} Default profile
   */
  static getDefaultProfile() {
    const data = this.loadProfiles();
    return data.default;
  }

  /**
   * Id of the model used when none is configured
   * @returns {string}
   */
  static getDefaultModelId() {
    return DEFAULT_TARGET_MODEL;
  }

  /**
   * Get all profiles
   * @returns {object} All LLM profiles
   */
  static getAllProfiles() {
    const data = this.loadProfiles();
    return data.profiles;
  }
  /**
   * Auto-detect LLM from environment and config
   * Performance target: <100ms
   * @returns {string} Detected model name or 'unknown'
   */
  static detect() {
    const startTime = Date.now();

    try {
      // 1. Check environment variables (fastest, <1ms)
      const envModel = this.detectFromEnv();
      if (envModel && envModel !== 'unknown') {
        logger.debug(`LLM detected from environment: ${envModel}`);
        return envModel;
      }

      // 2. Check user config (slower but still fast, <50ms)
      const configModel = this.detectFromConfig();
      if (configModel && configModel !== 'unknown') {
        logger.debug(`LLM detected from config: ${configModel}`);
        return configModel;
      }

      logger.debug('No LLM detected, using defaults');
      return 'unknown';
    } finally {
      const elapsed = Date.now() - startTime;
      if (elapsed > 100) {
        logger.warn(`LLM detection took ${elapsed}ms (threshold: 100ms)`);
      } else {
        logger.debug(`LLM detection completed in ${elapsed}ms`);
      }
    }
  }

  /**
   * Detect from environment variables
   * Checks for API keys and explicit overrides
   * @returns {string|null} Model name or null
   */
  static detectFromEnv() {
    // Explicit override
    if (process.env.CTXMAN_LLM) {
      return process.env.CTXMAN_LLM;
    }

    // A provider's API key selects that provider's current balanced model
    if (process.env.ANTHROPIC_API_KEY) {
      return 'claude-sonnet-5-5';
    }

    if (process.env.OPENAI_API_KEY) {
      return 'gpt-6.1-sol';
    }

    if (process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY) {
      return 'gemini-3.8-flash';
    }

    if (process.env.DEEPSEEK_API_KEY) {
      return 'deepseek-flash';
    }

    return null;
  }

  /**
   * Detect from user configuration file
   * @returns {string|null} Model name or null
   */
  static detectFromConfig() {
    try {
      const config = ConfigUtils.loadUserConfig();
      if (config && config.targetModel) {
        return config.targetModel;
      }
    } catch (error) {
      logger.debug(`Config file not found or invalid: ${error.message}`);
    }
    return null;
  }

  /**
   * Get LLM profile by name
   * Supports built-in and custom user models
   * @param {string} modelName - Model identifier
   * @returns {object} LLM profile
   */
  static getProfile(modelName) {
    // Unknown model
    if (!modelName || modelName === 'unknown') {
      return this.getDefaultProfile();
    }

    const id = this.resolveModelId(modelName);
    if (id) {
      const profile = { id, ...this.getAllProfiles()[id] };
      this.warnIfOutdated(profile);
      return profile;
    }

    // Fallback to default
    logger.warn(`Unknown LLM model: ${modelName}, using default profile (see --list-llms)`);
    return {
      ...this.getDefaultProfile(),
      name: modelName,
    };
  }

  /**
   * Map a model name to the id of its profile: the id itself, an alias (older ctxman
   * ids such as `claude-sonnet-4.5`, provider aliases) or a dated snapshot id
   * (`claude-haiku-4-5-20251001`, `gpt-5-2025-08-07`)
   * @param {string} modelName - Model identifier as given by the user
   * @returns {string|null} Profile id, or null for unknown models
   */
  static resolveModelId(modelName) {
    if (!modelName) return null;
    const { profiles, aliases = {} } = this.loadProfiles();
    const candidates = [modelName, modelName.toLowerCase()];
    for (const name of candidates) {
      if (profiles[name]) return name;
      if (aliases[name] && profiles[aliases[name]]) return aliases[name];
    }
    const undated = modelName
      .toLowerCase()
      .replace(/-\d{4}-\d{2}-\d{2}$/, '')
      .replace(/-\d{8}$/, '');
    if (undated !== modelName.toLowerCase()) {
      return this.resolveModelId(undated);
    }
    return null;
  }

  /**
   * Warn once per process when a profile's model is deprecated or retired by its provider
   * @param {object} profile - Resolved profile (with id)
   */
  static warnIfOutdated(profile) {
    if (!['deprecated', 'retired'].includes(profile.status) || warnedModels.has(profile.id)) {
      return;
    }
    warnedModels.add(profile.id);
    const when = profile.retires ? ` (retires ${profile.retires})` : '';
    const instead = profile.replacement ? `; consider ${profile.replacement}` : '';
    logger.warn(`${profile.name} is ${profile.status} by ${profile.vendor}${when}${instead}`);
  }

  /**
   * Recommend optimal configuration based on LLM profile and repository stats
   * @param {object} profile - LLM profile
   * @param {object} repoStats - Repository statistics
   * @returns {object} Configuration recommendations
   */
  static recommendConfiguration(profile, repoStats) {
    const { totalTokens } = repoStats;
    const { maxRecommendedInput, preferredFormat, chunkStrategy, utilizationPercentage } = profile;

    const fitsInContext = totalTokens <= maxRecommendedInput;
    const chunksNeeded = fitsInContext ? 1 : Math.ceil(totalTokens / maxRecommendedInput);

    // Chunk size should also respect 60% rule
    const recommendedChunkSize = maxRecommendedInput;

    return {
      targetModel: profile.name,
      outputFormat: preferredFormat,
      chunkingEnabled: !fitsInContext,
      chunkStrategy: chunkStrategy,
      chunkSize: recommendedChunkSize,
      chunksNeeded: chunksNeeded,
      fitsInContext: fitsInContext,
      utilizationPercentage: Math.round((utilizationPercentage || 0.6) * 100),
      utilizationActual: (totalTokens / maxRecommendedInput) * 100,
    };
  }

  /**
   * Analyze context fit - detailed analysis for display
   * @param {object} profile - LLM profile
   * @param {object} repoStats - Repository statistics
   * @param {object[]} largestFiles - Optional array of largest files for suggestions
   * @returns {object} Context fit analysis
   */
  static analyzeContextFit(profile, repoStats, largestFiles = []) {
    const { totalTokens, totalFiles } = repoStats;
    const { name, contextWindow, maxRecommendedInput, utilizationPercentage } = profile;

    // Calculate usable context (60% of total by default)
    const utilization = utilizationPercentage || 0.6;
    const usableContext = maxRecommendedInput; // Already calculated as 60%
    const reservedForSystem = contextWindow - usableContext; // 40% reserved

    const fitsInOne = totalTokens <= usableContext;
    const chunksNeeded = fitsInOne ? 1 : Math.ceil(totalTokens / usableContext);
    const utilizationActual = (totalTokens / usableContext) * 100; // % of usable context

    // Calculate percentage of total context window
    const percentageOfTotal = (totalTokens / contextWindow) * 100;

    // Determine warning level based on thresholds
    let warningLevel = 'ok';
    if (percentageOfTotal >= 100) {
      warningLevel = 'overflow';
    } else if (percentageOfTotal >= 90) {
      warningLevel = 'critical';
    } else if (percentageOfTotal >= 80) {
      warningLevel = 'warning';
    }

    // Generate file suggestions if needed
    const suggestions = this.generateFileSuggestions(largestFiles, totalTokens, usableContext);

    return {
      modelName: name,
      contextWindow,
      usableContext,
      reservedForSystem,
      utilizationPercentage: Math.round(utilization * 100),
      repoTokens: totalTokens,
      repoFiles: totalFiles,
      fitsInOne,
      chunksNeeded,
      utilizationActual,
      percentageOfTotal,
      warningLevel,
      suggestions,
      recommendation: this.getRecommendation(fitsInOne, chunksNeeded, utilizationActual),
    };
  }

  /**
   * Generate file exclusion suggestions based on largest files
   * @param {object[]} largestFiles - Array of largest files sorted by tokens
   * @param {number} totalTokens - Total repository tokens
   * @param {number} usableContext - Usable context limit
   * @returns {object[]} Array of file suggestions
   */
  static generateFileSuggestions(largestFiles, totalTokens, usableContext) {
    if (!largestFiles || largestFiles.length === 0) {
      return [];
    }

    const suggestions = [];
    const excessTokens = totalTokens - usableContext;

    // If we're over budget, suggest files to exclude
    if (excessTokens > 0) {
      let accumulatedSavings = 0;

      for (const file of largestFiles) {
        if (accumulatedSavings >= excessTokens) break;

        suggestions.push({
          path: file.relativePath || file.path,
          tokens: file.tokens,
          percentage: ((file.tokens / totalTokens) * 100).toFixed(1),
          reason: this.getFileSuggestionReason(file),
        });

        accumulatedSavings += file.tokens;
      }
    } else {
      // Even if under budget, show top files that could be excluded if needed
      const topFiles = largestFiles.slice(0, 3);
      for (const file of topFiles) {
        suggestions.push({
          path: file.relativePath || file.path,
          tokens: file.tokens,
          percentage: ((file.tokens / totalTokens) * 100).toFixed(1),
          reason: this.getFileSuggestionReason(file),
        });
      }
    }

    return suggestions;
  }

  /**
   * Determine reason for file suggestion
   * @param {object} file - File info object
   * @returns {string} Suggestion reason
   */
  static getFileSuggestionReason(file) {
    const path = file.relativePath || file.path;
    const ext = path.split('.').pop()?.toLowerCase();

    if (path.includes('.test.') || path.includes('.spec.') || path.includes('__tests__')) {
      return 'Test file';
    }
    if (path.includes('node_modules')) {
      return 'Dependency';
    }
    if (ext === 'md' || path.includes('docs/') || path.includes('documentation/')) {
      return 'Documentation';
    }
    if (ext === 'json' && !path.includes('package.json') && !path.includes('tsconfig.json')) {
      return 'Data file';
    }
    if (path.includes('dist/') || path.includes('build/') || path.includes('coverage/')) {
      return 'Build output';
    }

    return 'Large file';
  }

  /**
   * Get recommendation message based on context fit
   * @param {boolean} fitsInOne - Whether repo fits in one context
   * @param {number} chunksNeeded - Number of chunks needed
   * @param {number} utilizationActual - Actual utilization percentage
   * @returns {string} Recommendation message
   */
  static getRecommendation(fitsInOne, chunksNeeded, utilizationActual) {
    if (fitsInOne) {
      if (utilizationActual < 50) {
        return 'Plenty of room for system prompts and responses.';
      } else if (utilizationActual < 80) {
        return 'Your entire codebase fits comfortably.';
      } else if (utilizationActual <= 100) {
        return 'Repository uses most of available context.';
      } else {
        // Should not happen if fitsInOne is true, but safety check
        return 'Context limit exceeded. Enable chunking.';
      }
    } else {
      if (chunksNeeded <= 3) {
        return `Repository requires ${chunksNeeded} chunks. Enable chunking with --chunk flag.`;
      } else if (chunksNeeded <= 10) {
        return `Large repository needs ${chunksNeeded} chunks. Consider filtering with .contextinclude.`;
      } else {
        return `Very large repository (${chunksNeeded} chunks). Strongly recommend filtering to key files.`;
      }
    }
  }

  /**
   * List all available LLM profiles
   * @returns {string[]} Array of model identifiers
   */
  static listProfiles() {
    const allProfiles = this.getAllProfiles();
    return Object.keys(allProfiles);
  }

  /**
   * Get human-readable list of models with details
   * @param {object} [options]
   * @param {boolean} [options.includeRetired=false] - Also list models the provider has retired
   * @returns {object[]} Array of model details
   */
  static getModelList({ includeRetired = false } = {}) {
    const allProfiles = this.getAllProfiles();
    return Object.entries(allProfiles)
      .filter(([, profile]) => includeRetired || profile.status !== 'retired')
      .map(([key, profile]) => ({
        id: key,
        name: profile.name,
        vendor: profile.vendor,
        contextWindow: profile.contextWindow,
        outputWindow: profile.outputWindow,
        preferredFormat: profile.preferredFormat,
        status: profile.status || 'active',
        pricing: profile.pricing || null,
      }));
  }

  /**
   * Date the built-in model data was last checked against the providers' docs
   * @returns {string|undefined} ISO date
   */
  static getDataDate() {
    return this.loadProfiles().lastUpdated;
  }

  /**
   * Format context fit analysis for CLI display
   * @param {object} analysis - Context fit analysis
   * @returns {string} Formatted text
   */
  static formatAnalysis(analysis) {
    const lines = [];

    lines.push('');
    lines.push('📊 Context Window Analysis:');
    lines.push('════════════════════════════════════════════════════');
    lines.push(`   Target Model: ${analysis.modelName}`);
    lines.push(`   Available Context: ${analysis.contextWindow.toLocaleString()} tokens`);

    // Show actual percentage of total context window
    const percentageDisplay = analysis.percentageOfTotal.toFixed(1);
    lines.push(
      `   Your Repository: ${analysis.repoTokens.toLocaleString()} tokens (${percentageDisplay}%)`
    );
    lines.push('');

    // Warning level display with colors (using ANSI codes)
    if (analysis.warningLevel === 'overflow') {
      // Red for overflow (100%+)
      lines.push("   \x1b[31m⚠️  OVERFLOW: You've exceeded the context window!\x1b[0m");
      lines.push(
        `   Exceeds by: ${(analysis.repoTokens - analysis.contextWindow).toLocaleString()} tokens`
      );
    } else if (analysis.warningLevel === 'critical') {
      // Red for critical (90-99%)
      lines.push("   \x1b[31m⚠️  CRITICAL: You're using 90%+ of context window\x1b[0m");
    } else if (analysis.warningLevel === 'warning') {
      // Yellow for warning (80-89%)
      lines.push("   \x1b[33m⚠️  WARNING: You're using 80%+ of context window\x1b[0m");
    } else {
      // Green for OK
      lines.push('   \x1b[32m✅ Context usage is within safe limits\x1b[0m');
    }

    // Show suggestions if available
    if (analysis.suggestions && analysis.suggestions.length > 0) {
      lines.push('');
      lines.push('   💡 Consider excluding these large files:');

      const maxSuggestions = analysis.warningLevel === 'overflow' ? 5 : 3;
      const suggestionsToShow = analysis.suggestions.slice(0, maxSuggestions);

      for (const suggestion of suggestionsToShow) {
        lines.push(
          `      - ${suggestion.path} (${suggestion.tokens.toLocaleString()} tokens, ${suggestion.percentage}%)`
        );
      }

      if (analysis.suggestions.length > maxSuggestions) {
        lines.push(`      ... and ${analysis.suggestions.length - maxSuggestions} more`);
      }
    }

    lines.push('');
    lines.push(`   ${analysis.recommendation}`);
    lines.push('');

    return lines.join('\n');
  }
}
