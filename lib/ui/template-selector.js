/**
 * Template Selector UI Component
 * Interactive template selection for Ink UI
 * FEAT-009: Context Templates
 */

import React, { useState, useCallback, useMemo } from 'react';
import { Box, Text } from 'ink';
import SelectInput from './select-input.js';
import TemplateManager from '../utils/template-manager.js';

/**
 * Template Selector Component
 * Provides interactive template selection in wizard mode
 */
export default function TemplateSelector({ onSelect, projectRoot = process.cwd() }) {
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const manager = useMemo(() => new TemplateManager(projectRoot), [projectRoot]);

  // Build template items for selection
  const templateItems = useMemo(() => {
    const templates = manager.list();

    return templates.map((t) => ({
      label: `${t.name} - ${t.description}`,
      value: t.id,
      template: t,
    }));
  }, [manager]);

  const handleSelect = useCallback(
    (item) => {
      const template = manager.get(item.value);
      setSelectedTemplate(template);

      if (onSelect) {
        onSelect(template);
      }
    },
    [manager, onSelect]
  );

  if (selectedTemplate) {
    return React.createElement(
      Box,
      { flexDirection: 'column' },
      React.createElement(
        Box,
        { marginBottom: 1 },
        React.createElement(Text, { bold: true, color: 'green' }, '✓ Template Selected:'),
        React.createElement(Text, { color: 'cyan' }, ` ${selectedTemplate.name}`)
      ),
      React.createElement(
        Box,
        { flexDirection: 'column', marginBottom: 1 },
        React.createElement(
          Text,
          { dimColor: true },
          `  Description: ${selectedTemplate.description}`
        ),
        React.createElement(Text, { dimColor: true }, `  Source: ${selectedTemplate.source}`)
      )
    );
  }

  return React.createElement(
    Box,
    { flexDirection: 'column' },
    React.createElement(
      Box,
      { marginBottom: 1 },
      React.createElement(Text, null, 'Select a context template:')
    ),
    React.createElement(SelectInput, {
      items: templateItems,
      onSelect: handleSelect,
    }),
    React.createElement(
      Box,
      { marginTop: 1 },
      React.createElement(Text, { dimColor: true }, '[↑↓] Navigate  [Enter] Select  [Esc] Cancel')
    )
  );
}

/**
 * Get template choices for wizard integration
 * @param {string} projectRoot - Project root directory
 * @returns {Array} Array of template choice objects
 */
export function getTemplateChoices(projectRoot = process.cwd()) {
  const manager = new TemplateManager(projectRoot);
  const templates = manager.list();

  return templates.map((t) => ({
    label: `${t.name} - ${t.description}`,
    value: t.id,
  }));
}
