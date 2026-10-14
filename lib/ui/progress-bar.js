import React from 'react';

/**
 * Progress Bar Component for Ink Terminal UI
 * Shows analysis progress with file count and token count
 *
 * Note: Components are passed via props to avoid ESM import issues
 */
const ProgressBar = ({ current, total, tokens, maxTokens, currentFile, components }) => {
  const { Box, Text } = components || {};

  if (!Box || !Text) {
    throw new Error('Box and Text components required in props');
  }

  const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
  const barWidth = 40;
  const filled = Math.round((percentage / 100) * barWidth);
  const empty = barWidth - filled;

  const bar = '━'.repeat(filled) + '─'.repeat(empty);
  const tokenPercentage = maxTokens > 0 ? ((tokens / maxTokens) * 100).toFixed(1) : 0;

  const children = [];

  // Title
  children.push(
    React.createElement(
      Box,
      { key: 'title' },
      React.createElement(Text, { bold: true, color: 'cyan' }, '📊 Project Analysis')
    )
  );

  // Progress bar
  children.push(
    React.createElement(
      Box,
      { key: 'bar', marginTop: 1 },
      React.createElement(Text, { color: 'green' }, bar),
      React.createElement(Text, { color: 'yellow' }, ` ${percentage}%`),
      React.createElement(Text, { color: 'gray' }, ` (${current}/${total} files)`)
    )
  );

  // Current file
  if (currentFile) {
    children.push(
      React.createElement(
        Box,
        { key: 'current', marginTop: 1 },
        React.createElement(Text, { color: 'gray' }, 'Current: '),
        React.createElement(Text, null, currentFile)
      )
    );
  }

  // Tokens
  const tokenColor = tokenPercentage > 90 ? 'red' : 'green';
  const tokenChildren = [
    React.createElement(Text, { key: 't1', color: 'gray' }, 'Tokens: '),
    React.createElement(Text, { key: 't2', color: tokenColor }, tokens.toLocaleString()),
  ];

  if (maxTokens > 0) {
    tokenChildren.push(
      React.createElement(
        Text,
        { key: 't3', color: 'gray' },
        ` / ${maxTokens.toLocaleString()} (${tokenPercentage}%)`
      )
    );
  }

  children.push(React.createElement(Box, { key: 'tokens', marginTop: 1 }, ...tokenChildren));

  return React.createElement(Box, { flexDirection: 'column' }, ...children);
};

/**
 * Spinner Component with message
 */
const SpinnerWithText = ({ text, status = 'pending', components }) => {
  const { Box, Text, Spinner } = components || {};

  if (!Box || !Text) {
    throw new Error('Box and Text components required in props');
  }

  const statusIcons = {
    pending: '○',
    active: Spinner ? React.createElement(Spinner, { type: 'dots' }) : '⏳',
    complete: '✓',
    error: '✗',
  };

  const statusColors = {
    pending: 'gray',
    active: 'cyan',
    complete: 'green',
    error: 'red',
  };

  const icon =
    status === 'active' && Spinner
      ? React.createElement(Spinner, { type: 'dots' })
      : statusIcons[status];

  return React.createElement(
    Box,
    null,
    React.createElement(Text, { color: statusColors[status] }, icon, ' ', text)
  );
};

export { ProgressBar, SpinnerWithText };
