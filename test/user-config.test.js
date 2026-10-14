import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import ConfigUtils from '../lib/utils/config-utils.js';
import { LLMDetector } from '../lib/utils/llm-detector.js';

describe('user config (~/.ctxman/config.json)', () => {
  let home;
  let savedHome;
  let savedProfile;

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-home-'));
    savedHome = process.env.HOME;
    savedProfile = process.env.USERPROFILE;
    process.env.HOME = home;
    process.env.USERPROFILE = home;
  });

  afterEach(() => {
    process.env.HOME = savedHome;
    process.env.USERPROFILE = savedProfile;
    fs.rmSync(home, { recursive: true, force: true });
  });

  const writeConfig = (content) => {
    fs.mkdirSync(path.join(home, '.ctxman'), { recursive: true });
    fs.writeFileSync(path.join(home, '.ctxman', 'config.json'), content);
  };

  it('returns null when there is no config', () => {
    expect(ConfigUtils.loadUserConfig()).toBeNull();
  });

  it('returns null for invalid JSON', () => {
    writeConfig('{ not json');
    expect(ConfigUtils.loadUserConfig()).toBeNull();
  });

  it('lets LLMDetector pick the target model from the config', () => {
    writeConfig(JSON.stringify({ targetModel: 'claude-sonnet-4.5' }));

    expect(ConfigUtils.loadUserConfig()).toEqual({ targetModel: 'claude-sonnet-4.5' });
    expect(LLMDetector.detectFromConfig()).toBe('claude-sonnet-4.5');
  });
});
