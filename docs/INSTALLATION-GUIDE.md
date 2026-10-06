# Ctxman - Installation Guide

**Version:** 2.3.6+
**Last Updated:** November 3, 2025

---

## 📋 Table of Contents

1. [Quick Install](#quick-install)
2. [Platform-Specific Installation](#platform-specific-installation)
3. [Package Managers](#package-managers)
4. [Verification](#verification)
5. [Optional Dependencies](#optional-dependencies)
6. [Uninstallation](#uninstallation)
7. [Troubleshooting](#troubleshooting)

---

## ⚡ Quick Install

### NPM (Recommended - All Platforms)

```bash
# Global installation
npm install -g ctxman

# Verify
ctxman --help
```

### One-Line Installers

#### macOS / Linux

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/hakkisagdic/ctxman/main/scripts/install.sh)
```

#### Windows (PowerShell)

```powershell
irm https://raw.githubusercontent.com/hakkisagdic/ctxman/main/scripts/install.ps1 | iex
```

---

## 🖥️ Platform-Specific Installation

### macOS

#### Option 1: Homebrew (Recommended)

```bash
# Add tap (once)
brew tap hakkisagdic/ctxman

# Install
brew install ctxman

# Update
brew upgrade ctxman
```

#### Option 2: NPM

```bash
npm install -g ctxman
```

#### Option 3: Installation Script

```bash
curl -fsSL https://raw.githubusercontent.com/hakkisagdic/ctxman/main/scripts/install.sh | bash
```

### Linux

#### Option 1: Debian/Ubuntu (APT)

```bash
# Download DEB package
wget https://github.com/hakkisagdic/ctxman/releases/download/v2.3.5/ctxman_2.3.5_all.deb

# Install
sudo dpkg -i ctxman_2.3.5_all.deb

# Install dependencies if needed
sudo apt-get install -f
```

#### Option 2: Red Hat/Fedora (YUM/DNF)

```bash
# Coming soon - RPM package
# For now, use NPM:
npm install -g ctxman
```

#### Option 3: NPM (Universal)

```bash
npm install -g ctxman
```

#### Option 4: Installation Script

```bash
curl -fsSL https://raw.githubusercontent.com/hakkisagdic/ctxman/main/scripts/install.sh | bash
```

### Windows

#### Option 1: NPM (Recommended)

```powershell
npm install -g ctxman
```

#### Option 2: PowerShell Script

```powershell
# Run as Administrator
Set-ExecutionPolicy Bypass -Scope Process -Force
irm https://raw.githubusercontent.com/hakkisagdic/ctxman/main/scripts/install.ps1 | iex
```

#### Option 3: Manual Download

1. Download from: https://github.com/hakkisagdic/ctxman/releases
2. Extract to: `C:\Program Files\ctxman`
3. Add to PATH: `C:\Program Files\ctxman\bin`

---

## 📦 Package Managers

### NPM

```bash
# Global (recommended)
npm install -g ctxman

# Local (project-specific)
npm install ctxman

# Specific version
npm install -g ctxman@2.3.5

# Insider/pre-release
npm install -g ctxman@next
```

### Yarn

```bash
# Global
yarn global add ctxman

# Local
yarn add ctxman
```

### PNPM

```bash
# Global
pnpm add -g ctxman

# Local
pnpm add ctxman
```

### Homebrew (macOS)

```bash
brew tap hakkisagdic/ctxman
brew install ctxman
brew upgrade ctxman  # Update
brew uninstall ctxman  # Remove
```

---

## ✅ Verification

### Check Installation

```bash
# Check if installed
which ctxman

# Check version
ctxman --version

# Run help
ctxman --help

# Quick test
ctxman --simple
```

### Verify Dependencies

```bash
# Check Node.js version (22+ required)
node --version

# Check npm
npm --version

# List installed packages
npm list -g ctxman
```

### Test Core Features

```bash
# Test TOON format
ctxman --output toon --simple

# Test format listing
ctxman --list-formats

# Test method-level analysis
ctxman --method-level --simple

# Test format conversion
echo '{"test": "value"}' > test.json
ctxman convert test.json --from json --to toon
```

---

## 🎨 Optional Dependencies

Ctxman has **optional interactive features** that require additional dependencies.

### Interactive Wizard & Dashboard

These features use React + Ink for beautiful terminal UI:

```bash
# Install interactive dependencies
npm install -g ink react ink-select-input ink-text-input ink-spinner

# Or with the package
npm install -g ctxman
```

**Features Enabled:**

- ✨ Interactive Wizard (`--wizard`)
- 📊 Live Dashboard (`--dashboard`)
- 🎨 Progress bars and spinners
- ⌨️ Keyboard navigation

**Without these dependencies:**

- Tool still works perfectly
- Uses simple text-based output
- All core features available

### Exact Token Counting

For exact GPT-4 token counting (optional):

```bash
npm install -g tiktoken
```

**With tiktoken:**

- ✅ Exact token counts (100% accuracy)

**Without tiktoken:**

- ✅ Smart estimation (~95% accuracy)

---

## 🗑️ Uninstallation

### macOS / Linux

```bash
# Option 1: Uninstall script
bash <(curl -fsSL https://raw.githubusercontent.com/hakkisagdic/ctxman/main/scripts/uninstall.sh)

# Option 2: NPM
npm uninstall -g ctxman

# Option 3: Homebrew
brew uninstall ctxman
```

### Windows

```powershell
# Option 1: PowerShell script
irm https://raw.githubusercontent.com/hakkisagdic/ctxman/main/scripts/uninstall.ps1 | iex

# Option 2: NPM
npm uninstall -g ctxman
```

### Remove Configuration

```bash
# macOS / Linux
rm -rf ~/.ctxman

# Windows
Remove-Item -Path $env:USERPROFILE\.ctxman -Recurse
```

---

## 🐛 Troubleshooting

### "command not found: ctxman"

**Solution:**

```bash
# Check PATH
echo $PATH

# Restart terminal
# Or source profile
source ~/.bashrc  # or ~/.zshrc
```

### Permission Denied

**Linux/macOS:**

```bash
# Use sudo for global install
sudo npm install -g ctxman

# Or install locally without sudo
npm install ctxman
```

**Windows:**

```powershell
# Run PowerShell as Administrator
```

### Node.js Version Too Old

```bash
# Check version
node --version

# Update Node.js
# macOS: brew upgrade node
# Linux: nvm install --lts
# Windows: Download from nodejs.org
```

### Installation Hangs

```bash
# Clear npm cache
npm cache clean --force

# Try again
npm install -g ctxman
```

### Wizard/Dashboard Not Working

```bash
# Install interactive dependencies
npm install -g ink react ink-select-input ink-text-input ink-spinner

# Or use simple mode
ctxman --simple
```

---

## 🔄 Updating

### Built-in Updater

```bash
# Check for updates
ctxman update check

# Install update
ctxman update install

# Rollback if needed
ctxman update rollback
```

### NPM

```bash
# Update to latest
npm update -g ctxman

# Update to specific version
npm install -g ctxman@2.3.6
```

### Homebrew

```bash
brew upgrade ctxman
```

---

## 🎯 Installation Types

### Global Installation

```bash
npm install -g ctxman
```

✅ Available system-wide
✅ Use from any directory
✅ Simple `ctxman` command
❌ Requires admin/sudo (sometimes)

### Local Installation

```bash
npm install ctxman
```

✅ No admin rights needed
✅ Project-specific version
❌ Use via `npx` or npm scripts
❌ Not in system PATH

### Source Installation (Developers)

```bash
git clone https://github.com/hakkisagdic/ctxman.git
cd ctxman
npm install
npm link  # Make globally available
```

✅ Latest development version
✅ Easy to contribute
❌ Manual updates required

---

## 📚 Next Steps

After installation:

1. **Read Quick Start**: `ctxman --help`
2. **Try Wizard**: `ctxman --wizard`
3. **Read Docs**: See [FEATURE-EXAMPLES.md](./FEATURE-EXAMPLES.md)
4. **Configure**: Edit `~/.ctxman/config.json`
5. **Update**: `ctxman update check`

---

## 🆘 Getting Help

- **GitHub Issues**: https://github.com/hakkisagdic/ctxman/issues
- **Documentation**: https://github.com/hakkisagdic/ctxman#readme
- **Quick Help**: `ctxman --help`

---

**Version:** 2.3.6+
**Maintainer:** Hakkı Sağdıç
**License:** MIT
