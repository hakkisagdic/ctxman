import { describe, test, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const PROJECT_ROOT = process.cwd();
const PROFILES_DIR = path.join(PROJECT_ROOT, '.ctxman/wizard-profiles');
const EXAMPLES_DIR = path.join(PROJECT_ROOT, 'examples/wizard-profiles');

describe('Wizard Profiles System', () => {
  test('.ctxman/wizard-profiles directory exists', () => {
    expect(fs.existsSync(PROFILES_DIR)).toBe(true);
  });

  test('All 6 wizard profiles exist', () => {
    const expectedProfiles = [
      'code-review',
      'security-audit',
      'llm-explain',
      'documentation',
      'minimal',
      'full',
    ];

    expectedProfiles.forEach((profile) => {
      const profilePath = path.join(PROFILES_DIR, profile);
      expect(fs.existsSync(profilePath), `Profile '${profile}' not found`).toBe(true);
    });
  });

  test('Each profile has 5 required files', () => {
    const profiles = fs.readdirSync(PROFILES_DIR);
    const requiredFiles = [
      'profile.json',
      '.contextinclude',
      '.contextignore',
      '.methodinclude',
      '.methodignore',
    ];

    profiles.forEach((profile) => {
      const profilePath = path.join(PROFILES_DIR, profile);
      if (!fs.statSync(profilePath).isDirectory()) return;

      requiredFiles.forEach((file) => {
        const filePath = path.join(profilePath, file);
        expect(fs.existsSync(filePath), `${profile}/${file} not found`).toBe(true);
      });
    });
  });

  test('profile.json files are valid with required fields', () => {
    const profiles = fs.readdirSync(PROFILES_DIR);
    const requiredFields = [
      'id',
      'name',
      'icon',
      'description',
      'tokenBudget',
      'includes',
      'excludes',
      'bestFor',
    ];

    profiles.forEach((profile) => {
      const profilePath = path.join(PROFILES_DIR, profile);
      if (!fs.statSync(profilePath).isDirectory()) return;

      const metadataPath = path.join(profilePath, 'profile.json');
      const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));

      requiredFields.forEach((field) => {
        expect(metadata).toHaveProperty(field);
      });

      expect(metadata.id).toBe(profile);
    });
  });

  test('All filter files have content', () => {
    const profiles = fs.readdirSync(PROFILES_DIR);
    const filterFiles = ['.contextinclude', '.methodinclude'];

    profiles.forEach((profile) => {
      const profilePath = path.join(PROFILES_DIR, profile);
      if (!fs.statSync(profilePath).isDirectory()) return;

      filterFiles.forEach((file) => {
        const filePath = path.join(profilePath, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content
          .split('\n')
          .filter((line) => line.trim() && !line.trim().startsWith('#'));
        expect(lines.length, `${profile}/${file} has no filter patterns`).toBeGreaterThan(0);
      });
    });
  });

  test('examples/wizard-profiles backup exists', () => {
    expect(fs.existsSync(EXAMPLES_DIR)).toBe(true);

    const expectedProfiles = [
      'code-review',
      'security-audit',
      'llm-explain',
      'documentation',
      'minimal',
      'full',
    ];
    expectedProfiles.forEach((profile) => {
      const profilePath = path.join(EXAMPLES_DIR, profile);
      expect(fs.existsSync(profilePath), `examples/wizard-profiles/${profile} not found`).toBe(
        true
      );
    });
  });

  test('examples/README.md documents profiles', () => {
    const readmePath = path.join(PROJECT_ROOT, 'examples/README.md');
    expect(fs.existsSync(readmePath)).toBe(true);

    const content = fs.readFileSync(readmePath, 'utf-8');
    const requiredSections = [
      'Wizard Profiles',
      'Active vs Reference Profiles',
      'Creating Custom Profiles',
      'Profile Switching Workflow',
    ];

    requiredSections.forEach((section) => {
      expect(content).toContain(section);
    });
  });

  test('custom-llm-profiles.example.json in examples/', () => {
    const examplePath = path.join(PROJECT_ROOT, 'examples/custom-llm-profiles.example.json');
    expect(fs.existsSync(examplePath)).toBe(true);
    JSON.parse(fs.readFileSync(examplePath, 'utf-8'));
  });

  test('wizard.js has profile functions', () => {
    const wizardPath = path.join(PROJECT_ROOT, 'lib/ui/wizard.js');
    const content = fs.readFileSync(wizardPath, 'utf-8');

    const requiredFunctions = ['function discoverProfiles()', 'function copyProfileFiles('];

    requiredFunctions.forEach((func) => {
      expect(content).toContain(func);
    });
  });

  test('wizard.js initial step is profile', () => {
    const wizardPath = path.join(PROJECT_ROOT, 'lib/ui/wizard.js');
    const content = fs.readFileSync(wizardPath, 'utf-8');
    expect(content).toContain("useState('profile')");
  });

  test('package.json includes both directories', () => {
    const packagePath = path.join(PROJECT_ROOT, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));

    expect(pkg.files).toContain('.ctxman/');
    expect(pkg.files).toContain('examples/');
  });

  test('.gitignore ignores named configs', () => {
    const gitignorePath = path.join(PROJECT_ROOT, '.gitignore');
    const content = fs.readFileSync(gitignorePath, 'utf-8');

    const requiredPatterns = [
      '.contextinclude-*',
      '.contextignore-*',
      '.methodinclude-*',
      '.methodignore-*',
    ];

    requiredPatterns.forEach((pattern) => {
      expect(content).toContain(pattern);
    });
  });

  test('CHANGELOG has wizard profiles v2.3.8 entry', () => {
    const changelogPath = path.join(PROJECT_ROOT, 'docs/CHANGELOG.md');
    const content = fs.readFileSync(changelogPath, 'utf-8');

    expect(content).toContain('[2.3.8]');

    const requiredKeywords = [
      'Wizard Profiles System',
      'Named Configuration System',
      'profile.json',
      '.ctxman/wizard-profiles/',
      'examples/wizard-profiles/',
    ];

    requiredKeywords.forEach((keyword) => {
      expect(content).toContain(keyword);
    });
  });

  test('Token budgets follow consistent format', () => {
    const profiles = fs.readdirSync(PROFILES_DIR);

    profiles.forEach((profile) => {
      const profilePath = path.join(PROFILES_DIR, profile);
      if (!fs.statSync(profilePath).isDirectory()) return;

      const metadataPath = path.join(profilePath, 'profile.json');
      const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));

      expect(metadata.tokenBudget).toBeDefined();

      const requiredSizes = ['small', 'medium', 'large'];
      requiredSizes.forEach((size) => {
        expect(metadata.tokenBudget).toHaveProperty(size);
      });
    });
  });

  test('Profile icons are emoji characters', () => {
    const profiles = fs.readdirSync(PROFILES_DIR);

    profiles.forEach((profile) => {
      const profilePath = path.join(PROFILES_DIR, profile);
      if (!fs.statSync(profilePath).isDirectory()) return;

      const metadataPath = path.join(profilePath, 'profile.json');
      const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));

      expect(metadata.icon).toBeDefined();
      expect(metadata.icon.length).toBeGreaterThan(0);
      expect(metadata.icon.length).toBeLessThanOrEqual(4);
    });
  });
});
