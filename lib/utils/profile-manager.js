/**
 * Profile Manager
 * Manages team configuration profiles for consistent context generation
 * FEAT-004: Team Configuration Profiles
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { DEFAULT_TARGET_MODEL } from './llm-detector.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Built-in profiles defined in code for reliability
 */
const BUILTIN_PROFILES = {
  'frontend-team': {
    name: 'Frontend Team Profile',
    description: 'Configuration for frontend developers',
    createdBy: 'ctxman',
    createdAt: new Date().toISOString(),
    config: {
      exclude: ['backend/**', 'server/**', 'api/**', '**/*.test.js', '**/*.spec.js'],
      include: [
        'src/**/*.js',
        'src/**/*.jsx',
        'src/**/*.ts',
        'src/**/*.tsx',
        'components/**',
        'pages/**',
      ],
      targetModel: DEFAULT_TARGET_MODEL,
      methodLevel: true,
      methodInclude: ['*Component', '*Hook', '*Context', '*Provider'],
    },
  },
  'backend-team': {
    name: 'Backend Team Profile',
    description: 'Configuration for backend developers',
    createdBy: 'ctxman',
    createdAt: new Date().toISOString(),
    config: {
      exclude: ['frontend/**', 'src/components/**', 'pages/**', '**/*.test.js', '**/*.spec.js'],
      include: ['api/**', 'server/**', 'lib/**', 'db/**', 'services/**'],
      targetModel: DEFAULT_TARGET_MODEL,
      methodLevel: true,
      methodInclude: ['*Controller', '*Service', '*Repository', '*Handler', '*Middleware'],
    },
  },
  'devops-team': {
    name: 'DevOps Team Profile',
    description: 'Configuration for DevOps engineers',
    createdBy: 'ctxman',
    createdAt: new Date().toISOString(),
    config: {
      exclude: ['**/*.test.js', 'src/**/*.js', 'frontend/**'],
      include: [
        '**/*.yaml',
        '**/*.yml',
        '**/Dockerfile*',
        '**/*.sh',
        'scripts/**',
        '.github/**',
        'terraform/**',
        'k8s/**',
      ],
      targetModel: DEFAULT_TARGET_MODEL,
      methodLevel: false,
    },
  },
  default: {
    name: 'Default Profile',
    description: 'Standard configuration for general development',
    createdBy: 'ctxman',
    createdAt: new Date().toISOString(),
    config: {
      exclude: ['**/*.test.js', '**/*.spec.js', 'node_modules/**', 'coverage/**'],
      include: ['src/**', 'lib/**'],
      targetModel: DEFAULT_TARGET_MODEL,
      methodLevel: false,
    },
  },
};

class ProfileManager {
  /**
   * Create a ProfileManager instance
   * @param {string} projectRoot - Project root directory
   */
  constructor(projectRoot = process.cwd()) {
    this.projectRoot = projectRoot;
    this.profilesPath = path.join(projectRoot, '.ctxman', 'profiles');
    this.builtinProfilesPath = path.join(__dirname, '..', '..', '.ctxman', 'profiles');
  }

  /**
   * List all available profiles (built-in + custom)
   * @returns {Array} Array of profile objects
   */
  list() {
    const profiles = [];

    // Add built-in profiles
    for (const [id, profile] of Object.entries(BUILTIN_PROFILES)) {
      profiles.push({
        id,
        ...profile,
        source: 'builtin',
      });
    }

    // Add custom profiles from project .ctxman/profiles/
    const customProfiles = this.loadCustomProfiles();
    profiles.push(...customProfiles);

    return profiles;
  }

  /**
   * Get a specific profile by ID
   * @param {string} profileId - Profile identifier
   * @returns {object|null} Profile object or null if not found
   */
  get(profileId) {
    // Check built-in first
    if (BUILTIN_PROFILES[profileId]) {
      return {
        id: profileId,
        ...BUILTIN_PROFILES[profileId],
        source: 'builtin',
      };
    }

    // Check custom profiles
    const customProfiles = this.loadCustomProfiles();
    const custom = customProfiles.find((p) => p.id === profileId);
    if (custom) {
      return custom;
    }

    return null;
  }

  /**
   * Load custom profiles from .ctxman/profiles/
   * @returns {Array} Array of custom profile objects
   */
  loadCustomProfiles() {
    const profiles = [];

    try {
      if (!fs.existsSync(this.profilesPath)) {
        return profiles;
      }

      const files = fs.readdirSync(this.profilesPath);

      for (const file of files) {
        if (!file.endsWith('.json')) {
          continue;
        }

        const filePath = path.join(this.profilesPath, file);

        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          const profile = JSON.parse(content);
          const id = path.basename(file, '.json');

          // Skip if already defined as built-in (built-ins take precedence)
          if (BUILTIN_PROFILES[id]) {
            continue;
          }

          profiles.push({
            id,
            ...profile,
            source: 'custom',
          });
        } catch (parseError) {
          console.error(`Warning: Failed to parse profile ${file}: ${parseError.message}`);
        }
      }
    } catch (error) {
      console.error(`Warning: Failed to load custom profiles: ${error.message}`);
    }

