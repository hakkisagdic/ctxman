# Ink UI Test Screen

Interactive test application for demonstrating all Ink UI components used in Ctxman.

## 🚀 Quick Start

```bash
# Run interactive test screen
npm run test:ink

# Or directly
node test/test-ink-ui.js
```

## 📋 Test Menu

The test screen provides an interactive menu with the following tests:

### 1. 🎨 Test Colors

Demonstrates all available colors and text styles:

- Color palette: red, green, yellow, blue, magenta, cyan
- Text styles: bold, italic, underline, dim, inverse

### 2. 📊 Test Progress Bar

Animated progress bar demonstration:

- Real-time progress updates (0% → 100%)
- Visual bar with filled/empty indicators
- Percentage display
- Auto-completes in ~4 seconds

### 3. 🔄 Test Spinners

Multiple spinner types:

- Dots spinner (`⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏`)
- Line spinner (`-\|/`)
- Different states: scanning, calculating, complete

### 4. 📝 Test Input

Interactive text input:

- Type your name
- See live greeting
- Demonstrates real-time input handling

### 5. 🧙 Test Wizard

Full wizard flow demonstration:

- Multi-step configuration wizard
- Use case selection (Bug Fix, Feature, Code Review...)
- Target model selection (Claude, GPT-4, Gemini...)
- Output format selection (TOON, JSON, YAML...)
- Configuration summary

### 6. 📈 Test Dashboard

Live analysis dashboard:

- Project statistics (files, tokens, size, lines)
- Language distribution with visual bars
- Top files by token count
- Interactive keyboard controls
- Press [Q] to quit

## 🎮 Controls

Global controls available in all screens:

| Key     | Action                        |
| ------- | ----------------------------- |
| `↑↓`    | Navigate menu items           |
| `Enter` | Select/Confirm                |
| `Q`     | Quit application              |
| `Esc`   | Quit application              |
| `M`     | Return to menu (some screens) |

Screen-specific controls:

- **Dashboard:** `R` Refresh, `S` Save, `E` Export, `Q` Quit
- **Wizard:** Follow on-screen prompts
- **Input:** Type and see live feedback

## 🧪 What Gets Tested

### Component Tests

- ✅ Box layout (flexDirection, padding, borders)
- ✅ Text rendering (colors, styles, formatting)
- ✅ SelectInput (keyboard navigation, selection)
- ✅ TextInput (typing, onChange, placeholder)
- ✅ Spinner (multiple types, animations)
- ✅ Newline and spacing
- ✅ Border styles (round, single, double)

### Feature Tests

- ✅ State management (React.useState)
- ✅ Effects (React.useEffect for animations)
- ✅ Keyboard input (useInput hook)
- ✅ Conditional rendering
- ✅ Component composition
- ✅ Props passing
- ✅ Event handling

### Integration Tests

- ✅ Wizard component integration
- ✅ Dashboard component integration
- ✅ ProgressBar component integration
- ✅ Multi-screen navigation
- ✅ Component lifecycle

## 🐛 Troubleshooting

### Raw Mode Error

```
ERROR Raw mode is not supported on the current process.stdin
```

**Solution:** Run in a real terminal (not automated/piped):

- macOS: iTerm2, Terminal.app
- Linux: gnome-terminal, konsole
- Windows: Windows Terminal, PowerShell

### Dependencies Missing

```
❌ Ink UI Test Failed!
Error: Cannot find module 'ink'
```

**Solution:**

```bash
npm install
# Or specifically:
npm install ink react ink-select-input ink-spinner ink-text-input
```

### UI Not Rendering

Check terminal supports:

- ANSI colors (256-color mode)
- UTF-8 encoding
- Minimum size: 80x24

## 💡 Usage Examples

### Run Specific Test

```bash
# Test wizard only
npm run test:wizard

# Test dashboard only
npm run test:dashboard

# Full interactive test suite
npm run test:ink
```

### For Development

Use this test screen when:

- Developing new Ink components
- Testing UI changes
- Verifying Ink installation
- Demonstrating features to users
- Learning Ink component APIs

## 📚 Component Documentation

All tested components are located in:

- `/lib/ui/wizard.js` - Configuration wizard
- `/lib/ui/dashboard.js` - Live stats dashboard
- `/lib/ui/progress-bar.js` - Progress indicators
- `/lib/ui/index.js` - Component exports

## 🎯 Demo for Users

This test screen is perfect for demonstrating Ctxman's UI capabilities:

```bash
# Show to users
npm run test:ink

# Let them navigate through:
# 1. Colors → See visual design
# 2. Progress → See animations
# 3. Wizard → Try configuration flow
# 4. Dashboard → See live stats
```

---

**Version:** 2.3.6+
**Ink Version:** 4.4.1
**React Version:** 18.2.0
