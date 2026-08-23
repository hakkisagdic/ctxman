import React, { useState, useCallback, useMemo } from 'react';
import { Box, Text } from 'ink';
import SelectInput from './select-input.js';
import { LLMDetector } from '../utils/llm-detector.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Interactive Configuration Wizard
 * Guides users through context generation setup
 * v2.3.8 - Use case templates with configuration copying
 */

/**
 * Discover available wizard profiles from .ctxman/wizard-profiles/
 */
function discoverProfiles() {
  const profilesDir = path.join(__dirname, '../../.ctxman/wizard-profiles');
  const profiles = [];

  try {
    if (fs.existsSync(profilesDir)) {
      const dirs = fs.readdirSync(profilesDir, { withFileTypes: true });

      dirs.forEach((dirent) => {
        if (dirent.isDirectory()) {
          const profilePath = path.join(profilesDir, dirent.name);
          const metadataPath = path.join(profilePath, 'profile.json');

          if (fs.existsSync(metadataPath)) {
            try {
              const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
              profiles.push({
                label: `${metadata.icon} ${metadata.name}`,
                value: metadata.id,
                path: profilePath,
                metadata: metadata,
              });
            } catch (error) {
              console.error(`Error reading profile metadata ${dirent.name}:`, error);
            }
          }
        }
      });
    }
  } catch (error) {
    console.error('Error discovering profiles:', error);
  }

  // Add custom option at the end
  profiles.push({
    label: '⚙️  Custom (use existing root config)',
    value: 'custom',
    path: null,
    metadata: null,
  });

  return profiles;
}

/**
 * Copy profile configuration files to project root with profile name suffix
 */
function copyProfileFiles(profilePath, profileId, projectRoot) {
  const filesToCopy = ['.contextinclude', '.contextignore', '.methodinclude', '.methodignore'];
  const copiedFiles = [];

  filesToCopy.forEach((fileName) => {
    const sourcePath = path.join(profilePath, fileName);
    // Copy with profile name suffix: .contextinclude-code-review
    const destFileName = `${fileName}-${profileId}`;
    const destPath = path.join(projectRoot, destFileName);

    if (fs.existsSync(sourcePath)) {
      try {
        fs.copyFileSync(sourcePath, destPath);
        copiedFiles.push(destFileName);
      } catch (error) {
        console.error(`Error copying ${fileName}:`, error);
      }
    }
  });

  // Create/update symlinks for active config
  // .contextinclude -> .contextinclude-code-review
  const symlinkFiles = [
    ['.contextinclude', `.contextinclude-${profileId}`],
    ['.contextignore', `.contextignore-${profileId}`],
    ['.methodinclude', `.methodinclude-${profileId}`],
    ['.methodignore', `.methodignore-${profileId}`],
  ];

  symlinkFiles.forEach(([linkName, targetName]) => {
    const linkPath = path.join(projectRoot, linkName);
    const targetPath = path.join(projectRoot, targetName);

    try {
      // Remove existing symlink/file
      if (fs.existsSync(linkPath)) {
        fs.unlinkSync(linkPath);
      }

      // Create copy instead of symlink for better compatibility
      if (fs.existsSync(targetPath)) {
        fs.copyFileSync(targetPath, linkPath);
      }
    } catch (error) {
      console.error(`Error creating link ${linkName}:`, error);
    }
  });

  return copiedFiles;
}