    return profiles;
  }

  /**
   * Apply a profile and get configuration options
   * @param {string} profileId - Profile identifier
   * @param {object} options - Additional options to merge
   * @returns {object} Merged configuration options
   */
  apply(profileId, options = {}) {
    const profile = this.get(profileId);

    if (!profile) {
      throw new Error(`Profile '${profileId}' not found`);
    }

    // Build configuration from profile
    const config = {
      profileId,
      profileName: profile.name,
      profileDescription: profile.description,
      profileSource: profile.source,
      // Convert include/exclude patterns to ignore patterns for TokenAnalyzer
      ignorePatterns: profile.config.exclude || [],
      includePatterns: profile.config.include || [],
      methodInclude: profile.config.methodInclude || [],
      methodLevel: profile.config.methodLevel || false,
      targetModel: profile.config.targetModel || options.targetModel,
      ...options,
    };

    return config;
  }

  /**
   * Create a custom profile
   * @param {string} id - Profile identifier
   * @param {object} profile - Profile configuration
   * @returns {string} Path to created profile file
   */
  createCustom(id, profile) {
    // Ensure .ctxman/profiles directory exists
    if (!fs.existsSync(this.profilesPath)) {
      fs.mkdirSync(this.profilesPath, { recursive: true });
    }

    const filePath = path.join(this.profilesPath, `${id}.json`);

    // Check if profile already exists
    if (fs.existsSync(filePath)) {
      throw new Error(`Profile '${id}' already exists`);
    }

    // Validate profile structure
    this.validateProfile(profile);

    // Add metadata
    const profileWithMeta = {
      ...profile,
      createdAt: new Date().toISOString(),
    };

    // Write profile file
    fs.writeFileSync(filePath, JSON.stringify(profileWithMeta, null, 2));

    return filePath;
  }

  /**
   * Validate profile structure
   * @param {object} profile - Profile to validate
   * @throws {Error} If profile is invalid
   */
  validateProfile(profile) {
    if (!profile.name || typeof profile.name !== 'string') {
      throw new Error('Profile must have a "name" string property');
    }

    if (!profile.description || typeof profile.description !== 'string') {
      throw new Error('Profile must have a "description" string property');
    }

    if (!profile.config || typeof profile.config !== 'object') {
      throw new Error('Profile must have a "config" object property');
    }

    if (profile.config.exclude && !Array.isArray(profile.config.exclude)) {
      throw new Error('Profile "config.exclude" must be an array');
    }

    if (profile.config.include && !Array.isArray(profile.config.include)) {
      throw new Error('Profile "config.include" must be an array');
    }

    if (profile.config.methodInclude && !Array.isArray(profile.config.methodInclude)) {
      throw new Error('Profile "config.methodInclude" must be an array');
    }
  }

  /**
   * Export a profile to JSON
   * @param {string} profileId - Profile identifier
   * @returns {object} Profile object ready for export
   */
  export(profileId) {
    const profile = this.get(profileId);

    if (!profile) {
      throw new Error(`Profile '${profileId}' not found`);
    }

    // Return clean profile object without metadata
    return {
      name: profile.name,
      description: profile.description,
      createdBy: profile.createdBy || 'unknown',
      createdAt: profile.createdAt || new Date().toISOString(),
      config: profile.config,
    };
  }

  /**
   * Delete a custom profile
   * @param {string} id - Profile identifier
   * @returns {boolean} True if deleted, false if not found
   */
  deleteCustom(id) {
    // Prevent deletion of built-in profiles
    if (BUILTIN_PROFILES[id]) {
      throw new Error('Cannot delete built-in profiles');
    }

    const filePath = path.join(this.profilesPath, `${id}.json`);

    if (!fs.existsSync(filePath)) {
      return false;
    }

    fs.unlinkSync(filePath);
    return true;
  }

  /**
   * Format profiles for display
   * @returns {string} Formatted profile list
   */
  formatList() {
    const profiles = this.list();
    const lines = [];

    lines.push('\n📋 Available Team Configuration Profiles:\n');
    lines.push('═'.repeat(70));

    // Group by source
    const builtin = profiles.filter((p) => p.source === 'builtin');
    const custom = profiles.filter((p) => p.source === 'custom');

    if (builtin.length > 0) {
      lines.push('\nBuilt-in Profiles:');
      builtin.forEach((p) => {
        lines.push(`  ${p.id.padEnd(15)} ${p.description}`);
      });
    }

    if (custom.length > 0) {
      lines.push('\nCustom Profiles:');
      custom.forEach((p) => {
        lines.push(`  ${p.id.padEnd(15)} ${p.description}`);
      });
    }

    lines.push('\n' + '═'.repeat(70));
    lines.push('\nUsage:');
    lines.push('  ctxman --profile <profile-id>');
    lines.push('  ctxman --profile frontend-team --cli');
    lines.push('\nProfile Management:');
    lines.push('  ctxman --list-profiles                List all profiles');
    lines.push('  ctxman --create-profile <name>        Create a new profile');
    lines.push('  ctxman --export-profile <name>        Export a profile to JSON');
    lines.push('\nCustom Profiles:');
    lines.push('  Add profiles to .ctxman/profiles/<name>.json');
    lines.push('');

    return lines.join('\n');
  }
}

export default ProfileManager;
export { BUILTIN_PROFILES };
