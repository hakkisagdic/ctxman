import React, { useState } from 'react';
import { Box, Text, useInput, useStdin } from 'ink';

/**
 * Live Analysis Dashboard
 * Real-time statistics and progress display
 */
export default function Dashboard({ stats, topFiles = [], status = 'analyzing' }) {
  const [shouldRefresh, setShouldRefresh] = useState(false);
  const { isRawModeSupported } = useStdin();

  // Keyboard controls
  useInput(
    (input, _key) => {
      if (input === 'r' || input === 'R') {
        setShouldRefresh(!shouldRefresh);
      }
      if (input === 'q' || input === 'Q') {
        process.exit(0);
      }
    },
    { isActive: isRawModeSupported }
  );

  const {
    totalFiles = 0,
    totalTokens = 0,
    totalBytes = 0,
    totalLines = 0,
    byExtension = {},
  } = stats;

  const avgTokensPerFile = totalFiles > 0 ? Math.round(totalTokens / totalFiles) : 0;
  const sizeInMB = (totalBytes / (1024 * 1024)).toFixed(2);

  // Get dominant language
  const extensions = Object.entries(byExtension);
  const dominant =
    extensions.length > 0 ? extensions.sort((a, b) => b[1].count - a[1].count)[0] : null;

  return React.createElement(
    Box,
    {
      flexDirection: 'column',
      padding: 1,
      borderStyle: 'round',
      borderColor: 'green',
      width: 76, // Max width to prevent scrollbar overlap (reduced from 80)
    },
    React.createElement(
      Box,
      { marginBottom: 1 },
      React.createElement(Text, { bold: true, color: 'green' }, '📊 Live Analysis Dashboard'),
      React.createElement(Text, { color: 'gray' }, ` (${status})`)
    ),

    // Summary Stats
    React.createElement(
      Box,
      { flexDirection: 'column', marginBottom: 1 },
      React.createElement(
        Box,
        null,
        React.createElement(Text, null, 'Files: '),
        React.createElement(Text, { bold: true, color: 'cyan' }, totalFiles.toLocaleString()),
        React.createElement(Text, null, '    Methods: '),
        React.createElement(Text, { bold: true, color: 'cyan' }, '-'),
        React.createElement(Text, null, '    Tokens: '),
        React.createElement(Text, { bold: true, color: 'cyan' }, totalTokens.toLocaleString())
      ),

      React.createElement(
        Box,
        null,
        React.createElement(Text, null, 'Size: '),
        React.createElement(Text, { bold: true, color: 'cyan' }, `${sizeInMB} MB`),
        React.createElement(Text, null, '    Lines: '),
        React.createElement(Text, { bold: true, color: 'cyan' }, totalLines.toLocaleString()),
        React.createElement(Text, null, '    Avg: '),
        React.createElement(
          Text,
          { bold: true, color: 'cyan' },
          `${avgTokensPerFile.toLocaleString()} tok/file`
        )
      )
    ),

    // Top Languages
    dominant &&
      React.createElement(
        Box,
        { flexDirection: 'column', marginBottom: 1 },
        React.createElement(Text, { bold: true }, 'Top Languages:'),
        React.createElement(
          Box,
          { marginLeft: 2 },
          React.createElement(Text, { color: 'green' }, '▓'.repeat(30)),
          React.createElement(Text, null, ` ${dominant[0]} (${dominant[1].count} files)`)
        )
      ),

    // Largest Files
    topFiles.length > 0 &&
      React.createElement(
        Box,
        { flexDirection: 'column', marginBottom: 1 },
        React.createElement(Text, { bold: true }, 'Largest Files:'),
        ...topFiles.slice(0, 3).map((file, index) => {
          const barLength = Math.round((file.tokens / topFiles[0].tokens) * 20);
          const percentage = ((file.tokens / totalTokens) * 100).toFixed(1);
          const fileName = (file.name || file.relativePath || file.path || 'unknown').substring(
            0,
            30
          );

          return React.createElement(
            Box,
            { key: index, marginLeft: 2 },
            React.createElement(Text, null, '• '),
            React.createElement(Text, { color: 'cyan' }, fileName),
            React.createElement(Text, null, ` ${file.tokens.toLocaleString()} tokens  `),
            React.createElement(Text, { color: 'green' }, '▓'.repeat(barLength)),
            React.createElement(Text, { color: 'gray' }, ` (${percentage}%)`)
          );
        })
      ),

    // Controls
    React.createElement(
      Box,
      {
        marginTop: 1,
        borderStyle: 'single',
        borderColor: 'gray',
        padding: 1,
      },
      React.createElement(Text, { dimColor: true }, '[R] Refresh  [S] Save  [E] Export  [Q] Quit')
    )
  );
}
