import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import Updater from '../lib/utils/updater.js';

describe('Updater channel persistence', () => {
  let configDir;

  beforeEach(() => {
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-updater-channel-'));
    // switchChannel() checks the new channel right away; keep the test offline
    vi.spyOn(Updater.prototype, 'checkForUpdates').mockResolvedValue({ updateAvailable: false });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(configDir, { recursive: true, force: true });
  });

  it('uses the channel saved by switchChannel in a later run', async () => {
    await new Updater({ configDir }).switchChannel('insider');

    const saved = JSON.parse(fs.readFileSync(path.join(configDir, 'config.json'), 'utf8'));
    expect(saved.updateChannel).toBe('insider');
    expect(new Updater({ configDir }).channel).toBe('insider');
  });

  it('lets an explicit channel option override the saved one', async () => {
    await new Updater({ configDir }).switchChannel('insider');

    expect(new Updater({ configDir, channel: 'stable' }).channel).toBe('stable');
  });

  it('falls back to stable without a config or with an unknown saved channel', () => {
    expect(new Updater({ configDir }).channel).toBe('stable');

    fs.writeFileSync(
      path.join(configDir, 'config.json'),
      JSON.stringify({ updateChannel: 'beta' })
    );
    expect(new Updater({ configDir }).channel).toBe('stable');
  });
});
