/**
 * Init Wizard UI
 * Interactive Ink-based UI for configuration initialization
 * FEAT-001: Configuration Wizard
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { Box, Text } from 'ink';
import SelectInput from './select-input.js';
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';
import ProjectDetector from '../wizards/project-detector.js';
import ConfigGenerator from '../wizards/config-generator.js';

/**
 * Init Wizard Component
 */
export default function InitWizardUI({ options = {}, onComplete }) {
  const [step, setStep] = useState('detecting');
  const [detectedProjects, setDetectedProjects] = useState([]);
  const [selectedProjects, setSelectedProjects] = useState([]);
  const [config, setConfig] = useState(null);
  const [editingType, setEditingType] = useState(null);
  const [customPatterns, setCustomPatterns] = useState({
    contextignore: [],
    contextinclude: [],
    methodinclude: [],
  });
  const [newPattern, setNewPattern] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const detector = useMemo(() => new ProjectDetector(), []);
  const generator = useMemo(() => new ConfigGenerator(), []);

  // Check existing config on mount
  const existingConfig = useMemo(() => generator.checkExisting(), [generator]);

  // Run project detection on mount
  useEffect(() => {
    const runDetection = async () => {
      try {
        const projects = await detector.detect();
        setDetectedProjects(projects);

        if (projects.length > 0) {
          // Auto-select top project
          const topProject = projects[0];
          setSelectedProjects([topProject.type]);
          setConfig(detector.getMergedConfig([topProject.type]));
        }

        // If --yes flag, skip to generation
        if (options.yes || options.minimal) {
          handleGenerate({ minimal: options.minimal });
        } else {
          setStep(projects.length > 0 ? 'confirm' : 'manual');
        }
      } catch (err) {
        setError(err.message);
        setStep('error');
      }
    };

    runDetection();
  }, []);

  /**
   * Handle project selection
   */
  const handleProjectSelect = useCallback(
    (item) => {
      if (item.value === 'manual') {
        setStep('manual');
        return;
      }

      setSelectedProjects([item.value]);
      setConfig(detector.getMergedConfig([item.value]));
      setStep('preview');
    },
    [detector]
  );

  /**
   * Handle customization
   */
  const handleCustomize = useCallback(() => {
    setStep('customize-menu');
  }, []);

  /**
   * Handle edit pattern type selection
   */
  const handleEditTypeSelect = useCallback(
    (item) => {
      setEditingType(item.value);
      setCustomPatterns(config[item.value] || []);
      setStep('edit-patterns');
    },
    [config]
  );

  /**
   * Handle add pattern
   */
  const handleAddPattern = useCallback(() => {
    if (newPattern.trim()) {
      setCustomPatterns((prev) => [...prev, newPattern.trim()]);
      setNewPattern('');
    }
  }, [newPattern]);

  /**
   * Handle remove pattern
   */
  const handleRemovePattern = useCallback((index) => {
    setCustomPatterns((prev) => prev.filter((_, i) => i !== index));
  }, []);

  /**
   * Handle save patterns
   */
  const handleSavePatterns = useCallback(() => {
    setConfig((prev) => ({
      ...prev,
      [editingType]: customPatterns,
    }));
    setEditingType(null);
    setStep('preview');
  }, [editingType, customPatterns]);

  /**
   * Handle generation
   */
  const handleGenerate = useCallback(
    (genOptions = {}) => {
      setStep('generating');

      try {
        const configToUse = genOptions.minimal
          ? {
              contextignore: ['node_modules/', '.git/', 'dist/', 'build/', 'coverage/'],
              contextinclude: ['src/**', 'lib/**'],
              methodinclude: [],
            }
          : config;

        const genResult = generator.generate(configToUse, {
          force: options.force,
          minimal: genOptions.minimal,
        });

        setResult(genResult);
        setStep('complete');
      } catch (err) {
        setError(err.message);
        setStep('error');
      }
    },
    [config, generator, options.force]
  );

  /**
   * Handle completion
   */
  const handleComplete = useCallback(() => {
    if (onComplete) {
      onComplete(result);
    }
  }, [result, onComplete]);

  // Build UI based on step
  const children = [];

  // Title
  children.push(
    React.createElement(
      Box,
      { key: 'title', marginBottom: 1 },
      React.createElement(Text, { bold: true, color: 'cyan' }, '🧙 Ctxman Configuration Wizard')
    )
  );

  // Detecting step
  if (step === 'detecting') {
    children.push(
      React.createElement(
        Box,
        { key: 'detecting', flexDirection: 'column' },
        React.createElement(
          Box,
          { key: 'spinner-box' },
          React.createElement(Spinner, { type: 'dots' }),
          React.createElement(Text, null, ' Detecting project type...')
        )
      )
    );
  }

  // Confirm detected projects step
  if (step === 'confirm') {
    const topProject = detectedProjects[0];

    children.push(
      React.createElement(
        Box,
        { key: 'detected', flexDirection: 'column', marginBottom: 1 },
        React.createElement(Text, { bold: true, color: 'green' }, '✓ Detected project type:'),
        React.createElement(Text, { key: 'type', color: 'yellow' }, `  ${topProject.name}`),
        topProject.evidence.length > 0 &&
          React.createElement(
            Box,
            { key: 'evidence', flexDirection: 'column', marginTop: 1 },
            React.createElement(Text, { dimColor: true }, '  Evidence:'),
            ...topProject.evidence
              .slice(0, 3)
              .map((e, i) =>
                React.createElement(Text, { key: `evidence-${i}`, dimColor: true }, `    • ${e}`)
              )
          )
      )
    );

    const confirmItems = [
      { label: '✓ Use recommended configuration', value: 'accept' },
      { label: '⚙️  Customize patterns', value: 'customize' },
      { label: '📋 Select different project type', value: 'select' },
    ];

    children.push(
      React.createElement(
        Box,
        { key: 'confirm-menu', flexDirection: 'column' },
        React.createElement(Text, null, 'What would you like to do?'),
        React.createElement(SelectInput, {
          items: confirmItems,
          onSelect: (item) => {
            if (item.value === 'accept') {
              setStep('preview');
            } else if (item.value === 'customize') {
              handleCustomize();
            } else {
              setStep('select');
            }
          },
        })
      )
    );
  }

  // Select project type step
  if (step === 'select') {
    const projectItems = detectedProjects.map((p) => ({
      label: `${p.name} (score: ${p.score})`,
      value: p.type,
    }));

    projectItems.push({ label: '⚙️  Manual configuration', value: 'manual' });

    children.push(
      React.createElement(
        Box,
        { key: 'select', flexDirection: 'column' },
        React.createElement(Text, null, 'Select project type:'),
        React.createElement(SelectInput, {
          items: projectItems,
          onSelect: handleProjectSelect,
        })
      )
    );
  }

  // Manual configuration step
  if (step === 'manual') {
    const projectItems = [
      { label: 'Node.js', value: 'nodejs' },
      { label: 'TypeScript', value: 'typescript' },
      { label: 'React', value: 'react' },
      { label: 'Next.js', value: 'nextjs' },
      { label: 'Python', value: 'python' },
      { label: 'Rust', value: 'rust' },
      { label: 'Go', value: 'go' },
      { label: 'Java', value: 'java' },
      { label: 'Custom (empty)', value: 'custom' },
    ];

    children.push(
      React.createElement(
        Box,
        { key: 'manual', flexDirection: 'column' },
        React.createElement(Text, { color: 'yellow' }, '⚠️  Could not auto-detect project type'),
        React.createElement(Text, null, 'Select a project type:'),
        React.createElement(SelectInput, {
          items: projectItems,
          onSelect: handleProjectSelect,
        })
      )
    );
  }

  // Preview step
  if (step === 'preview') {
    // Check for existing files
    const hasExisting = existingConfig.contextignore || existingConfig.contextinclude;

    children.push(
      React.createElement(
        Box,
        { key: 'preview', flexDirection: 'column' },
        React.createElement(Text, { bold: true }, '📝 Configuration Preview:'),
        React.createElement(
          Box,
          { key: 'preview-content', flexDirection: 'column', marginTop: 1 },
          React.createElement(Text, { key: 'ignore-label', color: 'cyan' }, '.contextignore:'),
          ...(config?.contextignore?.slice(0, 10) || []).map((p, i) =>
            React.createElement(Text, { key: `ignore-${i}`, dimColor: true }, `  ${p}`)
          ),
          config?.contextignore?.length > 10 &&
            React.createElement(
              Text,
              { dimColor: true },
              `  ... and ${config.contextignore.length - 10} more`
            ),

          React.createElement(
            Text,
            { key: 'include-label', color: 'cyan', marginTop: 1 },
            '.contextinclude:'
          ),
          ...(config?.contextinclude || []).map((p, i) =>
            React.createElement(Text, { key: `include-${i}`, dimColor: true }, `  ${p}`)
          )
        )
      )
    );

    if (hasExisting && !options.force) {
      children.push(
        React.createElement(
          Box,
          { key: 'warning', marginTop: 1 },
          React.createElement(
            Text,
            { color: 'yellow' },
            '⚠️  Some config files already exist. Use --force to overwrite.'
          )
        )
      );
    }

    const actionItems = [
      { label: '✓ Generate configuration files', value: 'generate' },
      { label: '⚙️  Customize patterns', value: 'customize' },
      { label: '✗ Cancel', value: 'cancel' },
    ];

    children.push(
      React.createElement(
        Box,
        { key: 'actions', flexDirection: 'column', marginTop: 1 },
        React.createElement(SelectInput, {
          items: actionItems,
          onSelect: (item) => {
            if (item.value === 'generate') {
              handleGenerate();
            } else if (item.value === 'customize') {
              handleCustomize();
            } else {
              process.exit(0);
            }
          },
        })
      )
    );
  }

  // Customize menu step
  if (step === 'customize-menu') {
    const customizeItems = [
      { label: 'Edit .contextignore (exclude patterns)', value: 'contextignore' },
      { label: 'Edit .contextinclude (include patterns)', value: 'contextinclude' },
      { label: 'Edit .methodinclude (method patterns)', value: 'methodinclude' },
      { label: '← Back', value: 'back' },
    ];

    children.push(
      React.createElement(
        Box,
        { key: 'customize', flexDirection: 'column' },
        React.createElement(Text, null, 'What would you like to customize?'),
        React.createElement(SelectInput, {
          items: customizeItems,
          onSelect: (item) => {
            if (item.value === 'back') {
              setStep('preview');
            } else {
              handleEditTypeSelect(item);
            }
          },
        })
      )
    );
  }

  // Edit patterns step
  if (step === 'edit-patterns') {
    const fileName =
      editingType === 'contextignore'
        ? '.contextignore'
        : editingType === 'contextinclude'
          ? '.contextinclude'
          : '.methodinclude';

    children.push(
      React.createElement(
        Box,
        { key: 'edit', flexDirection: 'column' },
        React.createElement(Text, { bold: true }, `Editing ${fileName}:`),
        React.createElement(
          Box,
          { key: 'patterns-list', flexDirection: 'column', marginTop: 1 },
          ...customPatterns.map((p, i) =>
            React.createElement(Text, { key: `pattern-${i}`, dimColor: true }, `  ${i + 1}. ${p}`)
          )
        ),
        React.createElement(
          Box,
          { key: 'input', marginTop: 1 },
          React.createElement(Text, null, 'Add pattern: '),
          React.createElement(TextInput, {
            value: newPattern,
            onChange: setNewPattern,
            onSubmit: handleAddPattern,
            placeholder: 'e.g., **/*.test.js',
          })
        ),
        React.createElement(
          Box,
          { key: 'actions', marginTop: 1 },
          React.createElement(SelectInput, {
            items: [
              { label: '✓ Save', value: 'save' },
              { label: '+ Add another pattern', value: 'add' },
              { label: '← Cancel', value: 'cancel' },
            ],
            onSelect: (item) => {
              if (item.value === 'save') {
                handleSavePatterns();
              } else if (item.value === 'add') {
                // Focus input - handled by TextInput
              } else {
                setStep('customize-menu');
              }
            },
          })
        )
      )
    );
  }

  // Generating step
  if (step === 'generating') {
    children.push(
      React.createElement(
        Box,
        { key: 'generating', flexDirection: 'column' },
        React.createElement(
          Box,
          null,
          React.createElement(Spinner, { type: 'dots' }),
          React.createElement(Text, null, ' Generating configuration files...')
        )
      )
    );
  }

  // Complete step
  if (step === 'complete' && result) {
    children.push(
      React.createElement(
        Box,
        { key: 'complete', flexDirection: 'column' },
        React.createElement(Text, { bold: true, color: 'green' }, '✅ Configuration complete!'),
        React.createElement(
          Box,
          { key: 'files', flexDirection: 'column', marginTop: 1 },
          result.created.map((f) =>
            React.createElement(
              Text,
              { key: `created-${f.filename}`, color: 'green' },
              `  ✓ Created ${f.filename}`
            )
          ),
          result.overwritten.map((f) =>
            React.createElement(
              Text,
              { key: `overwritten-${f.filename}`, color: 'yellow' },
              `  ✓ Updated ${f.filename}`
            )
          ),
          result.skipped.map((f) =>
            React.createElement(
              Text,
              { key: `skipped-${f.filename}`, color: 'gray' },
              `  ⊘ Skipped ${f.filename} (${f.reason})`
            )
          )
        ),
        React.createElement(
          Box,
          { key: 'next', marginTop: 1 },
          React.createElement(Text, { dimColor: true }, 'Try: ctxman --cli')
        ),
        React.createElement(
          Box,
          { key: 'done', marginTop: 1 },
          React.createElement(SelectInput, {
            items: [{ label: '✓ Done', value: 'done' }],
            onSelect: handleComplete,
          })
        )
      )
    );
  }

  // Error step
  if (step === 'error') {
    children.push(
      React.createElement(
        Box,
        { key: 'error', flexDirection: 'column' },
        React.createElement(Text, { bold: true, color: 'red' }, '❌ Error'),
        React.createElement(Text, { color: 'red' }, error)
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