export default function Wizard({ onComplete }) {
  const [step, setStep] = useState('profile');
  const [answers, setAnswers] = useState({});

  // Dynamic profile discovery
  const profileItems = useMemo(() => discoverProfiles(), []);

  // Dynamic LLM model list from JSON config
  const targetModelItems = useMemo(() => {
    const models = LLMDetector.getModelList();
    const items = [{ label: '✨ Auto-detect from environment', value: 'auto' }];

    // Add models grouped by vendor
    const anthropicModels = models.filter((m) => m.vendor === 'Anthropic');
    const openaiModels = models.filter((m) => m.vendor === 'OpenAI');
    const googleModels = models.filter((m) => m.vendor === 'Google');
    const otherModels = models.filter((m) => !['Anthropic', 'OpenAI', 'Google'].includes(m.vendor));

    // Anthropic (Claude)
    anthropicModels.forEach((model) => {
      const contextK = Math.floor(model.contextWindow / 1000);
      items.push({
        label: `${model.name} (${contextK}k context)`,
        value: model.id,
      });
    });

    // OpenAI (GPT-4)
    openaiModels.forEach((model) => {
      const contextK = Math.floor(model.contextWindow / 1000);
      items.push({
        label: `${model.name} (${contextK}k context)`,
        value: model.id,
      });
    });

    // Google (Gemini)
    googleModels.forEach((model) => {
      const contextK =
        model.contextWindow >= 1000000
          ? Math.floor(model.contextWindow / 1000000) + 'M'
          : Math.floor(model.contextWindow / 1000) + 'k';
      items.push({
        label: `${model.name} (${contextK} context)`,
        value: model.id,
      });
    });

    // Others
    otherModels.forEach((model) => {
      const contextK = Math.floor(model.contextWindow / 1000);
      items.push({
        label: `${model.name} (${contextK}k context)`,
        value: model.id,
      });
    });

    return items;
  }, []);

  const outputFormatItems = [
    { label: 'TOON (most efficient, 40-50% reduction)', value: 'toon' },
    { label: 'JSON (standard format)', value: 'json' },
    { label: 'GitIngest (single file)', value: 'gitingest' },
    { label: 'Markdown (documentation)', value: 'markdown' },
    { label: 'YAML (human-readable)', value: 'yaml' },
    { label: 'CSV (spreadsheet)', value: 'csv' },
  ];

  const handleProfileSelect = useCallback((item) => {
    // Copy profile files if not custom
    if (item.value !== 'custom' && item.path) {
      const projectRoot = process.cwd();
      const copiedFiles = copyProfileFiles(item.path, item.value, projectRoot);

      setAnswers((prev) => ({
        ...prev,
        profile: item.value,
        copiedFiles: copiedFiles,
        profileMetadata: item.metadata,
      }));
    } else {
      // Custom - use existing root config files
      setAnswers((prev) => ({
        ...prev,
        profile: 'custom',
        copiedFiles: [],
        profileMetadata: null,
      }));
    }

    setStep('target-model');
  }, []);

  const handleTargetModelSelect = useCallback((item) => {
    let selectedModel = item.value;

    // Handle auto-detect
    if (selectedModel === 'auto') {
      selectedModel = LLMDetector.detect();
      if (selectedModel === 'unknown') {
        // Fallback to default if detection fails
        selectedModel = 'claude-sonnet-4.5';
      }
    }

    setAnswers((prev) => ({ ...prev, targetModel: selectedModel }));
    setStep('output-format');
  }, []);

  const handleOutputFormatSelect = useCallback(
    (item) => {
      const finalAnswers = { ...answers, outputFormat: item.value };
      setAnswers(finalAnswers);
      setStep('complete');

      // Call completion callback
      if (onComplete) {
        onComplete(finalAnswers);
      }
    },
    [answers, onComplete]
  );

  // Build children array and filter out falsy values
  const children = [
    React.createElement(
      Box,
      { key: 'title', marginBottom: 1 },
      React.createElement(Text, { bold: true, color: 'cyan' }, '🧙 Context Generation Wizard')
    ),
  ];

  // Step 1: Profile Selection
  if (step === 'profile') {
    children.push(
      React.createElement(
        Box,
        { key: 'profile-step', flexDirection: 'column' },
        React.createElement(
          Box,
          { key: 'question-box', marginBottom: 1 },
          React.createElement(Text, null, 'Select analysis profile:')
        ),
        React.createElement(SelectInput, {
          key: 'select-input',
          items: profileItems,
          onSelect: handleProfileSelect,
        }),
        React.createElement(
          Box,
          { key: 'help-box', marginTop: 1 },
          React.createElement(
            Text,
            { dimColor: true },
            '[↑↓] Navigate  [Enter] Select  [Esc] Cancel'
          )
        )
      )
    );
  }

  // Step 2: Target Model
  if (step === 'target-model') {
    children.push(
      React.createElement(
        Box,
        { key: 'target-model-step', flexDirection: 'column' },
        React.createElement(
          Box,
          { key: 'question-box-2', marginBottom: 1 },
          React.createElement(Text, null, 'Target LLM?')
        ),
        React.createElement(SelectInput, {
          key: 'select-input-2',
          items: targetModelItems,
          onSelect: handleTargetModelSelect,
        }),
        React.createElement(
          Box,
          { key: 'help-box-2', marginTop: 1 },
          React.createElement(
            Text,
            { dimColor: true },
            '[↑↓] Navigate  [Enter] Select  [Esc] Cancel'
          )
        )
      )
    );
  }

  // Step 3: Output Format
  if (step === 'output-format') {
    children.push(
      React.createElement(
        Box,
        { key: 'output-format-step', flexDirection: 'column' },
        React.createElement(
          Box,
          { key: 'question-box-3', marginBottom: 1 },
          React.createElement(Text, null, 'Output format?')
        ),
        React.createElement(SelectInput, {
          key: 'select-input-3',
          items: outputFormatItems,
          onSelect: handleOutputFormatSelect,
        }),
        React.createElement(
          Box,
          { key: 'help-box-3', marginTop: 1 },
          React.createElement(
            Text,
            { dimColor: true },
            '[↑↓] Navigate  [Enter] Select  [Esc] Cancel'
          )
        )
      )
    );
  }

  // Complete
  if (step === 'complete') {
    const completeBoxChildren = [
      React.createElement(
        Box,
        { key: 'complete-title', marginBottom: 1 },
        React.createElement(Text, { bold: true, color: 'green' }, '✓ Configuration Complete!')
      ),
      React.createElement(
        Box,
        { key: 'complete-info', flexDirection: 'column', marginBottom: 1 },
        React.createElement(Text, null, `Profile: ${answers.profile}`),
        React.createElement(Text, null, `Target Model: ${answers.targetModel}`),
        React.createElement(Text, null, `Output Format: ${answers.outputFormat}`)
      ),
    ];

    // Show copied files if any
    if (answers.copiedFiles && answers.copiedFiles.length > 0) {
      completeBoxChildren.push(
        React.createElement(
          Box,
          { key: 'copied-files', flexDirection: 'column', marginTop: 1 },
          React.createElement(Text, { color: 'cyan' }, 'Profile configuration files:'),
          ...answers.copiedFiles
            .slice(0, 4)
            .map((file, idx) =>
              React.createElement(Text, { key: `file-${idx}`, color: 'gray' }, `  ✓ ${file}`)
            )
        )
      );

      completeBoxChildren.push(
        React.createElement(
          Box,
          { key: 'active-files', flexDirection: 'column', marginTop: 1 },
          React.createElement(Text, { color: 'green' }, 'Active configuration (symlinked):'),
          React.createElement(Text, { color: 'gray' }, '  → .contextinclude'),
          React.createElement(Text, { color: 'gray' }, '  → .contextignore'),
          React.createElement(Text, { color: 'gray' }, '  → .methodinclude'),
          React.createElement(Text, { color: 'gray' }, '  → .methodignore')
        )
      );
    }

    children.push(
      React.createElement(
        Box,
        { key: 'complete-step', flexDirection: 'column' },
        ...completeBoxChildren
      )
    );
  }

  return React.createElement(
    Box,
    {
      flexDirection: 'column',
      padding: 1,
      borderStyle: 'round',
      borderColor: 'cyan',
      width: 76,
    },
    ...children
  );
}
