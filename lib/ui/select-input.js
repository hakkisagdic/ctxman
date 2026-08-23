import React, { useState, useCallback } from 'react';
import { Box, Text, useInput, useStdin } from 'ink';

/**
 * Custom SelectInput Component for Ink 6.x
 * Replaces deprecated ink-select-input package
 * Based on official Ink examples/select-input implementation
 *
 * @param {Array} items - Array of {label, value} objects
 * @param {Function} onSelect - Callback when item is selected
 */
export default function SelectInput({ items = [], onSelect }) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const { isRawModeSupported } = useStdin();

  useInput(
    useCallback(
      (input, key) => {
        if (key.upArrow) {
          setSelectedIndex((prev) => (prev === 0 ? items.length - 1 : prev - 1));
        }

        if (key.downArrow) {
          setSelectedIndex((prev) => (prev === items.length - 1 ? 0 : prev + 1));
        }

        if (key.return) {
          if (items[selectedIndex] && onSelect) {
            onSelect(items[selectedIndex]);
          }
        }

        if (key.escape) {
          process.exit(0);
        }
      },
      [selectedIndex, items, onSelect]
    ),
    { isActive: isRawModeSupported }
  );

  // Show ALL items (no scrolling/limit) - per Ink docs
  return React.createElement(
    Box,
    { flexDirection: 'column' },
    ...items.map((item, index) => {
      const isSelected = index === selectedIndex;

      return React.createElement(
        Text,
        {
          key: item.value || item.label || index, // Use unique value as key
          color: isSelected ? 'cyan' : undefined,
        },
        `${isSelected ? '❯ ' : '  '}${item.label}`
      );
    })
  );
}
