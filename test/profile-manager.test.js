import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import ProfileManager from '../lib/utils/profile-manager.js';
import fs from 'fs';
import os from 'os';
import path from 'path';

describe('ProfileManager', () => {
  let tempDir;
  let manager;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'profile-test-'));
    manager = new ProfileManager(tempDir);
  });

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('list()', () => {
    test('returns built-in profiles', () => {
      const profiles = manager.list();

      expect(profiles.length).toBeGreaterThan(0);

      // Check for built-in profiles
      const frontend = profiles.find((p) => p.id === 'frontend-team');
      expect(frontend).toBeDefined();
      expect(frontend.name).toBe('Frontend Team Profile');
      expect(frontend.source).toBe('builtin');

      const backend = profiles.find((p) => p.id === 'backend-team');
      expect(backend).toBeDefined();
      expect(backend.name).toBe('Backend Team Profile');

      const devops = profiles.find((p) => p.id === 'devops-team');
      expect(devops).toBeDefined();
      expect(devops.name).toBe('DevOps Team Profile');

      const defaultProfile = profiles.find((p) => p.id === 'default');
      expect(defaultProfile).toBeDefined();
    });

    test('includes custom profiles when present', () => {
      // Create custom profiles directory
      const profilesDir = path.join(tempDir, '.ctxman', 'profiles');
      fs.mkdirSync(profilesDir, { recursive: true });

      // Create a custom profile
      const customProfile = {
        name: 'Custom Profile',
        description: 'A custom test profile',
        createdBy: 'test',
        createdAt: new Date().toISOString(),
        config: {
          exclude: ['**/*.test.js'],
          include: ['src/**'],
          targetModel: 'claude-sonnet-4.5',
          methodLevel: false,
        },
      };
      fs.writeFileSync(path.join(profilesDir, 'my-custom.json'), JSON.stringify(customProfile));

      const profiles = manager.list();
      const custom = profiles.find((p) => p.id === 'my-custom');

      expect(custom).toBeDefined();
      expect(custom.name).toBe('Custom Profile');
      expect(custom.source).toBe('custom');
    });
  });

  describe('get()', () => {
    test('returns built-in profile by id', () => {
      const profile = manager.get('frontend-team');

      expect(profile).toBeDefined();
      expect(profile.id).toBe('frontend-team');
      expect(profile.name).toBe('Frontend Team Profile');
      expect(profile.config).toBeDefined();
      expect(profile.config.methodLevel).toBe(true);
    });

    test('returns null for non-existent profile', () => {
      const profile = manager.get('non-existent');
      expect(profile).toBeNull();
    });

    test('returns custom profile when exists', () => {
      const profilesDir = path.join(tempDir, '.ctxman', 'profiles');
      fs.mkdirSync(profilesDir, { recursive: true });

      const customProfile = {
        name: 'Test Profile',
        description: 'Test',
        config: {
          exclude: [],
          include: ['src/**'],
          methodLevel: false,
        },
      };
      fs.writeFileSync(path.join(profilesDir, 'test-profile.json'), JSON.stringify(customProfile));

      const profile = manager.get('test-profile');

      expect(profile).toBeDefined();
      expect(profile.id).toBe('test-profile');
      expect(profile.source).toBe('custom');
    });
  });

  describe('apply()', () => {
    test('applies profile configuration', () => {
      const config = manager.apply('frontend-team');

      expect(config.profileId).toBe('frontend-team');
      expect(config.profileName).toBe('Frontend Team Profile');
      expect(config.ignorePatterns).toBeDefined();
      expect(config.includePatterns).toBeDefined();
      expect(config.targetModel).toBe('claude-sonnet-4.5');
    });

    test('merges with additional options', () => {
      const config = manager.apply('frontend-team', {
        targetModel: 'gpt-4',
        customOption: 'value',
      });

      // Options should take precedence
      expect(config.targetModel).toBe('gpt-4');
      expect(config.customOption).toBe('value');
    });

    test('throws error for non-existent profile', () => {
      expect(() => manager.apply('non-existent')).toThrow("Profile 'non-existent' not found");
    });
  });

  describe('createCustom()', () => {
    test('creates a new custom profile', () => {
      const profile = {
        name: 'New Profile',
        description: 'A new profile',
        config: {
          exclude: ['node_modules/**'],
          include: ['src/**'],
          methodLevel: false,
        },
      };

      const filePath = manager.createCustom('new-profile', profile);

      expect(fs.existsSync(filePath)).toBe(true);

      // Verify content
      const saved = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      expect(saved.name).toBe('New Profile');
      expect(saved.createdAt).toBeDefined();
    });

    test('throws error for invalid profile structure', () => {
      const invalidProfile = {
        name: 'Invalid',
        // Missing description and config
      };

      expect(() => manager.createCustom('invalid', invalidProfile)).toThrow();
    });

    test('throws error if profile already exists', () => {
      const profile = {
        name: 'Test',
        description: 'Test',
        config: { include: ['src/**'] },
      };

      manager.createCustom('test', profile);

      expect(() => manager.createCustom('test', profile)).toThrow('already exists');
    });
  });

  describe('export()', () => {
    test('exports built-in profile', () => {
      const exported = manager.export('frontend-team');

      expect(exported.name).toBe('Frontend Team Profile');
      expect(exported.description).toBeDefined();
      expect(exported.config).toBeDefined();
    });

    test('throws error for non-existent profile', () => {
      expect(() => manager.export('non-existent')).toThrow('not found');
    });
  });

  describe('deleteCustom()', () => {
    test('deletes custom profile', () => {
      // Create a profile first
      const profilesDir = path.join(tempDir, '.ctxman', 'profiles');
      fs.mkdirSync(profilesDir, { recursive: true });

      const profile = {
        name: 'To Delete',
        description: 'Test',
        config: { include: ['src/**'] },
      };
      fs.writeFileSync(path.join(profilesDir, 'delete-me.json'), JSON.stringify(profile));

      // Delete it
      const result = manager.deleteCustom('delete-me');

      expect(result).toBe(true);
      expect(manager.get('delete-me')).toBeNull();
    });

    test('returns false for non-existent profile', () => {
      expect(manager.deleteCustom('non-existent')).toBe(false);
    });

    test('throws error when trying to delete built-in profile', () => {
      expect(() => manager.deleteCustom('frontend-team')).toThrow(
        'Cannot delete built-in profiles'
      );
    });
  });

  describe('formatList()', () => {
    test('returns formatted profile list', () => {
      const formatted = manager.formatList();

      expect(formatted).toContain('Available Team Configuration Profiles');
      expect(formatted).toContain('frontend-team');
      expect(formatted).toContain('backend-team');
      expect(formatted).toContain('devops-team');
      expect(formatted).toContain('Built-in Profiles');
    });
  });
});
